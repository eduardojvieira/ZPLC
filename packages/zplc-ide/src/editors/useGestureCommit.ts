/**
 * The commit of a visual editor (LNG-010): the editor says what each handler of the canvas did, and the document is
 * committed to `onChange` once for each gesture, with the selection from before the gesture and after it.
 */

import { useCallback, useEffect, useRef } from 'react';
import { createCommitBatcher, type CommitBatcher } from './gesture';
import type { VisualGesture } from './visualHistory';

export interface GestureStep {
  /** What was selected before this step. */
  before: string[];
  /** What is selected after it. */
  after: string[];
  /** Steps with this key that follow one another closely are one history entry. */
  coalesce?: string;
}

interface Pending<M> {
  before: string[];
  after: string[];
  coalesce?: string;
  model: M;
}

export function useGestureCommit<M>(onChange: ((model: M, gesture?: VisualGesture) => void) | undefined): (model: M, step: GestureStep) => void {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const pending = useRef<Pending<M> | null>(null);
  const batcher = useRef<CommitBatcher<null> | null>(null);

  return useCallback((model: M, step: GestureStep) => {
    const first = pending.current;
    pending.current = {
      model,
      before: first?.before ?? step.before,
      after: step.after,
      ...(step.coalesce === undefined ? (first?.coalesce === undefined ? {} : { coalesce: first.coalesce }) : { coalesce: step.coalesce }),
    };
    batcher.current ??= createCommitBatcher<null>(() => {
      const gesture = pending.current;
      pending.current = null;
      if (!gesture) return;
      onChangeRef.current?.(gesture.model, {
        ...(gesture.coalesce === undefined ? {} : { coalesce: gesture.coalesce }),
        selection: { before: gesture.before, after: gesture.after },
      });
    });
    batcher.current.push(null);
  }, []);
}
