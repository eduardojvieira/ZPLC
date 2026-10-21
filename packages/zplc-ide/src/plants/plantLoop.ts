/**
 * The closed loop of a plant with a running program (LRN-018): each poll reads the mapped program outputs, steps the plant once
 * for every scan the runtime has run since the last poll, and writes the sensors the plant drives to the mapped program
 * inputs through the same typed input write the faceplate uses (the runtime applies it at the start of its next scan). Only a
 * sensor that changed is written. Time is the scan counter, never a clock, so the plant follows the program, not the poll rate.
 *
 * Pure TypeScript: the reads, the writes and the scan counter are passed in, so a test closes the loop over a fake program.
 */
import type { DeclaredInput } from '../runtime/declaredInputs';
import type { DeclaredOutput } from '../runtime/ioMap';
import type { PlantRun } from './plantEngine';
import type { ResolvedPlantMap } from './plantMap';

/** The most scans one poll replays, so that a long pause of the poll cannot freeze the window. */
const MAX_SCANS_PER_POLL = 50;

export interface PlantLoopPorts {
  run: PlantRun;
  resolved: Pick<ResolvedPlantMap, 'reads' | 'drives'>;
  read(points: ReadonlyArray<DeclaredOutput>): Promise<ReadonlyMap<string, boolean | number>>;
  write(point: DeclaredInput, value: boolean): Promise<void>;
  /** The scan counter of the runtime, or null when it cannot be read (then one poll is one scan). */
  cycles(): Promise<number | null>;
}

export function createPlantLoop({ run, resolved, read, write, cycles }: PlantLoopPorts) {
  let last: number | null = null;
  const written = new Map<string, boolean>();

  const sample = async (): Promise<Record<string, boolean>> => {
    const points = Object.values(resolved.reads);
    const values = points.length > 0 ? await read(points) : new Map();
    loop.reads = Object.fromEntries(Object.entries(resolved.reads).map(([signal, point]) => [signal, values.get(point.path) === true]));
    return loop.reads;
  };

  const sync = async (): Promise<void> => {
    const sensed = run.sense();
    for (const [signal, point] of Object.entries(resolved.drives)) {
      const value = sensed[signal] === true;
      if (written.get(signal) === value) continue;
      await write(point, value);
      written.set(signal, value);
    }
  };

  const loop = {
    /** The commands read from the program at the last pass, for the drawing. */
    reads: {} as Record<string, boolean>,
    /** One pass of the loop: the scans run since the last pass, then the sensors. */
    async poll(): Promise<void> {
      const now = await cycles();
      const scans = now === null ? 1 : last === null ? 0 : Math.min(MAX_SCANS_PER_POLL, Math.max(0, now - last));
      if (now !== null) last = now;
      if (scans > 0) {
        const reads = await sample();
        for (let i = 0; i < scans; i += 1) run.tick(reads);
      }
      await sync();
    },
    /** One scan of the plant, paused or not (the Step control). */
    async step(): Promise<void> {
      run.step(await sample());
      await sync();
    },
    /** Forget what was written, so the next pass writes every sensor again (after a reset or a reload). */
    forget(): void {
      written.clear();
      last = null;
    },
  };
  return loop;
}
export type PlantLoop = ReturnType<typeof createPlantLoop>;
