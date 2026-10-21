/**
 * Alignment and distribution of the selected nodes of a diagram (UX-033), shared by the function block and the sequential
 * function chart editors. A command moves only the selected nodes and gives the whole canvas back; the editor commits the
 * result once, so one alignment is one undo step (LNG-010). Nothing here reads the screen: a node's box is its measured
 * size, or the size the canvas gave it, or a default before it has been drawn.
 */

import type { Node } from '@xyflow/react';
import { t, tn } from '../i18n';

export type ArrangeCommand =
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'alignTop'
  | 'alignMiddle'
  | 'alignBottom'
  | 'distributeHorizontally'
  | 'distributeVertically';
export const ARRANGE_COMMANDS: readonly ArrangeCommand[] = [
  'alignLeft',
  'alignCenter',
  'alignRight',
  'alignTop',
  'alignMiddle',
  'alignBottom',
  'distributeHorizontally',
  'distributeVertically',
];
export const isArrangeCommand = (command: string): command is ArrangeCommand => (ARRANGE_COMMANDS as readonly string[]).includes(command);

export interface Arranged {
  nodes: Node[];
  changed: boolean;
  /** What to announce: what was done, that nothing needed to move, or why the command was refused. */
  say: string;
  refused?: boolean;
}

const DEFAULT_SIZE = { width: 120, height: 60 };

interface Box {
  node: Node;
  left: number;
  top: number;
  width: number;
  height: number;
}

const boxOf = (node: Node): Box => ({
  node,
  left: node.position.x,
  top: node.position.y,
  width: node.measured?.width ?? node.width ?? DEFAULT_SIZE.width,
  height: node.measured?.height ?? node.height ?? DEFAULT_SIZE.height,
});

const distributes = (command: ArrangeCommand): boolean => command === 'distributeHorizontally' || command === 'distributeVertically';

/** Why a command cannot run on this many selected nodes; undefined when it can. */
export function arrangeReason(selected: number, command: ArrangeCommand): string | undefined {
  if (distributes(command)) return selected >= 3 ? undefined : t('editor.arrange.needThree');
  return selected >= 2 ? undefined : t('editor.arrange.needTwo');
}

export function arrangeSelection(nodes: Node[], command: ArrangeCommand): Arranged {
  const boxes = nodes.filter((node) => node.selected).map(boxOf);
  const reason = arrangeReason(boxes.length, command);
  if (reason) return { nodes, changed: false, say: reason, refused: true };

  const moved = new Map<string, { x: number; y: number }>();
  const place = (box: Box, x: number, y: number): void => {
    const next = { x: Math.round(x), y: Math.round(y) };
    if (next.x !== box.node.position.x || next.y !== box.node.position.y) moved.set(box.node.id, next);
    else moved.delete(box.node.id);
  };
  const left = Math.min(...boxes.map((box) => box.left));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const top = Math.min(...boxes.map((box) => box.top));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));

  for (const box of boxes) {
    switch (command) {
      case 'alignLeft':
        place(box, left, box.top);
        break;
      case 'alignRight':
        place(box, right - box.width, box.top);
        break;
      case 'alignCenter':
        place(box, (left + right) / 2 - box.width / 2, box.top);
        break;
      case 'alignTop':
        place(box, box.left, top);
        break;
      case 'alignBottom':
        place(box, box.left, bottom - box.height);
        break;
      case 'alignMiddle':
        place(box, box.left, (top + bottom) / 2 - box.height / 2);
        break;
      default:
        break;
    }
  }
  if (distributes(command)) {
    const horizontal = command === 'distributeHorizontally';
    const ordered = [...boxes].sort((a, b) => (horizontal ? a.left - b.left : a.top - b.top));
    const sizes = ordered.reduce((sum, box) => sum + (horizontal ? box.width : box.height), 0);
    const gap = ((horizontal ? right - left : bottom - top) - sizes) / (ordered.length - 1);
    let cursor = horizontal ? left : top;
    for (const box of ordered) {
      place(box, horizontal ? cursor : box.left, horizontal ? box.top : cursor);
      cursor += (horizontal ? box.width : box.height) + gap;
    }
  }

  if (moved.size === 0) return { nodes, changed: false, say: t(`editor.arrange.already.${command}`) };
  return {
    nodes: nodes.map((node) => (moved.has(node.id) ? { ...node, position: moved.get(node.id)! } : node)),
    changed: true,
    say: tn(`editor.arrange.done.${command}`, boxes.length),
  };
}
