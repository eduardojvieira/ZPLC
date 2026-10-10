/**
 * Keeping the modified files where a crash cannot take them (IDE-006), without ever getting in the way of the editor.
 *
 * Whenever a file's content changes, the content of every modified file is sent to the main process once the typing
 * stops for a moment (and no later than a fixed wait after the first change of a stretch of typing); a file that is no
 * longer modified (saved, discarded, closed with the project, deleted) has its entry removed. The user's own save,
 * discard and close choices therefore leave nothing behind, and only an exit that did not go through them does.
 * A failure is silent: the previous entry stays and the next flush tries again.
 */
import { discardRecovery, writeRecovery } from '../ipc/recoveryBridge';
import { projectRootId } from '../ipc/projectFilesHandles';

/** How long the typing must stop before the content is sent: well inside "a few seconds". */
export const RECOVERY_WRITE_DELAY_MS = 1000;
/** The longest a change waits, so that a user who never pauses is still written. */
export const RECOVERY_MAX_WAIT_MS = 4000;

export interface ModifiedFile { path: string; content: string }
export interface RecoverySnapshot { rootId: string; modified: readonly ModifiedFile[] }
export interface RecoveryPlan { write: ModifiedFile[]; discard: string[] }

/** What to send: the modified files whose kept content is missing or older, and the kept files that are no longer modified. */
export function planRecovery(kept: ReadonlyMap<string, string>, modified: readonly ModifiedFile[]): RecoveryPlan {
  const current = new Set(modified.map((file) => file.path));
  return {
    write: modified.filter((file) => kept.get(file.path) !== file.content),
    discard: [...kept.keys()].filter((path) => !current.has(path)),
  };
}

/** Where the entries go; both answer whether the main process did it. */
export interface RecoveryTarget {
  write(rootId: string, path: string, content: string): Promise<boolean>;
  discard(rootId: string, path: string): Promise<boolean>;
}

type Timer = ReturnType<typeof setTimeout>;
export interface RecoverySaverOptions {
  target: RecoveryTarget;
  /** The moment of sending decides what is sent: null when no project is open. */
  take: () => RecoverySnapshot | null;
  delayMs?: number;
  maxWaitMs?: number;
  schedule?: (run: () => void, delayMs: number) => Timer;
  cancel?: (timer: Timer) => void;
  now?: () => number;
}

