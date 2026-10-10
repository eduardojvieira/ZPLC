/**
 * Autosave (IDE-007): when the setting is on, the modified files are saved once the typing has stopped for the chosen
 * number of seconds. It uses the same save as the user's Save all, so a file that cannot be written stays modified and
 * is reported; nothing here decides what a save means. Off by default.
 */

type Timer = ReturnType<typeof setTimeout>;

export interface AutosaverOptions {
  /** The chosen interval in seconds; 0 is off. Read when a change happens, so a changed setting applies at once. */
  seconds: () => number;
  hasModified: () => boolean;
  save: () => Promise<void>;
  schedule?: (run: () => void, delayMs: number) => Timer;
  cancel?: (timer: Timer) => void;
}

export function createAutosaver({ seconds, hasModified, save, schedule = setTimeout, cancel = clearTimeout }: AutosaverOptions) {
  let timer: Timer | null = null;
  const stop = () => { if (timer !== null) { cancel(timer); timer = null; } };
  const arm = () => {
    stop();
    const wait = seconds();
    if (wait <= 0 || !hasModified()) return;
    timer = schedule(() => {
      timer = null;
      if (seconds() <= 0 || !hasModified()) return;
      void save().catch(() => undefined); // the store reports a file that could not be written
    }, wait * 1000);
  };
  return {
    /** A file's content or modified state changed: the wait starts again. */
    changed: arm,
    /** The interval was changed: turned off stops a pending save, turned on starts the wait for what is modified now. */
    settingsChanged: arm,
    dispose: stop,
  };
}

/** The part of the store that decides whether something is waiting to be saved. */
export interface AutosaveStoreState {
  loadedFiles: ReadonlyMap<string, { isModified: boolean }>;
}
export interface AutosaveStoreLike<S extends AutosaveStoreState> {
  getState(): S;
  subscribe(listener: (state: S, previous: S) => void): () => void;
}
export interface AutosaveWiring {
  seconds: () => number;
  save: () => Promise<void>;
  schedule?: AutosaverOptions['schedule'];
  cancel?: AutosaverOptions['cancel'];
}

/** Starts autosave on the store. Returns `{ settingsChanged, stop }`: call `settingsChanged` when the interval changes. */
export function startAutosave<S extends AutosaveStoreState>(store: AutosaveStoreLike<S>, wiring: AutosaveWiring) {
  const saver = createAutosaver({
    seconds: wiring.seconds,
    hasModified: () => { for (const file of store.getState().loadedFiles.values()) if (file.isModified) return true; return false; },
    save: wiring.save,
    schedule: wiring.schedule,
    cancel: wiring.cancel,
  });
  const unsubscribe = store.subscribe((state, previous) => { if (state.loadedFiles !== previous.loadedFiles) saver.changed(); });
  return { settingsChanged: saver.settingsChanged, stop: () => { unsubscribe(); saver.dispose(); } };
}
