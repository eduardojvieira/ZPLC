/**
 * Saving the session of the open project (IDE-008), without ever getting in the way of the editor.
 *
 * Changes (a tab opened or closed, another tab active, a panel resized, the cursor or the scroll moved) queue a snapshot;
 * the snapshot is taken and sent once the changes stop for a moment, and at once when the project is about to change or
 * the window goes away. The cursor and scroll live here, outside the store, because they change on every keystroke and
 * must not re-render the workbench. A failure is silent: the previous session stays.
 */
import type { SessionState } from '../../electron/sessionStoreProtocol';
import { saveSession } from '../ipc/sessionBridge';
import { projectRootId } from '../ipc/projectFilesHandles';
import { captureSession, type ViewState, type WorkspaceLayout } from '../utils/sessionState';
import { debugLog } from '../utils/debugLog';

/** How long the changes must stop before the session is sent. */
export const SESSION_SAVE_DELAY_MS = 400;

export interface SessionSnapshot {
  rootId: string;
  state: SessionState;
}

type Timer = ReturnType<typeof setTimeout>;
export interface SessionSaverOptions {
  send(rootId: string, state: SessionState): Promise<unknown>;
  delayMs?: number;
  schedule?: (run: () => void, delayMs: number) => Timer;
  cancel?: (timer: Timer) => void;
  onError?: (error: unknown) => void;
}

/** A debounced sender. `queue` takes a function so that the snapshot reflects the moment of sending. */
export function createSessionSaver({
  send,
  delayMs = SESSION_SAVE_DELAY_MS,
  schedule = setTimeout,
  cancel = clearTimeout,
  onError = (error) => debugLog('[Session] save failed', error),
}: SessionSaverOptions) {
  let snapshot: (() => SessionSnapshot | null) | null = null;
  let timer: Timer | null = null;
  const stop = () => {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  };
  /** Sends what is queued now. The promise settles when the main process has answered (or the send failed): it never rejects. */
  const flush = (): Promise<void> => {
    stop();
    const take = snapshot;
    snapshot = null;
    if (!take) return Promise.resolve();
    try {
      const taken = take();
      if (taken)
        return send(taken.rootId, taken.state).then(
          () => undefined,
          (error: unknown) => {
            onError(error);
          },
        );
    } catch (error) {
      onError(error);
    }
    return Promise.resolve();
  };
  return {
    queue(take: () => SessionSnapshot | null): void {
      snapshot = take;
      stop();
      timer = schedule(() => {
        void flush();
      }, delayMs);
    },
    flush,
    dispose(): void {
      stop();
      snapshot = null;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Cursor and scroll of the open files
// ---------------------------------------------------------------------------------------------------------------------

/** Where each file's cursor and scroll were last seen, by project-relative path. */
let viewStates = new Map<string, ViewState>();
/** Positions restored from the saved session that no editor has shown yet. */
let pendingViewStates = new Map<string, ViewState>();
let active: { queue(): void; flush(): Promise<void> } | null = null;

/** Called by the editor when the cursor or the scroll of a file moves. */
export function recordViewState(path: string, view: ViewState): void {
  // An editor that is still loading the file reports line 1; it must not wipe the position that waits to be applied.
  if (!pendingViewStates.has(path)) viewStates.set(path, view);
  active?.queue();
}

/** The restored position for a file, once: the editor applies it when it first shows the file. */
export function takePendingViewState(path: string): ViewState | undefined {
  const view = pendingViewStates.get(path);
  pendingViewStates.delete(path);
  return view;
}

export function currentViewStates(): ReadonlyMap<string, ViewState> {
  return viewStates;
}

/** Forgets the positions of the previous project; `restored` are those of the project that opens now. */
export function resetViewStates(restored: ReadonlyMap<string, ViewState> = new Map()): void {
  viewStates = new Map(restored);
  pendingViewStates = new Map(restored);
}

// ---------------------------------------------------------------------------------------------------------------------
// Wiring to the store
// ---------------------------------------------------------------------------------------------------------------------

/** The part of the store that decides what a session holds. */
export interface SessionStoreState {
  isProjectOpen?: boolean;
  openTabs: readonly string[];
  activeFileId: string | null;
  sessionLayout: object | null;
  isConsoleCollapsed: boolean;
}
export interface SessionStoreLike<S extends SessionStoreState> {
  getState(): S;
  subscribe(listener: (state: S, previous: S) => void): () => void;
}

export interface SessionWiring {
  snapshot?: () => SessionSnapshot | null;
  send?: SessionSaverOptions['send'];
  schedule?: SessionSaverOptions['schedule'];
  cancel?: SessionSaverOptions['cancel'];
}

/**
 * Starts saving the session of whatever project the store has open. Returns a function that stops it. Only the desktop
 * app has a session bridge; elsewhere nothing is queued and nothing is sent.
 */
export function startSessionPersistence<
  S extends SessionStoreState & { directoryHandle?: unknown; loadedFiles?: ReadonlyMap<string, { path: string }> },
>(store: SessionStoreLike<S>, wiring: SessionWiring = {}): () => void {
  const bridge = () => (typeof window === 'undefined' ? undefined : window.electronAPI?.session);
  const snapshot =
    wiring.snapshot ??
    ((): SessionSnapshot | null => {
      const state = store.getState();
      const rootId = projectRootId(state.directoryHandle);
      if (!state.isProjectOpen || rootId === null || !state.loadedFiles) return null;
      return {
        rootId,
        state: captureSession({
          openTabs: state.openTabs,
          activeFileId: state.activeFileId,
          files: state.loadedFiles,
          viewStates,
          layout: state.sessionLayout as WorkspaceLayout | null,
          consoleCollapsed: state.isConsoleCollapsed,
        }),
      };
    });
  const saver = createSessionSaver({
    send:
      wiring.send ??
      (async (rootId, state) => {
        const current = bridge();
        if (current) await saveSession(current, rootId, state);
      }),
    schedule: wiring.schedule,
    cancel: wiring.cancel,
  });
  const queue = () => {
    if (wiring.snapshot || bridge()) saver.queue(snapshot);
  };
  const unsubscribe = store.subscribe((state, previous) => {
    if (
      state.openTabs !== previous.openTabs ||
      state.activeFileId !== previous.activeFileId ||
      state.sessionLayout !== previous.sessionLayout ||
      state.isConsoleCollapsed !== previous.isConsoleCollapsed
    )
      queue();
  });
  const flush = () => saver.flush();
  // The window going away: the renderer is unloaded, and what is still queued goes out now.
  const onPageHide = () => {
    void flush();
  };
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);
  const handle = { queue, flush };
  active = handle;
  return () => {
    unsubscribe();
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
    saver.dispose();
    if (active === handle) active = null;
  };
}

/**
 * Sends the pending session now: before another folder replaces the window's, and when the project closes. The promise
 * settles when the main process has stored it, so a caller that is about to destroy the window can wait for it.
 */
export function flushSession(): Promise<void> {
  return active?.flush() ?? Promise.resolve();
}
