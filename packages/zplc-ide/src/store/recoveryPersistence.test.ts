import { describe, expect, it } from 'bun:test';

import {
  RECOVERY_MAX_WAIT_MS,
  RECOVERY_WRITE_DELAY_MS,
  createRecoverySaver,
  planRecovery,
  startRecoveryPersistence,
  type RecoverySnapshot,
  type RecoveryTarget,
  type RecoveryStoreState,
} from './recoveryPersistence';

/** A clock and a scheduler that the test drives, so that "within two seconds" is checked without waiting. */
function clock() {
  let now = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  let next = 1;
  return {
    now: () => now,
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

function target() {
  const calls: string[] = [];
  let failWrites = false;
  const api: RecoveryTarget = {
    write: async (rootId, path, content) => { if (failWrites) return false; calls.push(`write ${rootId} ${path} ${content}`); return true; },
    discard: async (rootId, path) => { calls.push(`discard ${rootId} ${path}`); return true; },
  };
  return { api, calls, failWrites: (value: boolean) => { failWrites = value; } };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('recovery plan (IDE-006)', () => {
  it('writes the files that are modified and not yet kept at their current content, and nothing else', () => {
    const kept = new Map([['src/A.st', 'a1'], ['src/B.st', 'b1']]);
    const plan = planRecovery(kept, [{ path: 'src/A.st', content: 'a1' }, { path: 'src/B.st', content: 'b2' }, { path: 'src/C.st', content: 'c1' }]);
    expect(plan.write).toEqual([{ path: 'src/B.st', content: 'b2' }, { path: 'src/C.st', content: 'c1' }]);
    expect(plan.discard).toEqual([]);
  });

  it('discards what was kept for a file that is no longer modified (saved, discarded, closed or deleted)', () => {
    const plan = planRecovery(new Map([['src/A.st', 'a1'], ['src/B.st', 'b1']]), [{ path: 'src/B.st', content: 'b1' }]);
    expect(plan).toEqual({ write: [], discard: ['src/A.st'] });
  });
});

describe('recovery saver (IDE-006)', () => {
  it('is quick enough for "a few seconds": the delay and the longest wait are bounded', () => {
    expect(RECOVERY_WRITE_DELAY_MS).toBeLessThanOrEqual(2000);
    expect(RECOVERY_MAX_WAIT_MS).toBeLessThanOrEqual(5000);
  });

  it('writes a modified file within the delay of the last change, and not before', async () => {
    const time = clock(); const sink = target();
    let modified: RecoverySnapshot['modified'] = [{ path: 'src/A.st', content: 'one' }];
    const saver = createRecoverySaver({ target: sink.api, take: () => ({ rootId: 'r', modified }), schedule: time.schedule, cancel: time.cancel, now: time.now });
    saver.queue();
    time.advance(RECOVERY_WRITE_DELAY_MS - 1); await settle();
    expect(sink.calls).toEqual([]);
    modified = [{ path: 'src/A.st', content: 'one two' }];
    saver.queue(); // another keystroke moves the write back
    time.advance(RECOVERY_WRITE_DELAY_MS - 1); await settle();
    expect(sink.calls).toEqual([]);
    time.advance(1); await settle();
    expect(sink.calls).toEqual(['write r src/A.st one two']);
  });

  it('writes during a long stretch of typing, no later than the longest wait after the first change', async () => {
    const time = clock(); const sink = target();
    let content = 'x';
    const saver = createRecoverySaver({ target: sink.api, take: () => ({ rootId: 'r', modified: [{ path: 'src/A.st', content }] }), schedule: time.schedule, cancel: time.cancel, now: time.now });
    saver.queue();
    for (let at = 0; at < RECOVERY_MAX_WAIT_MS; at += 200) { content += 'y'; time.advance(200); saver.queue(); }
    await settle();
    expect(sink.calls.length).toBeGreaterThanOrEqual(1);
    expect(sink.calls[0]).toMatch(/^write r src\/A\.st xy+/);
  });

  it('does not send a file again until its content changes', async () => {
    const time = clock(); const sink = target();
    const saver = createRecoverySaver({ target: sink.api, take: () => ({ rootId: 'r', modified: [{ path: 'src/A.st', content: 'one' }] }), schedule: time.schedule, cancel: time.cancel, now: time.now });
    await saver.flush(); await saver.flush();
    expect(sink.calls).toEqual(['write r src/A.st one']);
  });

  it('discards the entry once the file is saved, and retries a write that failed at the next flush', async () => {
    const time = clock(); const sink = target();
    let modified: RecoverySnapshot['modified'] = [{ path: 'src/A.st', content: 'one' }];
    const saver = createRecoverySaver({ target: sink.api, take: () => ({ rootId: 'r', modified }), schedule: time.schedule, cancel: time.cancel, now: time.now });
    sink.failWrites(true);
    await saver.flush();
    expect(sink.calls).toEqual([]);
    sink.failWrites(false);
    await saver.flush();
    expect(sink.calls).toEqual(['write r src/A.st one']);
    modified = [];
    await saver.flush();
    expect(sink.calls).toEqual(['write r src/A.st one', 'discard r src/A.st']);
  });

  it('drops an entry that an earlier run kept and the user restored, once the file is saved, though this run never wrote it', async () => {
    const time = clock(); const sink = target();
    let modified: RecoverySnapshot['modified'] = [{ path: 'src/A.st', content: 'restored' }];
    const saver = createRecoverySaver({ target: sink.api, take: () => ({ rootId: 'r', modified }), schedule: time.schedule, cancel: time.cancel, now: time.now });
    saver.adopt('r', 'src/A.st', 'restored');
    await saver.flush();
    expect(sink.calls).toEqual([]); // the store already holds exactly this content
    modified = [];
    await saver.flush();
    expect(sink.calls).toEqual(['discard r src/A.st']);
  });

  it('discards what it kept when the project closes or another opens, and writes the new project under its own id', async () => {
    const time = clock(); const sink = target();
    let snapshot: RecoverySnapshot | null = { rootId: 'r1', modified: [{ path: 'src/A.st', content: 'one' }] };
    const saver = createRecoverySaver({ target: sink.api, take: () => snapshot, schedule: time.schedule, cancel: time.cancel, now: time.now });
    await saver.flush();
    snapshot = { rootId: 'r2', modified: [{ path: 'src/B.st', content: 'two' }] };
    await saver.flush();
    snapshot = null;
    await saver.flush();
    expect(sink.calls).toEqual(['write r1 src/A.st one', 'discard r1 src/A.st', 'write r2 src/B.st two', 'discard r2 src/B.st']);
  });
});

describe('recovery wiring to the store (IDE-006)', () => {
  interface State extends RecoveryStoreState { n: number }
  function fakeStore(initial: State) {
    let state = initial;
    const listeners = new Set<(state: State, previous: State) => void>();
    return {
      getState: () => state,
      subscribe: (listener: (state: State, previous: State) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
      set(next: Partial<State>) { const previous = state; state = { ...state, ...next }; for (const listener of listeners) listener(state, previous); },
    };
  }
  const file = (path: string, content: string, isModified: boolean) => ({ path, content, isModified });
  const base: State = { n: 0, isProjectOpen: true, projectSession: 1, directoryHandle: 'handle', loadedFiles: new Map() };

  it('keeps the content of a file that becomes modified, after the delay, and drops it when the file is saved', async () => {
    const time = clock(); const sink = target();
    const store = fakeStore(base);
    startRecoveryPersistence(store, { target: sink.api, rootIdOf: () => 'r', schedule: time.schedule, cancel: time.cancel, now: time.now });
    store.set({ loadedFiles: new Map([['file:src/A.st', file('src/A.st', 'typed', true)]]) });
    time.advance(RECOVERY_WRITE_DELAY_MS); await settle();
    expect(sink.calls).toEqual(['write r src/A.st typed']);
    store.set({ loadedFiles: new Map([['file:src/A.st', file('src/A.st', 'typed', false)]]) });
    time.advance(RECOVERY_WRITE_DELAY_MS); await settle();
    expect(sink.calls).toEqual(['write r src/A.st typed', 'discard r src/A.st']);
  });

  it('ignores store changes that cannot change what is modified, so that a stream of live values schedules nothing', async () => {
    const time = clock(); const sink = target();
    const store = fakeStore(base);
    startRecoveryPersistence(store, { target: sink.api, rootIdOf: () => 'r', schedule: time.schedule, cancel: time.cancel, now: time.now });
    for (let value = 0; value < 50; value++) store.set({ n: value });
    expect(time.pending).toBe(0);
  });

  it('drops the entries at once when the project closes, without waiting for the delay', async () => {
    const time = clock(); const sink = target();
    const store = fakeStore({ ...base, loadedFiles: new Map([['file:src/A.st', file('src/A.st', 'typed', true)]]) });
    const stop = startRecoveryPersistence(store, { target: sink.api, rootIdOf: (state) => (state.isProjectOpen ? 'r' : null), schedule: time.schedule, cancel: time.cancel, now: time.now });
    store.set({ n: 1, loadedFiles: new Map([['file:src/A.st', file('src/A.st', 'typed!', true)]]) });
    time.advance(RECOVERY_WRITE_DELAY_MS); await settle();
    store.set({ isProjectOpen: false, projectSession: 2, loadedFiles: new Map() });
    await settle();
    expect(sink.calls).toEqual(['write r src/A.st typed!', 'discard r src/A.st']);
    stop();
  });
});
