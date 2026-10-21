/**
 * The function blocks and functions of the project as blocks of the visual languages (LNG-008)
 *
 * The conformance cases under conformance/lng build and run a diagram that places one. This file covers the
 * catalogue they are made from, the palette data of the editors, and the text the transpilers write for them.
 */

import { describe, expect, it } from 'bun:test';
import { transpileFBDToST } from '../transpiler/fbdToST';
import { transpileLDToST } from '../transpiler/ldToST';
import { transpileToST } from '../compiler';
import { getDefaultPorts, validateFBDModel, type FBDModel } from './fbd';
import { getToolboxItems } from './ld';
import { collectProjectBlocks, describeProjectBlock, findProjectBlock, projectPalette } from './projectBlocks';

const LIBRARY = [
  {
    name: 'blocks.st',
    path: 'src/blocks.st',
    language: 'ST',
    content: [
      'FUNCTION_BLOCK Latch',
      'VAR_INPUT Set : BOOL; Level : INT; END_VAR',
      'VAR_IN_OUT Total : DINT; END_VAR',
      'VAR_OUTPUT Q : BOOL; Count : INT; END_VAR',
      '  IF Set THEN Q := TRUE; END_IF;',
      'END_FUNCTION_BLOCK',
      '',
      'FUNCTION Scale : REAL',
      'VAR_INPUT Value : INT; Gain : REAL; END_VAR',
      '  Scale := INT_TO_REAL(Value) * Gain;',
      'END_FUNCTION',
    ].join('\n'),
  },
  { name: 'later.st', content: 'FUNCTION_BLOCK Latch\nVAR_INPUT Other : BOOL; END_VAR\nEND_FUNCTION_BLOCK', language: 'ST' },
  { name: 'broken.st', content: 'FUNCTION_BLOCK Broken VAR_INPUT : END_VAR', language: 'ST' },
  { name: 'diagram.fbd.json', content: '{"name":"Latch"}', language: 'FBD' },
];

const blocks = collectProjectBlocks(LIBRARY);

describe('the catalogue of the project blocks', () => {
  it('has the ports of a function block: its inputs, then its in-outs, and its outputs', () => {
    expect(findProjectBlock(blocks, 'LATCH')).toEqual({
      name: 'Latch',
      kind: 'FUNCTION_BLOCK',
      inputs: [
        { name: 'Set', type: 'BOOL' },
        { name: 'Level', type: 'INT' },
        { name: 'Total', type: 'DINT' },
      ],
      outputs: [
        { name: 'Q', type: 'BOOL' },
        { name: 'Count', type: 'INT' },
      ],
      source: 'src/blocks.st',
    });
  });

  it('has the inputs of a function and its result as the output OUT', () => {
    expect(findProjectBlock(blocks, 'scale')).toMatchObject({
      kind: 'FUNCTION',
      inputs: [
        { name: 'Value', type: 'INT' },
        { name: 'Gain', type: 'REAL' },
      ],
      outputs: [{ name: 'OUT', type: 'REAL' }],
    });
  });

  it('takes the first declaration of a name, skips files that are not Structured Text or do not parse', () => {
    expect(blocks.map((block) => block.name)).toEqual(['Latch', 'Scale']);
    expect(findProjectBlock(blocks, 'Latch')!.inputs.map((port) => port.name)).not.toContain('Other');
  });
});

describe('the palette data', () => {
  it('lists the blocks of the project in a category of their own, none when there are none', () => {
    expect(projectPalette(blocks)).toEqual({ name: 'Project', blocks: ['Latch', 'Scale'] });
    expect(projectPalette([])).toBeUndefined();
  });

  it('describes a block with its kind, file and ports', () => {
    expect(describeProjectBlock(findProjectBlock(blocks, 'Scale')!)).toBe(
      'FUNCTION Scale (src/blocks.st)\nIN: Value: INT, Gain: REAL\nOUT: OUT: REAL',
    );
  });

  it('puts the function blocks of the project among the blocks an LD rung places, and not the functions', () => {
    const names = getToolboxItems(blocks)
      .filter((item) => item.category === 'function_block')
      .map((item) => item.fbType);
    expect(names).toContain('Latch');
    expect(names).toContain('TON');
    expect(names).not.toContain('Scale');
    expect(getToolboxItems().map((item) => item.fbType)).not.toContain('Latch');
  });
});

