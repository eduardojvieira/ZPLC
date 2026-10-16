import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  getDebugCapabilitiesForAdapter,
  getDebugFeatureActionability,
} from './debugCapabilityActions';
import { resolveExecutionLocation } from './debugExecutionLocation';
import { DEBUG_CAPABILITY_STATUS } from '../runtime/debugCapabilities';
import type { DebugMap } from '../compiler';

const DEBUG_MAP: DebugMap = {
  version: '1.0.0',
  programName: 'WorkflowDebug',
  compilerVersion: '1.5.0',
  generatedAt: '2026-03-14T00:00:00Z',
  pou: {
    Main: {
      type: 'PROGRAM',
      entryPoint: 0,
      vars: {},
      sourceMap: [
        { pc: 16, line: 4, column: 1, length: 4 },
        { pc: 32, line: 8, column: 1, length: 4 },
      ],
      breakpoints: [
        { line: 4, pc: 16, valid: true },
        { line: 8, pc: 32, valid: true },
      ],
    },
  },
  memoryLayout: {
    ipiBase: 0x0000,
    ipiSize: 0x1000,
    opiBase: 0x1000,
    opiSize: 0x1000,
    workBase: 0x2000,
    workSize: 0x2000,
    retainBase: 0x4000,
    retainSize: 0x1000,
    codeBase: 0x0000,
    codeSize: 128,
  },
};

describe('resolveExecutionLocation', () => {
  it('resolves mapped breakpoint locations from the debug map', () => {
    expect(resolveExecutionLocation(DEBUG_MAP, 32)).toEqual({
      line: 8,
      pc: 32,
      pouName: 'Main',
    });
  });

  it('resolves any program counter inside a statement to that statement, and none past its end', () => {
    // the statement of line 8 owns the instructions at 32, 33, 34 and 35
    for (const pc of [32, 33, 34, 35]) {
      expect(resolveExecutionLocation(DEBUG_MAP, pc)).toEqual({ line: 8, pc, pouName: 'Main' });
    }
    expect(resolveExecutionLocation(DEBUG_MAP, 19)).toEqual({ line: 4, pc: 19, pouName: 'Main' });
    expect(resolveExecutionLocation(DEBUG_MAP, 20).pouName).toBeNull();
    expect(resolveExecutionLocation(DEBUG_MAP, 36, 9)).toEqual({ line: 9, pc: 36, pouName: null });
  });

  it('prefers the range that starts at the program counter', () => {
    const map: DebugMap = {
      ...DEBUG_MAP,
      pou: { Main: { ...DEBUG_MAP.pou.Main!, sourceMap: [{ pc: 16, line: 4, length: 8 }, { pc: 20, line: 5, length: 2 }] } },
    };
    expect(resolveExecutionLocation(map, 20).line).toBe(5);
    expect(resolveExecutionLocation(map, 21).line).toBe(4);
  });

  it('falls back to the provided line when the pc is not mapped', () => {
    expect(resolveExecutionLocation(DEBUG_MAP, 48, 11)).toEqual({
      line: 11,
      pc: 48,
      pouName: null,
    });
  });

  it('returns a null pou when no debug map exists', () => {
    expect(resolveExecutionLocation(null, 64)).toEqual({
      line: null,
      pc: 64,
      pouName: null,
    });
  });
});

