import { describe, expect, test } from 'bun:test';

import { DeviceCommandError, extractJson, parseDump } from '../src/link';
import { ShellLink } from '../src/shellLink';
import type { ShellTransport } from '../src/shellLink';

const SYS_INFO = '{"board":"rpi_pico","board_profile":"rpi_pico_rp2040","zplc_version":"2.0.0","zephyr_version":"4.0.0","uptime_ms":1,"cpu_freq_mhz":125,"device_protocol_version":1,"bytecode_abi_major":1,"bytecode_abi_minor":0,"draft_counter":4,"capabilities":{"fpu":true,"mpu":false,"scheduler":true,"max_tasks":4},"memory":{"work_size":8192,"retain_size":4096,"ipi_size":4096,"opi_size":4096}}';

/** The firmware shell as a script: a reply for a command, in the shapes of shell_cmds.c. */
class Shell implements ShellTransport {
  readonly sent: string[] = [];
  readonly memory = new Map<number, number>();
  failDataChunks = 0;
  scheduler = true;
  forceEntries: Array<{ addr: number; size: number; bytes: string }> = [];
  private readonly lines = new Set<(line: string) => void>();

  send(line: string): Promise<string> {
    this.sent.push(line);
    const echo = `${line}\r\n`;
    const reply = (text: string): Promise<string> => Promise.resolve(`${echo}${text}\r\nzplc:~$ `);
    if (line === 'zplc sys info --json') return reply(SYS_INFO.replace('"scheduler":true', `"scheduler":${this.scheduler}`));
    if (line === 'zplc status --json') return reply('{"state":"running","uptime_ms":4200,"stats":{"cycles":42,"program_size":10},"opi":[0,0,0,0,0,0,0,0]}');
    if (/^zplc (sched )?load \d+$/.test(line)) return reply('OK: Ready to receive bytes');
    if (/^zplc (sched )?data [0-9a-f]+$/.test(line)) {
      if (this.failDataChunks > 0) { this.failDataChunks -= 1; return reply('ERROR: chunk refused'); }
      return reply('OK: Received 16 bytes');
    }
    if (line.startsWith('zplc dbg peek')) {
      const [, , , address, length] = line.split(' ');
      const start = Number(address);
      const bytes = Array.from({ length: Number(length) }, (_, i) => this.memory.get(start + i) ?? 0);
      const rows = [] as string[];
      for (let at = 0; at < bytes.length; at += 16) rows.push(`${(start + at).toString(16).toUpperCase().padStart(4, '0')}: ${bytes.slice(at, at + 16).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')} `);
      return reply(`Memory at ${address} (${length} bytes):\r\n${rows.join('\r\n')}`);
    }
    if (line.startsWith('zplc dbg poke')) { const [, , , address, value] = line.split(' '); this.memory.set(Number(address), Number(value)); return reply('OK: Wrote'); }
    if (line.startsWith('zplc dbg force set')) { const [, , , , address, hex] = line.split(' '); this.forceEntries = [{ addr: Number(address), size: hex!.length / 2, bytes: hex! }]; return reply('OK: Forced'); }
    if (line === 'zplc dbg force clear_all') { this.forceEntries = []; return reply('OK: Cleared all force entries'); }
    if (line === 'zplc dbg force list --json') return reply(JSON.stringify({ count: this.forceEntries.length, items: this.forceEntries }));
    if (/^zplc (stop|start|reset)$/.test(line)) return reply('OK: done');
    if (line.startsWith('zplc hil mode')) return reply('OK: HIL mode set');
    return reply('ERROR: unknown command');
  }

  onLine(listener: (line: string) => void): () => void {
    this.lines.add(listener);
    return () => { this.lines.delete(listener); };
  }

  emit(line: string): void { for (const listener of this.lines) listener(line); }
  close(): Promise<void> { return Promise.resolve(); }
}

