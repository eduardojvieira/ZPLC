export const VISUAL_HISTORY_LIMIT = 50;

export interface VisualSnapshotHistory {
  snapshots: readonly string[];
  cursor: number;
}

export type VisualHistories = ReadonlyMap<string, VisualSnapshotHistory>;

export interface VisualHistoryResult {
  histories: VisualHistories;
  history: VisualSnapshotHistory;
}

function replaceHistory(
  histories: VisualHistories,
  key: string,
  history: VisualSnapshotHistory,
): VisualHistoryResult {
  const next = new Map(histories);
  next.set(key, history);
  return { histories: next, history };
}

/** Align one session-only history with the content currently owned by the store. */
export function synchronizeVisualHistory(histories: VisualHistories, key: string, content: string): VisualHistoryResult {
  const current = histories.get(key);
  if (current?.snapshots[current.cursor] === content) return { histories, history: current };
  return replaceHistory(histories, key, { snapshots: [content], cursor: 0 });
}

export function recordVisualSnapshot(
  histories: VisualHistories,
  key: string,
  currentContent: string,
  nextContent: string,
): VisualHistoryResult {
  const synced = synchronizeVisualHistory(histories, key, currentContent);
  if (nextContent === currentContent) return synced;

  const snapshots = [...synced.history.snapshots.slice(0, synced.history.cursor + 1), nextContent];
  // ponytail: session snapshots cap at 50 without gesture coalescing; add coalescing only if editing proves it necessary.
  const trimmed = snapshots.slice(-VISUAL_HISTORY_LIMIT);
  return replaceHistory(synced.histories, key, { snapshots: trimmed, cursor: trimmed.length - 1 });
}

export interface VisualHistoryStep {
  histories: VisualHistories;
  content?: string;
}

function stepVisualHistory(histories: VisualHistories, key: string, content: string, direction: -1 | 1): VisualHistoryStep {
  const synced = synchronizeVisualHistory(histories, key, content);
  const cursor = synced.history.cursor + direction;
  if (cursor < 0 || cursor >= synced.history.snapshots.length) return { histories: synced.histories };
  const history = { ...synced.history, cursor };
  return { histories: new Map(synced.histories).set(key, history), content: history.snapshots[cursor] };
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
