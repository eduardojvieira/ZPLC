import type { DeviceLink } from './link';

/**
 * A runtime port of the scenario engine (packages/zplc-ide/src/test-engine/index.ts, `ScenarioRuntimePort`): the same
 * six operations, so that a scenario file used on the host runs on a board (HIL-002). It is declared again here, and
 * a test of the Studio package compiles it against the engine's own, so that the two cannot drift apart.
 */
export interface ScenarioRuntimePort {
  loadProgram(zplc: Uint8Array): Promise<void>;
  reset(): Promise<void>;
  hasForces(): Promise<boolean>;
  setInput(address: number, bitOffset: number, value: boolean): Promise<void>;
  step(atMs: number): Promise<void>;
  readOutput(address: number, bitOffset: number): Promise<boolean>;
}

const IPI_END = 0x1000;
const OPI_START = 0x1000;
const OPI_END = 0x2000;

export interface HardwarePortOptions {
  /**
   * A lateness bound, not a window around the tick: a sample is taken once the device clock has reached its tick and is
   * never early, and the run is void when a sample is more than this many ms late. Assertion windows are not widened by
   * it. The bound, the void flag and every tick's lateness are written into the record (`measurements`).
   */
  toleranceMs?: number;
  /** How often the device's clock is read while waiting. */
  pollMs?: number;
  /** The longest the port waits for a tick, whatever the clock says. */
  timeoutMs?: number;
  signal?: AbortSignal | undefined;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class ScenarioTimingError extends Error {
  readonly atMs: number;
  readonly lateMs: number;
  constructor(atMs: number, lateMs: number, toleranceMs: number) {
    super(`tick ${atMs} ms was sampled ${lateMs} ms late by the device clock, over the tolerance of ${toleranceMs} ms: the run is void`);
    this.name = 'ScenarioTimingError';
    this.atMs = atMs;
    this.lateMs = lateMs;
  }
}

export interface StepObservation {
  atMs: number;
  deviceMs: number;
  lateMs: number;
  cycles: number;
}
export interface ReleaseReport {
  ok: boolean;
  forcesCleared: boolean;
  stopped: boolean;
  errors: string[];
}

/**
 * A scenario run on a board. Time is the device's: a tick is sampled once the device clock has reached it and a scan
 * has completed since its inputs were forced, so a sample is the outputs after one scan with those inputs, as on the
 * host's lock-step clock. Inputs are forced, not poked, because the HAL rewrites the input image on every scan; the
 * forced byte replaces all eight bits of it for the run. `release()` clears the forces and stops the board: the
 * caller must call it at the end and on abort (HIL-003), and the device releases the forces itself when the link is
 * lost (COM-020).
 */
export class HardwareRuntimePort implements ScenarioRuntimePort {
  readonly observations: StepObservation[] = [];
  readonly toleranceMs: number;
  private readonly link: DeviceLink;
  private readonly pollMs: number;
  private readonly timeoutMs: number;
  private readonly signal: AbortSignal | undefined;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly image = new Map<number, number>();
  private started = false;
  private origin = 0;
  private released: ReleaseReport | undefined;

  constructor(link: DeviceLink, options: HardwarePortOptions = {}) {
    this.link = link;
    this.toleranceMs = options.toleranceMs ?? 50;
    this.pollMs = options.pollMs ?? 5;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.signal = options.signal;
    this.sleep =
      options.sleep ??
      ((ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }));
    this.now = options.now ?? Date.now;
  }

  async loadProgram(zplc: Uint8Array): Promise<void> {
    this.started = false;
    await this.link.load(zplc);
  }

  async reset(): Promise<void> {
    this.started = false;
    this.image.clear();
    this.observations.length = 0;
    await this.link.reset();
  }

  async hasForces(): Promise<boolean> {
    return (await this.link.forces()).length > 0;
  }

