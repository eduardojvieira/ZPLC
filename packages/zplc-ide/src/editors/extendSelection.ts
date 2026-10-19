/**
 * Selecting more than one node from the keyboard (LNG-012), shared by the function block and the sequential function
 * chart editors: without it the alignment and distribution commands could only be reached with the mouse. Extending
 * adds the nearest node beyond the selection in a direction; selecting all adds every node. Neither changes the
 * document, so neither is a gesture of the history.
 */

import type { Edge, Node } from '@xyflow/react';
import { t, tn } from '../i18n';
import { nearestNode, type Direction } from './graphNav';

export const EXTEND_COMMANDS = ['extendLeft', 'extendRight', 'extendUp', 'extendDown', 'selectAll'] as const;
export const isExtendCommand = (command: string): boolean => (EXTEND_COMMANDS as readonly string[]).includes(command);

export interface Extended {
  nodes: Node[];
  edges: Edge[];
  changed: false;
  say: string;
  refused?: boolean;
}

const count = (n: number): string => tn('editor.extend.selected', n);

/** The nodes with the nearest one beyond the selection in `direction` (or all of them) selected too. */
export function extendSelection(nodes: Node[], edges: Edge[], command: string): Extended {
  const keep = { edges, changed: false as const };
  if (nodes.length === 0) return { ...keep, nodes, say: t('editor.extend.empty'), refused: true };
  const unselectedEdges = edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge));
  if (command === 'selectAll') {
    const all = nodes.map((node) => (node.selected ? node : { ...node, selected: true }));
    return { ...keep, edges: unselectedEdges, nodes: all, say: count(all.length) };
  }
  const selected = nodes.filter((node) => node.selected);
  if (selected.length === 0) return { ...keep, nodes, say: t('editor.extend.none'), refused: true };
  const direction = command.slice('extend'.length).toLowerCase() as Direction;
  // the far edge of the selection in that direction is where the next node is looked for
  const edgeOf = (node: Node) => (direction === 'left' ? -node.position.x : direction === 'right' ? node.position.x : direction === 'up' ? -node.position.y : node.position.y);
  const far = selected.reduce((best, node) => (edgeOf(node) > edgeOf(best) ? node : best));
  const next = nearestNode(nodes.filter((node) => !node.selected || node.id === far.id), far, direction);
  if (!next) return { ...keep, nodes, say: t(`editor.extend.nothing.${direction}`) };
  return { ...keep, edges: unselectedEdges, nodes: nodes.map((node) => (node.id === next.id ? { ...node, selected: true } : node)), say: count(selected.length + 1) };
}
