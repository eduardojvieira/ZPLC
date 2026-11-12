/**
 * Contract C8 of the M1 plan (spec 013 PLS-003, decision D-26): the one transport the command bar drives. Task W0 declares
 * the types and nothing else; Task W4 writes `programTransport` (over the debug controller) and `plantTransport` (over the
 * plant session of contract C6), and `store/useTransport.ts` registers and selects them.
 *
 * State mapping. Debug controller `vmState`: `running` is running, `paused` is paused, `error` is faulted, anything else is
 * stopped. `PlantSessionState`: `idle` and `stopped` are stopped; `running`, `paused`, `held` and `faulted` keep their names.
 * `held` is not `paused`: the program stopped at a breakpoint and the plant waits (PLT-005).
 */
import type { PlantSession } from '../plant/contracts';
import type { DebugController } from '../hooks/debugControllerTypes';

export type TransportState = 'stopped' | 'running' | 'paused' | 'held' | 'faulted';

export interface Transport {
  readonly kind: 'program' | 'plant';
  readonly state: TransportState;
  /** 1 = real time. Below 1 a plant slows itself and the program together (PLT-016). Always 1 for 'program'. */
  readonly slowdown: number;
  /** Starts, or resumes when paused. */
  run(): Promise<void>;
  pause(): Promise<void>;
  /** One scan. */
  step(): Promise<void>;
  stop(): Promise<void>;
  /** Program and plant together (spec 013, section 4.3). */
  reset(): Promise<void>;
  onChange(listener: (state: TransportState, reason?: string) => void): () => void;
}

/** Task W4. */
export declare function programTransport(controller: DebugController): Transport;
/** Task W4, over contract C6. */
export declare function plantTransport(session: PlantSession): Transport;
