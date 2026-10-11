import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

import { projectKey } from './recentProjects';
import { SESSION_DIRECTORY, createSessionStore } from './sessionStore';
import { SESSION_LIMITS, type SessionState } from './sessionStoreProtocol';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
async function fixture(): Promise<string> { const directory = await mkdtemp(join(tmpdir(), 'zplc-session-')); directories.push(directory); return directory; }

const PROJECT = '/home/ana/plant';
const state = (overrides: Partial<SessionState> = {}): SessionState => ({
  schemaVersion: 1,
  tabs: [{ path: 'src/Motor.st', line: 21, column: 5, scrollTop: 120 }, { path: 'src/Pump.st', line: 1, column: 1, scrollTop: 0 }],
  activePath: 'src/Pump.st',
  panels: { editor: 60, console: 40, consoleCollapsed: false },
  ...overrides,
});
const fileOf = (userData: string, realPath: string) => join(userData, SESSION_DIRECTORY, `${projectKey(realPath)}.json`);

describe('session store (IDE-008)', () => {
  test('has no session for a project it never saw', async () => {
    const store = createSessionStore(await fixture());
    await expect(store.load(PROJECT)).resolves.toBeNull();
  });

  test('saves and loads a session, keyed by a hash of the real path in the user-data directory', async () => {
    const userData = await fixture();
    const store = createSessionStore(userData);
    await store.save(PROJECT, state());
    await expect(store.load(PROJECT)).resolves.toEqual(state());
    await expect(store.load('/home/ana/other')).resolves.toBeNull();
    expect(await readdir(join(userData, SESSION_DIRECTORY))).toEqual([`${projectKey(PROJECT)}.json`]);
    expect(await readFile(fileOf(userData, PROJECT), 'utf8')).not.toContain('/home/ana'); // no project path in the stored file
  });

  test('writes through a temporary file, owner-only, and the last save wins when several run at once', async () => {
    const userData = await fixture();
    const store = createSessionStore(userData);
    await Promise.all(Array.from({ length: 6 }, (_, line) => store.save(PROJECT, state({ tabs: [{ path: 'a.st', line: line + 1, column: 1, scrollTop: 0 }], activePath: 'a.st' }))));
    expect((await store.load(PROJECT))!.tabs[0]!.line).toBe(6);
    expect(await readdir(join(userData, SESSION_DIRECTORY))).toEqual([`${projectKey(PROJECT)}.json`]);
    expect((await stat(fileOf(userData, PROJECT))).mode & 0o777).toBe(0o600);
    expect((await stat(join(userData, SESSION_DIRECTORY))).mode & 0o777).toBe(0o700);
  });

  test('settles once the saves accepted so far are on the disk, whether or not anybody awaited them (the process waits on it before it exits)', async () => {
    const userData = await fixture();
    const store = createSessionStore(userData);
    // the closing window's message: accepted, and nobody holds its promise
    const first = store.save(PROJECT, state({ tabs: [{ path: 'a.st', line: 12, column: 1, scrollTop: 0 }], activePath: 'a.st' }));
    const refused = store.save(PROJECT, { not: 'a session' });
    void first.catch(() => undefined);
    void refused.catch(() => undefined);
    await store.settled();
    expect(JSON.parse(await readFile(fileOf(userData, PROJECT), 'utf8')).tabs[0].line).toBe(12);
    await expect(createSessionStore(await fixture()).settled()).resolves.toBeUndefined();
  });

  test('refuses to store anything that is not exactly a session document, and writes nothing', async () => {
    const userData = await fixture();
    const store = createSessionStore(userData);
    for (const bad of [null, 'x', { ...state(), extra: 1 }, state({ tabs: [{ path: '../x.st', line: 1, column: 1, scrollTop: 0 }], activePath: null }), state({ tabs: [{ path: '/etc/passwd', line: 1, column: 1, scrollTop: 0 }], activePath: null }), state({ activePath: 'src/Absent.st' })]) {
      await expect(store.save(PROJECT, bad)).rejects.toThrow('Invalid session');
    }
    await expect(readdir(join(userData, SESSION_DIRECTORY))).rejects.toThrow();
  });

  test('keeps stale tabs as they were stored: it is the renderer that drops a file that no longer exists', async () => {
    const store = createSessionStore(await fixture());
    await store.save(PROJECT, state({ tabs: [{ path: 'src/Deleted.st', line: 3, column: 1, scrollTop: 0 }], activePath: 'src/Deleted.st' }));
    expect((await store.load(PROJECT))!.tabs.map((tab) => tab.path)).toEqual(['src/Deleted.st']);
  });

  test('reads a corrupt, oversized, wrongly shaped or linked file as no session, and replaces it on the next save', async () => {
    const userData = await fixture();
    const store = createSessionStore(userData);
    await store.save(PROJECT, state());
    const file = fileOf(userData, PROJECT);
    for (const content of ['{broken', 'x'.repeat(SESSION_LIMITS.maxBytes + 1), JSON.stringify({ ...state(), extra: 1 }), JSON.stringify({ ...state(), tabs: [{ path: '../x', line: 1, column: 1, scrollTop: 0 }], activePath: null }), '[]']) {
      await writeFile(file, content);
      await expect(store.load(PROJECT)).resolves.toBeNull();
    }
    await rm(file);
    await symlink('/etc/passwd', file);
    await expect(store.load(PROJECT)).resolves.toBeNull();
    await rm(file);
    await mkdir(file);
    await expect(store.load(PROJECT)).resolves.toBeNull();
    await rm(file, { recursive: true });
    await store.save(PROJECT, state());
    await expect(store.load(PROJECT)).resolves.toEqual(state());
  });

  test('does not read or write through a sessions directory that is a link', async () => {
    const userData = await fixture();
    const elsewhere = await fixture();
    await symlink(elsewhere, join(userData, SESSION_DIRECTORY));
    const store = createSessionStore(userData);
    await expect(store.save(PROJECT, state())).rejects.toThrow('Invalid session directory');
    expect(await readdir(elsewhere)).toEqual([]);
    await writeFile(join(elsewhere, `${projectKey(PROJECT)}.json`), JSON.stringify(state()));
    await expect(store.load(PROJECT)).resolves.toBeNull();
  });

  test('prunes the sessions of projects that are no longer remembered, and the leftovers of interrupted writes, only', async () => {
    const userData = await fixture();
    const store = createSessionStore(userData);
    await store.save('/keep', state());
    await store.save('/drop', state());
    const directory = join(userData, SESSION_DIRECTORY);
    await writeFile(join(directory, `.${projectKey('/keep')}.json.0f2ce877`), 'half written');
    await writeFile(join(directory, 'notes.txt'), 'not ours');
    await store.prune(new Set([projectKey('/keep')]));
    expect((await readdir(directory)).sort()).toEqual([`${projectKey('/keep')}.json`, 'notes.txt'].sort());
    await expect(store.load('/keep')).resolves.toEqual(state());
    await expect(store.load('/drop')).resolves.toBeNull();
  });

  test('prunes nothing, and does not fail, when there is no sessions directory yet', async () => {
    await expect(createSessionStore(await fixture()).prune(new Set())).resolves.toBeUndefined();
  });
});
