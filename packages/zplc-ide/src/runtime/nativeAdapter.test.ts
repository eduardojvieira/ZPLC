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
      return {};
    case 'status.get':
      return {
        state: 'idle',
        uptime_ms: 123,
        stats: {
          cycles: 7,
          active_tasks: 1,
          overruns: 0,
          program_size: 5,
        },
        focused_vm: {
          pc: 12,
          sp: 2,
          halted: false,
          error: 0,
        },
        tasks: [],
        opi: [0, 1, 0, 0],
        force_entries: [],
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

    adapter.setEventHandlers({
      onStateChange: (state) => {
        states.push(state);
      },
      onInfoUpdate: (info) => {
        pcs.push(info.pc);
      },
    });

    await adapter.connect();

    eventApi.emit({
      type: 'event',
      method: 'status.changed',
      params: {
        state: 'running',
        uptime_ms: 200,
        stats: {
          cycles: 11,
          active_tasks: 1,
          overruns: 0,
          program_size: 5,
        },
        focused_vm: {
          pc: 99,
          sp: 3,
          halted: false,
          error: 0,
        },
        tasks: [],
        opi: [0, 0, 0, 0],
        force_entries: [],
      },
    });

    expect(adapter.state).toBe('running');
    expect(states).toContain('running');
    expect(pcs).toContain(99);
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
        opi: [0, 0, 0, 0],
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
