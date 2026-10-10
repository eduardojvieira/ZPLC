import { describe, expect, it } from 'bun:test';

import { createAutosaver, startAutosave, type AutosaveStoreState } from './autosave';

function clock() {
  let now = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  let next = 1;
  return {
    schedule: (run: () => void, delay: number) => { const id = next++; timers.set(id, { at: now + delay, run }); return id as unknown as ReturnType<typeof setTimeout>; },
    cancel: (id: ReturnType<typeof setTimeout>) => { timers.delete(id as unknown as number); },
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]); now = due[1].at; due[1].run();
      }
      now = target;
    },
    get pending() { return timers.size; },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('autosave (IDE-007)', () => {
  it('saves the modified files once the typing has stopped for the chosen time, and not before', async () => {
    const time = clock(); let saves = 0; const seconds = 5; let modified = true;
    const saver = createAutosaver({ seconds: () => seconds, hasModified: () => modified, save: async () => { saves += 1; modified = false; }, schedule: time.schedule, cancel: time.cancel });
    saver.changed();
    time.advance(4_999); await settle();
    expect(saves).toBe(0);
    saver.changed(); // another keystroke moves the save back
    time.advance(4_999); await settle();
    expect(saves).toBe(0);
    time.advance(1); await settle();
    expect(saves).toBe(1);
  });

  it('does nothing while the setting is off, and a save that finds nothing modified does not run', async () => {
    const time = clock(); let saves = 0; let seconds = 0; let modified = true;
    const saver = createAutosaver({ seconds: () => seconds, hasModified: () => modified, save: async () => { saves += 1; }, schedule: time.schedule, cancel: time.cancel });
    saver.changed();
    expect(time.pending).toBe(0);
    seconds = 5; modified = false;
    saver.changed();
    time.advance(60_000); await settle();
    expect(saves).toBe(0);
  });

  it('stops a pending save when the setting is turned off', async () => {
    const time = clock(); let saves = 0; let seconds = 5;
    const saver = createAutosaver({ seconds: () => seconds, hasModified: () => true, save: async () => { saves += 1; }, schedule: time.schedule, cancel: time.cancel });
    saver.changed();
    seconds = 0;
    saver.settingsChanged();
    time.advance(60_000); await settle();
    expect(saves).toBe(0);
  });

  it('starts the wait when the setting is turned on while files are already modified', async () => {
    const time = clock(); let saves = 0; let seconds = 0;
    const saver = createAutosaver({ seconds: () => seconds, hasModified: () => true, save: async () => { saves += 1; }, schedule: time.schedule, cancel: time.cancel });
    seconds = 15;
    saver.settingsChanged();
    time.advance(15_000); await settle();
    expect(saves).toBe(1);
  });

  it('keeps going after a save that failed: the next change schedules the next attempt', async () => {
    const time = clock(); let attempts = 0;
    const saver = createAutosaver({ seconds: () => 5, hasModified: () => true, save: async () => { attempts += 1; throw new Error('disk full'); }, schedule: time.schedule, cancel: time.cancel });
    saver.changed(); time.advance(5_000); await settle();
    saver.changed(); time.advance(5_000); await settle();
    expect(attempts).toBe(2);
  });
});

describe('autosave wiring to the store (IDE-007)', () => {
  interface State extends AutosaveStoreState { n: number }
  function fakeStore(initial: State) {
    let state = initial;
    const listeners = new Set<(state: State, previous: State) => void>();
    return {
      getState: () => state,
      subscribe: (listener: (state: State, previous: State) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
      set(next: Partial<State>) { const previous = state; state = { ...state, ...next }; for (const listener of listeners) listener(state, previous); },
    };
  }
  const file = (isModified: boolean) => new Map([['file:src/A.st', { isModified }]]);

  it('saves a file that becomes modified after the interval, and ignores store changes that touch no file', async () => {
    const time = clock(); let saves = 0;
    const store = fakeStore({ n: 0, loadedFiles: file(false) });
    startAutosave(store, { seconds: () => 5, save: async () => { saves += 1; }, schedule: time.schedule, cancel: time.cancel });
    for (let value = 0; value < 20; value++) store.set({ n: value });
    expect(time.pending).toBe(0);
    store.set({ loadedFiles: file(true) });
    time.advance(5_000); await settle();
    expect(saves).toBe(1);
  });
});
