/**
 * Decides what a window close or a reload does while the renderer holds unsaved work.
 *
 * The renderer reports whether any file is modified. A request that would lose that work is
 * held back and the renderer asks the user (save, discard or cancel); only a save or discard
 * confirms it. Cancel sends nothing, so the next request asks again.
 */

export type GuardedAction = 'close' | 'reload';

export interface CloseGuard {
  setDirty(dirty: boolean): void;
  /** `proceed` runs the action now; `ask` holds it until the user confirms in the renderer. */
  request(action: GuardedAction): 'proceed' | 'ask';
  /** The user chose save or discard: returns the held action once, or null if none is held. */
  confirm(): GuardedAction | null;
  /** The renderer is gone or hung, so nobody can answer; requests proceed until it reports or resumes. */
  release(): void;
  /** The renderer answers again. */
  resume(): void;
}

export function createCloseGuard(): CloseGuard {
  let dirty = false;
  let released = false;
  let held: GuardedAction | null = null;
  return {
    setDirty(value) {
      dirty = value;
      released = false;
    },
    request(action) {
      if (!dirty || released) return 'proceed';
      held = action;
      return 'ask';
    },
    confirm() {
      const action = held;
      held = null;
      return action;
    },
    release() {
      released = true;
    },
    resume() {
      released = false;
    },
  };
}
