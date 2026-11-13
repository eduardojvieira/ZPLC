/**
 * Contract C8 of the M1 plan (spec 013 PLS-003, decision D-26): the one transport the command bar drives. `programTransport`
 * wraps the debug controller and `plantTransport` the plant session of contract C6 (Task W4); `store/useTransport.ts`
 * registers and selects them.
 *
 * State mapping. Debug controller `vmState`: `running` is running, `paused` is paused, `error` is faulted, anything else is
 * stopped. `PlantSessionState`: `idle` and `stopped` are stopped; `running`, `paused`, `held` and `faulted` keep their names.
 * `held` is not `paused`: the program stopped at a breakpoint and the plant waits (PLT-005).
 */
import type { PlantSession, PlantSessionState } from '../plant/contracts';
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

type Actions = Pick<Transport, 'run' | 'pause' | 'step' | 'stop' | 'reset'>;

/**
 * Both transports answer the same six calls with the same states. After an action that rejects the transport says `faulted`
 * with the reason, and the rejection still reaches the caller, whose handler words it for the person.
 */
function makeTransport(
  kind: Transport['kind'],
  readState: () => TransportState,
  readSlowdown: () => number,
  actions: Actions,
  subscribe?: (notify: (state: TransportState, reason?: string) => void) => () => void,
): Transport {
  const listeners = new Set<(state: TransportState, reason?: string) => void>();
  let fault: string | undefined;
  const notify = (state: TransportState, reason?: string) => listeners.forEach((listener) => listener(state, reason));
  const guarded = (action: () => Promise<void>) => async () => {
    fault = undefined;
    try {
      await action();
    } catch (error) {
      fault = error instanceof Error ? error.message : String(error);
      notify('faulted', fault);
      throw error;
    }
    notify(readState());
  };
  let unsubscribe: (() => void) | undefined;
  return {
    kind,
    get state() {
      return fault === undefined ? readState() : 'faulted';
    },
    get slowdown() {
      return readSlowdown();
    },
    run: guarded(actions.run),
    pause: guarded(actions.pause),
    step: guarded(actions.step),
    stop: guarded(actions.stop),
    reset: guarded(actions.reset),
    onChange(listener) {
      listeners.add(listener);
      if (subscribe && listeners.size === 1)
        unsubscribe = subscribe((state, reason) => {
          fault = undefined;
          notify(state, reason);
        });
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribe?.();
          unsubscribe = undefined;
        }
      };
    },
  };
}

function programState(controller: DebugController): TransportState {
  switch (controller.vmState) {
    case 'running':
      return 'running';
    case 'paused':
      return 'paused';
    case 'error':
      return 'faulted';
    default:
      return 'stopped';
  }
}

/** The program alone: today's debug controller calls, one for one. */
export function programTransport(controller: DebugController): Transport {
  return makeTransport(
    'program',
    () => programState(controller),
    () => 1,
    {
      run: () => (controller.vmState === 'paused' ? controller.resume() : controller.start()),
      pause: () => controller.pause(),
      step: () => controller.step(),
      stop: () => controller.stop(),
      reset: () => controller.reset(),
    },
  );
}

function plantState(state: PlantSessionState): TransportState {
  return state === 'idle' ? 'stopped' : state;
}

/** The program with its plant: one plant session, which runs the program and the plant on one clock (PLT-005). */
export function plantTransport(session: PlantSession): Transport {
  return makeTransport(
    'plant',
    () => plantState(session.state),
    () => session.slowdown,
    {
      run: async () => {
        if (session.state === 'paused') session.resume();
        else await session.start();
      },
      pause: async () => session.pause(),
      step: () => session.step(),
      stop: () => session.stop(),
      reset: () => session.reset(),
    },
    (notify) =>
      session.onChange((event) => {
        if (event.kind === 'state') notify(plantState(event.state), event.reason);
        // A slowdown changes what the rail says (PLS-013), not the state: listeners read `slowdown` again.
        else if (event.kind === 'slowdown') notify(plantState(session.state));
      }),
  );
}
