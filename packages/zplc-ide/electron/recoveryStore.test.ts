import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

import { RECOVERY_DIRECTORY, createRecoveryStore } from './recoveryStore';
import { RECOVERY_LIMITS, parseRecoveryDiscard, parseRecoveryEntry, parseRecoveryList, parseRecoveryWrite } from './recoveryStoreProtocol';
import { projectKey } from './recentProjects';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
async function fixture(): Promise<string> { const directory = await mkdtemp(join(tmpdir(), 'zplc-recovery-')); directories.push(directory); return directory; }

const PROJECT = '/home/ana/plant';
const projectDirectory = (userData: string, realPath = PROJECT) => join(userData, RECOVERY_DIRECTORY, projectKey(realPath));

describe('recovery store (IDE-006)', () => {
  test('has nothing for a project it never saw', async () => {
    const store = createRecoveryStore(await fixture());
    await expect(store.list(PROJECT)).resolves.toEqual([]);
  });

  test('keeps the content of a modified file under the user-data directory, named by project and path, with the time it was kept', async () => {
    const userData = await fixture();
    const store = createRecoveryStore(userData, () => 1_700_000_000_000);
    await store.write(PROJECT, 'src/Motor.st', 'PROGRAM Motor\nEND_PROGRAM\n');
    await expect(store.list(PROJECT)).resolves.toEqual([{ path: 'src/Motor.st', content: 'PROGRAM Motor\nEND_PROGRAM\n', savedAt: 1_700_000_000_000 }]);
    await expect(store.list('/home/ana/other')).resolves.toEqual([]);
    const names = await readdir(projectDirectory(userData));
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^[0-9a-f]{64}\.json$/);
    expect(await readFile(join(projectDirectory(userData), names[0]!), 'utf8')).not.toContain('/home/ana'); // the real project path is never stored
  });

  test('replaces the entry of a file that is written again, and lists several files by path', async () => {
    const store = createRecoveryStore(await fixture());
    await store.write(PROJECT, 'src/Pump.st', 'one');
    await store.write(PROJECT, 'src/Motor.st', 'a');
    await store.write(PROJECT, 'src/Pump.st', 'two');
    expect((await store.list(PROJECT)).map((entry) => [entry.path, entry.content])).toEqual([['src/Motor.st', 'a'], ['src/Pump.st', 'two']]);
  });

  test('the last of several concurrent writes wins and no temporary file is left', async () => {
    const userData = await fixture();
    const store = createRecoveryStore(userData);
    await Promise.all(Array.from({ length: 8 }, (_, index) => store.write(PROJECT, 'src/A.st', `v${index}`)));
    expect((await store.list(PROJECT)).map((entry) => entry.content)).toEqual(['v7']);
    expect(await readdir(projectDirectory(userData))).toHaveLength(1);
    expect((await stat(projectDirectory(userData))).mode & 0o777).toBe(0o700);
  });

  test('discards one entry or all of them, and discarding what is not there is not an error', async () => {
    const store = createRecoveryStore(await fixture());
    await store.write(PROJECT, 'src/A.st', 'a');
    await store.write(PROJECT, 'src/B.st', 'b');
    await store.discard(PROJECT, 'src/A.st');
    expect((await store.list(PROJECT)).map((entry) => entry.path)).toEqual(['src/B.st']);
    await store.discard(PROJECT, 'src/Absent.st');
    await store.discard(PROJECT, null);
    await expect(store.list(PROJECT)).resolves.toEqual([]);
    await store.discard('/home/ana/never', null);
  });

  test('refuses a path or a content it cannot keep, and writes nothing', async () => {
    const userData = await fixture();
    const store = createRecoveryStore(userData);
    for (const bad of ['../x.st', '/etc/passwd', '', 'a//b.st', 'a\\b.st']) await expect(store.write(PROJECT, bad, 'x')).rejects.toThrow('Invalid recovery entry');
    await expect(store.write(PROJECT, 'a.st', 'x'.repeat(RECOVERY_LIMITS.maxContentChars + 1))).rejects.toThrow('Invalid recovery entry');
    await expect(readdir(join(userData, RECOVERY_DIRECTORY))).rejects.toThrow();
  });

  test('refuses a new file once the project holds the most entries, but still updates a file it already holds', async () => {
    const store = createRecoveryStore(await fixture());
    for (let index = 0; index < RECOVERY_LIMITS.maxEntries; index++) await store.write(PROJECT, `src/F${index}.st`, 'x');
    await expect(store.write(PROJECT, 'src/Extra.st', 'x')).rejects.toThrow('Recovery store full');
    await store.write(PROJECT, 'src/F0.st', 'updated');
    expect((await store.list(PROJECT)).find((entry) => entry.path === 'src/F0.st')?.content).toBe('updated');
  }, 60_000); // It writes the store to its limit, one file at a time: a loaded disk outgrows the 5 s default, which is not what it measures.

  test('skips a file that is not exactly an entry and still lists the others', async () => {
    const userData = await fixture();
    const store = createRecoveryStore(userData);
    await store.write(PROJECT, 'src/Good.st', 'good');
    await writeFile(join(projectDirectory(userData), `${'0'.repeat(64)}.json`), '{ not json');
    await writeFile(join(projectDirectory(userData), `${'1'.repeat(64)}.json`), JSON.stringify({ path: '../escape.st', content: 'x', savedAt: 1 }));
    await writeFile(join(projectDirectory(userData), 'notes.txt'), 'foreign');
    expect((await store.list(PROJECT)).map((entry) => entry.path)).toEqual(['src/Good.st']);
  });

  test('reads nothing and writes nothing through a linked directory', async () => {
    const userData = await fixture();
    const elsewhere = await fixture();
    await mkdir(join(userData, RECOVERY_DIRECTORY), { recursive: true });
    await symlink(elsewhere, projectDirectory(userData));
    const store = createRecoveryStore(userData);
    await writeFile(join(elsewhere, `${'2'.repeat(64)}.json`), JSON.stringify({ path: 'src/A.st', content: 'x', savedAt: 1 }));
    await expect(store.list(PROJECT)).resolves.toEqual([]);
    await expect(store.write(PROJECT, 'src/A.st', 'x')).rejects.toThrow();
    expect(await readdir(elsewhere)).toEqual([`${'2'.repeat(64)}.json`]);
  });

  test('prunes the projects it was not told to keep and the leftovers of an interrupted write', async () => {
    const userData = await fixture();
    const store = createRecoveryStore(userData);
    await store.write(PROJECT, 'src/A.st', 'a');
    await store.write('/home/ana/forgotten', 'src/B.st', 'b');
    await writeFile(join(projectDirectory(userData), `.${'3'.repeat(64)}.json.leftover`), 'torn');
    await writeFile(join(userData, RECOVERY_DIRECTORY, 'notes.txt'), 'foreign');
    await store.prune(new Set([projectKey(PROJECT)]));
    expect((await readdir(join(userData, RECOVERY_DIRECTORY))).sort()).toEqual([projectKey(PROJECT), 'notes.txt'].sort());
    expect(await readdir(projectDirectory(userData))).toHaveLength(1);
    await expect(store.list(PROJECT)).resolves.toHaveLength(1);
  });

  test('counts what all the files of a project hold against the bound of the project', async () => {
    const store = createRecoveryStore(await fixture());
    const big = 'x'.repeat(RECOVERY_LIMITS.maxContentChars);
    for (let index = 0; index < 3; index++) await store.write(PROJECT, `src/Big${index}.st`, big);
    await expect(store.write(PROJECT, 'src/Big3.st', big)).rejects.toThrow('Recovery store full');
    expect(await store.list(PROJECT)).toHaveLength(3);
  });
});