describe('getDebugCapabilitiesForAdapter', () => {
  it('maps native adapter capability profiles into controller capabilities', () => {
    const result = getDebugCapabilitiesForAdapter(
      {
        type: 'native',
        capabilities: {
          profile_id: 'cap-01',
          features: [
            { name: 'pause', status: 'supported' },
            { name: 'resume', status: 'supported' },
            { name: 'step', status: 'degraded', reason: 'single scan only' },
            { name: 'breakpoints', status: 'unavailable', reason: 'program not loaded' },
          ],
        },
      } as never,
      'simulation',
      null,
    );

    expect(result?.features.pause.status).toBe(DEBUG_CAPABILITY_STATUS.SUPPORTED);
    expect(result?.features.step.status).toBe(DEBUG_CAPABILITY_STATUS.DEGRADED);
    expect(result?.features.breakpoints.status).toBe(DEBUG_CAPABILITY_STATUS.UNAVAILABLE);
  });

  it('takes the browser runtime from its profile: the controls it has are allowed, what it lacks is unavailable', () => {
    const result = getDebugCapabilitiesForAdapter(
      {
        type: 'wasm',
      } as never,
      'simulation',
      null,
    );

    expect(result?.features.pause.status).toBe(DEBUG_CAPABILITY_STATUS.SUPPORTED);
    expect(result?.features.resume.status).toBe(DEBUG_CAPABILITY_STATUS.SUPPORTED);
    expect(result?.features.step.status).toBe(DEBUG_CAPABILITY_STATUS.SUPPORTED);
    expect(result?.features.breakpoints.status).toBe(DEBUG_CAPABILITY_STATUS.SUPPORTED);
    expect(result?.features.modbus?.status).toBe(DEBUG_CAPABILITY_STATUS.UNAVAILABLE);
    expect(result?.features.timing?.status).toBe(DEBUG_CAPABILITY_STATUS.DEGRADED);
  });

  it('takes the profile that a connected browser runtime reported', () => {
    const result = getDebugCapabilitiesForAdapter(
      {
        type: 'wasm',
        capabilities: { profile_id: 'reported', features: [{ name: 'pause', status: 'supported' }] },
      } as never,
      'simulation',
      null,
    );

    expect(result?.features.pause.status).toBe(DEBUG_CAPABILITY_STATUS.SUPPORTED);
    expect(result?.features.step.status).toBe(DEBUG_CAPABILITY_STATUS.UNAVAILABLE);
  });
});

describe('native simulation input controller boundary', () => {
  it('uses the native staged input contract, refreshes status, and never writes memory', () => {
    const source = readFileSync(join(import.meta.dir, 'useDebugController.ts'), 'utf8');
    const action = source.slice(source.indexOf('const setSimulationInput ='), source.indexOf('// =========================================================================\n  // Polling for Live Values'));

    expect(action).toContain('owner instanceof NativeAdapter');
    expect(action).toContain('await owner.setSimulationInput(inputId, active);');
    expect(action).toContain('await owner.getRuntimeSnapshot();');
    expect(action).not.toContain('setVirtualInput');
    expect(action).not.toContain('memory.write');
    expect(action).not.toContain('setIPI');
    expect(action).not.toContain('poke');
    expect(source).toContain('onCapabilitiesChange: () =>');
    expect(source).toContain('setCapabilityRevision((revision) => revision + 1);');
    expect(source).toContain('useMemo(');
    expect(source).toContain('[adapter, capabilityRevision, controllerInfo, debugMode]');
  });
});

describe('direct watch-write hardware boundary', () => {
  it('rejects a serial adapter before encoding or writing and retains the captured adapter as owner', () => {
    const source = readFileSync(join(import.meta.dir, 'useDebugController.ts'), 'utf8');
    const action = source.slice(source.indexOf('const setValue ='), source.indexOf('const buildForceEntry ='));
    const serialGuard = action.indexOf("currentAdapter.type === 'serial'");
    const encode = action.indexOf('valueToBytes(value, type, maxLength)');
    const write = action.indexOf('await currentAdapter.setValue(address, bytes);');

    expect(serialGuard).toBeGreaterThanOrEqual(0);
    expect(encode).toBeGreaterThan(serialGuard);
    expect(write).toBeGreaterThan(encode);
    expect(action).toContain('const currentAdapter = adapterRef.current;');
    expect(action).toContain('Direct value edits are simulation-only. Use Force for hardware.');
  });
});