describe('the shell link speaks the firmware grammar (HIL-001)', () => {
  test('the identity is what the device reports in zplc sys info', async () => {
    const link = new ShellLink(new Shell());
    const identity = await link.identity();
    expect(identity).toMatchObject({ board: 'rpi_pico', boardProfile: 'rpi_pico_rp2040', zplcVersion: '2.0.0', abiMajor: 1, draftCounter: 4, schedulerCommands: true });
  });

  test('a deploy stops, announces the size, and sends the bytes sixteen at a time through the scheduler commands', async () => {
    const shell = new Shell();
    const link = new ShellLink(shell);
    await link.load(Uint8Array.from({ length: 40 }, (_, i) => i));
    expect(shell.sent.slice(0, 3)).toEqual(['zplc sys info --json', 'zplc stop', 'zplc sched load 40']);
    expect(shell.sent.filter((line) => line.startsWith('zplc sched data'))).toHaveLength(3);
    expect(shell.sent[3]).toBe('zplc sched data 000102030405060708090a0b0c0d0e0f');
  });

  test('a board without the scheduler is deployed through the legacy commands', async () => {
    const shell = new Shell();
    shell.scheduler = false;
    await new ShellLink(shell).load(Uint8Array.of(1, 2));
    expect(shell.sent).toContain('zplc load 2');
    expect(shell.sent.some((line) => line.includes('sched'))).toBe(false);
  });

  test('a chunk the device refuses is sent again, and a third refusal fails the deploy', async () => {
    const shell = new Shell();
    shell.failDataChunks = 2;
    await new ShellLink(shell).load(Uint8Array.of(1, 2));
    const refusing = new Shell();
    refusing.failDataChunks = 3;
    await expect(new ShellLink(refusing).load(Uint8Array.of(1, 2))).rejects.toBeInstanceOf(DeviceCommandError);
  });

  test('memory is read from the dump and written a byte at a time', async () => {
    const shell = new Shell();
    const link = new ShellLink(shell);
    await link.poke(0x1000, Uint8Array.of(7, 0, 42));
    expect(shell.sent.filter((line) => line.startsWith('zplc dbg poke'))).toEqual(['zplc dbg poke 0x1000 7', 'zplc dbg poke 0x1001 0', 'zplc dbg poke 0x1002 42']);
    expect(Array.from(await link.peek(0x1000, 3))).toEqual([7, 0, 42]);
    expect(Array.from(await link.peek(0x2000, 200))).toHaveLength(200);
  });

  test('forces are set, listed and cleared, and the clock and scan count come from the status', async () => {
    const shell = new Shell();
    const link = new ShellLink(shell);
    await link.force(0, Uint8Array.of(1));
    expect(await link.forces()).toEqual([{ address: 0, size: 1, bytesHex: '01' }]);
    await link.clearForces();
    expect(await link.forces()).toEqual([]);
    expect(await link.status()).toEqual({ state: 'running', uptimeMs: 4200, cycles: 42 });
  });

  test('trace lines reach a listener, and only the ones that are JSON', () => {
    const shell = new Shell();
    const link = new ShellLink(shell);
    const seen: string[] = [];
    const stop = link.onTrace((line) => seen.push(line));
    shell.emit('{"t":"opcode","op":"ADD"}');
    shell.emit('[HAL] something');
    stop();
    shell.emit('{"t":"opcode","op":"SUB"}');
    expect(seen).toEqual(['{"t":"opcode","op":"ADD"}']);
  });

  test('a reply that is an error is an error, with the command that caused it', async () => {
    const shell = new Shell();
    shell.send = (line: string) => Promise.resolve(`${line}\r\nERROR: not allowed\r\nzplc:~$ `);
    await expect(new ShellLink(shell).start()).rejects.toThrow(/zplc start: [\s\S]*not allowed/);
  });
});

describe('reading what a device prints', () => {
  test('the JSON object is found after the echo of the command', () => {
    expect(extractJson('zplc status --json\r\n{"a":{"b":1}}\r\nzplc:~$ ')).toEqual({ a: { b: 1 } });
    expect(() => extractJson('no json here')).toThrow(DeviceCommandError);
  });

  test('a dump that is shorter than asked is an error, not a shorter read', () => {
    expect(Array.from(parseDump('Memory at 0x1000 (2 bytes):\r\n1000: 01 02 \r\n', 2))).toEqual([1, 2]);
    expect(() => parseDump('1000: 01 \r\n', 4)).toThrow(DeviceCommandError);
  });
});