describe('recovery messages (IDE-006)', () => {
  test('accept exactly the documented fields and nothing else', () => {
    expect(parseRecoveryWrite({ rootId: 'r', path: 'src/A.st', content: 'x' })).toEqual({ rootId: 'r', path: 'src/A.st', content: 'x' });
    expect(parseRecoveryList({ rootId: 'r' })).toEqual({ rootId: 'r' });
    expect(parseRecoveryDiscard({ rootId: 'r', path: null })).toEqual({ rootId: 'r', path: null });
    expect(parseRecoveryDiscard({ rootId: 'r', path: 'src/A.st' })).toEqual({ rootId: 'r', path: 'src/A.st' });
    for (const bad of [null, 'x', [], { rootId: 'r' }, { rootId: 'r', path: 'a.st', content: 'x', extra: 1 }, { rootId: '', path: 'a.st', content: 'x' }, { rootId: 'r', path: '../a.st', content: 'x' }, { rootId: 'r', path: 'a.st', content: 1 }]) {
      expect(parseRecoveryWrite(bad)).toBeNull();
    }
    expect(parseRecoveryList({ rootId: 'r', path: 'a.st' })).toBeNull();
    expect(parseRecoveryDiscard({ rootId: 'r' })).toBeNull();
    expect(parseRecoveryDiscard({ rootId: 'r', path: '/etc/passwd' })).toBeNull();
    expect(parseRecoveryEntry({ path: 'src/A.st', content: 'x', savedAt: 5 })).toEqual({ path: 'src/A.st', content: 'x', savedAt: 5 });
    expect(parseRecoveryEntry({ path: 'src/A.st', content: 'x', savedAt: -1 })).toBeNull();
    expect(parseRecoveryEntry({ path: 'src/A.st', content: 'x' })).toBeNull();
  });
});
