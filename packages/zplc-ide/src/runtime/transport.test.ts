import { describe, expect, it } from 'bun:test';

import type { PlantSession, PlantSessionEvent, PlantSessionState } from '../plant/contracts';
import type { DebugController } from '../hooks/debugControllerTypes';
import { activeTransport, registerPlantTransport } from '../store/useTransport';
import { plantTransport, programTransport, type TransportState } from './transport';

/** A debug controller whose calls are recorded and whose `vmState` follows them, like the real one. */
function fakeController(initial = 'idle') {
  const calls: string[] = [];
  const controller = { vmState: initial } as unknown as DebugController & { vmState: string };
  const act = (name: string, next: string) => async () => {
    calls.push(name);
    controller.vmState = next;
  };
  Object.assign(controller, {
    start: act('start', 'running'),
    resume: act('resume', 'running'),
    pause: act('pause', 'paused'),
    step: act('step', 'paused'),
    stop: act('stop', 'idle'),
    reset: act('reset', 'idle'),
  });
  return { controller, calls };
}

/** A plant session per contract C6: the calls are recorded and the state follows them. */
function fakeSession(initial: PlantSessionState = 'idle') {
  const calls: string[] = [];
  const listeners = new Set<(event: PlantSessionEvent) => void>();
  const session = {
    state: initial,
    slowdown: 1,
    onChange(listener: (event: PlantSessionEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as { state: PlantSessionState; slowdown: number } & PlantSession;
  const move = (name: string, next: PlantSessionState) => {
    calls.push(name);
    session.state = next;
    listeners.forEach((listener) => listener({ kind: 'state', state: next }));
  };
  Object.assign(session, {
    start: async () => move('start', 'running'),
    pause: () => move('pause', 'paused'),
    resume: () => move('resume', 'running'),
    step: async () => move('step', 'paused'),
    stop: async () => move('stop', 'stopped'),
    reset: async () => move('reset', 'stopped'),
  });
  return { session, calls, listeners, emit: (event: PlantSessionEvent) => listeners.forEach((listener) => listener(event)) };
}

describe('Transport (PLS-003, decision D-26)', () => {
  it('PLS-003 the program transport maps running, paused, error and idle of the debug controller', () => {
    const { controller } = fakeController();
    const transport = programTransport(controller);
    const seen = (['running', 'paused', 'error', 'idle', 'disconnected'] as const).map((vmState) => {
      (controller as { vmState: string }).vmState = vmState;
      return transport.state;
    });
    expect(seen).toEqual<TransportState[]>(['running', 'paused', 'faulted', 'stopped', 'stopped']);
    expect(transport.kind).toBe('program');
    expect(transport.slowdown).toBe(1);
  });

  it('PLS-003 run resumes when paused and starts otherwise', async () => {
    const { controller, calls } = fakeController('paused');
    const transport = programTransport(controller);
    await transport.run();
    await transport.stop();
    await transport.run();
    expect(calls).toEqual(['resume', 'stop', 'start']);
  });

  it('PLS-003 the plant transport maps the six states of a plant session, and held is not paused', () => {
    const { session } = fakeSession();
    const transport = plantTransport(session);
    const seen = (['idle', 'stopped', 'running', 'paused', 'held', 'faulted'] as const).map((state) => {
      session.state = state;
      return transport.state;
    });
    expect(seen).toEqual<TransportState[]>(['stopped', 'stopped', 'running', 'paused', 'held', 'faulted']);
    expect(seen[3]).not.toBe(seen[4]);
    expect(transport.kind).toBe('plant');
    session.slowdown = 0.5;
    expect(transport.slowdown).toBe(0.5);
  });

  it('PLS-003 both transports answer run, pause, step, run, stop, reset with the same states', async () => {
    const program = programTransport(fakeController().controller);
    const plant = plantTransport(fakeSession().session);
    const trace = async (transport: typeof program) => {
      const states: TransportState[] = [];
      for (const action of ['run', 'pause', 'step', 'run', 'stop', 'reset'] as const) {
        await transport[action]();
        states.push(transport.state);
      }
      return states;
    };
    const expected: TransportState[] = ['running', 'paused', 'paused', 'running', 'stopped', 'stopped'];
    expect(await trace(program)).toEqual(expected);
    expect(await trace(plant)).toEqual(expected);
  });

  it('PLS-003 the plant transport drives the session: start, then resume from paused', async () => {
    const { session, calls } = fakeSession();
    const transport = plantTransport(session);
    await transport.run();
    await transport.pause();
    await transport.run();
    expect(calls).toEqual(['start', 'pause', 'resume']);
  });

  it('PLS-003 a change of the plant session reaches the listeners, and the last one to leave unsubscribes', async () => {
    const { session, emit, listeners } = fakeSession();
    const transport = plantTransport(session);
    const heard: Array<[TransportState, string | undefined]> = [];
    const off = transport.onChange((state, reason) => heard.push([state, reason]));
    expect(listeners.size).toBe(1);
    emit({ kind: 'state', state: 'held', reason: 'breakpoint' });
    session.slowdown = 0.5;
    emit({ kind: 'slowdown', factor: 0.5, message: 'slow' });
    // a slowdown is a change too (PLS-013): the listener repaints and reads `slowdown` again
    expect(heard).toEqual([
      ['held', 'breakpoint'],
      ['stopped', undefined],
    ]);
    expect(transport.slowdown).toBe(0.5);
    off();
    expect(listeners.size).toBe(0);
  });

  it(
    'PLS-003 with a plant transport registered the active transport is the plant one, and the program one again after it ' + 'unregisters',
    () => {
      const { controller } = fakeController();
      expect(activeTransport(controller).kind).toBe('program');
      const plant = plantTransport(fakeSession().session);
      const unregister = registerPlantTransport(plant);
      expect(activeTransport(controller)).toBe(plant);
      unregister();
      expect(activeTransport(controller).kind).toBe('program');
    },
  );

  it('PLS-003 a stale unregister does not remove a transport registered after it', () => {
    const { controller } = fakeController();
    const first = plantTransport(fakeSession().session);
    const second = plantTransport(fakeSession().session);
    const unregisterFirst = registerPlantTransport(first);
    const unregisterSecond = registerPlantTransport(second);
    unregisterFirst();
    expect(activeTransport(controller)).toBe(second);
    unregisterSecond();
  });

  it('a transport whose action rejects reports faulted with the reason, and the rejection reaches the caller', async () => {
    const { controller } = fakeController();
    (controller as { start: () => Promise<void> }).start = async () => {
      throw new Error('no runtime');
    };
    const transport = programTransport(controller);
    const heard: Array<[TransportState, string | undefined]> = [];
    transport.onChange((state, reason) => heard.push([state, reason]));
    await expect(transport.run()).rejects.toThrow('no runtime');
    expect(heard).toEqual([['faulted', 'no runtime']]);
    expect(transport.state).toBe('faulted');
  });
});
