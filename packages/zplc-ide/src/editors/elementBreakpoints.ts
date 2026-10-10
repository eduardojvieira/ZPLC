/**
 * Breakpoints on the elements of a diagram (LNG-004): a rung, a block, a step, a transition.
 *
 * The runtime and the store know a breakpoint as a line of a file. A line of a diagram is a line of the Structured
 * Text it was translated to, which moves whenever the diagram changes, so the author's breakpoints are kept here as the
 * elements they were set on, and the lines the store holds are worked out from the debug map of each build.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { elementAtPc, elementBreakpointLine, hasBreakpointElements } from '../compiler/debugElements';
import { useIDEStore } from '../store/useIDEStore';
import type { SourceElementId } from '../models/sourceElements';

interface Records {
  session: number;
  byFile: Map<string, Set<SourceElementId>>;
}

let records: Records = { session: -1, byFile: new Map() };
let version = 0;
const listeners = new Set<() => void>();

function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function recordsFor(session: number): Records {
  if (records.session !== session) records = { session, byFile: new Map() };
  return records;
}

/** The elements of the file that carry a breakpoint, in this project session. */
export function elementBreakpointsOf(fileId: string): ReadonlySet<SourceElementId> {
  const { projectSession } = useIDEStore.getState();
  return recordsFor(projectSession).byFile.get(fileId) ?? new Set();
}

function arm(fileId: string): void {
  const state = useIDEStore.getState();
  const file = state.loadedFiles.get(fileId);
  const elements = recordsFor(state.projectSession).byFile.get(fileId) ?? new Set<SourceElementId>();
  const lines = [...elements]
    .map((element) => (file ? elementBreakpointLine(state.debug.debugMap, file.path, element) : undefined))
    .filter((line): line is number => line !== undefined);
  state.setBreakpoints(fileId, lines);
}

/**
 * Set or clear the breakpoint on an element of the file. Returns false when execution cannot stop at the element
 * (nothing was built, or the element has no statement), and the breakpoint is not recorded.
 */
export function toggleElementBreakpoint(fileId: string, element: SourceElementId): boolean {
  const state = useIDEStore.getState();
  const file = state.loadedFiles.get(fileId);
  if (!file) return false;
  const at = recordsFor(state.projectSession);
  const elements = at.byFile.get(fileId) ?? new Set<SourceElementId>();
  if (elements.has(element)) {
    elements.delete(element);
  } else {
    if (elementBreakpointLine(state.debug.debugMap, file.path, element) === undefined) return false;
    elements.add(element);
  }
  at.byFile.set(fileId, elements);
  arm(fileId);
  changed();
  return true;
}

/**
 * A build produced a new debug map: the lines of the generated source moved. Work the lines of every file's
 * breakpoints out again from the elements, and forget an element that is no longer in the file.
 */
export function reconcileElementBreakpoints(): void {
  const state = useIDEStore.getState();
  const at = recordsFor(state.projectSession);
  if (!state.debug.debugMap) return;
  let any = false;
  for (const [fileId, elements] of at.byFile) {
    const file = state.loadedFiles.get(fileId);
    if (!file) continue;
    for (const element of [...elements]) {
      if (elementBreakpointLine(state.debug.debugMap, file.path, element) === undefined) { elements.delete(element); any = true; }
    }
    arm(fileId);
  }
  if (any) changed();
}

export interface ElementBreakpoints {
  /** Whether a build has put this file on the debug map: without it no element has a place to stop. */
  built: boolean;
  /** Whether the runtime does not hold the breakpoints the editor shows, and why. */
  inactiveReason: string | null;
  isSet(element: SourceElementId): boolean;
  /** Whether execution can stop at the element. */
  canSet(element: SourceElementId): boolean;
  toggle(element: SourceElementId): void;
  /** The element the paused program is at, when it is in this file. */
  pausedAt: SourceElementId | undefined;
}

/** For the editor of the active file. */
export function useElementBreakpoints(): ElementBreakpoints {
  useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version);
  const fileId = useIDEStore((state) => state.activeFileId);
  const path = useIDEStore((state) => (state.activeFileId ? state.loadedFiles.get(state.activeFileId)?.path : undefined));
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const inactiveReason = useIDEStore((state) => state.debug.breakpointsInactiveReason);
  const pc = useIDEStore((state) => state.debug.currentPC);
  const line = useIDEStore((state) => state.debug.currentLine);
  // the lines in the store are what the runtime holds: reading them re-renders the dots when the sync changes them
  useIDEStore((state) => (state.activeFileId ? state.debug.breakpoints.get(state.activeFileId) : undefined));

  const elements = fileId ? elementBreakpointsOf(fileId) : new Set<SourceElementId>();
  const canSet = useCallback(
    (element: SourceElementId) => path !== undefined && elementBreakpointLine(debugMap, path, element) !== undefined,
    [debugMap, path],
  );
  return {
    built: path !== undefined && hasBreakpointElements(debugMap, path),
    inactiveReason,
    isSet: (element) => elements.has(element),
    canSet,
    toggle: (element) => { if (fileId) toggleElementBreakpoint(fileId, element); },
    pausedAt: path !== undefined && line !== null && pc !== null ? elementAtPc(debugMap, path, pc) : undefined,
  };
}