describe('force without a value', () => {
  it('refuses to force a value that has not been read, before anything is encoded or sent, while a release needs no value', () => {
    const source = readFileSync(join(import.meta.dir, 'useDebugController.ts'), 'utf8');
    const action = source.slice(source.indexOf('const toggleForceValue ='), source.indexOf('const clearAllForcedValues ='));
    const refusal = action.indexOf('if (force && value === null) {');
    const encode = action.indexOf('valueToBytes(value as number | boolean | string, type, maxLength)');

    expect(action).toContain('value: number | boolean | string | null,');
    expect(refusal).toBeGreaterThanOrEqual(0);
    expect(action.indexOf('try {')).toBeGreaterThan(refusal);
    expect(encode).toBeGreaterThan(refusal);
    expect(action).toContain('await currentAdapter.clearForcedValue(address);');
  });
});

describe('breakpoint teardown boundary', () => {
  // The round itself (stale rounds dropped, errors of a live session reported) is tested in
  // useDebugControllerBreakpoints.test.ts; this pins what the hook hands to it.
  it('lets the syncer drop a round once the adapter is replaced or disconnected', () => {
    const source = readFileSync(join(import.meta.dir, 'useDebugController.ts'), 'utf8');
    const push = source.slice(source.indexOf('const pushBreakpoints ='), source.indexOf('const resetConnectionState ='));

    expect(push).toContain('() => useIDEStore.getState().getAllBreakpointPCs(),');
    expect(push).toContain('() => adapterRef.current === target && target.connected,');
    expect(push).toContain("console.error('Failed to sync breakpoints:', err);");
    // A refusal reaches the Console panel and the store, not only devtools.
    expect(push).toContain('reportBreakpointSync(outcome, { addConsoleEntry, setBreakpointsInactiveReason });');
  });

  it('pushes breakpoints only through the one-at-a-time syncer', () => {
    const source = readFileSync(join(import.meta.dir, 'useDebugController.ts'), 'utf8');

    expect(source).not.toContain('.setBreakpoint(');
    expect(source).not.toContain('.clearBreakpoints(');
    // program.load and execution.reset empty the runtime table, so both must invalidate what the syncer knows.
    expect(source.slice(source.indexOf('const loadProgram ='), source.indexOf('const start ='))).toContain('breakpointSyncer.invalidate();');
    expect(source.slice(source.indexOf('const reset ='), source.indexOf('// Memory Access'))).toContain('breakpointSyncer.invalidate();');
  });
});

describe('getDebugFeatureActionability', () => {
  it('blocks unavailable actions with a direct message', () => {
    const result = getDebugFeatureActionability(
      {
        mode: 'scheduler',
        supportsPause: false,
        supportsResume: true,
        supportsStep: false,
        supportsBreakpoints: false,
        features: {
          pause: { status: 'unavailable', reason: 'runtime does not expose pause yet' },
          resume: { status: 'supported' },
          step: { status: 'degraded', reason: 'single-cycle only' },
          breakpoints: { status: 'supported' },
        },
      },
      'pause',
      'Pause',
    );

    expect(result.allowed).toBe(false);
    expect(result.message).toBe('Pause unavailable: runtime does not expose pause yet');
  });

  it('allows degraded actions but returns an operator-facing warning', () => {
    const result = getDebugFeatureActionability(
      {
        mode: 'scheduler',
        supportsPause: true,
        supportsResume: true,
        supportsStep: false,
        supportsBreakpoints: true,
        features: {
          pause: { status: 'supported' },
          resume: { status: 'supported' },
          step: {
            status: 'degraded',
            reason: 'single-cycle stepping only',
            recommendedAction: 'Use hardware session for task-aware stepping',
          },
          breakpoints: { status: 'supported' },
        },
      },
      'step',
      'Step',
    );

    expect(result.allowed).toBe(true);
    expect(result.message).toBe(
      'Step is degraded: single-cycle stepping only. Use hardware session for task-aware stepping',
    );
  });
});
