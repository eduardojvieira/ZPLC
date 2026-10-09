/**
 * @file useDebugControllerBreakpoints.ts
 * @brief Breakpoint synchronisation between the IDE and the runtime, for useDebugController.
 *
 * The IDE keeps breakpoint lines; the runtime keeps its own table of PCs and drops it on
 * program.load and execution.reset. Two code paths used to push the IDE list into the runtime
 * (loadProgram and the "sync" effect) and both ran right after a load: their clear/add calls
 * interleaved and the second `breakpoint.add` of a pc was refused by the runtime.
 * Every push now goes through one syncer: one round at a time, and a round that would leave the
 * runtime in the state it is already known to be in is skipped.
 */

import type { IDebugAdapter } from '../runtime/debugAdapter';

export type BreakpointSyncTarget = Pick<IDebugAdapter, 'clearBreakpoints' | 'setBreakpoint'>;

export interface BreakpointSyncOutcome {
  /** The distinct PCs the IDE asked the runtime to stop at, ascending. */
  pcs: number[];
  /** Why the runtime does not hold them; null when it does. */
  error: unknown;
  /** False when an earlier round had already left the runtime in this state, so nothing was sent. */
  sent: boolean;
}

export interface BreakpointSyncer {
  /**
   * The runtime lost its table (program.load, execution.reset, a new session): the next sync must
   * send even a list that did not change, and a round already in flight must not count as done.
   */
  invalidate(): void;
  /**
   * Make the runtime hold exactly the PCs `readPcs` returns when this call's turn comes.
   * Resolves null when `isCurrent` turned false (adapter replaced or disconnected): nothing to report.
   */
  sync(target: BreakpointSyncTarget, readPcs: () => number[], isCurrent: () => boolean): Promise<BreakpointSyncOutcome | null>;
}

export function createBreakpointSyncer(): BreakpointSyncer {
  let queue: Promise<unknown> = Promise.resolve();
  let epoch = 0;
  // What the runtime is known to hold (or to have refused) for `target`; null = unknown.
  let known: { target: BreakpointSyncTarget; key: string; error: unknown } | null = null;

  async function round(
    target: BreakpointSyncTarget,
    readPcs: () => number[],
    isCurrent: () => boolean,
  ): Promise<BreakpointSyncOutcome | null> {
    if (!isCurrent()) return null;
    const pcs = [...new Set(readPcs())].sort((a, b) => a - b);
    const key = pcs.join(',');
    if (known?.target === target && known.key === key) {
      return { pcs, error: known.error, sent: false };
    }

    known = null;
    const startedAt = epoch;
    const remember = (error: unknown) => {
      if (epoch === startedAt) known = { target, key, error };
    };
    try {
      await target.clearBreakpoints();
      for (const pc of pcs) {
        if (!isCurrent()) return null;
        await target.setBreakpoint(pc);
      }
      if (!isCurrent()) return null;
      remember(null);
      return { pcs, error: null, sent: true };
    } catch (error) {
      if (!isCurrent()) return null;
      remember(error);
      // All or nothing: a half-set table would stop at some dots and not at others.
      await target.clearBreakpoints().catch(() => undefined);
      return { pcs, error, sent: true };
    }
  }

  return {
    invalidate() {
      epoch += 1;
      known = null;
    },
    sync(target, readPcs, isCurrent) {
      const result = queue.then(() => round(target, readPcs, isCurrent));
      queue = result.catch(() => undefined);
      return result;
    },
  };
}