describe('the ports of a block a diagram places', () => {
  it('are the ones of the declaration, and win over a standard block of the same name', () => {
    expect(getDefaultPorts('Latch', blocks).inputs.map((port) => port.name)).toEqual(['Set', 'Level', 'Total']);
    const timer = collectProjectBlocks([
      { name: 'ton.st', language: 'ST', content: 'FUNCTION_BLOCK TON\nVAR_INPUT Go : BOOL; END_VAR\nEND_FUNCTION_BLOCK' },
    ]);
    expect(getDefaultPorts('TON', timer).inputs).toEqual([{ name: 'Go', type: 'BOOL' }]);
    expect(getDefaultPorts('TON').inputs.map((port) => port.name)).toEqual(['IN', 'PT']);
  });

  it('are checked: a wire to a port the declaration does not have is refused', () => {
    const model = {
      name: 'Wires',
      variables: { local: [], outputs: [] },
      blocks: [
        { id: 'a', type: 'input', variableName: 'X', position: { x: 0, y: 0 } },
        { id: 'l', type: 'Latch', instanceName: 'Held', position: { x: 1, y: 0 } },
      ],
      connections: [{ id: 'w', from: { block: 'a', port: 'OUT' }, to: { block: 'l', port: 'Reset' } }],
    };
    expect(() => validateFBDModel(model, blocks)).toThrow(/unknown destination input port 'l.Reset'/);
    expect(() =>
      validateFBDModel({ ...model, connections: [{ ...model.connections[0], to: { block: 'l', port: 'Set' } }] }, blocks),
    ).not.toThrow();
  });
});

describe('the text of a diagram that places a block of the project', () => {
  const diagram = (extra: FBDModel['blocks'], connections: FBDModel['connections']): FBDModel => ({
    name: 'Place',
    variables: {
      local: [{ name: 'Total', type: 'DINT' }],
      inputs: [
        { name: 'Go', type: 'BOOL', address: '%IX0.0' },
        { name: 'Raw', type: 'INT', address: '%IW0' },
      ],
      outputs: [
        { name: 'Done', type: 'BOOL', address: '%QX0.0' },
        { name: 'Level', type: 'REAL', address: '%QD0' },
      ],
    },
    blocks: [
      { id: 'go', type: 'input', variableName: 'Go', position: { x: 0, y: 0 } },
      { id: 'raw', type: 'input', variableName: 'Raw', position: { x: 0, y: 1 } },
      ...extra,
    ],
    connections,
  });

  it('declares the instance of a function block and calls it with the ports of the declaration by name', () => {
    const result = transpileFBDToST(
      diagram(
        [
          { id: 'latch', type: 'Latch', instanceName: 'Held', position: { x: 1, y: 0 } },
          { id: 'done', type: 'output', variableName: 'Done', position: { x: 2, y: 0 } },
        ],
        [
          { id: 'w1', from: { block: 'go', port: 'OUT' }, to: { block: 'latch', port: 'Set' } },
          { id: 'w2', from: { block: 'latch', port: 'Q' }, to: { block: 'done', port: 'IN' } },
        ],
      ),
      blocks,
    );
    expect(result.errors).toEqual([]);
    expect(result.source).toContain('Held : Latch;');
    expect(result.source).toContain('Held(Set := Go);');
    expect(result.source).toContain('Done := _latch_Q;');
  });

  it('calls a function with its inputs by name and takes its result from OUT', () => {
    const result = transpileFBDToST(
      diagram(
        [
          { id: 'gain', type: 'constant', dataType: 'REAL', value: 1.5, position: { x: 0, y: 2 } },
          { id: 'scale', type: 'Scale', position: { x: 1, y: 0 } },
          { id: 'level', type: 'output', variableName: 'Level', position: { x: 2, y: 0 } },
        ],
        [
          { id: 'w1', from: { block: 'raw', port: 'OUT' }, to: { block: 'scale', port: 'Value' } },
          { id: 'w2', from: { block: 'gain', port: 'OUT' }, to: { block: 'scale', port: 'Gain' } },
          { id: 'w3', from: { block: 'scale', port: 'OUT' }, to: { block: 'level', port: 'IN' } },
        ],
      ),
      blocks,
    );
    expect(result.errors).toEqual([]);
    expect(result.source).toContain('_scale_OUT := Scale(Value := Raw, Gain := 1.5);');
    expect(result.source).toContain('_scale_OUT : REAL;');
    // a function has no instance
    expect(result.source).not.toMatch(/: Scale;/);
  });

  it('still calls a function whose result nobody uses', () => {
    const result = transpileFBDToST(
      diagram(
        [{ id: 'scale', type: 'Scale', position: { x: 1, y: 0 } }],
        [{ id: 'w1', from: { block: 'raw', port: 'OUT' }, to: { block: 'scale', port: 'Value' } }],
      ),
      blocks,
    );
    expect(result.errors).toEqual([]);
    expect(result.source).toContain('Scale(Value := Raw);');
  });

  it('is an error that names the block when the project does not declare its type', () => {
    const result = transpileFBDToST(diagram([{ id: 'ghost', type: 'Ghost', instanceName: 'g', position: { x: 1, y: 0 } }], []), blocks);
    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toMatch(/ghost.*Ghost/);
  });

  it('is what the build does with a diagram file: the ports come from the project files', () => {
    const content = JSON.stringify(
      diagram(
        [
          { id: 'latch', type: 'Latch', instanceName: 'Held', position: { x: 1, y: 0 } },
          { id: 'done', type: 'output', variableName: 'Done', position: { x: 2, y: 0 } },
        ],
        [
          { id: 'w1', from: { block: 'go', port: 'OUT' }, to: { block: 'latch', port: 'Set' } },
          { id: 'w2', from: { block: 'latch', port: 'Q' }, to: { block: 'done', port: 'IN' } },
        ],
      ),
    );
    expect(transpileToST(content, 'FBD').success).toBe(false);
    const result = transpileToST(content, 'FBD', undefined, blocks);
    expect(result.errors).toEqual([]);
    expect(result.source).toContain('Held(Set := Go);');
  });
});

