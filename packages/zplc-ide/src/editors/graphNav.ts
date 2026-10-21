/**
 * Moving about a canvas of nodes from the keyboard (LNG-012): the cursor of the function block and the sequential
 * function chart editors is the selected node. These are the pure rules for going to the nearest node in a direction,
 * for the first node, and for the place a new node is put.
 */

import type { Edge, Node } from '@xyflow/react';

export type Direction = 'left' | 'right' | 'up' | 'down';

const DEFAULT_WIDTH = 150;
const DEFAULT_HEIGHT = 70;

function centre(node: Node): { x: number; y: number } {
  const width = node.measured?.width ?? node.width ?? DEFAULT_WIDTH;
  const height = node.measured?.height ?? node.height ?? DEFAULT_HEIGHT;
  return { x: node.position.x + width / 2, y: node.position.y + height / 2 };
}

/** The id of the selected node, when exactly one node is: the cursor. */
export function cursorNode(nodes: readonly Node[]): Node | undefined {
  const selected = nodes.filter((node) => node.selected);
  return selected.length === 1 ? selected[0] : undefined;
}

/**
 * The node nearest to `from` in a direction: it is on that side of it, and it is the one with the least distance along
 * the direction plus twice the distance across it, so that a node straight ahead beats one far off to the side.
 */
export function nearestNode(nodes: readonly Node[], from: Node, direction: Direction): Node | undefined {
  const origin = centre(from);
  let best: { node: Node; score: number } | undefined;
  for (const node of nodes) {
    if (node.id === from.id) continue;
    const at = centre(node);
    const along =
      direction === 'right'
        ? at.x - origin.x
        : direction === 'left'
          ? origin.x - at.x
          : direction === 'down'
            ? at.y - origin.y
            : origin.y - at.y;
    if (along <= 0) continue;
    const across = Math.abs(direction === 'left' || direction === 'right' ? at.y - origin.y : at.x - origin.x);
    const score = along + 2 * across;
    if (!best || score < best.score || (score === best.score && node.id < best.node.id)) best = { node, score };
  }
  return best?.node;
}

/** The first node of the canvas in reading order: the top row, then the leftmost. */
export function firstNode(nodes: readonly Node[]): Node | undefined {
  return [...nodes].sort(
    (first, second) => first.position.y - second.position.y || first.position.x - second.position.x || (first.id < second.id ? -1 : 1),
  )[0];
}

/** The nodes and edges with only the node `id` selected. */
export function selectOnly(nodes: Node[], edges: Edge[], id: string): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: nodes.map((node) => (node.selected === (node.id === id) ? node : { ...node, selected: node.id === id })),
    edges: edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
  };
}

const GRID = 10;
const snap = (value: number) => Math.round(value / GRID) * GRID;

/**
 * A free place for a new node: beside the anchor when there is one, else below the others. It is moved down until no
 * node is in the way, and snapped to the grid of the canvas.
 */
export function freePosition(
  nodes: readonly Node[],
  anchor: Node | undefined,
  size = { width: 240, height: 110 },
  placement: 'right' | 'below' = 'right',
): { x: number; y: number } {
  let x: number;
  let y: number;
  if (anchor && placement === 'below') {
    x = anchor.position.x;
    y = anchor.position.y + size.height;
  } else if (anchor) {
    x = anchor.position.x + size.width;
    y = anchor.position.y;
  } else if (nodes.length > 0) {
    x = Math.min(...nodes.map((node) => node.position.x));
    y = Math.max(...nodes.map((node) => node.position.y)) + size.height;
  } else {
    x = 80;
    y = 80;
  }
  const taken = (at: { x: number; y: number }) =>
    nodes.some((node) => Math.abs(node.position.x - at.x) < size.width * 0.75 && Math.abs(node.position.y - at.y) < size.height * 0.75);
  let place = { x: snap(x), y: snap(y) };
  // in the way: a node below goes on down, a node beside goes on down too, so that the column of a chain stays a column
  for (let attempt = 0; attempt < 200 && taken(place); attempt++)
    place = placement === 'below' ? { x: place.x + size.width, y: place.y } : { x: place.x, y: place.y + size.height };
  return place;
}

/** A node id that no node uses: `base`, or `base_2`, `base_3`... */
export function freeId(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((id) => id.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (used.has(`${base}_${suffix}`.toLowerCase())) suffix += 1;
  return `${base}_${suffix}`;
}

/** `base_1`, `base_2`...: the first that no name in `taken` is. */
export function numberedId(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((name) => name.toLowerCase()));
  let number = 1;
  while (used.has(`${base}_${number}`.toLowerCase())) number += 1;
  return `${base}_${number}`;
}
