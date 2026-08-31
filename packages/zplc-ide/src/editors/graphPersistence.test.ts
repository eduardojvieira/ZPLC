import { describe, expect, it } from 'bun:test';
import { applyEdgeChanges, applyNodeChanges, type Edge, type Node } from '@xyflow/react';
import { edgesToConnections, hasCanonicalEdgeChanges as fbdEdgeChanges, hasCanonicalNodeChanges as fbdNodeChanges, nodesToBlocks, uniqueNodeId as uniqueFbdNodeId } from './fbd/graphModel';
import { parseFBDModel, serializeFBDModel, type FBDModel } from '../models/fbd';
import { hasCanonicalEdgeChanges as sfcEdgeChanges, hasCanonicalNodeChanges as sfcNodeChanges, nodesToSteps, nodesToTransitions, uniqueNodeId as uniqueSfcNodeId } from './sfc/graphModel';
import { parseSFCModel, serializeSFCModel, type SFCModel } from '../models/sfc';

describe('visual graph persistence', () => {
  it('persists the first FBD node and edge changes through serialization', () => {
    const nodes: Node[] = [{ id: 'gate', type: 'logicGate', position: { x: 0, y: 0 }, data: { type: 'AND', inputs: [], outputs: [], address: '%Q0.0', comment: 'old', debugActive: true } }];
    const moved = applyNodeChanges([{ id: 'gate', type: 'position', position: { x: 80, y: 40 } }], nodes);
    const withComment = moved.map((node) => ({ ...node, data: { ...node.data, comment: 'persisted' } }));
    const edges: Edge[] = [{ id: 'wire', source: 'gate', sourceHandle: 'OUT', target: 'sink', targetHandle: 'IN' }];
    const withoutWire = applyEdgeChanges([{ id: 'wire', type: 'remove' }], edges);
    const model: FBDModel = { name: 'diagram', variables: { local: [], outputs: [] }, blocks: nodesToBlocks(withComment), connections: edgesToConnections(withoutWire) };

    const reopened = parseFBDModel(serializeFBDModel(model));
    expect(reopened.blocks).toEqual([{ id: 'gate', type: 'AND', position: { x: 80, y: 40 }, address: '%Q0.0', comment: 'persisted', inputs: [], outputs: [] }]);
    expect(reopened.connections).toEqual([]);
  });

  it('persists SFC inline data and deleted/reconnected canonical endpoints', () => {
    const nodes: Node[] = [
      { id: 'start', type: 'step', position: { x: 0, y: 0 }, data: { name: 'Start', isInitial: true, actions: [], debugActive: true } },
      { id: 'next', type: 'step', position: { x: 0, y: 100 }, data: { name: 'Next', isInitial: false, actions: [], debugActive: true } },
      { id: 'transition', type: 'transition', position: { x: 0, y: 50 }, data: { condition: 'Sensor', fromStep: 'stale', toStep: 'stale', debugActive: true } },
    ];
    const edges: Edge[] = [
      { id: 'in', source: 'start', target: 'transition' },
      { id: 'out', source: 'transition', target: 'next' },
    ];
    const removed = applyEdgeChanges([{ id: 'in', type: 'remove' }], edges);
    expect(nodesToTransitions(nodes, removed)[0]).toMatchObject({ fromStep: '', toStep: 'next', condition: 'Sensor' });

    const reconnected = [...removed, { id: 'new-in', source: 'next', target: 'transition' }];
    const model: SFCModel = {
      name: 'sequence',
      steps: nodesToSteps(nodes.map((node) => node.id === 'start' ? { ...node, data: { ...node.data, name: 'Ready' } } : node)),
      transitions: nodesToTransitions(nodes, reconnected),
    };
    const reopened = parseSFCModel(serializeSFCModel(model));
    expect(reopened.steps[0]).toMatchObject({ id: 'start', name: 'Ready', position: { x: 0, y: 0 } });
    expect(reopened.transitions).toEqual([{ id: 'transition', fromStep: 'next', toStep: 'next', condition: 'Sensor', position: { x: 0, y: 50 } }]);
    expect(reopened.transitions[0].fromStep).toBe('next');
  });

  it('keeps UI-only selection and dimensions out of canonical commits', () => {
    expect(fbdNodeChanges([{ id: 'block', type: 'select', selected: true }])).toBe(false);
    expect(sfcNodeChanges([{ id: 'step', type: 'dimensions', dimensions: { width: 100, height: 50 } }])).toBe(false);
    expect(fbdNodeChanges([{ id: 'block', type: 'position', position: { x: 1, y: 2 } }])).toBe(true);
    expect(sfcNodeChanges([{ id: 'step', type: 'remove' }])).toBe(true);
    expect(fbdEdgeChanges([{ id: 'wire', type: 'select', selected: true }])).toBe(false);
    expect(sfcEdgeChanges([{ id: 'wire', type: 'remove' }])).toBe(true);
  });

  it('creates stable distinct drop ids at one timestamp', () => {
    const nodes: Node[] = [{ id: 'step_123', position: { x: 0, y: 0 }, data: {} }];
    expect(uniqueFbdNodeId('step_123', nodes)).toBe('step_123_2');
    expect(uniqueSfcNodeId('step_123', [...nodes, { id: 'step_123_2', position: { x: 0, y: 0 }, data: {} }])).toBe('step_123_3');
  });
});
