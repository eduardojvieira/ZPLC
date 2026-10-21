import { describe, expect, it } from 'bun:test';

import { parseIL } from '../compiler/il/parser';
import { transpileILToST } from '../compiler/il/ilToST';
import { elementAtLine, linesOfElement, type SourceMapRange } from '../models/sourceElements';
import { transpileFBDToST } from './fbdToST';
import { transpileLDToST } from './ldToST';
import { transpileSFCToST } from './sfcToST';
import type { FBDModel } from '../models/fbd';
import type { SFCModel } from '../models/sfc';

// LNG-003, LNG-004, LNG-026: each transpiler says, for every line of the Structured Text it writes, which element of the
// diagram or which line of the IL source the line was written for.
const textOf = (source: string, map: SourceMapRange[] | undefined, element: string): string[] => {
  const lines = source.split('\n');
  return linesOfElement(map, element).map((line) => lines[line - 1]!);
};

describe('LNG-004 the Ladder source map', () => {
  const cell = (id: string, type: string, variable: string, col: number) => ({
    element: { id, type, variable, row: 0, col },
    hasWire: true,
  });
  const model = (comment: string) => ({
    name: 'Mapped',
    variables: {
      local: [],
      inputs: [{ name: 'Sw', type: 'BOOL', address: '%IX0.0' }],
      outputs: [
        { name: 'Lamp', type: 'BOOL', address: '%QX0.0' },
        { name: 'Fan', type: 'BOOL', address: '%QX0.1' },
      ],
    },
    rungs: ['r1', 'r2'].map((id, index) => ({
      id,
      number: index + 1,
      comment: index === 0 ? comment : undefined,
      gridConfig: { rows: 1, cols: 2, cellWidth: 80, cellHeight: 60 },
      grid: [[cell(`c${index}`, 'contact_no', 'Sw', 0), cell(`k${index}`, 'coil', index === 0 ? 'Lamp' : 'Fan', 1)]],
      branches: [],
    })),
  });

  it('maps the statements of a rung to its cells and the rest of the rung to the rung', () => {
    const result = transpileLDToST(model('first rung'));
    expect(result.success).toBe(true);
    const map = result.sourceMap!;
    expect(textOf(result.source, map, 'rung:r1/cell:0,1')).toEqual(['_rung1_result := Sw;', 'Lamp := _rung1_result;']);
    expect(textOf(result.source, map, 'rung:r2/cell:0,1')).toEqual(['_rung2_result := Sw;', 'Fan := _rung2_result;']);
    // a rung owns its comment, its state declarations and its cells
    expect(textOf(result.source, map, 'rung:r1')).toContain('(* Rung 1: first rung *)');
    expect(textOf(result.source, map, 'rung:r1')).toContain('    _rung1_result : BOOL;');
    expect(textOf(result.source, map, 'rung:r1')).not.toContain('Fan := _rung2_result;');
  });

  it('numbers the lines of the Structured Text as they are, whatever a comment holds', () => {
    const result = transpileLDToST(model('two\nlines'));
    expect(result.success).toBe(true);
    const lines = result.source.split('\n');
    const coil = lines.indexOf('Lamp := _rung1_result;') + 1;
    expect(coil).toBeGreaterThan(0);
    expect(elementAtLine(result.sourceMap, coil)).toBe('rung:r1/cell:0,1');
    expect(elementAtLine(result.sourceMap, lines.indexOf('Fan := _rung2_result;') + 1)).toBe('rung:r2/cell:0,1');
    expect(elementAtLine(result.sourceMap, 1)).toBeUndefined();
  });

  it('names the element of a rung that is a list of elements', () => {
    const legacy = {
      name: 'Legacy',
      variables: { local: [], outputs: [{ name: 'Lamp', type: 'BOOL', address: '%QX0.0' }] },
      rungs: [{ id: 'old', number: 1, elements: [{ id: 'k', type: 'coil', variable: 'Missing', position: { x: 0, y: 0 } }] }],
    };
    const result = transpileLDToST(legacy);
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual([expect.objectContaining({ element: 'rung:old/element:k' })]);
  });
});

