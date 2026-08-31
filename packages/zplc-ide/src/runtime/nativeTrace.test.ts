import { describe, expect, it } from 'bun:test';

import type { IDebugAdapter, RuntimeSnapshot } from './debugAdapter';
import {
  NATIVE_TRACE_LIMIT,
  appendNativeTrace,
  canCaptureNativeTrace,
  canCommitNativeLoad,
  canReenableNativeTrace,
  presentLiveNativeMotorOutput,
  presentLiveNativeMotorControls,
  projectNativeTrace,
} from './nativeTrace';
import type { DebugMap } from '../compiler';

function snapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return {
    source: 'native',
    state: 'paused',
    uptimeMs: 40,
    stats: { cycles: 4, activeTasks: 1, overruns: 2, programSize: 9 },
    focusedVm: { pc: 12, sp: 1, halted: false, cycles: 4, error: 3 },
    tasks: [],
    opi: [0, 0, 0, 0, 0, 0, 0, 0],
    ipi: [0, 0, 0, 0, 0, 0, 0, 0],
    programGeneration: 1,
    forceEntries: [],
    ...overrides,
  };
}

function project(input: RuntimeSnapshot, compilerRunId = 3, receivedAtMs = 1_000) {
  return projectNativeTrace(input, { compilerRunId, receivedAtMs });
}

describe('native trace', () => {
  it('projects bounded host-safe fields, copies OPI, and accepts a missing focused VM', () => {
    const source = snapshot({ opi: [1, 0, 0, 0, 0, 0, 0, 0] });
    const projected = project(source);
    expect(project(snapshot())).toEqual({
      source: 'native', uptimeMs: 40, cycles: 4, state: 'paused', pc: 12, error: 3, overruns: 2, opi: [0, 0, 0, 0, 0, 0, 0, 0], ipi: [0, 0, 0, 0, 0, 0, 0, 0], programGeneration: 1, forceCount: 0, compilerRunId: 3, receivedAtMs: 1_000,
    });
    expect(project(snapshot({ focusedVm: null }))).toMatchObject({ pc: null, error: null });
    expect(projected).not.toBeNull();
    source.opi[0] = 0;
    source.ipi![0] = 1;
    expect(projected?.opi[0]).toBe(1);
    expect(projected?.ipi[0]).toBe(0);
  });

  it('fails closed when native OPI or force evidence is malformed', () => {
    expect(project(snapshot({ opi: [0, 0, 0, 0, 0, 0, 0] }))).toBeNull();
    expect(project(snapshot({ ipi: undefined }))).toBeNull();
    expect(project(snapshot({ programGeneration: 0 }))).not.toBeNull();
    expect(project(snapshot({ programGeneration: -1 }))).toBeNull();
    expect(project(snapshot({ opi: [0, 0, 0, 0, 0, 0, 0, 256] }))).toBeNull();
    expect(project(snapshot({ forceEntries: [{}] as RuntimeSnapshot['forceEntries'] }))).toBeNull();
    expect(project(snapshot({ forceEntries: [{ path: 'F', address: 0, size: 1, type: 'BOOL', bytesHex: '', state: 'forced' }] }))).toBeNull();
    expect(project(snapshot({ forceEntries: [{ path: 'F', address: 0, size: 1, type: 'BOOL', bytesHex: '01', state: 'idle' }] }))).toBeNull();
    expect(project(snapshot({ forceEntries: Array.from({ length: 9 }, () => ({ path: 'F', address: 0, size: 1, type: 'BOOL', bytesHex: '01', state: 'forced' })) as RuntimeSnapshot['forceEntries'] }))).toBeNull();
    expect(project(snapshot(), -1)).toBeNull();
    expect(project(snapshot(), 3, -1)).toBeNull();
  });

  it('ignores non-native snapshots and stale adapter owners', () => {
    const current = { type: 'native' } as IDebugAdapter;
    const stale = { type: 'native' } as IDebugAdapter;
    const serial = { type: 'serial' } as IDebugAdapter;
    expect(project(snapshot({ source: 'serial' }))).toBeNull();
    expect(appendNativeTrace([], current, stale, snapshot(), { compilerRunId: 0, receivedAtMs: 0 })).toEqual([]);
    expect(appendNativeTrace([], serial, serial, snapshot(), { compilerRunId: 0, receivedAtMs: 0 })).toEqual([]);
    expect(appendNativeTrace([], current, current, snapshot(), { compilerRunId: 0, receivedAtMs: 0 })).toHaveLength(1);
    expect(appendNativeTrace([], current, current, snapshot(), { compilerRunId: -1, receivedAtMs: 0 })).toEqual([]);
  });

  it('requires the captured compiler generation and trace epoch to remain current', () => {
    const owner = { type: 'native' } as IDebugAdapter;
    expect(canCaptureNativeTrace({
      activeAdapter: owner, owner, snapshot: snapshot(), capturedCompilerRunId: 3, currentCompilerRunId: 3, capturedTraceEpoch: 4, currentTraceEpoch: 4,
    })).toBe(true);
    expect(canCaptureNativeTrace({
      activeAdapter: owner, owner, snapshot: snapshot(), capturedCompilerRunId: 3, currentCompilerRunId: 4, capturedTraceEpoch: 4, currentTraceEpoch: 4,
    })).toBe(false);
    expect(canCaptureNativeTrace({
      activeAdapter: owner, owner, snapshot: snapshot(), capturedCompilerRunId: 3, currentCompilerRunId: 3, capturedTraceEpoch: 4, currentTraceEpoch: 5,
    })).toBe(false);
  });

  it('does not commit stale loads or reactivate trace after an edit', () => {
    expect(canCommitNativeLoad(true, 3, 3)).toBe(true);
    expect(canCommitNativeLoad(true, 3, 4)).toBe(false);
    expect(canCommitNativeLoad(false, 3, 3)).toBe(false);
    expect(canReenableNativeTrace(true, 3, 3)).toBe(true);
    expect(canReenableNativeTrace(true, 3, 4)).toBe(false);
    expect(canReenableNativeTrace(false, 3, 3)).toBe(false);
  });

  it('keeps exactly the newest 200 samples', () => {
    const owner = { type: 'native' } as IDebugAdapter;
    let trace = [];
    for (let index = 0; index <= NATIVE_TRACE_LIMIT; index += 1) {
      trace = appendNativeTrace(trace, owner, owner, snapshot({ uptimeMs: index }), { compilerRunId: 0, receivedAtMs: index });
    }

    expect(trace).toHaveLength(NATIVE_TRACE_LIMIT);
    expect(trace[0]?.uptimeMs).toBe(1);
    expect(trace.at(-1)?.uptimeMs).toBe(NATIVE_TRACE_LIMIT);
    expect(trace.at(-1)).toMatchObject({ compilerRunId: 0, receivedAtMs: NATIVE_TRACE_LIMIT });
  });
});

