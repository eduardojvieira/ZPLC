/**
 * LNG-029: MUX takes more inputs, and a person adds and removes them from the context menu of the block (which opens from the
 * keyboard too); the transpiler reads the inputs of the document.
 */
import { describe, expect, it } from 'bun:test';
import type { Node } from '@xyflow/react';

import { transpileFBDToST } from './fbdToST';
import { getDefaultPorts, type FBDModel } from '../models/fbd';
import { fbdInputMenuItems, runFBDCommand } from '../editors/fbd/keyboard';

type Wire = [from: string, to: string, port: string];

/** A diagram of one block `fn` of `type`, fed by variable reads (`V:<name>`) or constants (`C:<json>`), its OUT stored in Result. */
function diagram(
  type: string,
  feeds: Record<string, string>,
  local: Array<[string, string]>,
  extra: { inputs?: Array<{ name: string; type: string }>; result?: string } = {},
): FBDModel {
  const blocks: FBDModel['blocks'] = [{ id: 'fn', type, position: { x: 200, y: 0 }, ...(extra.inputs ? { inputs: extra.inputs } : {}) }];
  const wires: Wire[] = [];
  for (const [pin, feed] of Object.entries(feeds)) {
    const id = `src_${pin}`;
    if (feed.startsWith('V:')) blocks.push({ id, type: 'input', variableName: feed.slice(2), position: { x: 0, y: 0 } });
    else blocks.push({ id, type: 'constant', value: JSON.parse(feed.slice(2)), position: { x: 0, y: 0 } });
    wires.push([id, 'fn', pin]);
  }
  if (extra.result) {
    blocks.push({ id: 'sink', type: 'output', variableName: 'Result', position: { x: 400, y: 0 } });
    wires.push(['fn', 'sink', 'IN']);
  }
  return {
    name: 'Main',
    variables: {
      local: [...local, ...(extra.result ? [['Result', extra.result]] : [])].map(([name, t]) => ({ name, type: t })),
      outputs: [],
    },
    blocks,
    connections: wires.map(([from, to, port], index) => ({
      id: `w${index}`,
      from: { block: from, port: 'OUT' },
      to: { block: to, port },
    })),
  };
}

describe('LNG-029 a person adds and removes inputs of MUX', () => {
  const ports = getDefaultPorts('MUX');
  const mux = (inputs = ports.inputs): Node => ({
    id: 'mux',
    type: 'functionBlock',
    position: { x: 0, y: 0 },
    selected: true,
    data: { type: 'MUX', inputs, outputs: ports.outputs },
  });
  const empty: FBDModel = { name: 'Main', variables: { local: [], outputs: [] }, blocks: [], connections: [] };

  it('adds IN2, and the call takes it', () => {
    const outcome = runFBDCommand(empty, { nodes: [mux()], edges: [] }, 'addInput');
    expect(outcome.changed).toBe(true);
    const inputs = (outcome.nodes[0]!.data as { inputs: Array<{ name: string }> }).inputs.map((port) => port.name);
    expect(inputs).toEqual(['K', 'IN0', 'IN1', 'IN2']);
    const model = diagram(
      'MUX',
      { K: 'V:K', IN0: 'V:A', IN1: 'V:B', IN2: 'V:C' },
      [
        ['K', 'INT'],
        ['A', 'INT'],
        ['B', 'INT'],
        ['C', 'INT'],
      ],
      { inputs: (outcome.nodes[0]!.data as { inputs: Array<{ name: string; type: string }> }).inputs, result: 'INT' },
    );
    expect(transpileFBDToST(model).source).toContain('_fn_OUT := MUX(K, A, B, C);');
  });

  it('removes the last input and its wire, never below IN0 and IN1', () => {
    const three = [...ports.inputs, { name: 'IN2', type: 'ANY' }];
    const edges = [{ id: 'e', source: 'x', target: 'mux', sourceHandle: 'OUT', targetHandle: 'IN2' }];
    const outcome = runFBDCommand(empty, { nodes: [mux(three)], edges }, 'removeInput');
    expect((outcome.nodes[0]!.data as { inputs: unknown[] }).inputs).toEqual(ports.inputs);
    expect(outcome.edges).toEqual([]);
    const again = runFBDCommand(empty, { nodes: outcome.nodes, edges: [] }, 'removeInput');
    expect(again.refused).toBe(true);
    expect(again.changed).toBe(false);
  });

  it('refuses both commands on a block with fixed inputs', () => {
    const sqrt: Node = { ...mux(), data: { type: 'SQRT', ...getDefaultPorts('SQRT') } };
    expect(runFBDCommand(empty, { nodes: [sqrt], edges: [] }, 'addInput').refused).toBe(true);
  });

  it('offers the two commands in the context menu of a MUX, and only there', () => {
    const items = fbdInputMenuItems([mux()], false, () => undefined);
    expect(items.map((item) => [item.id, item.disabled === true])).toEqual([
      ['addInput', false],
      ['removeInput', true],
    ]);
    expect(fbdInputMenuItems([{ ...mux(), data: { type: 'SQRT' } }], false, () => undefined)).toEqual([]);
  });

  it('stops at the eight inputs of MUX: Add input is disabled there and says why, and the build refuses a ninth', () => {
    const eight = [ports.inputs[0]!, ...Array.from({ length: 8 }, (_, index) => ({ name: `IN${index}`, type: 'ANY' }))];
    const items = fbdInputMenuItems([mux(eight)], false, () => undefined);
    expect(items[0]).toMatchObject({ id: 'addInput', disabled: true, disabledReason: 'MUX takes at most 8 inputs.' });
    const refused = runFBDCommand(empty, { nodes: [mux(eight)], edges: [] }, 'addInput');
    expect([refused.refused, refused.changed]).toEqual([true, false]);
    const nine = [...eight, { name: 'IN8', type: 'ANY' }];
    const feeds = Object.fromEntries(nine.map((port) => [port.name, `V:${port.name === 'K' ? 'K' : 'A'}`]));
    const model = diagram(
      'MUX',
      feeds,
      [
        ['K', 'INT'],
        ['A', 'INT'],
      ],
      { inputs: nine, result: 'INT' },
    );
    expect(transpileFBDToST(model).errors).toEqual(["FBD block 'fn' (MUX): it has 9 inputs after K; MUX takes at most 8"]);
  });
});
