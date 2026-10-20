import { DeviceCommandError, extractJson, fromHex, parseBuildIdentity, parseDump, parseIdentityText, toHex } from './link';
import type { BuildIdentity, DeviceIdentity, DeviceLink, DeviceStatus, ForceEntry, LinkKind, TraceListener } from './link';

/** The lines of a serial shell: send one, get what the device printed until a marker. */
export interface ShellTransport {
  send(line: string, options?: { waitFor?: string; timeoutMs?: number }): Promise<string>;
  onLine?(listener: (line: string) => void): () => void;
  close(): Promise<void>;
}

const CHUNK_HEX = 32; // 16 bytes a command: what the shell's line buffer takes
const READ_MAX = 128;
// eslint-disable-next-line no-control-regex
const ANSI = /\x1B\[[0-9;]*[A-Za-z]/g;

/**
 * The firmware shell grammar (firmware/app/src/shell_cmds.c) over a transport. This is the control path of the
 * boards today; when the framed protocol of COM-019 is on the device it is one more `DeviceLink`, and nothing above
 * this file changes.
 */
export class ShellLink implements DeviceLink {
  readonly kind: LinkKind;
  private readonly transport: ShellTransport;
  private cached: DeviceIdentity | undefined;

  constructor(transport: ShellTransport, kind: LinkKind = 'serial') {
    this.transport = transport;
    this.kind = kind;
  }

  private async run(command: string, options: { waitFor?: string; timeoutMs?: number; ok?: boolean } = {}): Promise<string> {
    const reply = (await this.transport.send(command, options)).replace(ANSI, '');
    if (/^\s*ERROR:/m.test(reply)) throw new DeviceCommandError(`${command}: ${reply.trim().slice(0, 200)}`);
    if (options.ok && !reply.includes('OK:')) throw new DeviceCommandError(`${command}: no OK in ${reply.trim().slice(0, 200)}`);
    return reply;
  }

  async identity(): Promise<DeviceIdentity> {
    const info = extractJson(await this.run('zplc sys info --json'));
    const text = (key: string): string | undefined => (typeof info[key] === 'string' ? (info[key] as string) : undefined);
    const number = (key: string): number | undefined => (typeof info[key] === 'number' ? (info[key] as number) : undefined);
    const capabilities = info.capabilities as { scheduler?: boolean } | undefined;
    const board = text('board');
    if (!board) throw new DeviceCommandError('the device did not report a board');
    const identity: DeviceIdentity = { board, raw: info, schedulerCommands: capabilities?.scheduler === true };
    const profile = text('board_profile');
    if (profile !== undefined) identity.boardProfile = profile;
    const version = text('zplc_version');
    if (version !== undefined) identity.zplcVersion = version;
    const zephyr = text('zephyr_version');
    if (zephyr !== undefined) identity.zephyrVersion = zephyr;
    const major = number('bytecode_abi_major');
    if (major !== undefined) identity.abiMajor = major;
    const minor = number('bytecode_abi_minor');
    if (minor !== undefined) identity.abiMinor = minor;
    identity.draftCounter = number('draft_counter') ?? null;
    const build = await this.buildIdentity();
    if (build !== undefined) identity.build = build;
    this.cached = identity;
    return identity;
  }

  /** `zplc sys build --json` (REL-023), else the text of `zplc version`; undefined for an image that reports neither. */
  private async buildIdentity(): Promise<BuildIdentity | undefined> {
    try {
      const parsed = parseBuildIdentity(extractJson(await this.run('zplc sys build --json')));
      if (parsed) return parsed;
    } catch {
      // an image without the command answers an error or nothing parseable; the text of `zplc version` is the next try
    }
    try {
      return parseIdentityText(await this.run('zplc version'));
    } catch {
      return undefined;
    }
  }

  async status(): Promise<DeviceStatus> {
    const status = extractJson(await this.run('zplc status --json'));
    const stats = (status.stats ?? {}) as { cycles?: unknown };
    const cycles = typeof stats.cycles === 'number' ? stats.cycles : status.cycles;
    if (typeof status.state !== 'string' || typeof status.uptime_ms !== 'number' || typeof cycles !== 'number') {
      throw new DeviceCommandError('the status reply has no state, uptime and cycle count');
    }
    return { state: status.state, uptimeMs: status.uptime_ms, cycles };
  }

  async load(zplc: Uint8Array): Promise<void> {
    const identity = this.cached ?? (await this.identity());
    const prefix = identity.schedulerCommands ? 'zplc sched' : 'zplc';
    await this.stop();
    await this.run(`${prefix} load ${zplc.length}`, { waitFor: 'OK:', timeoutMs: 10_000, ok: true });
    const hex = toHex(zplc);
    for (let at = 0; at < hex.length; at += CHUNK_HEX) {
      let attempt = 0;
      for (;;) {
        try {
          await this.run(`${prefix} data ${hex.slice(at, at + CHUNK_HEX)}`, { waitFor: 'OK:', timeoutMs: 5_000, ok: true });
          break;
        } catch (error) {
          // The device answered with a refusal (e.g. the loader's -13): that text is the finding, so it is not retried.
          // Only silence (a transport timeout) is worth another try.
          attempt += 1;
          if (error instanceof DeviceCommandError || attempt >= 3) throw error;
        }
      }
    }
  }

  async start(): Promise<void> {
    await this.run('zplc start', { waitFor: 'OK:', ok: true });
  }

  async stop(): Promise<void> {
    await this.run('zplc stop', { waitFor: 'OK:', ok: true });
  }

  async reset(): Promise<void> {
    await this.run('zplc reset', { waitFor: 'OK:', ok: true });
  }

  async peek(address: number, length: number): Promise<Uint8Array> {
    const parts: Uint8Array[] = [];
    for (let at = 0; at < length; at += READ_MAX) {
      const size = Math.min(READ_MAX, length - at);
      parts.push(parseDump(await this.run(`zplc dbg peek 0x${(address + at).toString(16)} ${size}`), size));
    }
    return Uint8Array.from(parts.flatMap((part) => Array.from(part)));
  }

  async poke(address: number, bytes: Uint8Array): Promise<void> {
    for (const [offset, value] of bytes.entries()) {
      await this.run(`zplc dbg poke 0x${(address + offset).toString(16)} ${value}`, { waitFor: 'OK:', ok: true });
    }
  }

  async force(address: number, bytes: Uint8Array): Promise<void> {
    await this.run(`zplc dbg force set 0x${address.toString(16)} ${toHex(bytes)}`, { waitFor: 'OK:', ok: true });
  }

  async clearForces(): Promise<void> {
    await this.run('zplc dbg force clear_all', { waitFor: 'OK:', ok: true });
  }

  async forces(): Promise<ForceEntry[]> {
    const list = extractJson(await this.run('zplc dbg force list --json'));
    const items = Array.isArray(list.items) ? (list.items as Array<{ addr: number; size: number; bytes: string }>) : [];
    return items.map((item) => ({ address: item.addr, size: item.size, bytesHex: item.bytes }));
  }

  async setTraceMode(mode: 'off' | 'summary' | 'verbose'): Promise<void> {
    await this.run(`zplc hil mode ${mode}`, { waitFor: 'OK:', ok: true });
  }

  onTrace(listener: TraceListener): () => void {
    return this.transport.onLine?.((line) => { if (line.trimStart().startsWith('{')) listener(line); }) ?? (() => undefined);
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}

export { fromHex };
