import type { Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import { findAction, type SFCModel, type SFCStep, type SFCTransition, validateSFCModel } from '../../models/sfc';

export function nodesToSteps(nodes: Node[]): SFCStep[] {
  return nodes.filter((node) => node.type === 'step').map((node) => {
    const data = node.data as Record<string, unknown>;
    return { id: node.id, name: data.name as string, isInitial: data.isInitial as boolean || false, position: node.position, actions: data.actions as SFCStep['actions'], comment: data.comment as string | undefined };
  });
}

export function nodesToTransitions(nodes: Node[], edges: Edge[]): SFCTransition[] {
  return nodes.filter((node) => node.type === 'transition').map((node) => {
    const data = node.data as Record<string, unknown>;
    const incoming = edges.find((edge) => edge.target === node.id && nodes.some((candidate) => candidate.id === edge.source && candidate.type === 'step'));
    const outgoing = edges.find((edge) => edge.source === node.id && nodes.some((candidate) => candidate.id === edge.target && candidate.type === 'step'));
    return { id: node.id, fromStep: incoming?.source || '', toStep: outgoing?.target || '', condition: data.condition as string || 'TRUE', position: node.position, comment: data.comment as string | undefined };
  });
}

export function hasCanonicalNodeChanges(changes: NodeChange[]): boolean {
  return changes.some((change) => change.type === 'position' || change.type === 'add' || change.type === 'remove' || change.type === 'replace');
}

export function hasCanonicalEdgeChanges(changes: EdgeChange[]): boolean {
  return changes.some((change) => change.type === 'add' || change.type === 'remove' || change.type === 'replace');
}

export function uniqueNodeId(base: string, nodes: Node[]): string {
  const ids = new Set(nodes.map((node) => node.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export interface SFCClipboardFragment {
  steps: SFCStep[];
  transitions: SFCTransition[];
  edges: Array<Pick<Edge, 'id' | 'source' | 'target' | 'sourceHandle' | 'targetHandle' | 'type'>>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function uniqueCaseInsensitive(base: string, existing: Iterable<string>): string {
  const names = new Set([...existing].map((name) => name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (names.has(`${base}_${suffix}`.toLowerCase())) suffix += 1;
  return `${base}_${suffix}`;
}

/** Creates a closed SFC fragment; a selected transition must include both endpoints. */
export function copySFCFragment(nodes: Node[], edges: Edge[]): SFCClipboardFragment | undefined {
  const selected = nodes.filter((node) => node.selected);
  if (selected.length === 0) return undefined;
  const selectedIds = new Set(selected.map((node) => node.id));
  const internalEdges = edges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target));
  const steps = nodesToSteps(selected);
  const transitions = nodesToTransitions(selected, internalEdges);
  if (selected.filter((node) => node.type === 'transition').some((node) => {
    const incoming = internalEdges.filter((edge) => edge.target === node.id);
    const outgoing = internalEdges.filter((edge) => edge.source === node.id);
    return incoming.length !== 1 || outgoing.length !== 1 || !isCanonicalSFCConnection(incoming[0]!, selected) || !isCanonicalSFCConnection(outgoing[0]!, selected);
  }) || transitions.some((transition) => !transition.fromStep || !transition.toStep)) return undefined;
  const fragment = { steps: clone(steps), transitions: clone(transitions), edges: clone(internalEdges.map(({ id, source, target, sourceHandle, targetHandle, type }) => ({ id, source, target, sourceHandle, targetHandle, type }))) };
  try {
    validateSFCModel({ name: 'clipboard', steps: fragment.steps.length ? fragment.steps : [{ id: 'initial', name: 'Initial', isInitial: true, position: { x: 0, y: 0 } }], transitions: fragment.transitions });
    return fragment;
  } catch {
    return undefined;
  }
}

/** Returns the validated canonical model and graph edges for one atomic paste. */
export function pasteSFCFragment(model: SFCModel, fragment: SFCClipboardFragment): { model: SFCModel; edges: SFCClipboardFragment['edges'] } | undefined {
  if (fragment.steps.length === 0 && fragment.transitions.length === 0) return undefined;
  if (fragment.transitions.some((transition) => !fragment.steps.some((step) => step.id === transition.fromStep) || !fragment.steps.some((step) => step.id === transition.toStep))) return undefined;
  if (fragment.steps.some((step) => step.actions?.some((action) => !findAction(model, action.actionName)))) return undefined;
  try {
    const copiedAlready = Math.max(...fragment.steps.map((step) => model.steps.filter((candidate) => candidate.id.startsWith(`${step.id}_copy`)).length), 0);
    const offset = 40 * (copiedAlready + 1);
    const ids = new Set([...model.steps, ...model.transitions].map((item) => item.id));
    const names = model.steps.map((step) => step.name);
    const remapped = new Map<string, string>();
    const steps = fragment.steps.map((step) => {
      const id = uniqueCaseInsensitive(`${step.id}_copy`, ids);
      ids.add(id); remapped.set(step.id, id);
      const name = uniqueCaseInsensitive(`${step.name}_copy`, names);
      names.push(name);
      return { ...clone(step), id, name, isInitial: false, position: { x: step.position.x + offset, y: step.position.y + offset } };
    });
    const transitions = fragment.transitions.map((transition) => {
      const id = uniqueCaseInsensitive(`${transition.id}_copy`, ids);
      ids.add(id); remapped.set(transition.id, id);
      return { ...clone(transition), id, fromStep: remapped.get(transition.fromStep)!, toStep: remapped.get(transition.toStep)!, position: transition.position && { x: transition.position.x + offset, y: transition.position.y + offset } };
    });
    const candidate = validateSFCModel({ ...model, steps: [...model.steps, ...steps], transitions: [...model.transitions, ...transitions] });
    const edges = fragment.edges.map((edge) => {
      const source = remapped.get(edge.source)!;
      const target = remapped.get(edge.target)!;
      return { ...edge, id: `${source}_to_${target}`, source, target };
    });
    return { model: candidate, edges };
  } catch {
    return undefined;
  }
}

/** SFC is directional: Steps and Transitions are never connected directly by arbitrary handles. */
export function isCanonicalSFCConnection(connection: { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }, nodes: Node[]): boolean {
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  if (!source || !target) return false;
  return (source.type === 'step' && sourceHandleIsOut(connection.sourceHandle) && target.type === 'transition' && connection.targetHandle === 'in')
    || (source.type === 'transition' && sourceHandleIsOut(connection.sourceHandle) && target.type === 'step' && connection.targetHandle === 'in');
}

function sourceHandleIsOut(handle: string | null | undefined): boolean {
  return handle === 'out';
}