describe('LNG-004 the FBD source map', () => {
  const fbd: FBDModel = {
    name: 'Mapped',
    variables: {
      local: [{ name: 'Mid', type: 'BOOL' }],
      inputs: [{ name: 'Sw', type: 'BOOL', address: '%IX0.0' }],
      outputs: [{ name: 'Lamp', type: 'BOOL', address: '%QX0.0' }],
    },
    blocks: [
      {
        id: 'sw',
        type: 'input',
        variableName: 'Sw',
        position: { x: 0, y: 0 },
        inputs: [{ name: 'IN', type: 'ANY' }],
        outputs: [{ name: 'OUT', type: 'ANY' }],
      },
      {
        id: 'inv',
        type: 'NOT',
        position: { x: 100, y: 0 },
        comment: 'invert',
        inputs: [{ name: 'IN', type: 'BOOL' }],
        outputs: [{ name: 'OUT', type: 'BOOL' }],
      },
      {
        id: 'tmr',
        type: 'TON',
        instanceName: 'Delay',
        position: { x: 200, y: 0 },
        inputs: [
          { name: 'IN', type: 'BOOL' },
          { name: 'PT', type: 'TIME' },
        ],
        outputs: [
          { name: 'Q', type: 'BOOL' },
          { name: 'ET', type: 'TIME' },
        ],
      },
      {
        id: 'pt',
        type: 'constant',
        dataType: 'TIME',
        value: 'T#1s',
        position: { x: 100, y: 100 },
        inputs: [],
        outputs: [{ name: 'OUT', type: 'ANY' }],
      },
      { id: 'lamp', type: 'output', variableName: 'Lamp', position: { x: 300, y: 0 }, inputs: [{ name: 'IN', type: 'ANY' }], outputs: [] },
    ],
    connections: [
      { id: 'w1', from: { block: 'sw', port: 'OUT' }, to: { block: 'inv', port: 'IN' } },
      { id: 'w2', from: { block: 'inv', port: 'OUT' }, to: { block: 'tmr', port: 'IN' } },
      { id: 'w3', from: { block: 'pt', port: 'OUT' }, to: { block: 'tmr', port: 'PT' } },
      { id: 'w4', from: { block: 'tmr', port: 'Q' }, to: { block: 'lamp', port: 'IN' } },
    ],
  };

  it('maps the statements, the comment and the declarations of a block to the block', () => {
    const result = transpileFBDToST(fbd);
    expect(result.success).toBe(true);
    const map = result.sourceMap!;
    expect(textOf(result.source, map, 'block:inv')).toEqual(expect.arrayContaining(['(* invert *)', '_inv_OUT := NOT Sw;']));
    expect(textOf(result.source, map, 'block:tmr')).toEqual(
      expect.arrayContaining(['    Delay : TON;', 'Delay(IN := _inv_OUT, PT := T#1s);', '_tmr_Q := Delay.Q;']),
    );
    expect(textOf(result.source, map, 'block:lamp')).toEqual(['Lamp := _tmr_Q;']);
    // a constant and a read have no statement of their own
    expect(linesOfElement(map, 'block:pt')).toEqual([]);
    expect(linesOfElement(map, 'block:sw')).toEqual([]);
  });

  it('names the block of an error, and the wire of an error in a wire', () => {
    const unwired = transpileFBDToST({ ...fbd, connections: fbd.connections.filter((wire) => wire.id !== 'w1') });
    expect(unwired.success).toBe(false);
    expect(unwired.diagnostics).toEqual([{ message: "FBD block 'inv' (NOT): input 'IN' is not wired", element: 'block:inv' }]);
    const loop = transpileFBDToST({
      ...fbd,
      connections: [...fbd.connections, { id: 'w5', from: { block: 'tmr', port: 'Q' }, to: { block: 'inv', port: 'IN' } }].filter(
        (wire) => wire.id !== 'w1',
      ),
    });
    expect(loop.success).toBe(false);
    expect(loop.diagnostics?.[0]?.element).toMatch(/^block:(inv|tmr)$/);
  });
});

