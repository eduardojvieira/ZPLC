import { addEdge, MarkerType, type Edge, type Node } from '@xyflow/react';
import { findAction, type SFCModel, type SFCStep, type SFCTransition, validateSFCModel } from '../../models/sfc';
import { stepElement, transitionElement } from '../../models/sourceElements';

const STEP_FIELDS = new Set(['id', 'name', 'isInitial', 'position', 'actions', 'comment']);
const TRANSITION_FIELDS = new Set(['id', 'fromStep', 'toStep', 'fromSteps', 'toSteps', 'priority', 'condition', 'position', 'comment']);

const extraOf = (value: object, known: ReadonlySet<string>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([field]) => !known.has(field)));

/** What the canvas holds in a node for a step: the fields it edits, and the rest as it was in the file (LNG-014). */
export function stepNodeData(step: SFCStep): Record<string, unknown> {
  const extra = extraOf(step, STEP_FIELDS);
  return {
    name: step.name,
    isInitial: step.isInitial,
    actions: step.actions,
    comment: step.comment,
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
}

/** What the canvas holds in a node for a transition (LNG-014). */
export function transitionNodeData(transition: SFCTransition): Record<string, unknown> {
  const extra = extraOf(transition, TRANSITION_FIELDS);
  return {
    condition: transition.condition,
    fromStep: transition.fromStep,
    toStep: transition.toStep,
    priority: transition.priority,
    comment: transition.comment,
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
}

export function nodesToSteps(nodes: Node[]): SFCStep[] {
  return nodes
    .filter((node) => node.type === 'step')
    .map((node) => {
      const data = node.data as Record<string, unknown>;
      return {
        ...(data.extra as Record<string, unknown> | undefined),
        id: node.id,
        name: data.name as string,
        isInitial: (data.isInitial as boolean) || false,
        position: node.position,
        actions: data.actions as SFCStep['actions'],
        comment: data.comment as string | undefined,
      };
    });
}

export function nodesToTransitions(nodes: Node[], edges: Edge[]): SFCTransition[] {
  const isStep = (id: string) => nodes.some((candidate) => candidate.id === id && candidate.type === 'step');
  return nodes
    .filter((node) => node.type === 'transition')
    .map((node) => {
      const data = node.data as Record<string, unknown>;
      // Every step wired to the transition: several make a simultaneous convergence or divergence
      const incoming = edges.filter((edge) => edge.target === node.id && isStep(edge.source)).map((edge) => edge.source);
      const outgoing = edges.filter((edge) => edge.source === node.id && isStep(edge.target)).map((edge) => edge.target);
      return {
        ...(data.extra as Record<string, unknown> | undefined),
        id: node.id,
        fromStep: incoming[0] || '',
        toStep: outgoing[0] || '',
        ...(incoming.length > 1 ? { fromSteps: incoming } : {}),
        ...(outgoing.length > 1 ? { toSteps: outgoing } : {}),
        ...(typeof data.priority === 'number' ? { priority: data.priority } : {}),
        condition: (data.condition as string) || 'TRUE',
        position: node.position,
        comment: data.comment as string | undefined,
      };
    });
}

/** Whether the changes of the canvas are a commit of the document: a node put down, not one dragged (LNG-010). */
export { edgeChangesCommit as hasCanonicalEdgeChanges, nodeChangesCommit as hasCanonicalNodeChanges } from '../gesture';

/** The ids of what is selected on the canvas: `step:<id>`, `transition:<id>`, and `edge:<id>` for a wire (LNG-010). */
export function sfcSelection(nodes: readonly Node[], edges: readonly Edge[]): string[] {
  return [
    ...nodes
      .filter((node) => node.selected)
      .map((node) => (node.type === 'transition' ? transitionElement(node.id) : stepElement(node.id))),
    ...edges.filter((edge) => edge.selected).map((edge) => `edge:${edge.id}`),
  ];
}

/** The nodes and wires with the selection set to `ids`; what is not on the canvas any more is not selected. */
export function applySFCSelection(nodes: Node[], edges: Edge[], ids: readonly string[]): { nodes: Node[]; edges: Edge[] } {
  const wanted = new Set(ids);
  return {
    nodes: nodes.map((node) => ({
      ...node,
      selected: wanted.has(node.type === 'transition' ? transitionElement(node.id) : stepElement(node.id)),
    })),
    edges: edges.map((edge) => ({ ...edge, selected: wanted.has(`edge:${edge.id}`) })),
  };
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
  if (
    selected
      .filter((node) => node.type === 'transition')
      .some((node) => {
        const incoming = internalEdges.filter((edge) => edge.target === node.id);
        const outgoing = internalEdges.filter((edge) => edge.source === node.id);
        return (
          incoming.length !== 1 ||
          outgoing.length !== 1 ||
          !isCanonicalSFCConnection(incoming[0]!, selected) ||
          !isCanonicalSFCConnection(outgoing[0]!, selected)
        );
      }) ||
    transitions.some((transition) => !transition.fromStep || !transition.toStep)
  )
    return undefined;
  const fragment = {
    steps: clone(steps),
    transitions: clone(transitions),
    edges: clone(
      internalEdges.map(({ id, source, target, sourceHandle, targetHandle, type }) => ({
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
        type,
      })),
    ),
  };
  try {
    validateSFCModel({
      name: 'clipboard',
      steps: fragment.steps.length ? fragment.steps : [{ id: 'initial', name: 'Initial', isInitial: true, position: { x: 0, y: 0 } }],
      transitions: fragment.transitions,
    });
    return fragment;
  } catch {
    return undefined;
  }
}

/** Returns the validated canonical model and graph edges for one atomic paste. */
export function pasteSFCFragment(
  model: SFCModel,
  fragment: SFCClipboardFragment,
): { model: SFCModel; edges: SFCClipboardFragment['edges'] } | undefined {
  if (fragment.steps.length === 0 && fragment.transitions.length === 0) return undefined;
  if (
    fragment.transitions.some(
      (transition) =>
        !fragment.steps.some((step) => step.id === transition.fromStep) || !fragment.steps.some((step) => step.id === transition.toStep),
    )
  )
    return undefined;
  if (fragment.steps.some((step) => step.actions?.some((action) => !findAction(model, action.actionName)))) return undefined;
  try {
    const copiedAlready = Math.max(
      ...fragment.steps.map((step) => model.steps.filter((candidate) => candidate.id.startsWith(`${step.id}_copy`)).length),
      0,
    );
    const offset = 40 * (copiedAlready + 1);
    const ids = new Set([...model.steps, ...model.transitions].map((item) => item.id));
    const names = model.steps.map((step) => step.name);
    const remapped = new Map<string, string>();
    const steps = fragment.steps.map((step) => {
      const id = uniqueCaseInsensitive(`${step.id}_copy`, ids);
      ids.add(id);
      remapped.set(step.id, id);
      const name = uniqueCaseInsensitive(`${step.name}_copy`, names);
      names.push(name);
      return { ...clone(step), id, name, isInitial: false, position: { x: step.position.x + offset, y: step.position.y + offset } };
    });
    const transitions = fragment.transitions.map((transition) => {
      const id = uniqueCaseInsensitive(`${transition.id}_copy`, ids);
      ids.add(id);
      remapped.set(transition.id, id);
      return {
        ...clone(transition),
        id,
        fromStep: remapped.get(transition.fromStep)!,
        toStep: remapped.get(transition.toStep)!,
        position: transition.position && { x: transition.position.x + offset, y: transition.position.y + offset },
      };
    });
    const candidate = validateSFCModel({
      ...model,
      steps: [...model.steps, ...steps],
      transitions: [...model.transitions, ...transitions],
    });
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
export function isCanonicalSFCConnection(
  connection: { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null },
  nodes: Node[],
): boolean {
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  if (!source || !target) return false;
  return (
    (source.type === 'step' &&
      sourceHandleIsOut(connection.sourceHandle) &&
      target.type === 'transition' &&
      connection.targetHandle === 'in') ||
    (source.type === 'transition' &&
      sourceHandleIsOut(connection.sourceHandle) &&
      target.type === 'step' &&
      connection.targetHandle === 'in')
  );
}

function sourceHandleIsOut(handle: string | null | undefined): boolean {
  return handle === 'out';
}

const WIRE_STYLE = { stroke: 'var(--visual-wire)', strokeWidth: 2 };
const ARROW = { type: MarkerType.ArrowClosed, width: 10, height: 10 } as const;

/** A wire of the chart from the output of `source` to the input of `target`, drawn as the canvas draws one loaded from a file. */
export function sfcEdge(source: string, target: string): Edge {
  return {
    id: `${source}_to_${target}`,
    source,
    sourceHandle: 'out',
    target,
    targetHandle: 'in',
    type: 'sfc',
    style: WIRE_STYLE,
    markerEnd: ARROW,
  };
}

/**
 * The wires after a wire is drawn from `source` to `target`, or undefined when it is not one a chart has (a step joins a
 * transition and a transition joins a step). A transition has one source and one target: the wire it had is replaced.
 * The canvas and the keyboard draw wires with this one rule.
 */
export function connectSFC(
  nodes: Node[],
  edges: Edge[],
  wire: { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null },
): Edge[] | undefined {
  if (!isCanonicalSFCConnection(wire, nodes)) return undefined;
  const source = nodes.find((node) => node.id === wire.source);
  const target = nodes.find((node) => node.id === wire.target);
  if (!source || !target) return undefined;
  const kept = edges.filter((edge) => (target.type === 'transition' ? edge.target !== target.id : edge.source !== source.id));
  return addEdge(
    { ...sfcEdge(wire.source, wire.target), sourceHandle: wire.sourceHandle ?? 'out', targetHandle: wire.targetHandle ?? 'in' },
    kept,
  );
}
