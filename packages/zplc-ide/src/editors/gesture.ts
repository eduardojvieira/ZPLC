/**
 * What makes one undo step in the visual editors (LNG-010).
 *
 * A canvas reports a drag as a stream of position changes while the pointer moves, and a delete as the removal of the
 * nodes and, a call later, of their wires. The document is committed once for each gesture, not once for each change:
 *  - a position change of a drag in progress (`dragging: true`) moves the node on the canvas and commits nothing; the
 *    change that ends the drag (`dragging: false`) commits the document;
 *  - the commits that one task makes (the nodes of a delete and their wires) are one commit, of the last state.
 */

import type { EdgeChange, NodeChange } from '@xyflow/react';

/** Whether the changes of a canvas end a gesture: they add, remove or replace a node, or put a dragged node down. */
export function nodeChangesCommit(changes: readonly NodeChange[]): boolean {
  return changes.some(
    (change) =>
      change.type === 'add' ||
      change.type === 'remove' ||
      change.type === 'replace' ||
      (change.type === 'position' && change.dragging !== true),
  );
}

/** Whether the changes of a canvas change the wires of the document. */
export function edgeChangesCommit(changes: readonly EdgeChange[]): boolean {
  return changes.some((change) => change.type === 'add' || change.type === 'remove' || change.type === 'replace');
}

export interface CommitBatcher<T> {
  /** Queue the value; `flush` is called with the last one queued before the current task ends. */
  push(value: T): void;
  /** Whether a value is waiting. */
  pending(): boolean;
}

/**
 * Batches the commits of one task. The editors commit synchronously from the handlers of the canvas; a gesture that
 * reaches them as several handler calls in one task (delete: nodes, then wires) is one call of `flush`.
 */
export function createCommitBatcher<T>(flush: (value: T) => void): CommitBatcher<T> {
  let waiting: { value: T } | undefined;
  return {
    push(value) {
      const queued = waiting !== undefined;
      waiting = { value };
      if (queued) return;
      queueMicrotask(() => {
        const batch = waiting;
        waiting = undefined;
        if (batch) flush(batch.value);
      });
    },
    pending: () => waiting !== undefined,
  };
}
