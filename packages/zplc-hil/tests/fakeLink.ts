import type { DeviceIdentity, DeviceLink, DeviceStatus, ForceEntry, LinkKind } from '../src/link';

/**
 * A device in memory, with a clock of its own that moves only when it is read. It runs one scan every `scanMs` of that
 * clock while it is running, and a scan copies `program(input)` to the output image. Forces replace the input image.
 * It stands in for a board in the tests of the port and the runner; it is not hardware and says `fake`.
 */
export class FakeLink implements DeviceLink {
  readonly kind: LinkKind = 'fake';
  readonly calls: string[] = [];
  clock = 1000;
  cycles = 0;
  running = false;
  scanMs = 10;
  tickPerStatus = 5;
  loaded: Uint8Array | undefined;
  readonly memory = new Map<number, number>();
  readonly forced = new Map<number, number>();
  /** Methods that throw when called: `fail.add('stop')`. */
  readonly fail = new Set<string>();
  /** The program: reads an input byte (forced value first) and returns the output bytes of this scan. */
  program: (input: (address: number) => number) => Map<number, number> = (input) => new Map([[0x1000, input(0) & 0x01]]);
  /** Keep forces after `clearForces`, to model a device that did not release them. */
  stuckForces = false;
  private last = 0;

  private enter(method: string, detail = ''): void {
    this.calls.push(detail ? `${method} ${detail}` : method);
    if (this.fail.has(method)) throw new Error(`${method} failed`);
  }

  private input(address: number): number {
    return this.forced.get(address) ?? this.memory.get(address) ?? 0;
  }

  private advance(ms: number): void {
    const target = this.clock + ms;
    while (this.running && this.last + this.scanMs <= target) {
      this.last += this.scanMs;
      this.cycles += 1;
      for (const [address, value] of this.program((a) => this.input(a))) this.memory.set(address, value);
    }
    this.clock = target;
  }

  identity(): Promise<DeviceIdentity> {
    this.enter('identity');
    return Promise.resolve({ board: 'fake_board', raw: { board: 'fake_board' } });
  }

  status(): Promise<DeviceStatus> {
    this.enter('status');
    this.advance(this.tickPerStatus);
    return Promise.resolve({ state: this.running ? 'running' : 'idle', uptimeMs: this.clock, cycles: this.cycles });
  }

  load(zplc: Uint8Array): Promise<void> {
    this.enter('load', String(zplc.length));
    this.running = false;
    this.loaded = zplc;
    return Promise.resolve();
  }

  start(): Promise<void> {
    this.enter('start');
    this.running = true;
    this.last = this.clock;
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.enter('stop');
    this.running = false;
    this.memory.set(0x1000, 0); // STOP puts the outputs in their safe state
    return Promise.resolve();
  }

  reset(): Promise<void> {
    this.enter('reset');
    this.cycles = 0;
    return Promise.resolve();
  }

  peek(address: number, length: number): Promise<Uint8Array> {
    this.enter('peek', `${address}:${length}`);
    return Promise.resolve(Uint8Array.from({ length }, (_, offset) => this.input(address + offset)));
  }

  poke(address: number, bytes: Uint8Array): Promise<void> {
    this.enter('poke', `${address}`);
    bytes.forEach((byte, offset) => this.memory.set(address + offset, byte));
    return Promise.resolve();
  }

  force(address: number, bytes: Uint8Array): Promise<void> {
    this.enter('force', `${address}:${bytes[0]}`);
    bytes.forEach((byte, offset) => this.forced.set(address + offset, byte));
    return Promise.resolve();
  }

  clearForces(): Promise<void> {
    this.enter('clearForces');
    if (!this.stuckForces) this.forced.clear();
    return Promise.resolve();
  }

  forces(): Promise<ForceEntry[]> {
    this.enter('forces');
    return Promise.resolve(
      [...this.forced].map(([address, value]) => ({ address, size: 1, bytesHex: value.toString(16).padStart(2, '0') })),
    );
  }

  close(): Promise<void> {
    this.calls.push('close');
    return Promise.resolve();
  }
}
