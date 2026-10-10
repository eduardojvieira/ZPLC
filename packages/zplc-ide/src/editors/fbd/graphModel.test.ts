import { describe, expect, it } from 'bun:test';
import type { Edge, Node } from '@xyflow/react';
import { parseFBDModel, serializeFBDModel, type FBDModel } from '../../models/fbd';
import { connectBlocks, copyFBDFragment, pasteFBDFragment } from './graphModel';

const model: FBDModel = {
  name: 'copy', variables: { local: [], outputs: [] },
  blocks: [
    { id: 'timer', type: 'TON', instanceName: 'Timer', position: { x: 0, y: 0 }, inputs: [{ name: 'IN', type: 'BOOL' }], outputs: [{ name: 'Q', type: 'BOOL' }], comment: 'timer' },
    { id: 'output', type: 'output', position: { x: 100, y: 0 }, inputs: [{ name: 'IN', type: 'BOOL' }], outputs: [], variableName: 'Output', address: '%Q0.0' },
    { id: 'outside', type: 'constant', position: { x: 200, y: 0 }, inputs: [], outputs: [{ name: 'OUT', type: 'BOOL' }], value: true },
  ],
  connections: [{ id: 'internal', from: { block: 'timer', port: 'Q' }, to: { block: 'output', port: 'IN' } }],
};

const nodes: Node[] = model.blocks.map((block, index) => ({ id: block.id, type: 'block', position: block.position, selected: index < 2, data: { ...block, debugActive: true, callback: () => undefined } }));
const edges: Edge[] = [
  { id: 'internal', source: 'timer', sourceHandle: 'Q', target: 'output', targetHandle: 'IN' },
  { id: 'boundary', source: 'outside', sourceHandle: 'OUT', target: 'timer', targetHandle: 'IN' },
];

describe('FBD copy/paste graph model', () => {
  it('copies only the selected closed graph and pastes validated independent clones', () => {
    const fragment = copyFBDFragment(nodes, edges);
    expect(fragment).toEqual({ blocks: model.blocks.slice(0, 2), connections: model.connections });
    expect(fragment?.blocks[0]).not.toBe(model.blocks[0]);
    expect(fragment?.blocks[0]?.inputs).not.toBe(model.blocks[0]?.inputs);

    const pasted = pasteFBDFragment(model, fragment!);
    expect(pasted?.blocks).toHaveLength(5);
    expect(pasted?.connections).toHaveLength(2);
    expect(pasted?.blocks.slice(3)).toMatchObject([
      { id: 'timer_copy', instanceName: 'Timer_copy', position: { x: 40, y: 40 } },
      { id: 'output_copy', variableName: 'Output', address: '%Q0.0', position: { x: 140, y: 40 } },
    ]);
    expect(pasted?.connections[1]).toEqual({ id: 'internal_copy', from: { block: 'timer_copy', port: 'Q' }, to: { block: 'output_copy', port: 'IN' } });
    expect(parseFBDModel(serializeFBDModel(pasted!))).toEqual(pasted!);

    const repeated = pasteFBDFragment(pasted!, fragment!);
    expect(repeated?.blocks.slice(-2).map((block) => [block.id, block.instanceName, block.position])).toEqual([
      ['timer_copy_2', 'Timer_copy_2', { x: 80, y: 80 }],
      ['output_copy_2', undefined, { x: 180, y: 80 }],
    ]);
  });

  it('fails closed for an empty selection or malformed fragment', () => {
    expect(copyFBDFragment(nodes.map((node) => ({ ...node, selected: false })), edges)).toBeUndefined();
    expect(pasteFBDFragment(model, { blocks: [{ ...model.blocks[0]!, position: { x: Number.NaN, y: 0 } }], connections: [] })).toBeUndefined();
    expect(pasteFBDFragment({ ...model, blocks: [...model.blocks, { ...model.blocks[0]!, id: 'timer_two', instanceName: 'timer' }] }, copyFBDFragment(nodes, edges)!)).toBeUndefined();
  });
});

describe('LNG-013 drawing a wire between two pins', () => {
  const diagram: FBDModel = {
    name: 'pins',
    variables: { local: [{ name: 'Level', type: 'REAL' }], outputs: [{ name: 'Lamp', type: 'BOOL' }] },
    blocks: [
      { id: 'level', type: 'variable', variableName: 'Level', position: { x: 0, y: 0 }, inputs: [{ name: 'IN', type: 'ANY' }], outputs: [{ name: 'OUT', type: 'ANY' }] },
      { id: 'gate', type: 'AND', position: { x: 100, y: 0 }, inputs: [{ name: 'IN1', type: 'BOOL' }, { name: 'IN2', type: 'BOOL' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
      { id: 'lamp', type: 'output', variableName: 'Lamp', position: { x: 200, y: 0 }, inputs: [{ name: 'IN', type: 'ANY' }], outputs: [] },
    ],
    connections: [],
  };
  const flowNodes: Node[] = diagram.blocks.map((block) => ({ id: block.id, type: 'block', position: block.position, data: { ...block } }));

  it('refuses a REAL variable into a BOOL input, keeps the edges, and says why', () => {
    const edges: Edge[] = [];
    const result = connectBlocks(diagram, flowNodes, edges, { source: 'level', sourceHandle: 'OUT', target: 'gate', targetHandle: 'IN1' });
    expect(result.edges).toBe(edges);
    expect(result.refusal).toContain("'level.OUT' cannot feed 'gate.IN1'");
    expect(result.refusal).toContain('REAL is a real number (REAL) and BOOL is a BOOL');
  });

  it('adds the wire from the output end when it was drawn from the input end', () => {
    const result = connectBlocks(diagram, flowNodes, [], { source: 'lamp', sourceHandle: 'IN', target: 'gate', targetHandle: 'OUT' });
    expect(result.refusal).toBeUndefined();
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: 'gate', sourceHandle: 'OUT', target: 'lamp', targetHandle: 'IN' });
  });

  it('refuses a second wire into an input that already has one', () => {
    const first = connectBlocks(diagram, flowNodes, [], { source: 'gate', sourceHandle: 'OUT', target: 'lamp', targetHandle: 'IN' });
    const second = connectBlocks(diagram, flowNodes, first.edges, { source: 'level', sourceHandle: 'OUT', target: 'lamp', targetHandle: 'IN' });
    expect(second.refusal).toContain("input 'lamp.IN' already has a wire");
    expect(second.edges).toBe(first.edges);
  });
});
