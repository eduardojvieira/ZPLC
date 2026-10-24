import { describe, expect, it } from 'bun:test';
import { applyNodeChanges, type Edge, type EdgeChange, type Node, type NodeChange } from '@xyflow/react';
import { appliedNodeChanges, createCommitBatcher, edgeChangesCommit, nodeChangesCommit } from './gesture';
import { applyFBDSelection, edgesToConnections, fbdSelection, nodesToBlocks } from './fbd/graphModel';
import { serializeFBDModel, type FBDModel } from '../models/fbd';
import { recordVisualSnapshot, undoVisualSnapshot, type VisualHistories } from './visualHistory';

const move = (id: string, dragging: boolean): NodeChange => ({ id, type: 'position', position: { x: 10, y: 20 }, dragging });

describe('which changes of a canvas end a gesture (LNG-010)', () => {
  it('a drag in progress commits nothing: 30 steps of one drag are not 30 undo steps', () => {
    for (let step = 0; step < 30; step++) expect(nodeChangesCommit([move('and_1', true)])).toBe(false);
  });

  it('putting the node down commits once', () => {
    expect(nodeChangesCommit([move('and_1', false)])).toBe(true);
  });

  it('a selection or a size change is not an edit of the document', () => {
    expect(
      nodeChangesCommit([
        { id: 'and_1', type: 'select', selected: true },
        { id: 'and_1', type: 'dimensions', dimensions: { width: 10, height: 10 } },
      ]),
    ).toBe(false);
  });

  it('adding, removing and replacing commit', () => {
    expect(nodeChangesCommit([{ id: 'n', type: 'remove' }])).toBe(true);
    expect(nodeChangesCommit([{ type: 'add', item: { id: 'n', position: { x: 0, y: 0 }, data: {} } }])).toBe(true);
    expect(edgeChangesCommit([{ id: 'w', type: 'remove' } as EdgeChange])).toBe(true);
    expect(edgeChangesCommit([{ id: 'w', type: 'select', selected: true } as EdgeChange])).toBe(false);
  });
});

describe('what a canvas applies while it is read-only', () => {
  const changes: NodeChange[] = [
    { id: 'start', type: 'select', selected: true },
    move('start', false),
    { id: 'start', type: 'dimensions', dimensions: { width: 120, height: 40 } },
  ];

  // a node without its measured size is drawn hidden by React Flow until it is measured again: a chart online rebuilds its
  // nodes for every value, so a read-only canvas that dropped the sizes would hide its nodes, and could leave them hidden
  it('keeps the size React Flow measured, and nothing that edits or selects', () => {
    const applied = appliedNodeChanges(changes, true);
    expect(applied.map((change) => change.type)).toEqual(['dimensions']);
    const [node] = applyNodeChanges(applied, [{ id: 'start', position: { x: 0, y: 0 }, data: {} }]);
    expect(node?.measured).toEqual({ width: 120, height: 40 });
    expect(node?.selected).toBeUndefined();
    expect(node?.position).toEqual({ x: 0, y: 0 });
  });

  it('applies every change while the canvas is edited', () => {
    expect(appliedNodeChanges(changes, false)).toEqual(changes);
  });
});

describe('the commits of one task are one commit', () => {
  it('a delete that removes the nodes and then their wires is flushed once, with the last state', async () => {
    const flushed: string[] = [];
    const batcher = createCommitBatcher<string>((value) => flushed.push(value));
    batcher.push('nodes removed');
    batcher.push('wires removed');
    expect(batcher.pending()).toBe(true);
    expect(flushed).toEqual([]);
    await Promise.resolve();
    expect(flushed).toEqual(['wires removed']);
    expect(batcher.pending()).toBe(false);
  });

  it('commits of two tasks are two commits', async () => {
    const flushed: number[] = [];
    const batcher = createCommitBatcher<number>((value) => flushed.push(value));
    batcher.push(1);
    await Promise.resolve();
    batcher.push(2);
    await Promise.resolve();
    expect(flushed).toEqual([1, 2]);
  });
});

// The editor's commit rule, as the editors apply it: a canvas change that `nodeChangesCommit` accepts is serialized and recorded.
describe('one drag is one undo step, and the selection comes back (LNG-010, WP-55)', () => {
  const base: FBDModel = { name: 'd', variables: { local: [], outputs: [] }, blocks: [], connections: [] };
  const nodes0: Node[] = [
    { id: 'and_1', type: 'logicGate', position: { x: 0, y: 0 }, selected: true, data: { type: 'AND', inputs: [], outputs: [] } },
    { id: 'or_2', type: 'logicGate', position: { x: 200, y: 0 }, data: { type: 'OR', inputs: [], outputs: [] } },
  ];
  const wires: Edge[] = [{ id: 'w1', source: 'and_1', sourceHandle: 'OUT', target: 'or_2', targetHandle: 'IN1' }];
  const document = (nodes: Node[]) => serializeFBDModel({ ...base, blocks: nodesToBlocks(nodes), connections: edgesToConnections(wires) });

  it('a drag of 300 pixels in 30 steps records one history entry; undo moves the node back', () => {
    const key = '1:diagram.fbd.json';
    let nodes = nodes0;
    let histories: VisualHistories = new Map();
    let committed = document(nodes);
    const commit = (): void => {
      const next = document(nodes);
      histories = recordVisualSnapshot(histories, key, committed, next, {
        selection: { before: ['block:and_1'], after: fbdSelection(nodes, wires) },
      }).histories;
      committed = next;
    };
    for (let step = 1; step <= 30; step++) {
      const changes = [move('and_1', true)].map((change) => ({ ...change, position: { x: step * 10, y: 0 } }) as NodeChange);
      nodes = applyNodeChanges(changes, nodes);
      if (nodeChangesCommit(changes)) commit();
    }
    const drop = [{ ...move('and_1', false), position: { x: 300, y: 0 } } as NodeChange];
    nodes = applyNodeChanges(drop, nodes);
    if (nodeChangesCommit(drop)) commit();

    expect(histories.get(key)?.snapshots).toHaveLength(2);
    const undo = undoVisualSnapshot(histories, key, committed);
    expect(undo.content).toBe(document(nodes0));
    expect(undo.selection).toEqual(['block:and_1']);
    expect(undoVisualSnapshot(undo.histories, key, undo.content!).content).toBeUndefined();
  });

  it('the selection of blocks and wires is read from the canvas and put back after a rebuild', () => {
    const selected = fbdSelection(nodes0, [{ ...wires[0]!, selected: true }]);
    expect(selected).toEqual(['block:and_1', 'connection:w1']);
    const rebuilt = applyFBDSelection(
      nodes0.map((node) => ({ ...node, selected: false })),
      wires,
      ['block:or_2', 'connection:w1', 'block:gone'],
    );
    expect(rebuilt.nodes.map((node) => [node.id, node.selected])).toEqual([
      ['and_1', false],
      ['or_2', true],
    ]);
    expect(rebuilt.edges.map((edge) => edge.selected)).toEqual([true]);
  });
});
