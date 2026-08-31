import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { DEBUG_ADAPTER_TYPE } from './debugAdapter';
import { NativeAdapter } from './nativeAdapter';
import { createNativeRequest } from './nativeProtocol';

type NativeRequest = ReturnType<typeof createNativeRequest>;

const startSession = mock(async () => ({
  protocol_version: '1.0',
  runtime_kind: 'native-posix',
  runtime_version: '1.5.0',
  capability_profile: {
    profile_id: 'cap-01',
    features: [
      { name: 'pause', status: 'supported' as const },
      { name: 'resume', status: 'supported' as const },
      { name: 'step', status: 'supported' as const },
      { name: 'breakpoints', status: 'supported' as const },
    ],
  },
}));

const stopSession = mock(async () => undefined);
const requestMock = mock(async (message: NativeRequest) => {
  switch (message.method) {
    case 'program.load':
      return {
        program_size: typeof message.params.bytecode_hex === 'string' ? message.params.bytecode_hex.length / 2 : 0,
        program_generation: 1,
      };
    case 'status.get':
      return nativeSnapshot({
        state: 'idle',
        uptime_ms: 123,
        stats: {
          cycles: 7,
          active_tasks: 1,
          overruns: 0,
          program_size: 5,
        },
        focused_vm: { pc: 12, sp: 2, halted: false, error: 0 },
        opi: [0, 1, 0, 0, 0, 0, 0, 0],
      });
    case 'execution.step':
    case 'scenario.step':
      return {
        state: 'paused',
        uptime_ms: 124,
        program_generation: 1,
        stats: {
          cycles: 8,
          active_tasks: 1,
          overruns: 1,
          program_size: 5,
        },
        focused_vm: {
          pc: 13,
          sp: 2,
          halted: false,
          error: 0,
        },
        tasks: [{
          task_id: 0,
          state: 'paused',
          cycles: 8,
          overruns: 1,
          interval_us: 1000,
          priority: 1,
          pc: 13,
          sp: 2,
          halted: false,
          error: 0,
        }],
        opi: [1, 0, 1, 0, 0, 0, 0, 0],
        ipi: [0, 0, 0, 0, 0, 0, 0, 0],
        force_entries: [],
        host_cadence: {
          kind: 'observed_poll_cadence',
          missed_intervals: 0,
          last_dispatch_lateness_ms: 2,
        },
      };
    case 'memory.read':
      return { bytes_hex: '2A00' };
    case 'memory.write':
      return {};
    case 'breakpoint.add':
      return { breakpoints: [12, 24, Number(message.params.pc)] };
    case 'breakpoint.remove':
      return { breakpoints: [12] };
    case 'breakpoint.clear':
      return { breakpoints: [] };
    case 'breakpoint.list':
      return { breakpoints: [12, 24] };
    case 'force.set':
      return { force_entries: [{ address: Number(message.params.address), size: 1, bytes_hex: '01', state: 'forced' }] };
    case 'force.clear':
      return { force_entries: [] };
    case 'force.clear_all':
      return { force_entries: [] };
    case 'force.list':
      return { force_entries: [{ address: 0, size: 1, bytes_hex: '01', state: 'forced' }] };
    default:
      return {};
  }
});

const request = async <TResult = unknown>(message: NativeRequest): Promise<TResult> => {
  return (await requestMock(message)) as TResult;
};

