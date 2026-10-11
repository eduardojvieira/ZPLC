import { describe, expect, it } from 'bun:test';
import type { Edge, Node } from '@xyflow/react';
import { parseSFCModel, serializeSFCModel, type SFCModel } from '../../models/sfc';
import { transpileSFCToST } from '../../transpiler/sfcToST';
import { applySFCSelection, copySFCFragment, isCanonicalSFCConnection, nodesToTransitions, pasteSFCFragment, sfcSelection } from './graphModel';

const nodes: Node[] = [
  { id: 'step', type: 'step', position: { x: 0, y: 0 }, data: {} },
  { id: 'transition', type: 'transition', position: { x: 0, y: 0 }, data: {} },
];

describe('SFC connection policy', () => {
  it('accepts only the two canonical Step/Transition directions', () => {
    expect(isCanonicalSFCConnection({ source: 'step', sourceHandle: 'out', target: 'transition', targetHandle: 'in' }, nodes)).toBe(true);
    expect(isCanonicalSFCConnection({ source: 'transition', sourceHandle: 'out', target: 'step', targetHandle: 'in' }, nodes)).toBe(true);
    expect(isCanonicalSFCConnection({ source: 'step', sourceHandle: 'in', target: 'transition', targetHandle: 'in' }, nodes)).toBe(false);
    expect(isCanonicalSFCConnection({ source: 'step', sourceHandle: 'out', target: 'transition', targetHandle: 'out' }, nodes)).toBe(false);
    expect(isCanonicalSFCConnection({ source: 'transition', sourceHandle: 'out', target: 'step', targetHandle: 'out' }, nodes)).toBe(false);
    expect(isCanonicalSFCConnection({ source: 'step', sourceHandle: 'out', target: 'step', targetHandle: 'in' }, nodes)).toBe(false);
  });
});

describe('SFC copy/paste graph model', () => {
  const model: SFCModel = {
    name: 'sequence', actions: [{ id: 'action', name: 'Run', type: 'ST', body: 'output := TRUE;' }],
    steps: [
      { id: 'start', name: 'Start', isInitial: true, position: { x: 0, y: 0 }, actions: [{ qualifier: 'N', actionName: 'Run' }] },
      { id: 'next', name: 'Next', isInitial: false, position: { x: 0, y: 100 }, actions: [] },
    ],
    transitions: [{ id: 'go', fromStep: 'start', toStep: 'next', condition: 'TRUE', position: { x: 0, y: 50 } }],
  };
  const graph: Node[] = [
    { id: 'start', type: 'step', position: { x: 0, y: 0 }, selected: true, data: { ...model.steps[0]! } },
    { id: 'go', type: 'transition', position: { x: 0, y: 50 }, selected: true, data: { ...model.transitions[0]! } },
    { id: 'next', type: 'step', position: { x: 0, y: 100 }, selected: true, data: { ...model.steps[1]! } },
  ];
  const edges: Edge[] = [
    { id: 'start-go', source: 'start', sourceHandle: 'out', target: 'go', targetHandle: 'in', type: 'sfc' },
    { id: 'go-next', source: 'go', sourceHandle: 'out', target: 'next', targetHandle: 'in', type: 'sfc' },
  ];

  it('pastes a closed chain with unique names, non-initial steps, and retained action definitions', () => {
    const fragment = copySFCFragment(graph, edges)!;
    expect(fragment.edges).toEqual(edges);
    expect(fragment.steps[0]?.actions).not.toBe(model.steps[0]?.actions);
    const pasted = pasteSFCFragment(model, fragment)!;
    expect(pasted.model.steps.slice(-2)).toMatchObject([
      { id: 'start_copy', name: 'Start_copy', isInitial: false, position: { x: 40, y: 40 }, actions: [{ qualifier: 'N', actionName: 'Run' }] },
      { id: 'next_copy', name: 'Next_copy', isInitial: false, position: { x: 40, y: 140 } },
    ]);
    expect(pasted.model.transitions.at(-1)).toMatchObject({ id: 'go_copy', fromStep: 'start_copy', toStep: 'next_copy', position: { x: 40, y: 90 } });
    expect(pasted.model.steps.filter((step) => step.isInitial)).toHaveLength(1);
    expect(parseSFCModel(serializeSFCModel(pasted.model))).toEqual(pasted.model);
    expect(transpileSFCToST(pasted.model).success).toBe(true);
    expect(pasteSFCFragment(pasted.model, fragment)?.model.steps.at(-2)?.name).toBe('Start_copy_2');
  });

  it('fails closed when a selected transition has an endpoint outside the selection or an action is unresolved', () => {
    expect(copySFCFragment(graph.map((node) => node.id === 'next' ? { ...node, selected: false } : node), edges)).toBeUndefined();
    const fragment = copySFCFragment(graph, edges)!;
    expect(pasteSFCFragment({ ...model, actions: [] }, fragment)).toBeUndefined();
  });
});

describe('SFC graph to transitions', () => {
  const step = (id: string): Node => ({ id, type: 'step', position: { x: 0, y: 0 }, data: {} });
  const edge = (source: string, target: string) => ({ id: `${source}_${target}`, source, sourceHandle: 'out', target, targetHandle: 'in', type: 'sfc' });

  it('keeps every step wired to a transition and its priority, so saving does not drop a branch', () => {
    const nodes: Node[] = [
      step('a'), step('b'), step('c'), step('d'),
      { id: 'fork', type: 'transition', position: { x: 0, y: 0 }, data: { condition: 'Go', priority: 3 } },
      { id: 'join', type: 'transition', position: { x: 0, y: 0 }, data: { condition: 'TRUE' } },
    ];
    const edges = [edge('a', 'fork'), edge('fork', 'b'), edge('fork', 'c'), edge('b', 'join'), edge('c', 'join'), edge('join', 'd')] as Edge[];
    expect(nodesToTransitions(nodes, edges)).toEqual([
      { id: 'fork', fromStep: 'a', toStep: 'b', toSteps: ['b', 'c'], priority: 3, condition: 'Go', position: { x: 0, y: 0 }, comment: undefined },
      { id: 'join', fromStep: 'b', toStep: 'd', fromSteps: ['b', 'c'], condition: 'TRUE', position: { x: 0, y: 0 }, comment: undefined },
    ]);
  });
});

describe('SFC selection (LNG-010)', () => {
  it('names steps, transitions and wires, and puts the selection back on a rebuilt canvas', () => {
    const edges: Edge[] = [{ id: 'step_to_transition', source: 'step', target: 'transition' }];
    expect(sfcSelection(nodes.map((node) => ({ ...node, selected: true })), edges.map((edge) => ({ ...edge, selected: true }))))
      .toEqual(['step:step', 'transition:transition', 'edge:step_to_transition']);
    const rebuilt = applySFCSelection(nodes, edges, ['transition:transition', 'step:gone']);
    expect(rebuilt.nodes.map((node) => node.selected)).toEqual([false, true]);
    expect(rebuilt.edges.map((edge) => edge.selected)).toEqual([false]);
  });
});
