/**
 * The hook a visual editor uses to take the requests to select one of its elements (LNG-003). The requests are
 * kept in `elementSelectionRequests.ts`.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import type { SourceElementId } from '../models/sourceElements';
import { currentElementSelection, subscribeElementSelection, takeElementSelection } from './elementSelectionRequests';

/**
 * Calls `select` once with the element of a request for the file the editor is showing; the request is then taken.
 * `select` ignores an element the diagram does not have.
 */
export function useElementSelection(select: (element: SourceElementId) => void): void {
  const file = useIDEStore((state) => (state.activeFileId ? state.loadedFiles.get(state.activeFileId)?.path : undefined));
  const request = useSyncExternalStore(subscribeElementSelection, currentElementSelection);
  const mine = request && file !== undefined && request.file === file ? request : null;
  useEffect(() => {
    if (!mine) return;
    select(mine.element);
    takeElementSelection(mine);
  }, [mine, select]);
}