describe('LNG-004 and LNG-026 the SFC source map', () => {
  const chart: SFCModel = {
    name: 'Chart',
    variables: {
      local: [],
      outputs: [
        { name: 'Lamp', type: 'BOOL', address: '%QX0.0' },
        { name: 'Fan', type: 'BOOL', address: '%QX0.1' },
      ],
    },
    steps: [
      { id: 's_a', name: 'A', isInitial: true, position: { x: 0, y: 0 }, actions: [{ qualifier: 'N', actionName: 'Mark' }] },
      { id: 's_b', name: 'B', isInitial: false, position: { x: 0, y: 100 } },
    ],
    transitions: [{ id: 't_ab', fromStep: 's_a', toStep: 's_b', condition: 'A.T >= T#1s' }],
    actions: [{ id: 'mark', name: 'Mark', type: 'ST', body: 'Lamp := TRUE;\n  Fan := FALSE;\n  Lamp := Lamp;' }],
  };

  it('maps every line of an action body to the action and the condition line to the transition', () => {
    const result = transpileSFCToST(chart);
    expect(result.success).toBe(true);
    const map = result.sourceMap!;
    expect(textOf(result.source, map, 'action:mark')).toEqual(
      expect.arrayContaining(['    Lamp := TRUE;', '    Fan := FALSE;', '    Lamp := Lamp;']),
    );
    const condition = result.source.split('\n').findIndex((line) => line.startsWith('_F_t_ab :=')) + 1;
    expect(elementAtLine(map, condition)).toBe('transition:t_ab');
    expect(textOf(result.source, map, 'step:s_a')).toEqual(expect.arrayContaining([expect.stringContaining('X_s_a : BOOL')]));
  });

  it('names the action and the transition of the findings of the translation', () => {
    const broken = transpileSFCToST({
      ...chart,
      transitions: [{ ...chart.transitions[0]!, condition: 'A.T >= (T#1s' }],
      actions: [{ ...chart.actions![0]!, body: 'IF Lamp THEN Fan := TRUE;' }],
    });
    expect(broken.success).toBe(false);
    expect(broken.diagnostics?.map((diagnostic) => diagnostic.element).sort()).toEqual(['action:mark', 'transition:t_ab']);
  });
});

describe('LNG-004 the IL source map', () => {
  const program = (body: string) => `PROGRAM P\nVAR\n  Sw AT %IX0.0 : BOOL;\n  Lamp AT %QX0.0 : BOOL;\nEND_VAR\n${body}\nEND_PROGRAM\n`;

  it('maps the statements of an instruction to its IL line', () => {
    const il = parseIL(program('  LD Sw\n  ANDN Lamp\n  ST Lamp\n'));
    const result = transpileILToST(il);
    expect(result.success).toBe(true);
    const map = result.sourceMap!;
    expect(textOf(result.source, map, 'line:6')).toEqual(['IL_CR_BOOL := Sw;']);
    expect(textOf(result.source, map, 'line:7')).toEqual(['IL_CR_BOOL := IL_CR_BOOL AND NOT Lamp;']);
    expect(textOf(result.source, map, 'line:8')).toEqual(['Lamp := IL_CR_BOOL;']);
  });

  it('keeps the IL line of a statement inside the state machine of a jump, and leaves the scaffolding without one', () => {
    const il = parseIL(program('  LD Sw\n  JMPC skip\n  ST Lamp\nskip: LD Sw\n  ST Lamp\n'));
    const result = transpileILToST(il);
    expect(result.success).toBe(true);
    const lines = result.source.split('\n');
    const scaffold = lines.findIndex((line) => line.includes('WHILE NOT IL_DONE')) + 1;
    expect(elementAtLine(result.sourceMap, scaffold)).toBeUndefined();
    const jump = lines.findIndex((line) => line.trim().startsWith('IF IL_CR_BOOL THEN')) + 1;
    expect(elementAtLine(result.sourceMap, jump)).toBe('line:7');
  });
});
