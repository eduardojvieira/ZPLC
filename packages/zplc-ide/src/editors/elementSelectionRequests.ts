/**
 * Selecting an element of the open diagram from outside its editor (LNG-003): activating a problem in the Problems
 * panel names a file and an element, and the editor of that file selects it as soon as it is showing the file.
 * The request waits here, so it does not matter whether the editor was already open or is mounted by the activation.
 */

import type { SourceElementId } from '../models/sourceElements';

export interface ElementSelectionRequest {
  file: string;
  element: SourceElementId;
}

let pending: ElementSelectionRequest | null = null;
const listeners = new Set<() => void>();

function publish(next: ElementSelectionRequest | null): void {
  pending = next;
  for (const listener of listeners) listener();
}

/** Ask the editor that shows `file` to select `element`. The latest request replaces an earlier one that nobody took. */
export function requestElementSelection(file: string, element: SourceElementId): void {
  publish({ file, element });
}

/** The request waiting for the file, if any. */
export function pendingElementSelection(file: string | undefined): ElementSelectionRequest | null {
  return pending && file !== undefined && pending.file === file ? pending : null;
}

/** The editor took the request. */
export function takeElementSelection(request: ElementSelectionRequest): void {
  if (pending === request) publish(null);
}

export function clearElementSelection(): void {
  if (pending) publish(null);
}

export function subscribeElementSelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentElementSelection(): ElementSelectionRequest | null {
  return pending;
}