function motorMap(overrides: Partial<DebugMap> = {}): DebugMap {
  return {
    version: '1', programName: 'Motor', compilerVersion: '1', generatedAt: 'now',
    pou: {
      Motor: {
        type: 'PROGRAM', vars: {
          Forward: { addr: 0x1000, type: 'BOOL', region: 'OPI', size: 1, bitOffset: 0 },
          Reverse: { addr: 0x1000, type: 'BOOL', region: 'OPI', size: 1, bitOffset: 1 },
          Start: { addr: 0, type: 'BOOL', region: 'IPI', size: 1, bitOffset: 0 },
          Stop: { addr: 0, type: 'BOOL', region: 'IPI', size: 1, bitOffset: 1 },
          EStop: { addr: 0, type: 'BOOL', region: 'IPI', size: 1, bitOffset: 2 },
        }, sourceMap: [], breakpoints: [],
      },
    },
    memoryLayout: { ipiBase: 0, ipiSize: 0x1000, opiBase: 0x1000, opiSize: 0x1000, workBase: 0x2000, workSize: 1, retainBase: 0x3000, retainSize: 1, codeBase: 0x4000, codeSize: 1 },
    ...overrides,
  };
}

describe('live native motor output', () => {
  const live = (overrides: Partial<Parameters<typeof presentLiveNativeMotorOutput>[0]> = {}) => presentLiveNativeMotorOutput({
    adapterType: 'native', connected: true, vmState: 'running', debugMap: motorMap(), currentCompilerRunId: 3, nowMs: 1_500,
    sample: project(snapshot({ state: 'running', opi: [1, 0, 0, 0, 0, 0, 0, 0] })),
    ...overrides,
  });

  it('reads exact Motor OPI bits only for the current live native session', () => {
    expect(live()).toEqual({ forward: true, reverse: false, uptimeMs: 40, cycles: 4, state: 'running' });
    expect(live({ vmState: 'paused', sample: project(snapshot({ state: 'paused', opi: [2, 0, 0, 0, 0, 0, 0, 0] })) })).toEqual({ forward: false, reverse: true, uptimeMs: 40, cycles: 4, state: 'paused' });
    expect(live({ adapterType: 'wasm' })).toBeNull();
    expect(live({ connected: false })).toBeNull();
    expect(live({ vmState: 'idle' })).toBeNull();
    expect(live({ sample: project(snapshot({ state: 'paused' })) })).toBeNull();
    expect(live({ sample: null })).toBeNull();
  });

  it('hides output when forces, symbols, types, regions, addresses, or layout are invalid', () => {
    const forced = project(snapshot({ state: 'running', forceEntries: [{ path: 'Motor.Forward', address: 0x1000, size: 1, type: 'BOOL', bytesHex: '01', state: 'forced' }] }));
    expect(live({ sample: forced })).toBeNull();
    expect(live({ debugMap: motorMap({ pou: {} }) })).toBeNull();
    const invalidType = motorMap(); invalidType.pou.Motor!.vars.Forward!.type = 'INT';
    expect(live({ debugMap: invalidType })).toBeNull();
    const invalidRegion = motorMap(); invalidRegion.pou.Motor!.vars.Reverse!.region = 'WORK';
    expect(live({ debugMap: invalidRegion })).toBeNull();
    const invalidAddress = motorMap(); invalidAddress.pou.Motor!.vars.Reverse!.addr = 0x1008;
    expect(live({ debugMap: invalidAddress })).toBeNull();
    const invalidBit = motorMap(); invalidBit.pou.Motor!.vars.Reverse!.bitOffset = 8;
    expect(live({ debugMap: invalidBit })).toBeNull();
    const missingBit = motorMap(); delete missingBit.pou.Motor!.vars.Reverse!.bitOffset;
    expect(live({ debugMap: missingBit })).toBeNull();
    const duplicateBit = motorMap(); duplicateBit.pou.Motor!.vars.Reverse!.bitOffset = 0;
    expect(live({ debugMap: duplicateBit })).toBeNull();
    expect(live({ debugMap: motorMap({ memoryLayout: { ...motorMap().memoryLayout, opiSize: 0 } }) })).toBeNull();
    expect(live({ debugMap: motorMap({ memoryLayout: { ...motorMap().memoryLayout, opiBase: -1 } }) })).toBeNull();
    const overflowingLayout = motorMap();
    overflowingLayout.memoryLayout.opiBase = Number.MAX_SAFE_INTEGER;
    overflowingLayout.memoryLayout.opiSize = 2;
    overflowingLayout.pou.Motor!.vars.Forward!.addr = Number.MAX_SAFE_INTEGER;
    overflowingLayout.pou.Motor!.vars.Reverse!.addr = Number.MAX_SAFE_INTEGER;
    expect(live({ debugMap: overflowingLayout })).toBeNull();
    const shiftedOpi = motorMap();
    shiftedOpi.memoryLayout.opiBase = 0x2000;
    shiftedOpi.pou.Motor!.vars.Forward!.addr = 0x2000;
    shiftedOpi.pou.Motor!.vars.Reverse!.addr = 0x2000;
    expect(live({ debugMap: shiftedOpi })).toBeNull();
  });

  it('requires a current compiler generation and a fresh timestamp', () => {
    expect(live({ currentCompilerRunId: 4 })).toBeNull();
    expect(live({ nowMs: 1_500 })).not.toBeNull();
    expect(live({ nowMs: 1_501 })).toBeNull();
    expect(live({ nowMs: 999 })).toBeNull();
    expect(live({ nowMs: -1 })).toBeNull();
    expect(live({ sample: project(snapshot({ state: 'running' }), 3, Number.MAX_SAFE_INTEGER) })).toBeNull();
  });
});

