import type { Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import { isFunctionBlock, type FBDBlock, type FBDConnection, type FBDModel, validateFBDModel } from '../../models/fbd';

export function nodesToBlocks(nodes: Node[]): FBDBlock[] {
  return nodes.map((node) => {
    const data = node.data as Record<string, unknown>;
    return {
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
