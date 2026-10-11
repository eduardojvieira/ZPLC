import { addEdge, type Edge, type Node } from '@xyflow/react';
import { isFunctionBlock, type FBDBlock, type FBDConnection, type FBDModel, validateFBDModel } from '../../models/fbd';
import { judgeConnection } from '../../models/pinTypes';
import type { ProjectBlock } from '../../models/projectBlocks';
import { blockElement, connectionElement } from '../../models/sourceElements';

const BLOCK_FIELDS = new Set(['id', 'type', 'position', 'instanceName', 'variableName', 'address', 'dataType', 'value', 'comment', 'inputs', 'outputs']);

/**
 * What the canvas holds in a node for a block: the fields it edits, and the rest of the block as it was in the file, so
 * that a commit that changed nothing writes the block back as it was (LNG-014).
 */
export function blockNodeData(block: FBDBlock): Record<string, unknown> {
  const extra = Object.fromEntries(Object.entries(block).filter(([field]) => !BLOCK_FIELDS.has(field)));
  return {
    type: block.type, instanceName: block.instanceName, variableName: block.variableName, address: block.address,
    dataType: block.dataType, value: block.value, comment: block.comment, inputs: block.inputs, outputs: block.outputs,
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
}

export function nodesToBlocks(nodes: Node[]): FBDBlock[] {
  return nodes.map((node) => {
    const data = node.data as Record<string, unknown>;
    return {
      ...(data.extra as Record<string, unknown> | undefined),
      id: node.id, type: data.type as string, position: node.position,
      instanceName: data.instanceName as string | undefined,
      variableName: data.variableName as string | undefined,
      address: data.address as string | undefined,
      dataType: data.dataType as string | undefined, value: data.value,
      comment: data.comment as string | undefined,
      inputs: data.inputs as FBDBlock['inputs'], outputs: data.outputs as FBDBlock['outputs'],
    };
  });
}

export function edgesToConnections(edges: Edge[]): FBDConnection[] {
  return edges.map((edge) => ({ id: edge.id, from: { block: edge.source, port: edge.sourceHandle || 'OUT' }, to: { block: edge.target, port: edge.targetHandle || 'IN' } }));
}

/** The two ends of a wire as the canvas reports them: a pin of a block each. */
export type WireEnds = { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null };

/**
 * The edges after the user draws a wire between two pins, or the reason the wire is refused (LNG-013): the canvas lets a
 * wire start at an input, so the wire is written from the output end, and it is refused when the pin types do not match.
 */
export function connectBlocks(
  model: FBDModel,
  nodes: Node[],
  edges: Edge[],
  params: WireEnds,
  projectBlocks?: readonly ProjectBlock[],
): { edges: Edge[]; refusal?: string } {
  const current: FBDModel = { ...model, blocks: nodesToBlocks(nodes), connections: edgesToConnections(edges) };
  const verdict = judgeConnection(
    current,
    { block: params.source, port: params.sourceHandle || 'OUT' },
    { block: params.target, port: params.targetHandle || 'IN' },
    projectBlocks,
  );
  if (verdict.reason !== undefined || !verdict.from || !verdict.to) return { edges, refusal: verdict.reason ?? 'a wire joins an output to an input' };
  return {
    edges: addEdge({
      source: verdict.from.block, sourceHandle: verdict.from.port, target: verdict.to.block, targetHandle: verdict.to.port,
      type: 'smoothstep', style: { stroke: 'var(--visual-wire)', strokeWidth: 2 },
    }, edges),
  };
}

/** Whether the changes of the canvas are a commit of the document: a node put down, not one dragged (LNG-010). */
export { edgeChangesCommit as hasCanonicalEdgeChanges, nodeChangesCommit as hasCanonicalNodeChanges } from '../gesture';

/** The ids of what is selected on the canvas: `block:<id>` and `connection:<id>` (LNG-010). */
export function fbdSelection(nodes: readonly Node[], edges: readonly Edge[]): string[] {
  return [
    ...nodes.filter((node) => node.selected).map((node) => blockElement(node.id)),
    ...edges.filter((edge) => edge.selected).map((edge) => connectionElement(edge.id)),
  ];
}

/** The nodes and wires with the selection set to `ids`; what is not on the canvas any more is not selected. */
export function applyFBDSelection(nodes: Node[], edges: Edge[], ids: readonly string[]): { nodes: Node[]; edges: Edge[] } {
  const wanted = new Set(ids);
  return {
    nodes: nodes.map((node) => ({ ...node, selected: wanted.has(blockElement(node.id)) })),
    edges: edges.map((edge) => ({ ...edge, selected: wanted.has(connectionElement(edge.id)) })),
  };
}

export function uniqueNodeId(base: string, nodes: Node[]): string {
  const ids = new Set(nodes.map((node) => node.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export interface FBDClipboardFragment {
  blocks: FBDBlock[];
  connections: FBDConnection[];
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

/** Creates a canonical, UI-free FBD fragment from the current selection. */
export function copyFBDFragment(nodes: Node[], edges: Edge[]): FBDClipboardFragment | undefined {
  const selected = nodes.filter((node) => node.selected);
  if (selected.length === 0) return undefined;
  const selectedIds = new Set(selected.map((node) => node.id));
  const fragment = {
    blocks: clone(nodesToBlocks(selected)),
    connections: clone(edges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target)).map((edge) => ({
      id: edge.id,
      from: { block: edge.source, port: edge.sourceHandle || 'OUT' },
      to: { block: edge.target, port: edge.targetHandle || 'IN' },
    }))),
  };
  try {
    validateFBDModel({ name: 'clipboard', variables: { local: [], outputs: [] }, ...fragment });
    return fragment;
  } catch {
    return undefined;
  }
}

/** Returns the validated canonical model produced by one atomic paste, or nothing on invalid input. */
export function pasteFBDFragment(model: FBDModel, fragment: FBDClipboardFragment): FBDModel | undefined {
  if (fragment.blocks.length === 0) return undefined;
  try {
    validateFBDModel({ name: 'clipboard', variables: { local: [], outputs: [] }, ...fragment });
    const copiedAlready = Math.max(...fragment.blocks.map((block) => model.blocks.filter((candidate) => candidate.id.startsWith(`${block.id}_copy`)).length), 0);
    const offset = 40 * (copiedAlready + 1);
    const ids = new Set(model.blocks.map((block) => block.id));
    const instanceNames = model.blocks.filter((block) => block.instanceName).map((block) => block.instanceName!);
    const remapped = new Map<string, string>();
    const blocks = fragment.blocks.map((block) => {
      const id = uniqueCaseInsensitive(`${block.id}_copy`, ids);
      ids.add(id);
      remapped.set(block.id, id);
      const instanceName = isFunctionBlock(block.type)
        ? uniqueCaseInsensitive(`${block.instanceName ?? block.id}_copy`, instanceNames)
        : block.instanceName;
      if (instanceName) instanceNames.push(instanceName);
      return { ...clone(block), id, instanceName, position: { x: block.position.x + offset, y: block.position.y + offset } };
    });
    const connectionIds = new Set(model.connections.map((connection) => connection.id));
    const connections = fragment.connections.map((connection) => {
      const id = uniqueCaseInsensitive(`${connection.id}_copy`, connectionIds);
      connectionIds.add(id);
      return { ...clone(connection), id, from: { ...connection.from, block: remapped.get(connection.from.block)! }, to: { ...connection.to, block: remapped.get(connection.to.block)! } };
    });
    const candidate = validateFBDModel({ ...model, blocks: [...model.blocks, ...blocks], connections: [...model.connections, ...connections] });
    const functionBlockNames = candidate.blocks.filter((block) => isFunctionBlock(block.type)).map((block) => block.instanceName?.toLowerCase());
    if (functionBlockNames.some((name) => !name) || new Set(functionBlockNames).size !== functionBlockNames.length) return undefined;
    return candidate;
  } catch {
    return undefined;
  }
}