describe('live native motor controls', () => {
  const live = (overrides: Partial<Parameters<typeof presentLiveNativeMotorControls>[0]> = {}) => presentLiveNativeMotorControls({
    adapterType: 'native', connected: true, simulationInputsAuthorized: true, vmState: 'running', debugMap: motorMap(), currentCompilerRunId: 3, nowMs: 1_500,
    sample: project(snapshot({ state: 'running', ipi: [4, 0, 0, 0, 0, 0, 0, 0] })),
    ...overrides,
  });

  it('authorizes only an exact fresh native motor input map and reports observed E-stop', () => {
    expect(live()).toEqual({ eStopAsserted: true, receivedAtMs: 1_000 });
    expect(live({ simulationInputsAuthorized: false })).toBeNull();
    expect(live({ adapterType: 'serial' })).toBeNull();
    expect(live({ vmState: 'idle' })).toBeNull();
    expect(live({ sample: project(snapshot({ state: 'running', ipi: [0, 0, 0, 0, 0, 0, 0, 0] })) })).toEqual({ eStopAsserted: false, receivedAtMs: 1_000 });
  });

  it('fails closed for missing or stale native evidence, force state, and malformed input bindings', () => {
    expect(live({ sample: project(snapshot({ state: 'running', ipi: undefined })) })).toBeNull();
    expect(live({ sample: project(snapshot({ state: 'running', programGeneration: 0 })) })).toBeNull();
    expect(live({ sample: project(snapshot({ state: 'running', forceEntries: [{ path: 'F', address: 0, size: 1, type: 'BOOL', bytesHex: '01', state: 'forced' }] })) })).toBeNull();
    expect(live({ currentCompilerRunId: 4 })).toBeNull();
    expect(live({ nowMs: 1_501 })).toBeNull();
    const wrongBit = motorMap(); wrongBit.pou.Motor!.vars.Stop!.bitOffset = 3;
    expect(live({ debugMap: wrongBit })).toBeNull();
    const duplicate = motorMap(); duplicate.pou.Motor!.vars.EStop!.bitOffset = 1;
    expect(live({ debugMap: duplicate })).toBeNull();
    expect(live({ debugMap: motorMap({ memoryLayout: { ...motorMap().memoryLayout, ipiSize: 7 } }) })).toBeNull();
  });
});
