/**
 * The undo history of a visual file (LNG-010): one entry for each gesture of the user, as whole-document snapshots.
 *
 * A gesture is one drag, one paste, one delete, one edit of a field. The editors commit a gesture once, and an entry
 * remembers the selection around it, so that undo and redo give the selection back with the content.
 */

/** The number of gestures that can be undone, per file. The history keeps one snapshot more: the one before the first. */
export const VISUAL_HISTORY_LIMIT = 100;

/** Successive edits of one thing (the letters typed into one field) within this time are one gesture. */
export const GESTURE_COALESCE_MS = 1000;

/** The ids of the selected elements of a diagram (the `SourceElementId` of each). */
export type VisualSelectionIds = readonly string[];

export interface VisualGestureSelection {
  /** Selected when the gesture began: what undo gives back. */
  before: VisualSelectionIds;
  /** Selected when the gesture ended: what redo gives back. */
  after: VisualSelectionIds;
}

/** What an editor says about a commit: which gesture it ends. */
export interface VisualGesture {
  /** Edits with the same key that follow one another closely are one history entry (typing in a field). */
  coalesce?: string;
  selection?: VisualGestureSelection;
  /** The time of the commit, in milliseconds; `Date.now()` when absent. */
  at?: number;
}

interface GestureRecord {
  coalesce?: string;
  at: number;
  selection?: VisualGestureSelection;
}

export interface VisualSnapshotHistory {
  snapshots: readonly string[];
  cursor: number;
  /** For each snapshot, the gesture that produced it (the first has none). Parallel to `snapshots`. */
  gestures?: ReadonlyArray<GestureRecord | undefined>;
}

export type VisualHistories = ReadonlyMap<string, VisualSnapshotHistory>;

export interface VisualHistoryResult {
  histories: VisualHistories;
  history: VisualSnapshotHistory;
}

function replaceHistory(histories: VisualHistories, key: string, history: VisualSnapshotHistory): VisualHistoryResult {
  const next = new Map(histories);
  next.set(key, history);
  return { histories: next, history };
}

/** Align one session-only history with the content currently owned by the store. */
export function synchronizeVisualHistory(histories: VisualHistories, key: string, content: string): VisualHistoryResult {
  const current = histories.get(key);
  if (current?.snapshots[current.cursor] === content) return { histories, history: current };
  return replaceHistory(histories, key, { snapshots: [content], cursor: 0, gestures: [undefined] });
}

export function recordVisualSnapshot(
  histories: VisualHistories,
  key: string,
  currentContent: string,
  nextContent: string,
  gesture?: VisualGesture,
): VisualHistoryResult {
  const synced = synchronizeVisualHistory(histories, key, currentContent);
  if (nextContent === currentContent) return synced;

  const { history } = synced;
  const at = gesture?.at ?? Date.now();
  const record: GestureRecord = {
    at,
    ...(gesture?.coalesce === undefined ? {} : { coalesce: gesture.coalesce }),
    ...(gesture?.selection === undefined ? {} : { selection: gesture.selection }),
  };
  const gestures = history.gestures ?? history.snapshots.map(() => undefined);

  // The same thing edited again at once: the entry that holds the earlier edit takes the new content
  const last = gestures[history.cursor];
  if (
    gesture?.coalesce !== undefined &&
    last !== undefined &&
    history.cursor > 0 &&
    last.coalesce === gesture.coalesce &&
    at - last.at <= GESTURE_COALESCE_MS &&
    history.cursor === history.snapshots.length - 1
  ) {
    const selection =
      last.selection && record.selection
        ? { before: last.selection.before, after: record.selection.after }
        : (last.selection ?? record.selection);
    const merged: GestureRecord = { at, coalesce: gesture.coalesce, ...(selection === undefined ? {} : { selection }) };
    return replaceHistory(synced.histories, key, {
      snapshots: [...history.snapshots.slice(0, history.cursor), nextContent],
      cursor: history.cursor,
      gestures: [...gestures.slice(0, history.cursor), merged],
    });
  }

  const snapshots = [...history.snapshots.slice(0, history.cursor + 1), nextContent];
  const records = [...gestures.slice(0, history.cursor + 1), record];
  // the snapshot before the first gesture, and one for each gesture that can be undone
  const keep = VISUAL_HISTORY_LIMIT + 1;
  const trimmed = snapshots.slice(-keep);
  return replaceHistory(synced.histories, key, { snapshots: trimmed, cursor: trimmed.length - 1, gestures: records.slice(-keep) });
}

export interface VisualHistoryStep {
  histories: VisualHistories;
  content?: string;
  /** The selection to show after the step, when the gesture that was undone or redone remembers one. */
  selection?: VisualSelectionIds;
}

function stepVisualHistory(histories: VisualHistories, key: string, content: string, direction: -1 | 1): VisualHistoryStep {
  const synced = synchronizeVisualHistory(histories, key, content);
  const cursor = synced.history.cursor + direction;
  if (cursor < 0 || cursor >= synced.history.snapshots.length) return { histories: synced.histories };
  const history = { ...synced.history, cursor };
  // undo gives back the selection from before the gesture it undoes; redo, the one from after the gesture it repeats
  const gesture = synced.history.gestures?.[direction === -1 ? synced.history.cursor : cursor];
  const selection = direction === -1 ? gesture?.selection?.before : gesture?.selection?.after;
  return {
    histories: new Map(synced.histories).set(key, history),
    content: history.snapshots[cursor],
    ...(selection === undefined ? {} : { selection }),
  };
}

export function undoVisualSnapshot(histories: VisualHistories, key: string, content: string): VisualHistoryStep {
  return stepVisualHistory(histories, key, content, -1);
}

export function redoVisualSnapshot(histories: VisualHistories, key: string, content: string): VisualHistoryStep {
  return stepVisualHistory(histories, key, content, 1);
}

export function visualHistoryActions(history: VisualSnapshotHistory | undefined, content: string): { canUndo: boolean; canRedo: boolean } {
  if (!history || history.snapshots[history.cursor] !== content) return { canUndo: false, canRedo: false };
  return { canUndo: history.cursor > 0, canRedo: history.cursor < history.snapshots.length - 1 };
}
