/**
 * How a node of a canvas shows that execution stops at it (LNG-004): a red outline for a breakpoint, a grey dashed one
 * while the runtime does not hold the breakpoints, a yellow one for the element the paused program is at.
 */

import type { Node } from '@xyflow/react';
import type { ElementBreakpoints } from './elementBreakpoints';
import type { SourceElementId } from '../models/sourceElements';

export function markBreakpointNodes(
  nodes: Node[],
  elementOf: (node: Node) => SourceElementId | undefined,
  breakpoints: Pick<ElementBreakpoints, 'isSet' | 'inactiveReason' | 'pausedAt'>,
): Node[] {
  return nodes.map((node) => {
    const element = elementOf(node);
    if (element === undefined) return node;
    const paused = breakpoints.pausedAt !== undefined && (breakpoints.pausedAt === element || breakpoints.pausedAt.startsWith(`${element}/`));
    if (!paused && !breakpoints.isSet(element)) return node;
    const outline = paused
      ? '3px solid var(--color-accent-yellow)'
      : breakpoints.inactiveReason
        ? '2px dashed var(--color-surface-400)'
        : '2px solid var(--color-accent-red)';
    return { ...node, style: { ...node.style, outline, outlineOffset: 2, borderRadius: 6 } };
  });
}
