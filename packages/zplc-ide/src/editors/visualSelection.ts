/**
 * The selection of each open diagram, kept outside the editor (LNG-010).
 *
 * An editor rebuilds its canvas from the document whenever the document changes: after a commit, after undo, after a
 * change made outside. The selection is not part of the document, so it is remembered here, by file, and applied again
 * when the canvas is rebuilt: the selection survives the edit. Undo and redo write the selection that the entry of the
 * history remembers, and the editor shows it when it rebuilds.
 */

import { useIDEStore } from '../store/useIDEStore';
import type { VisualSelectionIds } from './visualHistory';

const selections = new Map<string, VisualSelectionIds>();

/** The key of a file's history and selection: project session and file, like the key of the history. */
export function visualFileKey(projectSession: number, fileId: string): string {
  return `${projectSession}:${fileId}`;
}

export function getVisualSelection(key: string | null): VisualSelectionIds {
  return (key !== null && selections.get(key)) || [];
}

export function setVisualSelection(key: string | null, ids: VisualSelectionIds): void {
  if (key === null) return;
  if (ids.length === 0) selections.delete(key);
  else selections.set(key, [...ids]);
}

/** The key of the file the visual editor shows, or null. */
export function useVisualFileKey(): string | null {
  const projectSession = useIDEStore((state) => state.projectSession);
  const fileId = useIDEStore((state) => state.activeFileId);
  return fileId === null ? null : visualFileKey(projectSession, fileId);
}
