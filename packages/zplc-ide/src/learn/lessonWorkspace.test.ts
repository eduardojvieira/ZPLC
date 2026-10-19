// Starting a lesson creates or reopens its workspace with no manual copy step (LRN-003): the first start makes the workspace, the
// next start reopens that same folder, a folder that is gone is made again, and a cancelled dialog leaves nothing remembered.
import { describe, expect, it } from 'bun:test';
import { createWorkspaceMemory, openLessonWorkspace, parseWorkspaceMemory, type RecentEntry, type WorkspaceDeps } from './lessonWorkspace';

const LESSON = 'scan-cycle-one-scan-memory';

function harness(over: Partial<WorkspaceDeps> = {}, recents: RecentEntry[] = []) {
  const remembered = new Map<string, string>();
  const calls: string[] = [];
  let clock = 1_000;
  const deps: WorkspaceDeps = {
    memory: { get: (id) => remembered.get(id), set: (id, recent) => { remembered.set(id, recent); }, forget: (id) => { remembered.delete(id); } },
    recents: async () => recents,
    openRecent: async (id) => { calls.push(`open:${id}`); return true; },
    createWorkspace: async (project) => { calls.push(`create:${project}`); recents.unshift({ recentId: 'r-new', lastOpenedAt: clock + 5, available: true }); return true; },
    now: () => clock,
    wait: async (ms) => { clock += ms; },
    ...over,
  };
  return { deps, remembered, calls, recents };
}

describe('opening the app-owned workspace of a lesson (LRN-003)', () => {
  it('opens it with no folder dialog and no remembered folder when the main process owns the workspaces', async () => {
    const { deps, remembered, calls } = harness({ openManaged: async (id, project) => { calls.push(`managed:${id}:${project}`); return 'created'; } });
    expect(await openLessonWorkspace(deps, LESSON, 'scan_snapshot_starter')).toBe('created');
    expect(calls).toEqual([`managed:${LESSON}:scan_snapshot_starter`]);
    expect(remembered.size).toBe(0);
  });

  it('says reopened for a workspace that already held the learner\'s work, and cancelled when it could not be opened', async () => {
    expect(await openLessonWorkspace(harness({ openManaged: async () => 'reopened' }).deps, LESSON, 'scan_snapshot_starter')).toBe('reopened');
    expect(await openLessonWorkspace(harness({ openManaged: async () => false }).deps, LESSON, 'scan_snapshot_starter')).toBe('cancelled');
  });
});

describe('opening the workspace of a lesson', () => {
  it('creates the workspace from the starter on the first start and remembers the folder for that lesson', async () => {
    const { deps, remembered, calls } = harness();
    expect(await openLessonWorkspace(deps, LESSON, 'scan_snapshot_starter')).toBe('created');
    expect(calls).toEqual(['create:scan_snapshot_starter']);
    expect(remembered.get(LESSON)).toBe('r-new');
  });

  it('reopens the remembered folder on the next start, without creating anything', async () => {
    const { deps, remembered, calls } = harness({}, [{ recentId: 'r-old', lastOpenedAt: 10, available: true }]);
    remembered.set(LESSON, 'r-old');
    expect(await openLessonWorkspace(deps, LESSON, 'scan_snapshot_starter')).toBe('reopened');
    expect(calls).toEqual(['open:r-old']);
  });

  it('makes the workspace again when the remembered folder is no longer there, and forgets the old one', async () => {
    const { deps, remembered, calls } = harness({}, [{ recentId: 'r-old', lastOpenedAt: 10, available: false }]);
    remembered.set(LESSON, 'r-old');
    expect(await openLessonWorkspace(deps, LESSON, 'scan_snapshot_starter')).toBe('created');
    expect(calls).toEqual(['create:scan_snapshot_starter']);
    expect(remembered.get(LESSON)).toBe('r-new');
  });

  it('leaves nothing remembered when the folder dialog is cancelled', async () => {
    const { deps, remembered } = harness({ createWorkspace: async () => false });
    expect(await openLessonWorkspace(deps, LESSON, 'scan_snapshot_starter')).toBe('cancelled');
    expect(remembered.size).toBe(0);
  });

  it('does not make a second workspace when reopening the remembered one fails (the reason is shown where it happened)', async () => {
    const { deps, remembered, calls } = harness({ openRecent: async () => false }, [{ recentId: 'r-old', lastOpenedAt: 10, available: true }]);
    remembered.set(LESSON, 'r-old');
    expect(await openLessonWorkspace(deps, LESSON, 'scan_snapshot_starter')).toBe('cancelled');
    expect(calls).toEqual([]);
    expect(remembered.get(LESSON)).toBe('r-old');
  });

  it('waits for the main process to list the new folder before it gives up remembering it', async () => {
    const recents: RecentEntry[] = [];
    let listed = 0;
    const { deps, remembered } = harness({
      recents: async () => { listed += 1; if (listed === 3) recents.push({ recentId: 'r-late', lastOpenedAt: 2_000, available: true }); return recents; },
      createWorkspace: async () => true,
    }, recents);
    expect(await openLessonWorkspace(deps, LESSON, 'scan_snapshot_starter')).toBe('created');
    expect(remembered.get(LESSON)).toBe('r-late');
  });
});

describe('what is remembered between runs', () => {
  it('keeps a lesson to folder map in storage, and reads a damaged value as empty', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
    const memory = createWorkspaceMemory(storage);
    memory.set(LESSON, 'r-1');
    expect(createWorkspaceMemory(storage).get(LESSON)).toBe('r-1');
    memory.forget(LESSON);
    expect(createWorkspaceMemory(storage).get(LESSON)).toBeUndefined();
    expect(parseWorkspaceMemory('{not json')).toEqual({});
    expect(parseWorkspaceMemory(JSON.stringify({ [LESSON]: 'r-1', 'Bad Id': 'x', other: 5 }))).toEqual({ [LESSON]: 'r-1' });
    expect(parseWorkspaceMemory(null)).toEqual({});
  });

  it('does not fail without storage', () => {
    const memory = createWorkspaceMemory(undefined);
    memory.set(LESSON, 'r-1');
    expect(memory.get(LESSON)).toBeUndefined();
  });
});