  async setInput(address: number, bitOffset: number, value: boolean): Promise<void> {
    if (!Number.isInteger(address) || address < 0 || address >= IPI_END) throw new Error('Scenario IPI address is invalid');
    if (!Number.isInteger(bitOffset) || bitOffset < 0 || bitOffset > 7)
      throw new Error('Scenario bitOffset must be an integer from 0 to 7');
    const current = this.image.get(address) ?? (await this.link.peek(address, 1))[0] ?? 0;
    const next = value ? current | (1 << bitOffset) : current & ~(1 << bitOffset);
    this.image.set(address, next);
    await this.link.force(address, Uint8Array.of(next));
  }

  async step(atMs: number): Promise<void> {
    this.signal?.throwIfAborted();
    if (!this.started) {
      await this.link.start();
      this.started = true;
      this.origin = (await this.link.status()).uptimeMs;
    }
    const base = (await this.link.status()).cycles; // the inputs of this tick are already forced: one scan after this one has seen them
    const target = this.origin + atMs;
    const deadline = this.now() + this.timeoutMs;
    for (;;) {
      this.signal?.throwIfAborted();
      const status = await this.link.status();
      if (status.uptimeMs >= target && status.cycles > base) {
        const lateMs = status.uptimeMs - target;
        this.observations.push({ atMs, deviceMs: status.uptimeMs - this.origin, lateMs, cycles: status.cycles });
        if (lateMs > this.toleranceMs) throw new ScenarioTimingError(atMs, lateMs, this.toleranceMs);
        return;
      }
      if (this.now() > deadline)
        throw new Error(
          `the device did not reach tick ${atMs} ms in ${this.timeoutMs} ms (clock ${
            status.uptimeMs - this.origin
          } ms, scans ${status.cycles - base})`,
        );
      await this.sleep(this.pollMs);
    }
  }

  async readOutput(address: number, bitOffset: number): Promise<boolean> {
    if (!Number.isInteger(address) || address < OPI_START || address >= OPI_END) throw new Error('Scenario OPI address is invalid');
    if (!Number.isInteger(bitOffset) || bitOffset < 0 || bitOffset > 7)
      throw new Error('Scenario bitOffset must be an integer from 0 to 7');
    return (((await this.link.peek(address, 1))[0] ?? 0) & (1 << bitOffset)) !== 0;
  }

  /** The largest lateness seen: what the record states as the timing of the run. */
  get maxLateMs(): number {
    return this.observations.reduce((most, observation) => Math.max(most, observation.lateMs), 0);
  }

  /** Clear every force this port set and stop the board, whatever happened before. Safe to call twice. */
  async release(): Promise<ReleaseReport> {
    if (this.released) return this.released;
    const report: ReleaseReport = { ok: false, forcesCleared: false, stopped: false, errors: [] };
    try {
      await this.link.clearForces();
      report.forcesCleared = (await this.link.forces()).length === 0;
      if (!report.forcesCleared) report.errors.push('forces are still listed after clear_all');
    } catch (error) {
      report.errors.push(`releasing the forces: ${(error as Error).message}`);
    }
    try {
      await this.link.stop();
      report.stopped = (await this.link.status()).state.toLowerCase() !== 'running';
      if (!report.stopped) report.errors.push('the device still reports running after STOP');
    } catch (error) {
      report.errors.push(`stopping: ${(error as Error).message}`);
    }
    report.ok = report.forcesCleared && report.stopped;
    this.released = report;
    return report;
  }
}

/**
 * Run `body` on a port and release it, on success, on an error and on abort. The body's error is kept, and a failed release is added to it.
 */
export async function withHardwarePort<T>(
  link: DeviceLink,
  options: HardwarePortOptions,
  body: (port: HardwareRuntimePort) => Promise<T>,
): Promise<{ value: T; release: ReleaseReport; port: HardwareRuntimePort }> {
  const port = new HardwareRuntimePort(link, options);
  let value: T;
  try {
    value = await body(port);
  } catch (error) {
    const release = await port.release();
    if (!release.ok)
      throw new AggregateError(
        [error, new Error(`and the board was not left safe: ${release.errors.join('; ')}`)],
        `${(error as Error).message}; the release also failed: ${release.errors.join('; ')}`,
      );
    throw error;
  }
  return { value, release: await port.release(), port };
}
