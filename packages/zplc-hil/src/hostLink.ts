import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DeviceCommandError, fromHex, parseBuildIdentity, toHex } from './link';
import type { DeviceIdentity, DeviceLink, DeviceStatus, ForceEntry } from './link';

interface Pending {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

/**
 * The native POSIX runtime of this repository (`zplc_runtime`) as a device: the host-side stand-in that lets the
 * harness be tested without a board. It speaks newline-delimited JSON on stdio. It is never hardware evidence: its
 * kind is `host-runtime`, and the record says so.
 */
export class HostRuntimeLink implements DeviceLink {
  readonly kind = 'host-runtime' as const;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, Pending>();
  private readonly persist: string;
  private buffer = '';
  private count = 0;
  private hello: Record<string, unknown> = {};
  private exited = false;

  private constructor(binary: string) {
    this.persist = mkdtempSync(join(tmpdir(), 'zplc-hil-host-'));
    this.child = spawn(binary, [], { env: { ...process.env, ZPLC_PERSIST_ROOT: this.persist }, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.resume(); // the runtime's own log: drained, not kept
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.read(chunk));
    this.child.on('exit', () => {
      this.exited = true;
      for (const { reject } of this.pending.values()) reject(new DeviceCommandError('the host runtime exited'));
      this.pending.clear();
    });
  }

  static async open(binary: string): Promise<HostRuntimeLink> {
    const link = new HostRuntimeLink(binary);
    link.hello = await link.call('session.hello', { client_name: 'zplc-hil', client_version: '0', protocol_version: '1.0' });
    return link;
  }

  private read(chunk: string): void {
    this.buffer += chunk;
    for (let end = this.buffer.indexOf('\n'); end >= 0; end = this.buffer.indexOf('\n')) {
      const line = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end + 1);
      if (!line) continue;
      const message = JSON.parse(line) as { type?: string; id?: string; result?: Record<string, unknown>; error?: { code: string; message: string } };
      if (message.type !== 'response' || !message.id) continue;
      const waiting = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) waiting?.reject(new DeviceCommandError(`${message.error.code}: ${message.error.message}`));
      else waiting?.resolve(message.result ?? {});
    }
  }

  private call(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    if (this.exited) return Promise.reject(new DeviceCommandError('the host runtime has exited'));
    this.count += 1;
    const id = `hil-${this.count}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new DeviceCommandError(`${method} was not answered`)); }, 15_000);
      this.pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
      this.child.stdin.write(`${JSON.stringify({ id, type: 'request', method, params })}\n`);
    });
  }

  identity(): Promise<DeviceIdentity> {
    const version = this.hello.runtime_version;
    const build = parseBuildIdentity(this.hello.build);
    return Promise.resolve({
      board: 'native_posix', boardProfile: 'host-runtime', zephyrVersion: 'none', schedulerCommands: true,
      ...(typeof version === 'string' ? { zplcVersion: version } : {}),
      ...(build ? { build } : {}),
      draftCounter: typeof this.hello.draft_counter === 'number' ? this.hello.draft_counter : null,
      raw: this.hello,
    });
  }

  async status(): Promise<DeviceStatus> {
    const status = await this.call('status.get');
    const stats = (status.stats ?? {}) as { cycles?: number };
    return { state: String(status.state), uptimeMs: Number(status.uptime_ms), cycles: stats.cycles ?? 0 };
  }

  async load(zplc: Uint8Array): Promise<void> {
    await this.call('execution.stop');
    await this.call('program.load', { bytecode_hex: toHex(zplc) });
  }

  async start(): Promise<void> { await this.call('execution.start'); }
  async stop(): Promise<void> { await this.call('execution.stop'); }
  async reset(): Promise<void> { await this.call('execution.reset'); }

  async peek(address: number, length: number): Promise<Uint8Array> {
    return fromHex(String((await this.call('memory.read', { address, length })).bytes_hex));
  }

  async poke(address: number, bytes: Uint8Array): Promise<void> {
    await this.call('memory.write', { address, bytes_hex: toHex(bytes) });
  }

  async force(address: number, bytes: Uint8Array): Promise<void> {
    await this.call('force.set', { address, bytes_hex: toHex(bytes) });
  }

  async clearForces(): Promise<void> { await this.call('force.clear_all'); }

  async forces(): Promise<ForceEntry[]> {
    const list = await this.call('force.list');
    const entries = Array.isArray(list.force_entries) ? (list.force_entries as Array<{ address: number; size: number; bytes_hex: string }>) : [];
    return entries.map((entry) => ({ address: entry.address, size: entry.size, bytesHex: entry.bytes_hex }));
  }

  async close(): Promise<void> {
    if (!this.exited) {
      await this.call('session.shutdown').catch(() => undefined);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { this.child.kill(); resolve(); }, 3_000);
        this.child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
    rmSync(this.persist, { recursive: true, force: true });
  }
}
