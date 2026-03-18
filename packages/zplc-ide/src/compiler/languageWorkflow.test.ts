import { describe, expect, it } from 'bun:test';

import {
  compileSingleFileWithTask,
  getLanguageWorkflowSupport,
  type PLCLanguage,
} from './index';
import { supportsTranspileWorkflow } from './transpilers';
import type { FBDModel } from '../models/fbd';
import type { LDModel } from '../models/ld';
import type { SFCModel } from '../models/sfc';

const ST_SOURCE = `
PROGRAM WorkflowST
VAR
    Start : BOOL := TRUE;
    Timer : TON;
    Out1 : BOOL := FALSE;
END_VAR
Timer(IN := Start, PT := T#250ms);
Out1 := Timer.Q;
END_PROGRAM
`;

const IL_SOURCE = `
PROGRAM WorkflowIL
VAR
    Start : BOOL := TRUE;
    Timer : TON;
END_VAR
VAR_OUTPUT
    Out1 AT %Q0.0 : BOOL;
END_VAR
    LD Start
    ST Timer.IN
    CAL Timer(
        PT := T#250ms
    )
    LD Timer.Q
    ST Out1
END_PROGRAM
`;

const LD_MODEL: LDModel = {
  name: 'WorkflowLD',
  variables: {
    local: [{ name: 'Start', type: 'BOOL', initialValue: true }],
    outputs: [{ name: 'Out1', type: 'BOOL', address: '%Q0.0' }],
  },
  rungs: [
    {
      id: 'rung_1',
      number: 1,
      gridConfig: { cols: 2, rows: 1, cellWidth: 80, cellHeight: 60 },
      verticalLinks: [],
      branches: [],
      grid: [[
        { element: { id: 'c1', type: 'contact_no', row: 0, col: 0, variable: 'Start' } },
        { element: { id: 'coil1', type: 'coil', row: 0, col: 1, variable: 'Out1' } },
      ]],
    },
  ],
};

const FBD_MODEL: FBDModel = {
  name: 'WorkflowFBD',
  variables: {
    local: [{ name: 'Start', type: 'BOOL', initialValue: true }],
    outputs: [{ name: 'Out1', type: 'BOOL', address: '%Q0.0' }],
  },
  blocks: [
    { id: 'start', type: 'input', variableName: 'Start', position: { x: 0, y: 0 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
    { id: 'out', type: 'output', variableName: 'Out1', position: { x: 120, y: 0 }, inputs: [{ name: 'IN', type: 'BOOL' }] },
  ],
  connections: [{ id: 'link', from: { block: 'start', port: 'OUT' }, to: { block: 'out', port: 'IN' } }],
};

const SFC_MODEL: SFCModel = {
  name: 'WorkflowSFC',
  variables: {
    local: [],
    outputs: [{ name: 'Out1', type: 'BOOL', address: '%Q0.0' }],
  },
  steps: [
    { id: 'step_1', name: 'Idle', isInitial: true, position: { x: 0, y: 0 }, actions: [{ qualifier: 'N', actionName: 'SetOut' }] },
  ],
  transitions: [],
  actions: [{ id: 'action_1', name: 'SetOut', type: 'ST', body: 'Out1 := TRUE;' }],
};

const SOURCES: Record<PLCLanguage, string> = {
  ST: ST_SOURCE,
  IL: IL_SOURCE,
  LD: JSON.stringify(LD_MODEL),
  FBD: JSON.stringify(FBD_MODEL),
  SFC: JSON.stringify(SFC_MODEL),
};

describe('v1.5 language workflow support', () => {
  it('declares full workflow support for every claimed language', () => {
    const languages: PLCLanguage[] = ['ST', 'IL', 'LD', 'FBD', 'SFC'];

    for (const language of languages) {
      expect(getLanguageWorkflowSupport(language)).toEqual({
        author: true,
        compile: true,
        simulate: true,
        deploy: true,
        debug: true,
      });
    }
  });

  it('identifies transpiled language paths correctly', () => {
    expect(supportsTranspileWorkflow('IL')).toBe(true);
    expect(supportsTranspileWorkflow('LD')).toBe(true);
    expect(supportsTranspileWorkflow('FBD')).toBe(true);
    expect(supportsTranspileWorkflow('SFC')).toBe(true);
    expect(supportsTranspileWorkflow('ST')).toBe(false);
  });

  it('compiles canonical single-file workflow sources for every claimed language', () => {
    const languages: PLCLanguage[] = ['ST', 'IL', 'LD', 'FBD', 'SFC'];

    for (const language of languages) {
      const result = compileSingleFileWithTask(SOURCES[language], language, {
        programName: `Workflow_${language}`,
      });

      expect(result.language).toBe(language);
      expect(result.hasTaskSegment).toBe(true);
      expect(result.bytecode.length).toBeGreaterThan(0);
      expect(result.zplcFile.length).toBeGreaterThan(result.bytecode.length);
    }
  });
});