function createEventApi() {
  let eventHandler: ((event: {
    type: 'event';
    method: string;
    params: Record<string, unknown>;
  }) => void) | null = null;

  return {
    onEvent: (callback: (event: {
      type: 'event';
      method: string;
      params: Record<string, unknown>;
    }) => void) => {
      eventHandler = callback;
      return () => {
        eventHandler = null;
      };
    },
    emit: (event: {
      type: 'event';
      method: string;
      params: Record<string, unknown>;
    }) => {
      eventHandler?.(event);
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function nativeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    state: 'paused',
    uptime_ms: 124,
    program_generation: 1,
    stats: { cycles: 8, active_tasks: 1, overruns: 1, program_size: 5 },
    focused_vm: { pc: 13, sp: 2, halted: false, error: 0 },
    tasks: [{ task_id: 0, state: 'paused', cycles: 8, overruns: 1, interval_us: 1000, priority: 1, pc: 13, sp: 2, halted: false, error: 0 }],
    opi: [1, 0, 1, 0, 0, 0, 0, 0],
    ipi: [0, 0, 0, 0, 0, 0, 0, 0],
    force_entries: [],
    ...overrides,
  };
}

describe('NativeAdapter', () => {
  beforeEach(() => {
    startSession.mockClear();
    stopSession.mockClear();
    requestMock.mockClear();
  });

  it('connects through the Electron native simulation API', async () => {
    const adapter = new NativeAdapter({ startSession, stopSession, request });

    await adapter.connect();

    expect(adapter.type).toBe(DEBUG_ADAPTER_TYPE.NATIVE);
    expect(adapter.connected).toBe(true);
    expect(adapter.state).toBe('idle');
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid native hello, stops the child, and stays disconnected', async () => {
    const localStop = mock(async () => undefined);
    const adapter = new NativeAdapter({
      startSession: async () => ({
        protocol_version: '1.0', runtime_kind: 'native-posix', runtime_version: '1.5.0',
        capability_profile: { profile_id: 'native-posix-mvp', features: [null] },
      } as never),
      stopSession: localStop,
      request,
    });
    const errors: string[] = [];
    adapter.setEventHandlers({ onError: (message) => errors.push(message) });

    await expect(adapter.connect()).rejects.toThrow('Invalid native simulator capability profile');
    expect(localStop).toHaveBeenCalledTimes(1);
    expect(adapter.connected).toBe(false);
    expect(adapter.state).toBe('disconnected');
    expect(errors).toEqual(['Invalid native simulator capability profile']);
  });

  it('loads bytecode and normalizes status snapshots', async () => {
    const adapter = new NativeAdapter({ startSession, stopSession, request });
    await adapter.connect();

    await adapter.loadProgram(new Uint8Array([0x00, 0x2a]));
    const info = await adapter.getInfo();

    expect(requestMock).toHaveBeenCalled();
    expect(info.pc).toBe(12);
    expect(info.sp).toBe(2);
    expect(info.cycles).toBe(7);
  });

  it('stages only closed simulation inputs after a native program activation', async () => {
    const requests: NativeRequest[] = [];
    const adapter = new NativeAdapter({
      startSession: async () => ({
        protocol_version: '1.0', runtime_kind: 'native-posix', runtime_version: '1.5.0',
        capability_profile: { profile_id: 'native-posix-mvp', features: [{ name: 'simulation-inputs', status: 'supported' }] },
      }),
      stopSession,
      request: async <TResult>(message: NativeRequest): Promise<TResult> => {
        requests.push(message);
        if (message.method === 'program.load') return { program_size: 1, program_generation: 1 } as TResult;
        return { input_id: 'motor.start', active: true, program_generation: 1, cycle_count_at_apply: 0, state: 'staged' } as TResult;
      },
    });

    await adapter.connect();
    expect(adapter.supportsSimulationInput).toBe(true);
    await expect(adapter.setSimulationInput('motor.start', true)).rejects.toThrow('running or paused');
    await adapter.loadProgram(new Uint8Array([0x00]));
    await adapter.start();
    await adapter.setSimulationInput('motor.start', true);

    expect(requests.at(-1)).toEqual(createNativeRequest(expect.any(String), 'simulation.input.set', {
      input_id: 'motor.start', active: true, program_generation: 1,
    }));
    await expect(adapter.setSimulationInput('motor.overload' as 'motor.start', true)).rejects.toThrow();
  });

  it('fails closed for a noncanonical native input capability session', async () => {
    for (const [runtime_kind, profile_id] of [['wasm', 'native-posix-mvp'], ['native-posix', 'other-profile']]) {
      const adapter = new NativeAdapter({
        startSession: async () => ({
          protocol_version: '1.0', runtime_kind, runtime_version: '1.5.0',
          capability_profile: { profile_id, features: [{ name: 'simulation-inputs', status: 'supported' }] },
        }),
        stopSession,
        request: async <TResult>(message: NativeRequest): Promise<TResult> => (
          message.method === 'program.load' ? { program_size: 1, program_generation: 1 } : {}
        ) as TResult,
      });
      await adapter.connect();
      expect(adapter.supportsSimulationInput).toBe(false);
      await adapter.loadProgram(new Uint8Array([0x00]));
      await adapter.start();
      await expect(adapter.setSimulationInput('motor.start', true)).rejects.toThrow('does not support');
    }
  });

  it('rejects malformed or mismatched native simulation input acknowledgements', async () => {
    for (const acknowledgement of [
      { input_id: 'motor.start', active: true, program_generation: 1, cycle_count_at_apply: 0, state: 'applied' },
      { input_id: 'motor.stop', active: true, program_generation: 1, cycle_count_at_apply: 0, state: 'staged' },
      { input_id: 'motor.start', active: true, program_generation: 2, cycle_count_at_apply: 0, state: 'staged' },
      { input_id: 'motor.start', active: true, program_generation: 1, cycle_count_at_apply: -1, state: 'staged' },
    ]) {
      const adapter = new NativeAdapter({
        startSession: async () => ({
          protocol_version: '1.0', runtime_kind: 'native-posix', runtime_version: '1.5.0',
          capability_profile: { profile_id: 'native-posix-mvp', features: [{ name: 'simulation-inputs', status: 'supported' }] },
        }),
        stopSession,
        request: async <TResult>(message: NativeRequest): Promise<TResult> => (
          message.method === 'program.load' ? { program_size: 1, program_generation: 1 } : acknowledgement
        ) as TResult,
      });
      await adapter.connect();
      await adapter.loadProgram(new Uint8Array([0x00]));
      await adapter.start();
      await expect(adapter.setSimulationInput('motor.start', true)).rejects.toThrow('Invalid native simulation input acknowledgement');
    }
  });

  it('clears the native program token when a required snapshot field is malformed or absent', async () => {
    let invalid = false;
    const adapter = new NativeAdapter({
      startSession: async () => ({
        protocol_version: '1.0', runtime_kind: 'native-posix', runtime_version: '1.5.0',
        capability_profile: { profile_id: 'native-posix-mvp', features: [{ name: 'simulation-inputs', status: 'supported' }] },
      }),
      stopSession,
      request: async <TResult>(message: NativeRequest): Promise<TResult> => {
        if (message.method === 'program.load') return { program_size: 1, program_generation: 1 } as TResult;
        if (message.method === 'status.get') return (invalid ? nativeSnapshot({ ipi: undefined }) : nativeSnapshot()) as TResult;
        return {} as TResult;
      },
    });
    await adapter.connect();
    await adapter.loadProgram(new Uint8Array([0]));
    await adapter.start();
    invalid = true;

    await expect(adapter.getInfo()).rejects.toThrow('Invalid native runtime snapshot');
    await expect(adapter.setSimulationInput('motor.start', true)).rejects.toThrow('current native program generation');
  });

  it('rejects malformed activation and reset acknowledgements without retaining a token', async () => {
    const adapter = new NativeAdapter({
      startSession: async () => ({
        protocol_version: '1.0', runtime_kind: 'native-posix', runtime_version: '1.5.0',
        capability_profile: { profile_id: 'native-posix-mvp', features: [{ name: 'simulation-inputs', status: 'supported' }] },
      }),
      stopSession,
      request: async <TResult>(message: NativeRequest): Promise<TResult> => {
        if (message.method === 'program.load') return { program_size: 2, program_generation: 1 } as TResult;
        return { program_generation: 1, extra: true } as TResult;
      },
    });
    await adapter.connect();
    await expect(adapter.loadProgram(new Uint8Array([0]))).rejects.toThrow('Invalid native program activation result');
    await adapter.start();
    await expect(adapter.setSimulationInput('motor.start', true)).rejects.toThrow('current native program generation');

    const resetAdapter = new NativeAdapter({
      startSession: async () => ({
        protocol_version: '1.0', runtime_kind: 'native-posix', runtime_version: '1.5.0',
        capability_profile: { profile_id: 'native-posix-mvp', features: [{ name: 'simulation-inputs', status: 'supported' }] },
      }),
      stopSession,
      request: async <TResult>(message: NativeRequest): Promise<TResult> => (
        message.method === 'program.load' ? { program_size: 1, program_generation: 1 } : { program_generation: 1, extra: true }
      ) as TResult,
    });
    await resetAdapter.connect();
    await resetAdapter.loadProgram(new Uint8Array([0]));
    await expect(resetAdapter.reset()).rejects.toThrow('Invalid native program reset result');
    await resetAdapter.start();
    await expect(resetAdapter.setSimulationInput('motor.start', true)).rejects.toThrow('current native program generation');
  });

  it('synchronizes a valid zero program generation from status without retaining an older token', async () => {
    const adapter = new NativeAdapter({
      startSession: async () => ({
        protocol_version: '1.0', runtime_kind: 'native-posix', runtime_version: '1.5.0',
        capability_profile: { profile_id: 'native-posix-mvp', features: [{ name: 'simulation-inputs', status: 'supported' }] },
      }),
      stopSession,
      request: async <TResult>(message: NativeRequest): Promise<TResult> => {
        if (message.method === 'program.load') return { program_size: 1, program_generation: 1 } as TResult;
        if (message.method === 'status.get') return nativeSnapshot({
          state: 'running', program_generation: 0,
          stats: { cycles: 0, active_tasks: 1, overruns: 0, program_size: 0 },
        }) as TResult;
        return {} as TResult;
      },
    });
    await adapter.connect();
    await adapter.loadProgram(new Uint8Array([0]));
    await adapter.start();
    await adapter.getInfo();
    await expect(adapter.setSimulationInput('motor.start', true)).rejects.toThrow('current native program generation');
  });

  it('fails closed when a capability update changes or duplicates simulation input authority during a request', async () => {
    const eventApi = createEventApi();
    const acknowledgement = deferred<Record<string, unknown>>();
    const adapter = new NativeAdapter({
      startSession: async () => ({
        protocol_version: '1.0', runtime_kind: 'native-posix', runtime_version: '1.5.0',
        capability_profile: { profile_id: 'native-posix-mvp', features: [{ name: 'simulation-inputs', status: 'supported' }] },
      }),
      stopSession,
      onEvent: eventApi.onEvent,
      request: async <TResult>(message: NativeRequest): Promise<TResult> => {
        if (message.method === 'program.load') return { program_size: 1, program_generation: 1 } as TResult;
        if (message.method === 'simulation.input.set') return acknowledgement.promise as TResult;
        return {} as TResult;
      },
    });
    await adapter.connect();
    await adapter.loadProgram(new Uint8Array([0]));
    await adapter.start();
    const pending = adapter.setSimulationInput('motor.start', true);
    eventApi.emit({
      type: 'event', method: 'capability.updated', params: {
        profile_id: 'native-posix-mvp',
        features: [
          { name: 'simulation-inputs', status: 'supported' },
          { name: 'simulation-inputs', status: 'supported' },
        ],
      },
    });
    acknowledgement.resolve({ input_id: 'motor.start', active: true, program_generation: 1, cycle_count_at_apply: 0, state: 'staged' });
    await expect(pending).rejects.toThrow('Invalid native simulation input acknowledgement');
    await expect(adapter.setSimulationInput('motor.start', true)).rejects.toThrow('does not support');
  });

  it('revokes simulation input authority when a malformed capability update arrives during a pending request', async () => {
    const eventApi = createEventApi();
    const acknowledgement = deferred<Record<string, unknown>>();
    const adapter = new NativeAdapter({
      startSession: async () => ({
        protocol_version: '1.0', runtime_kind: 'native-posix', runtime_version: '1.5.0',
        capability_profile: { profile_id: 'native-posix-mvp', features: [{ name: 'simulation-inputs', status: 'supported' }] },
      }),
      stopSession,
      onEvent: eventApi.onEvent,
      request: async <TResult>(message: NativeRequest): Promise<TResult> => {
        if (message.method === 'program.load') return { program_size: 1, program_generation: 1 } as TResult;
        if (message.method === 'simulation.input.set') return acknowledgement.promise as TResult;
        return {} as TResult;
      },
    });
    await adapter.connect();
    await adapter.loadProgram(new Uint8Array([0]));
    await adapter.start();
    const pending = adapter.setSimulationInput('motor.start', true);
    eventApi.emit({
      type: 'event', method: 'capability.updated', params: {
        profile_id: 'native-posix-mvp', features: [null],
      },
    });
    acknowledgement.resolve({ input_id: 'motor.start', active: true, program_generation: 1, cycle_count_at_apply: 0, state: 'staged' });

    await expect(pending).rejects.toThrow('Invalid native simulation input acknowledgement');
    await expect(adapter.setSimulationInput('motor.start', true)).rejects.toThrow('does not support');
  });

  it('reads memory and breakpoint lists through structured requests', async () => {
    const adapter = new NativeAdapter({ startSession, stopSession, request });
    await adapter.connect();

    const bytes = await adapter.peek(0x1000, 2);
    const breakpoints = await adapter.getBreakpoints();

    expect(Array.from(bytes)).toEqual([0x2a, 0x00]);
    expect(breakpoints).toEqual([12, 24]);
  });

  it('updates VM state and info from runtime status events', async () => {
    const eventApi = createEventApi();
    const adapter = new NativeAdapter({ startSession, stopSession, request, onEvent: eventApi.onEvent });
    const states: string[] = [];
    const pcs: number[] = [];
    const snapshots: import('./debugAdapter').RuntimeSnapshot[] = [];

    adapter.setEventHandlers({
      onStateChange: (state) => {
        states.push(state);
      },
      onInfoUpdate: (info) => {
        pcs.push(info.pc);
      },
      onRuntimeSnapshot: (snapshot) => {
        snapshots.push(snapshot);
      },
    });

    await adapter.connect();

    eventApi.emit({
      type: 'event',
      method: 'status.changed',
      params: nativeSnapshot({
        state: 'running',
        uptime_ms: 200,
        stats: {
          cycles: 11,
          active_tasks: 1,
          overruns: 0,
          program_size: 5,
        },
        focused_vm: { pc: 99, sp: 3, halted: false, error: 0 },
        host_cadence: {
          kind: 'observed_poll_cadence',
          missed_intervals: 3,
          last_dispatch_lateness_ms: 7,
        },
      }),
    });

    expect(adapter.state).toBe('running');
    expect(states).toContain('running');
    expect(pcs).toContain(99);
    expect(snapshots[0]?.hostCadence).toEqual({
      kind: 'observed_poll_cadence',
      missedIntervals: 3,
      lastDispatchLatenessMs: 7,
    });
  });

  it('rejects malformed optional host cadence in runtime status events', async () => {
    const eventApi = createEventApi();
    const adapter = new NativeAdapter({ startSession, stopSession, request, onEvent: eventApi.onEvent });
    const snapshots: import('./debugAdapter').RuntimeSnapshot[] = [];
    adapter.setEventHandlers({ onRuntimeSnapshot: (snapshot) => snapshots.push(snapshot) });
    await adapter.connect();

    eventApi.emit({
      type: 'event',
      method: 'status.changed',
      params: nativeSnapshot({
        state: 'running',
        uptime_ms: 200,
        stats: { cycles: 11, active_tasks: 1, overruns: 0, program_size: 5 },
        host_cadence: {
          kind: 'not_observed_poll_cadence',
          missed_intervals: -1,
          last_dispatch_lateness_ms: 7.5,
        },
      }),
    });

    eventApi.emit({
      type: 'event',
      method: 'status.changed',
      params: nativeSnapshot({
        state: 'running',
        uptime_ms: 200,
        stats: { cycles: 11, active_tasks: 1, overruns: 0, program_size: 5 },
        host_cadence: null,
      }),
    });

    expect(adapter.state).toBe('idle');
    expect(snapshots).toEqual([]);
  });

  it('emits breakpoint hits when native runtime transitions to paused', async () => {
    const eventApi = createEventApi();
    const adapter = new NativeAdapter({ startSession, stopSession, request, onEvent: eventApi.onEvent });
    const hits: number[] = [];

    adapter.setEventHandlers({
      onBreakpointHit: (pc) => {
        hits.push(pc);
      },
    });

    await adapter.connect();

    eventApi.emit({
      type: 'event',
      method: 'status.changed',
      params: {
        state: 'paused',
        uptime_ms: 200,
        program_generation: 1,
        stats: {
          cycles: 11,
          active_tasks: 1,
          overruns: 0,
          program_size: 5,
        },
        focused_vm: {
          pc: 42,
          sp: 3,
          halted: false,
          error: 0,
        },
        tasks: [
          {
            task_id: 0,
            state: 'paused',
            cycles: 11,
            overruns: 0,
            interval_us: 13000,
            priority: 1,
            pc: 42,
            sp: 3,
            halted: false,
            error: 0,
          },
        ],
        opi: [0, 0, 0, 0, 0, 0, 0, 0],
        ipi: [0, 0, 0, 0, 0, 0, 0, 0],
        force_entries: [],
      },
    });

    expect(hits).toEqual([42]);
  });

  it('marks the adapter disconnected when the native session exits', async () => {
    const eventApi = createEventApi();
    const adapter = new NativeAdapter({ startSession, stopSession, request, onEvent: eventApi.onEvent });
    const errors: string[] = [];

    adapter.setEventHandlers({
      onError: (message) => {
        errors.push(message);
      },
    });

    await adapter.connect();

    eventApi.emit({
      type: 'event',
      method: 'session.exited',
      params: {},
    });

    expect(adapter.connected).toBe(false);
    expect(adapter.state).toBe('disconnected');
    expect(errors).toEqual(['Native simulator session exited']);
  });

  it('supports runtime-owned memory, breakpoint, and force commands', async () => {
    const adapter = new NativeAdapter({ startSession, stopSession, request });
    await adapter.connect();

    await adapter.pokeN(0x1000, new Uint8Array([0x2a, 0x00]));
    const breakpointAdded = await adapter.setBreakpoint(64);
    const breakpointRemoved = await adapter.removeBreakpoint(24);
    await adapter.clearBreakpoints();
    await adapter.forceValue(0, new Uint8Array([0x01]));
    const forcedValues = await adapter.listForcedValues();
    await adapter.clearForcedValue(0);
    await adapter.clearAllForcedValues();

    expect(breakpointAdded).toBe(true);
    expect(breakpointRemoved).toBe(true);
    expect(forcedValues).toEqual([
      {
        path: '0x0000',
        address: 0,
        size: 1,
        type: 'BYTE',
        bytesHex: '01',
        state: 'forced',
      },
    ]);
  });

  it('returns normalized runtime snapshots for shared workflow consumers', async () => {
    const adapter = new NativeAdapter({ startSession, stopSession, request });
    await adapter.connect();

    const snapshot = await adapter.getRuntimeSnapshot();

    expect(snapshot.source).toBe('native');
    expect(snapshot.stats.cycles).toBeGreaterThanOrEqual(0);
    expect(snapshot.focusedVm?.pc).toBeTypeOf('number');
    expect(snapshot.hostCadence).toBeUndefined();
  });

  it('publishes a validated step snapshot before step completion without inventing a breakpoint', async () => {
    const adapter = new NativeAdapter({ startSession, stopSession, request });
    const events: string[] = [];
    const snapshots: import('./debugAdapter').RuntimeSnapshot[] = [];
    const breakpoints: number[] = [];
    adapter.setEventHandlers({
      onInfoUpdate: (info) => events.push(`info:${info.pc}:${info.cycles}`),
      onRuntimeSnapshot: (snapshot) => {
        events.push(`snapshot:${snapshot.uptimeMs}:${snapshot.stats.overruns}`);
        snapshots.push(snapshot);
      },
      onStepComplete: (pc) => events.push(`step:${pc}`),
      onBreakpointHit: (pc) => breakpoints.push(pc),
    });
    await adapter.connect();

    await adapter.step();

    expect(adapter.state).toBe('paused');
    expect(events).toEqual(['info:13:8', 'snapshot:124:1', 'step:13']);
    expect(snapshots[0]).toMatchObject({
      uptimeMs: 124,
      state: 'paused',
      stats: { cycles: 8, overruns: 1 },
      focusedVm: { pc: 13 },
      opi: [1, 0, 1, 0, 0, 0, 0, 0],
      hostCadence: { missedIntervals: 0, lastDispatchLatenessMs: 2 },
    });
    expect(snapshots[0]?.tasks).toHaveLength(1);
    expect(breakpoints).toEqual([]);
  });

  it('sends a strict logical timestamp for scenario steps', async () => {
    const adapter = new NativeAdapter({ startSession, stopSession, request: requestMock });
    await adapter.connect();

    await adapter.scenarioStep(20);
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({
      method: 'scenario.step', params: { at_ms: 20 },
    }));
    await expect(adapter.scenarioStep(-1)).rejects.toThrow('uint32');
    await expect(adapter.scenarioStep(1.5)).rejects.toThrow('uint32');
  });

  it('rejects malformed step snapshots before state or event updates', async () => {
    const malformedRequest = async <TResult = unknown>(message: NativeRequest): Promise<TResult> => {
      if (message.method === 'execution.step') {
        return {
          state: 'paused',
          uptime_ms: 124,
          stats: { cycles: 8, active_tasks: 1, overruns: 1, program_size: 5 },
          focused_vm: { pc: 13, sp: 2, halted: false, error: 0 },
          tasks: [],
          opi: [256],
          force_entries: [],
        } as TResult;
      }
      return request<TResult>(message);
    };
    const adapter = new NativeAdapter({ startSession, stopSession, request: malformedRequest });
    const events: string[] = [];
    adapter.setEventHandlers({
      onInfoUpdate: () => events.push('info'),
      onRuntimeSnapshot: () => events.push('snapshot'),
      onStepComplete: () => events.push('step'),
    });
    await adapter.connect();

    await expect(adapter.step()).rejects.toThrow('Invalid native runtime snapshot');

    expect(adapter.state).toBe('idle');
    expect(events).toEqual([]);
  });

  it('does not publish a late step response after disconnecting the native session', async () => {
    const stepResponse = deferred<unknown>();
    const request = async <TResult = unknown>(message: NativeRequest): Promise<TResult> => {
      if (message.method === 'execution.step') return stepResponse.promise as TResult;
      return requestMock(message) as TResult;
    };
    const adapter = new NativeAdapter({ startSession, stopSession, request });
    const events: string[] = [];
    adapter.setEventHandlers({
      onInfoUpdate: () => events.push('info'),
      onRuntimeSnapshot: () => events.push('snapshot'),
      onStepComplete: () => events.push('step'),
    });
    await adapter.connect();

    const stepping = adapter.step();
    await adapter.disconnect();
    stepResponse.resolve(nativeSnapshot());

    await expect(stepping).rejects.toThrow('Native simulator session is no longer active');
    expect(adapter.connected).toBe(false);
    expect(adapter.state).toBe('disconnected');
    expect(events).toEqual([]);
  });

  it('becomes logically disconnected even when native session shutdown fails', async () => {
    stopSession.mockImplementationOnce(async () => {
      throw new Error('raw shutdown detail');
    });
    const adapter = new NativeAdapter({ startSession, stopSession, request });
    await adapter.connect();

    await expect(adapter.disconnect()).rejects.toThrow('Failed to stop native simulator session');

    expect(adapter.connected).toBe(false);
    expect(adapter.state).toBe('disconnected');
  });

  it('rejects native snapshots outside the exact POSIX session contract', async () => {
    const task = (task_id: number, priority: number, interval_us = 10_000) => ({
      task_id, state: 'paused', cycles: 8, overruns: 1, interval_us, priority, pc: 13, sp: 2, halted: false, error: 0,
    });
    const validTaskSet = nativeSnapshot({
      stats: { cycles: 8, active_tasks: 2, overruns: 1, program_size: 5 },
      focused_vm: { pc: 0xffff, sp: 0xffff, halted: false, error: 0xff },
      tasks: [task(2, 1), { ...task(0xffff, 0xff), pc: 0xffff, sp: 0xffff, error: 0xff }],
    });
    const validAdapter = new NativeAdapter({
      startSession,
      stopSession,
      request: async <TResult = unknown>(message: NativeRequest): Promise<TResult> =>
        (message.method === 'status.get' ? validTaskSet : requestMock(message)) as TResult,
    });
    await validAdapter.connect();
    await expect(validAdapter.getRuntimeSnapshot()).resolves.toMatchObject({ stats: { activeTasks: 2 } });

    const invalidSnapshots = [
      nativeSnapshot({ uptime_ms: 0x1_0000_0000 }),
      nativeSnapshot({ opi: [0, 0, 0, 0, 0, 0, 0] }),
      nativeSnapshot({ stats: { cycles: 8, active_tasks: 2, overruns: 1, program_size: 5 } }),
      nativeSnapshot({ stats: { cycles: 8, active_tasks: 2, overruns: 1, program_size: 5 }, tasks: [task(1, 1), task(1, 2)] }),
      nativeSnapshot({ stats: { cycles: 8, active_tasks: 2, overruns: 1, program_size: 5 }, tasks: [task(1, 1), task(2, 2, 20_000)] }),
      nativeSnapshot({ stats: { cycles: 8, active_tasks: 2, overruns: 1, program_size: 5 }, tasks: [task(2, 2), task(1, 1)] }),
      nativeSnapshot({ tasks: [{ ...task(0x1_0000, 1) }] }),
      nativeSnapshot({ tasks: [{ ...task(1, 0x100) }] }),
      nativeSnapshot({ tasks: [{ ...task(1, 1), pc: 0x1_0000, sp: 0x1_0000 }] }),
      nativeSnapshot({ tasks: [{ ...task(1, 1), error: 0x100 }] }),
      nativeSnapshot({ focused_vm: { pc: 0x1_0000, sp: 2, halted: false, error: 0 } }),
      nativeSnapshot({ focused_vm: { pc: 2, sp: 0x1_0000, halted: false, error: 0x100 } }),
      nativeSnapshot({ force_entries: [{ address: 0x0fff, size: 2, bytes_hex: '0000', state: 'forced' }] }),
      nativeSnapshot({ force_entries: [
        { address: 0, size: 2, bytes_hex: '0000', state: 'forced' },
        { address: 1, size: 1, bytes_hex: '00', state: 'forced' },
      ] }),
    ];

    for (const invalidSnapshot of invalidSnapshots) {
      const adapter = new NativeAdapter({
        startSession,
        stopSession,
        request: async <TResult = unknown>(message: NativeRequest): Promise<TResult> =>
          (message.method === 'status.get' ? invalidSnapshot : requestMock(message)) as TResult,
      });
      await adapter.connect();
      await expect(adapter.getRuntimeSnapshot()).rejects.toThrow('Invalid native runtime snapshot');
      expect(adapter.state).toBe('idle');
    }
  });

  it('stores parity evidence records for release-boundary reporting', async () => {
    const adapter = new NativeAdapter({ startSession, stopSession, request });
    adapter.setParityEvidence([
      {
        evidence_id: 'evidence-1',
        reference_project_id: 'ref-project',
        capability_scope: ['logic', 'breakpoints'],
        native_result: 'degraded',
        hardware_result: 'pass',
        mismatches: [
          {
            feature: 'tasks',
            native_observation: 'single focused task only',
            hardware_observation: 'full scheduler task table',
            severity: 'degrading',
            resolution: 'downgrade-claim',
          },
        ],
        owner: 'qa-industrial',
        recorded_at: '2026-03-20T10:00:00Z',
      },
    ]);

    expect(adapter.getParityEvidence()).toHaveLength(1);
    expect(adapter.getParityEvidence()[0]?.mismatches[0]?.feature).toBe('tasks');
  });
});
