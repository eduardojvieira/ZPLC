import { describe, expect, it } from 'bun:test';

import {
  compileMultiTaskProject,
  compileSingleFileWithTask,
  CompilerError,
  getLanguageWorkflowSupport,
  transpileToST,
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
        { element: { id: 'c1', type: 'contact_no', row: 0, col: 0, variable: 'Start' }, hasWire: true },
        { element: { id: 'coil1', type: 'coil', row: 0, col: 1, variable: 'Out1' }, hasWire: true },
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

  it('propagates ESP32 target memory limits through the canonical project compiler', () => {
    const result = compileMultiTaskProject(
      {
        name: 'EspProfile', version: '1.0.0', target: { board: 'esp32s3_devkitc' },
        tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main'] }],
      },
      [{ name: 'Main', sourceRef: 'src/Main.st', language: 'ST', content: 'PROGRAM Main VAR Value : BOOL; END_VAR END_PROGRAM' }],
    );

    expect(result.debugMap.memoryLayout).toMatchObject({ workSize: 2048, retainSize: 1024 });
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

  it('keeps a single-file ST diagnostic on its exact source path', () => {
    expect(() => compileSingleFileWithTask('PROGRAM Main\n@\nEND_PROGRAM', 'ST', {
      programName: 'Main',
      sourceRef: 'src/Main.st',
    })).toThrow(CompilerError);

    try {
      compileSingleFileWithTask('PROGRAM Main\n@\nEND_PROGRAM', 'ST', {
        programName: 'Main',
        sourceRef: 'src/Main.st',
      });
    } catch (error) {
      const diagnostic = error as CompilerError;
      expect(diagnostic.line).toBe(2);
      expect(diagnostic.column).toBe(1);
      expect(diagnostic.sourceRef).toBe('src/Main.st');
    }
  });

  it('uses a project file sourceRef instead of the logical task reference for ST diagnostics', () => {
    try {
      compileMultiTaskProject(
        {
          name: 'PhysicalDiagnostic',
          version: '1.0.0',
          tasks: [{ name: 'MotorTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['MotorTask'] }],
        },
        [{ name: 'MotorTask', sourceRef: 'src/Motor.st', language: 'ST', content: 'PROGRAM Motor\n@\nEND_PROGRAM' }],
      );
      throw new Error('expected a compiler diagnostic');
    } catch (error) {
      const diagnostic = error as CompilerError;
      expect(diagnostic.phase).toBe('lexer');
      expect(diagnostic.line).toBe(2);
      expect(diagnostic.column).toBe(1);
      expect(diagnostic.sourceRef).toBe('src/Motor.st');
    }
  });

  it('rejects task cardinality before resolving or transpiling sources', () => {
    expect(() => compileMultiTaskProject(
      {
        name: 'CardinalityFirst',
        version: '1.0.0',
        tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['broken.fbd', 'missing.st'] }],
      },
      [{ name: 'broken.fbd', sourceRef: 'src/broken.fbd', language: 'FBD', content: '{' }],
    )).toThrow(CompilerError);

    try {
      compileMultiTaskProject(
        {
          name: 'CardinalityFirst',
          version: '1.0.0',
          tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['broken.fbd', 'missing.st'] }],
        },
        [{ name: 'broken.fbd', sourceRef: 'src/broken.fbd', language: 'FBD', content: '{' }],
      );
    } catch (error) {
      const diagnostic = error as CompilerError;
      expect(diagnostic.phase).toBe('codegen');
      expect(diagnostic.line).toBe(0);
      expect(diagnostic.column).toBe(0);
      expect(diagnostic.sourceRef).toBeUndefined();
      expect(diagnostic.detail).toBe("Task 'Main' must reference exactly one PROGRAM");
    }
  });

  it('rejects the portable task maximum before visual transpilation', () => {
    const config = {
      name: 'TaskLimitFirst',
      version: '1.0.0',
      tasks: Array.from({ length: 17 }, (_, id) => ({
        name: `Task${id}`,
        trigger: 'cyclic' as const,
        interval_ms: 10,
        priority: 1,
        programs: ['broken.fbd'],
      })),
    };
    const sources = [{ name: 'broken.fbd', sourceRef: 'src/broken.fbd', language: 'FBD' as const, content: '{' }];
    const compile = () => compileMultiTaskProject(config, sources);

    expect(compile).toThrow(CompilerError);
    expect(compile).toThrow(/supports at most 16 tasks/i);
    try {
      compile();
    } catch (error) {
      expect(error).toMatchObject({
        phase: 'codegen',
        line: 0,
        column: 0,
        sourceRef: undefined,
      });
    }
  });

  it('does not report generated ST coordinates on a visual source', () => {
    const invalidModel = {
      ...FBD_MODEL,
      variables: { ...FBD_MODEL.variables, local: [{ name: 'Start@', type: 'BOOL' }] },
    };

    try {
      compileMultiTaskProject(
        { name: 'VisualDiagnostic', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.fbd'] }] },
        [{ name: 'main.fbd', sourceRef: 'src/main.fbd.json', language: 'FBD', content: JSON.stringify(invalidModel) }],
      );
      throw new Error('expected a compiler diagnostic');
    } catch (error) {
      const diagnostic = error as CompilerError;
      expect(diagnostic.phase).toBe('lexer');
      expect(diagnostic.line).toBe(0);
      expect(diagnostic.column).toBe(0);
      expect(diagnostic.sourceRef).toBe('src/main.fbd.json');
      expect(diagnostic.message).not.toContain('4:10');
    }
  });

  it('rejects invalid FBD connections as parser diagnostics before bytecode generation', () => {
    const invalidModel = {
      ...FBD_MODEL,
      connections: [{ id: 'missing-source', from: { block: 'missing', port: 'OUT' }, to: { block: 'out', port: 'IN' } }],
    };

    expect(transpileToST(JSON.stringify(invalidModel), 'FBD')).toMatchObject({ success: false, source: '', errors: [expect.stringContaining('unknown source block')] });

    try {
      compileMultiTaskProject(
        { name: 'InvalidFBD', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.fbd'] }] },
        [{ name: 'main.fbd', sourceRef: 'src/main.fbd.json', language: 'FBD', content: JSON.stringify(invalidModel) }],
      );
      throw new Error('expected an FBD parser diagnostic');
    } catch (error) {
      const diagnostic = error as CompilerError;
      expect(diagnostic.phase).toBe('parser');
      expect(diagnostic.line).toBe(0);
      expect(diagnostic.column).toBe(0);
      expect(diagnostic.sourceRef).toBe('src/main.fbd.json');
      expect(diagnostic.detail).toContain('unknown source block');
    }
  });

  it('rejects invalid SFC semantics before generating bytecode', () => {
    const invalidCases = [
      {
        label: 'missing action',
        model: { ...SFC_MODEL, steps: [{ ...SFC_MODEL.steps[0], actions: [{ qualifier: 'N', actionName: 'missing' }] }] },
        message: 'does not resolve',
      },
      {
        label: 'missing transition step',
        model: { ...SFC_MODEL, transitions: [{ id: 'missing_step', fromStep: 'step_1', toStep: 'missing', condition: 'TRUE' }] },
        message: 'unknown step',
      },
      {
        label: 'ambiguous action',
        model: {
          ...SFC_MODEL,
          steps: [{ ...SFC_MODEL.steps[0], actions: [{ qualifier: 'N', actionName: 'action_1' }] }],
          actions: [...SFC_MODEL.actions!, { id: 'another', name: 'action_1', type: 'ST', body: 'Out1 := FALSE;' }],
        },
        message: 'resolves to multiple actions',
      },
    ];

    for (const { label, model, message } of invalidCases) {
      expect(transpileToST(JSON.stringify(model), 'SFC')).toMatchObject({ success: false, source: '', errors: [expect.stringContaining(message)] });

      try {
        compileMultiTaskProject(
          { name: `InvalidSFC-${label}`, version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.sfc'] }] },
          [{ name: 'main.sfc', sourceRef: 'src/main.sfc.json', language: 'SFC', content: JSON.stringify(model) }],
        );
        throw new Error('expected an SFC parser diagnostic');
      } catch (error) {
        const diagnostic = error as CompilerError;
        expect(diagnostic.phase).toBe('parser');
        expect(diagnostic.line).toBe(0);
        expect(diagnostic.column).toBe(0);
        expect(diagnostic.sourceRef).toBe('src/main.sfc.json');
        expect(diagnostic.detail).toContain(message);
      }
    }
  });

  it('reports malformed SFC JSON as a canonical visual parser diagnostic', () => {
    for (const content of ['{', JSON.stringify({ name: 'Broken', steps: 'not-an-array', transitions: [] })]) {
      expect(transpileToST(content, 'SFC')).toMatchObject({ success: false, source: '', errors: [expect.any(String)] });
      try {
        compileMultiTaskProject(
          { name: 'MalformedSFC', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.sfc'] }] },
          [{ name: 'main.sfc', sourceRef: 'src/main.sfc.json', language: 'SFC', content }],
        );
        throw new Error('expected an SFC parser diagnostic');
      } catch (error) {
        const diagnostic = error as CompilerError;
        expect(diagnostic.phase).toBe('parser');
        expect(diagnostic.line).toBe(0);
        expect(diagnostic.column).toBe(0);
        expect(diagnostic.sourceRef).toBe('src/main.sfc.json');
      }
    }
  });

  it('rejects malformed and semantically invalid LD before bytecode generation', () => {
    const invalidCases = [
      '{',
      JSON.stringify({ ...LD_MODEL, rungs: [{ ...LD_MODEL.rungs[0], elements: [{ id: 'bad', type: 'NOT_A_REAL_TYPE' }], grid: undefined, gridConfig: undefined }] }),
      JSON.stringify({ ...LD_MODEL, rungs: [{ id: 'rung_1', number: 1, elements: [{ id: 'contact', type: 'contact_no', variable: 'Start' }], connections: [{ from: 'contact', to: 'missing' }] }] }),
    ];

    for (const content of invalidCases) {
      expect(transpileToST(content, 'LD')).toMatchObject({ success: false, source: '', errors: [expect.any(String)] });
      try {
        compileMultiTaskProject(
          { name: 'InvalidLD', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.ld'] }] },
          [{ name: 'main.ld', sourceRef: 'src/main.ld.json', language: 'LD', content }],
        );
        throw new Error('expected an LD parser diagnostic');
      } catch (error) {
        const diagnostic = error as CompilerError;
        expect(diagnostic.phase).toBe('parser');
        expect(diagnostic.line).toBe(0);
        expect(diagnostic.column).toBe(0);
        expect(diagnostic.sourceRef).toBe('src/main.ld.json');
      }
    }
  });

  it('reports unsafe LD writers and disconnected grid elements as parser diagnostics', () => {
    const invalidCases = [
      {
        ...LD_MODEL,
        variables: { local: [{ name: 'Start', type: 'BOOL' }], inputs: [{ name: 'In', type: 'BOOL', address: '%I0.0' }], outputs: [] },
        rungs: [{ id: 'rung_1', number: 1, gridConfig: { rows: 1, cols: 2, cellWidth: 80, cellHeight: 60 }, grid: [[
          { element: { id: 'start', type: 'contact_no', variable: 'Start', row: 0, col: 0 }, hasWire: true },
          { element: { id: 'coil', type: 'coil', variable: 'In', row: 0, col: 1 }, hasWire: true },
        ]], branches: [] }],
      },
      {
        ...LD_MODEL,
        rungs: [{ id: 'rung_1', number: 1, gridConfig: { rows: 1, cols: 1, cellWidth: 80, cellHeight: 60 }, grid: [[
          { element: { id: 'orphan', type: 'contact_no', variable: 'Start', row: 0, col: 0 }, hasWire: false },
        ]], branches: [] }],
      },
    ];
    for (const model of invalidCases) {
      try {
        compileMultiTaskProject(
          { name: 'UnsafeLD', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.ld'] }] },
          [{ name: 'main.ld', sourceRef: 'src/main.ld.json', language: 'LD', content: JSON.stringify(model) }],
        );
        throw new Error('expected an LD parser diagnostic');
      } catch (error) {
        const diagnostic = error as CompilerError;
        expect(diagnostic.phase).toBe('parser');
        expect(diagnostic.line).toBe(0);
        expect(diagnostic.column).toBe(0);
        expect(diagnostic.sourceRef).toBe('src/main.ld.json');
      }
    }
  });

  it('rejects a writable local alias of the input area before bytecode exists', () => {
    const model = {
      name: 'WriteInput',
      variables: { local: [{ name: 'Start', type: 'BOOL' }, { name: 'Mapped', type: 'BOOL', address: '%I0.0' }], outputs: [] },
      rungs: [{ id: 'rung_1', number: 1, elements: [{ id: 'start', type: 'contact_no', variable: 'Start' }, { id: 'coil', type: 'coil', variable: 'Mapped' }], connections: [] }],
    };
    expect(transpileToST(JSON.stringify(model), 'LD')).toMatchObject({ success: false, source: '' });
    try {
      compileSingleFileWithTask(JSON.stringify(model), 'LD', { sourceRef: 'src/write-input.ld.json' });
      throw new Error('expected an LD parser diagnostic');
    } catch (error) {
      const diagnostic = error as CompilerError;
      expect(diagnostic.phase).toBe('parser');
      expect(diagnostic.line).toBe(0);
      expect(diagnostic.column).toBe(0);
      expect(diagnostic.sourceRef).toBe('src/write-input.ld.json');
    }
  });

  it('rejects LD variable types outside the canonical compiler registry before bytecode exists', () => {
    const model = {
      name: 'UnknownLDType',
      variables: { local: [{ name: 'Mystery', type: 'MYSTERY' }], outputs: [] },
      rungs: [],
    };
    const content = JSON.stringify(model);

    expect(transpileToST(content, 'LD')).toMatchObject({ success: false, source: '' });
    try {
      compileSingleFileWithTask(content, 'LD', { sourceRef: 'src/unknown-type.ld.json' });
      throw new Error('expected an LD parser diagnostic');
    } catch (error) {
      const diagnostic = error as CompilerError;
      expect(diagnostic.phase).toBe('parser');
      expect(diagnostic.line).toBe(0);
      expect(diagnostic.column).toBe(0);
      expect(diagnostic.sourceRef).toBe('src/unknown-type.ld.json');
    }
  });

  it('reports sanitized FBD temporary collisions as parser diagnostics', () => {
    const collisionModel = {
      name: 'Collision', variables: { local: [], outputs: [] },
      blocks: [
        { id: 'a-b', type: 'variable', variableName: 'A', position: { x: 0, y: 0 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
        { id: 'a_b', type: 'variable', variableName: 'B', position: { x: 0, y: 100 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
        { id: 'sink-one', type: 'output', variableName: 'One', position: { x: 100, y: 0 }, inputs: [{ name: 'IN', type: 'BOOL' }] },
        { id: 'sink-two', type: 'output', variableName: 'Two', position: { x: 100, y: 100 }, inputs: [{ name: 'IN', type: 'BOOL' }] },
      ],
      connections: [
        { id: 'one', from: { block: 'a-b', port: 'OUT' }, to: { block: 'sink-one', port: 'IN' } },
        { id: 'two', from: { block: 'a_b', port: 'OUT' }, to: { block: 'sink-two', port: 'IN' } },
      ],
    };

    try {
      compileMultiTaskProject(
        { name: 'CollisionFBD', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.fbd'] }] },
        [{ name: 'main.fbd', sourceRef: 'src/main.fbd.json', language: 'FBD', content: JSON.stringify(collisionModel) }],
      );
      throw new Error('expected an FBD parser diagnostic');
    } catch (error) {
      const diagnostic = error as CompilerError;
      expect(diagnostic.phase).toBe('parser');
      expect(diagnostic.line).toBe(0);
      expect(diagnostic.column).toBe(0);
      expect(diagnostic.sourceRef).toBe('src/main.fbd.json');
      expect(diagnostic.detail).toContain('temporary name collision');
    }
  });

  it('uses canonical task entry points for multi-program workflows', () => {
    const result = compileMultiTaskProject(
      {
        name: 'MultiTaskWorkflow',
        version: '1.0.0',
        tasks: [
          { name: 'FastTask', trigger: 'cyclic', interval_ms: 10, priority: 0, programs: ['Fast'] },
          { name: 'SlowTask', trigger: 'cyclic', interval_ms: 100, priority: 1, programs: ['Slow'] },
        ],
      },
      [
        { name: 'Fast', language: 'ST', content: 'PROGRAM Fast VAR x : BOOL; END_VAR x := TRUE; END_PROGRAM' },
        { name: 'Slow', language: 'ST', content: 'PROGRAM Slow VAR y : INT; END_VAR y := 42; END_PROGRAM' },
      ],
    );

    expect(result.tasks.map((task) => task.entryPoint)).toEqual([3, 23]);
    expect(result.programDetails.map((program) => program.entryPoint)).toEqual([3, 23]);
    expect(Object.keys(result.debugMap.pou)).toEqual(expect.arrayContaining(['Fast', 'Slow']));
  });

  it('prefers exact source names over extension aliases', () => {
    const result = compileMultiTaskProject(
      {
        name: 'SourcePrecedence',
        version: '1.0.0',
        tasks: [
          { name: 'BareTask', trigger: 'cyclic', interval_ms: 10, priority: 0, programs: ['main'] },
          { name: 'ExtensionTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.st'] },
        ],
      },
      [
        { name: 'main', language: 'ST', content: 'PROGRAM Bare VAR BareValue : BOOL; END_VAR BareValue := TRUE; END_PROGRAM' },
        { name: 'main.st', language: 'ST', content: 'PROGRAM Extension VAR ExtensionValue : BOOL; END_VAR ExtensionValue := FALSE; END_PROGRAM' },
      ],
    );

    expect(result.programDetails[0].assembly).toContain('BareValue');
    expect(result.programDetails[0].assembly).not.toContain('ExtensionValue');
    expect(result.programDetails[1].assembly).toContain('ExtensionValue');
  });

  it('keeps physical task references separate from semantic ST and LD PROGRAM names', () => {
    const result = compileMultiTaskProject(
      {
        name: 'PhysicalSourceRefs',
        version: '1.0.0',
        tasks: [
          { name: 'MotorTask', trigger: 'cyclic', interval_ms: 10, priority: 0, programs: ['Motor.st'] },
          { name: 'LadderTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.ld'] },
        ],
      },
      [
        { name: 'Motor.st', language: 'ST', content: 'PROGRAM Motor VAR Start : BOOL; END_VAR Start := TRUE; END_PROGRAM' },
        { name: 'main.ld', language: 'LD', content: JSON.stringify(LD_MODEL) },
      ],
    );

    expect(result.programDetails.map((program) => program.name)).toEqual(['Motor.st', 'main.ld']);
    expect(result.debugMap.pou.Motor?.sourceRef).toBe('Motor.st');
    expect(result.debugMap.pou.WorkflowLD?.sourceRef).toBe('main.ld');
    expect(result.debugMap.pou['Motor.st']).toBeUndefined();
    expect(result.debugMap.pou['main.ld']).toBeUndefined();
  });
});