export function createRecoverySaver({
  target, take, delayMs = RECOVERY_WRITE_DELAY_MS, maxWaitMs = RECOVERY_MAX_WAIT_MS,
  schedule = setTimeout, cancel = clearTimeout, now = Date.now,
}: RecoverySaverOptions) {
  /** The project the entries below were sent for, and the content last kept for each of its files. */
  let rootId: string | null = null;
  const kept = new Map<string, string>();
  let timer: Timer | null = null;
  let firstQueuedAt = 0;
  let chain: Promise<void> = Promise.resolve();

  const stop = () => { if (timer !== null) { cancel(timer); timer = null; } };

  async function run(): Promise<void> {
    const snapshot = take();
    if (rootId !== null && (snapshot === null || snapshot.rootId !== rootId)) {
      // The project closed or another opened: its files are not waiting to be saved any more.
      const previous = rootId;
      await Promise.all([...kept.keys()].map((path) => target.discard(previous, path)));
      kept.clear();
      rootId = null;
    }
    if (snapshot === null) return;
    rootId = snapshot.rootId;
    const plan = planRecovery(kept, snapshot.modified);
    await Promise.all([
      ...plan.write.map(async (file) => { if (await target.write(snapshot.rootId, file.path, file.content)) kept.set(file.path, file.content); }),
      ...plan.discard.map(async (path) => { if (await target.discard(snapshot.rootId, path)) kept.delete(path); }),
    ]);
  }

  /** Sends what changed now. Runs one at a time, in the order asked; never rejects. */
  function flush(): Promise<void> {
    stop();
    firstQueuedAt = 0;
    chain = chain.then(run).catch(() => undefined);
    return chain;
  }

  return {
    /** Something may have changed: send after the typing stops, or after the longest wait, whichever comes first. */
    queue(): void {
      const at = now();
      if (timer === null) firstQueuedAt = at;
      stop();
      timer = schedule(() => { void flush(); }, Math.max(0, Math.min(delayMs, maxWaitMs - (at - firstQueuedAt))));
    },
    flush,
    /** The main process already holds this content for the file (an entry the user restored): nothing to send until it changes. */
    adopt(project: string, path: string, content: string): void {
      if (rootId !== null && rootId !== project) return;
      rootId = project;
      kept.set(path, content);
    },
    dispose(): void { stop(); },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Wiring to the store
// ---------------------------------------------------------------------------------------------------------------------

/** The part of the store that decides what is modified. */
export interface RecoveryStoreState {
  isProjectOpen?: boolean;
  projectSession: number;
  directoryHandle?: unknown;
  loadedFiles: ReadonlyMap<string, { path: string; content: string; isModified: boolean }>;
}
export interface RecoveryStoreLike<S extends RecoveryStoreState> {
  getState(): S;
  subscribe(listener: (state: S, previous: S) => void): () => void;
}
export interface RecoveryWiring {
  target?: RecoveryTarget;
  rootIdOf?: (state: RecoveryStoreState) => string | null;
  schedule?: RecoverySaverOptions['schedule'];
  cancel?: RecoverySaverOptions['cancel'];
  now?: () => number;
}

let active: { flush(): Promise<void>; adopt(rootId: string, path: string, content: string): void } | null = null;

/**
 * Starts keeping the modified files of whatever project the store has open. Returns a function that stops it. Only the
 * desktop app has a recovery bridge; elsewhere nothing is queued and nothing is sent.
 */
export function startRecoveryPersistence<S extends RecoveryStoreState>(store: RecoveryStoreLike<S>, wiring: RecoveryWiring = {}): () => void {
  const bridge = () => (typeof window === 'undefined' ? undefined : window.electronAPI?.recovery);
  const target: RecoveryTarget = wiring.target ?? {
    write: async (rootId, path, content) => { const current = bridge(); return current ? writeRecovery(current, rootId, path, content) : false; },
    discard: async (rootId, path) => { const current = bridge(); return current ? discardRecovery(current, rootId, path) : false; },
  };
  const rootIdOf = wiring.rootIdOf ?? ((state: RecoveryStoreState) => projectRootId(state.directoryHandle));
  const saver = createRecoverySaver({
    target,
    take: () => {
      const state = store.getState();
      const rootId = state.isProjectOpen === false ? null : rootIdOf(state);
      if (rootId === null) return null;
      const modified: ModifiedFile[] = [];
      for (const file of state.loadedFiles.values()) if (file.isModified) modified.push({ path: file.path, content: file.content });
      return { rootId, modified };
    },
    schedule: wiring.schedule,
    cancel: wiring.cancel,
    now: wiring.now,
  });
  const enabled = () => wiring.target !== undefined || bridge() !== undefined;
  const unsubscribe = store.subscribe((state, previous) => {
    if (!enabled()) return;
    if (state.projectSession !== previous.projectSession || state.isProjectOpen !== previous.isProjectOpen || state.directoryHandle !== previous.directoryHandle) {
      void saver.flush(); // a project went away or came: what it had kept is settled now, not after a delay
    } else if (state.loadedFiles !== previous.loadedFiles) {
      saver.queue();
    }
  });
  const flush = () => { void saver.flush(); };
  // The window going away: the renderer is unloaded, and what is still queued goes out now.
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
  const handle = { flush: saver.flush, adopt: saver.adopt };
  active = handle;
  return () => {
    unsubscribe();
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', flush);
    saver.dispose();
    if (active === handle) active = null;
  };
}

/** Tells the saver that the main process already holds `content` for `path`: the user restored it, so only a later change or a save matters. */
export function adoptRecovered(rootId: string, path: string, content: string): void {
  active?.adopt(rootId, path, content);
}

/** Sends the pending changes now and waits for them: before the window closes after the user's answer. */
export function flushRecovery(): Promise<void> {
  return active?.flush() ?? Promise.resolve();
}

