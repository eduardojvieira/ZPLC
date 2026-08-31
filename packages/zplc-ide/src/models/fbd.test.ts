import { describe, expect, it } from 'bun:test';

import { parseFBDModel, validateFBDModel } from './fbd';
import { transpileFBDToST } from '../transpiler/fbdToST';

const model = {
  name: 'SafeFBD',
  variables: { local: [], outputs: [] },
  blocks: [
    { id: 'source', type: 'constant', position: { x: 0, y: 0 } },
    { id: 'sink', type: 'output', position: { x: 100, y: 0 } },
  ],
  connections: [{ id: 'wire', from: { block: 'source', port: 'OUT' }, to: { block: 'sink', port: 'IN' } }],
};

describe('FBD model validation', () => {
  it('fails closed instead of dropping a connection to a missing block', () => {
    const invalid = { ...model, connections: [{ id: 'wire', from: { block: 'missing', port: 'OUT' }, to: { block: 'sink', port: 'IN' } }] };

    expect(() => parseFBDModel(JSON.stringify(invalid))).toThrow('unknown source block');
    expect(transpileFBDToST(invalid as never)).toMatchObject({ success: false, source: '', errors: [expect.stringContaining('unknown source block')] });
  });

  it('normalizes only omitted legacy ports and respects explicit empty ports', () => {
    const parsed = parseFBDModel(JSON.stringify({ ...model, blocks: [
      { id: 'source', type: 'constant', position: { x: 0, y: 0 } },
      { id: 'sink', type: 'output', position: { x: 100, y: 0 }, inputs: [], outputs: [] },
    ], connections: [] }));

    expect(parsed.blocks[0]).toMatchObject({ inputs: [], outputs: [{ name: 'OUT', type: 'ANY' }] });
    expect(parsed.blocks[1]).toMatchObject({ inputs: [], outputs: [] });
  });

  it('rejects invalid model shapes, duplicate ids, invalid ports, and multiple writers', () => {
    expect(() => parseFBDModel('[]')).toThrow('top-level object');
    expect(() => parseFBDModel('null')).toThrow('top-level object');
    expect(() => parseFBDModel(JSON.stringify({ ...model, name: ' ', variables: { local: [], outputs: [] } }))).toThrow('name');
    expect(() => parseFBDModel(JSON.stringify({ ...model, variables: { local: {}, outputs: [] } }))).toThrow('variables.local');
    expect(() => parseFBDModel(JSON.stringify({ ...model, blocks: [...model.blocks, { ...model.blocks[0] }] }))).toThrow('duplicate block id');
    expect(() => parseFBDModel(JSON.stringify({ ...model, connections: [...model.connections, { ...model.connections[0] }] }))).toThrow('duplicate connection id');
    expect(() => parseFBDModel(JSON.stringify({ ...model, connections: [{ id: 'wire', from: { block: 'source', port: 'IN' }, to: { block: 'sink', port: 'IN' } }] }))).toThrow('unknown source output port');
    expect(() => parseFBDModel(JSON.stringify({ ...model, connections: [{ id: 'wire', from: { block: 'source', port: 'OUT' }, to: { block: 'sink', port: 'OUT' } }] }))).toThrow('unknown destination input port');
    expect(() => parseFBDModel(JSON.stringify({ ...model, connections: [
      ...model.connections,
      { id: 'wire-two', from: { block: 'source', port: 'OUT' }, to: { block: 'sink', port: 'IN' } },
    ] }))).toThrow('multiple writers');
    expect(() => parseFBDModel(JSON.stringify({ ...model, blocks: [{ ...model.blocks[0], outputs: [{ name: 'OUT', type: ' ' }] }, model.blocks[1]] }))).toThrow('outputs[0].type');
  });

  it('rejects collisions between distinct sanitized temporary names', () => {
    const collision = {
      name: 'Collision', variables: { local: [], outputs: [] },
      blocks: [
        { id: 'a.b', type: 'variable', variableName: 'A', position: { x: 0, y: 0 }, outputs: [{ name: 'c', type: 'BOOL' }] },
        { id: 'a', type: 'variable', variableName: 'B', position: { x: 0, y: 100 }, outputs: [{ name: 'b.c', type: 'BOOL' }] },
        { id: 'sink-one', type: 'output', variableName: 'One', position: { x: 100, y: 0 }, inputs: [{ name: 'IN', type: 'BOOL' }] },
        { id: 'sink-two', type: 'output', variableName: 'Two', position: { x: 100, y: 100 }, inputs: [{ name: 'IN', type: 'BOOL' }] },
      ],
      connections: [
        { id: 'one', from: { block: 'a.b', port: 'c' }, to: { block: 'sink-one', port: 'IN' } },
        { id: 'two', from: { block: 'a', port: 'b.c' }, to: { block: 'sink-two', port: 'IN' } },
      ],
    };

    expect(transpileFBDToST(collision as never)).toMatchObject({ success: false, source: '', errors: [expect.stringContaining('temporary name collision')] });
  });

  it('allows fan-out from one source endpoint to distinct inputs', () => {
    const fanOut = {
      name: 'FanOut', variables: { local: [], outputs: [] },
      blocks: [
        { id: 'source', type: 'variable', variableName: 'Source', position: { x: 0, y: 0 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
        { id: 'left', type: 'output', variableName: 'Left', position: { x: 100, y: 0 }, inputs: [{ name: 'IN', type: 'BOOL' }] },
        { id: 'right', type: 'output', variableName: 'Right', position: { x: 100, y: 100 }, inputs: [{ name: 'IN', type: 'BOOL' }] },
      ],
      connections: [
        { id: 'left-wire', from: { block: 'source', port: 'OUT' }, to: { block: 'left', port: 'IN' } },
        { id: 'right-wire', from: { block: 'source', port: 'OUT' }, to: { block: 'right', port: 'IN' } },
      ],
    };

    expect(transpileFBDToST(fanOut as never)).toMatchObject({ success: true, errors: [] });
  });

  it('rejects non-finite positions passed directly to the shared validator', () => {
    expect(() => validateFBDModel({ ...model, blocks: [{ ...model.blocks[0], position: { x: Number.NaN, y: Number.POSITIVE_INFINITY } }, model.blocks[1]] })).toThrow('finite');
  });
});
