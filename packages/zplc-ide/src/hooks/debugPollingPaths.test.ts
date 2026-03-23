import { describe, expect, it } from 'bun:test';

import { readFileSync } from 'node:fs';

import { compileMultiTaskProject, type DebugMap } from '../compiler';
import { buildPolledDebugPaths, describePolledDebugVariable } from './debugPollingPaths';

const DEBUG_MAP: DebugMap = {
  version: '1.0.0',
  programName: 'Main',
  compilerVersion: '1.5.0',
  generatedAt: '2026-03-18T00:00:00Z',
  pou: {
    Main: {
      type: 'PROGRAM',
      entryPoint: 0,
      vars: {
        Counter: { addr: 0x2000, type: 'INT', region: 'WORK', size: 2 },
        Enabled: { addr: 0x2002, type: 'BOOL', region: 'WORK', size: 1 },
      },
      sourceMap: [],
      breakpoints: [],
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
    codeBase: 0x5000,
    codeSize: 128,
  },
};

describe('buildPolledDebugPaths', () => {
  it('polls only explicit watch variables when live preview is disabled', () => {
    expect(buildPolledDebugPaths(['Counter'], DEBUG_MAP, false)).toEqual(['Counter']);
  });

  it('adds debug-map variables when live preview is enabled', () => {
    expect(buildPolledDebugPaths(['Counter'], DEBUG_MAP, true)).toEqual(['Counter', 'Enabled']);
  });

  it('respects the cap while keeping watched variables first', () => {
    expect(buildPolledDebugPaths(['Counter'], DEBUG_MAP, true, 1)).toEqual(['Counter']);
  });

  it('describes variables with absolute addresses instead of relative offsets', () => {
    const projectConfig = JSON.parse(
      readFileSync(new URL('../../projects/pico_blinky/zplc.json', import.meta.url), 'utf8'),
    );
    const programSources = [
      {
        name: 'main.st',
        language: 'ST' as const,
        content: readFileSync(new URL('../../projects/pico_blinky/src/main.st', import.meta.url), 'utf8'),
      },
    ];
    const compiled = compileMultiTaskProject(projectConfig, programSources);
    const result = describePolledDebugVariable(
      compiled.debugMap,
      'LED_Output',
    );

    expect(result).toEqual({
      name: 'LED_Output',
      address: 0x1000,
      type: 'BOOL',
      forceable: false,
      bitOffset: 0,
      maxLength: undefined,
    });
  });

  it('keeps valid address zero variables pollable', () => {
    const result = describePolledDebugVariable(
      {
        ...DEBUG_MAP,
        pou: {
          Main: {
            ...DEBUG_MAP.pou.Main,
            vars: {
              Button: { addr: 0x0000, type: 'BOOL', region: 'IPI', size: 1, bitOffset: 0 },
            },
          },
        },
      },
      'Button',
    );

    expect(result).toEqual({
      name: 'Button',
      address: 0x0000,
      type: 'BOOL',
      forceable: true,
      bitOffset: 0,
      maxLength: undefined,
    });
  });
});
