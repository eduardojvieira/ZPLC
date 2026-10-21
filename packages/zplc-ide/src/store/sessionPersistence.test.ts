import { afterEach, describe, expect, it } from 'bun:test';

import type { SessionState } from '../../electron/sessionStoreProtocol';
import {
  createSessionSaver,
  currentViewStates,
  flushSession,
  recordViewState,
  resetViewStates,
  startSessionPersistence,
  takePendingViewState,
  type SessionSnapshot,
} from './sessionPersistence';

const state = (line: number): SessionState => ({
  schemaVersion: 1,
  tabs: [{ path: 'a.st', line, column: 1, scrollTop: 0 }],
  activePath: 'a.st',
  panels: null,
});

/** A timer the test advances by hand. */
function manualTimer() {
  let next = 1;
  const timers = new Map<number, () => void>();
  return {
    schedule: (run: () => void) => {
      const id = next++;
      timers.set(id, run);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: (id: ReturnType<typeof setTimeout>) => {
      timers.delete(id as unknown as number);
    },
    pending: () => timers.size,
    fire: () => {
      const due = [...timers.values()];
      timers.clear();
      for (const run of due) run();
    },
  };
}

describe('debounced session saver (IDE-008)', () => {
  const sent: Array<[string, SessionState]> = [];
  const send = async (rootId: string, document: SessionState) => {
    sent.push([rootId, document]);
  };
  afterEach(() => {
    sent.length = 0;
  });

  it('sends the newest snapshot once after the delay, however many changes came before', () => {
    const timer = manualTimer();
    const saver = createSessionSaver({ send, schedule: timer.schedule, cancel: timer.cancel });
    let line = 0;
    for (let index = 0; index < 5; index++) saver.queue(() => ({ rootId: 'r1', state: state(++line) }));
    expect(timer.pending()).toBe(1);
    expect(sent).toEqual([]);
    timer.fire();
    expect(sent).toEqual([['r1', state(1)]]); // only the last snapshot function runs, once, when the timer fires
  });

  it('takes the snapshot when it sends, not when the change happened', () => {
    const timer = manualTimer();
    const saver = createSessionSaver({ send, schedule: timer.schedule, cancel: timer.cancel });
    let current = 1;
    saver.queue(() => ({ rootId: 'r1', state: state(current) }));
    current = 9;
    timer.fire();
    expect(sent[0]![1].tabs[0]!.line).toBe(9);
  });

  it('sends at once on flush, cancels the timer, and sends nothing when nothing is queued', () => {
    const timer = manualTimer();
    const saver = createSessionSaver({ send, schedule: timer.schedule, cancel: timer.cancel });
    void saver.flush();
    expect(sent).toEqual([]);
    saver.queue(() => ({ rootId: 'r1', state: state(4) }));
    void saver.flush();
    expect(timer.pending()).toBe(0);
    expect(sent).toEqual([['r1', state(4)]]);
    void saver.flush();
    expect(sent).toHaveLength(1);
  });

  it('lets a caller that is about to destroy the window wait until the main process has stored the session', async () => {
    const timer = manualTimer();
    let store!: () => void;
    const stored = new Promise<void>((resolve) => {
      store = resolve;
    });
    const saver = createSessionSaver({
      send: async (rootId, document) => {
        sent.push([rootId, document]);
        await stored;
      },
      schedule: timer.schedule,
      cancel: timer.cancel,
    });
    saver.queue(() => ({ rootId: 'r1', state: state(12) }));
    let done = false;
    const flushed = saver.flush().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(sent).toEqual([['r1', state(12)]]);
    expect(done).toBe(false); // the message has been sent, the main process has not answered yet
    store();
    await flushed;
    expect(done).toBe(true);
  });

  it('answers a flush with nothing queued, and a flush whose send fails, without throwing', async () => {
    const timer = manualTimer();
    const errors: unknown[] = [];
    const saver = createSessionSaver({
      send: async () => {
        throw new Error('refused');
      },
      schedule: timer.schedule,
      cancel: timer.cancel,
      onError: (error) => errors.push(error),
    });
    await expect(saver.flush()).resolves.toBeUndefined();
    saver.queue(() => ({ rootId: 'r1', state: state(1) }));
    await expect(saver.flush()).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });

  it('sends nothing when there is no project to snapshot', () => {
    const timer = manualTimer();
    const saver = createSessionSaver({ send, schedule: timer.schedule, cancel: timer.cancel });
    saver.queue(() => null);
    timer.fire();
    expect(sent).toEqual([]);
  });

  it('never throws or rejects into the editor when the snapshot or the send fails', async () => {
    const timer = manualTimer();
    const errors: unknown[] = [];
    const saver = createSessionSaver({
      send: async () => {
        throw new Error('denied');
      },
      schedule: timer.schedule,
      cancel: timer.cancel,
      onError: (error) => errors.push(error),
    });
    saver.queue(() => ({ rootId: 'r1', state: state(1) }));
    expect(() => timer.fire()).not.toThrow();
    saver.queue(() => {
      throw new Error('snapshot');
    });
    expect(() => timer.fire()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    // the snapshot fails at once, the send a moment later
    expect(errors.map((error) => (error as Error).message)).toEqual(['snapshot', 'denied']);
  });

  it('drops a queued save on dispose', () => {
    const timer = manualTimer();
    const saver = createSessionSaver({ send, schedule: timer.schedule, cancel: timer.cancel });
    saver.queue(() => ({ rootId: 'r1', state: state(1) }));
    saver.dispose();
    timer.fire();
    expect(sent).toEqual([]);
  });
});

describe('cursor and scroll of the open files (IDE-008)', () => {
  afterEach(() => resetViewStates());

  it('remembers the latest position of each file and forgets them all on reset', () => {
    recordViewState('src/a.st', { line: 3, column: 2, scrollTop: 10 });
    recordViewState('src/a.st', { line: 8, column: 1, scrollTop: 40 });
    recordViewState('src/b.st', { line: 1, column: 1, scrollTop: 0 });
    expect([...currentViewStates()]).toEqual([
      ['src/a.st', { line: 8, column: 1, scrollTop: 40 }],
      ['src/b.st', { line: 1, column: 1, scrollTop: 0 }],
    ]);
    resetViewStates();
    expect(currentViewStates().size).toBe(0);
  });

  it('hands a restored position to the editor once, and keeps it for the next save', () => {
    resetViewStates(new Map([['src/a.st', { line: 21, column: 5, scrollTop: 120 }]]));
    expect(currentViewStates().get('src/a.st')).toEqual({ line: 21, column: 5, scrollTop: 120 });
    expect(takePendingViewState('src/a.st')).toEqual({ line: 21, column: 5, scrollTop: 120 });
    expect(takePendingViewState('src/a.st')).toBeUndefined();
    expect(takePendingViewState('src/other.st')).toBeUndefined();
    expect(currentViewStates().get('src/a.st')).toEqual({ line: 21, column: 5, scrollTop: 120 });
  });

  it('does not let an editor that showed a file before the restore overwrite the position waiting for it', () => {
    resetViewStates(new Map([['src/a.st', { line: 21, column: 5, scrollTop: 120 }]]));
    // the editor reports line 1 while it loads, before the restore is applied
    recordViewState('src/a.st', { line: 1, column: 1, scrollTop: 0 });
    expect(takePendingViewState('src/a.st')).toEqual({ line: 21, column: 5, scrollTop: 120 });
  });
});

describe('what triggers a save (IDE-008)', () => {
  interface Fake {
    openTabs: string[];
    activeFileId: string | null;
    sessionLayout: object | null;
    isConsoleCollapsed: boolean;
    projectSession: number;
    unrelated: number;
  }
  function fakeStore(initial: Partial<Fake> = {}) {
    let current: Fake = {
      openTabs: [],
      activeFileId: null,
      sessionLayout: null,
      isConsoleCollapsed: false,
      projectSession: 1,
      unrelated: 0,
      ...initial,
    };
    const listeners = new Set<(next: Fake, previous: Fake) => void>();
    return {
      getState: () => current,
      subscribe: (listener: (next: Fake, previous: Fake) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      set(change: Partial<Fake>) {
        const previous = current;
        current = { ...current, ...change };
        for (const listener of listeners) listener(current, previous);
      },
      listeners: () => listeners.size,
    };
  }
  const setup = () => {
    const timer = manualTimer();
    const sent: SessionSnapshot[] = [];
    const store = fakeStore();
    const stop = startSessionPersistence(store, {
      snapshot: (): SessionSnapshot => ({
        rootId: 'r1',
        state: { schemaVersion: 1, tabs: [], activePath: store.getState().activeFileId, panels: null },
      }),
      send: async (rootId, document) => {
        sent.push({ rootId, state: document });
      },
      schedule: timer.schedule,
      cancel: timer.cancel,
    });
    return { timer, sent, store, stop };
  };
  afterEach(() => resetViewStates());

  it('queues a save when the tabs, the active tab or the panels change, and for nothing else', () => {
    const { timer, store, stop } = setup();
    store.set({ unrelated: 1 });
    expect(timer.pending()).toBe(0);
    for (const change of [
      { openTabs: ['file:a.st'] },
      { activeFileId: 'file:a.st' },
      { sessionLayout: { editor: 60, console: 40 } },
      { isConsoleCollapsed: true },
    ]) {
      store.set(change);
      expect(timer.pending()).toBe(1);
      timer.fire();
    }
    stop();
  });

  it('queues a save when an editor reports a new position', () => {
    const { timer, sent } = setup();
    recordViewState('a.st', { line: 5, column: 1, scrollTop: 0 });
    expect(timer.pending()).toBe(1);
    timer.fire();
    expect(sent).toHaveLength(1);
  });

  it('flushes the pending save before the project changes, so the old project is saved with its own state', () => {
    const { store, sent, timer } = setup();
    store.set({ activeFileId: 'file:old.st' });
    expect(sent).toEqual([]);
    void flushSession();
    expect(sent.map((item) => item.state.activePath)).toEqual(['file:old.st']);
    expect(timer.pending()).toBe(0);
  });

  it('stops listening when stopped, and a flush after that does nothing', () => {
    const { store, stop, timer, sent } = setup();
    stop();
    expect(store.listeners()).toBe(0);
    store.set({ openTabs: ['file:a.st'] });
    expect(timer.pending()).toBe(0);
    void flushSession();
    expect(sent).toEqual([]);
  });
});