describe('the text of a rung that places a function block of the project', () => {
  const rung = (fbType: string) => ({
    name: 'Keep',
    variables: {
      local: [{ name: 'Keeper', type: fbType }],
      inputs: [{ name: 'Sensor', type: 'BOOL', address: '%IX0.0' }],
      outputs: [{ name: 'Held', type: 'BOOL', address: '%QX0.0' }],
    },
    rungs: [
      {
        id: 'rung1',
        number: 1,
        elements: [
          { id: 'c1', type: 'contact_no', position: { x: 50, y: 0 }, variable: 'Sensor' },
          {
            id: 'fb1',
            type: 'function_block',
            position: { x: 150, y: 0 },
            fbType,
            instance: 'Keeper',
            parameters: { Set: 'CONNECTED' },
            outputs: { Q: 'Held' },
          },
        ],
        connections: [],
      },
    ],
  });

  it('declares the instance and calls it, the contact powering the input it is wired to', () => {
    const result = transpileLDToST(rung('Latch'), blocks);
    expect(result.errors).toEqual([]);
    expect(result.source).toContain('Keeper : Latch;');
    expect(result.source).toContain('Keeper(Set := _rung1_result);');
    expect(result.source).toContain('Held := Keeper.Q;');
  });

  it('refuses a block that the project does not declare, and a port it does not have', () => {
    expect(transpileLDToST(rung('Latch')).success).toBe(false);
    const wrongPort = rung('Latch');
    (wrongPort.rungs[0]!.elements[1] as { outputs: Record<string, string> }).outputs = { Missing: 'Held' };
    expect(transpileLDToST(wrongPort, blocks).errors.join(' ')).toMatch(/output 'Missing' is not supported by Latch/);
  });

  it('does not place a function: a rung has no value to give it', () => {
    expect(transpileLDToST(rung('Scale'), blocks).success).toBe(false);
  });

  it('leaves no trace of the project blocks for the next transpilation', () => {
    expect(transpileLDToST(rung('Latch'), blocks).success).toBe(true);
    expect(transpileLDToST(rung('Latch')).success).toBe(false);
  });
});
