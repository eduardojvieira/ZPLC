import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

import { RECENT_PROJECTS_FILENAME, RECENT_PROJECTS_LIMITS, createRecentProjects, parseRecentProjects, projectKey } from './recentProjects';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'zplc-recent-'));
  directories.push(directory);
  return directory;
}

/** A clock that moves forward by one second at each reading, so that "most recent first" is observable. */
function clock(start = 1_000_000) {
  let now = start;
  return () => (now += 1_000);
}

describe('recent projects store', () => {
  test('starts empty and names a project by a hash of its real path, never by the path', async () => {
    const directory = await fixture();
    const store = createRecentProjects(directory);
    await expect(store.list()).resolves.toEqual([]);
    expect(projectKey('/home/ana/plant')).toMatch(/^[0-9a-f]{64}$/);
    expect(projectKey('/home/ana/plant')).toBe(projectKey('/home/ana/plant'));
    expect(projectKey('/home/ana/plant')).not.toBe(projectKey('/home/ana/Plant'));
  });

  test('records the most recent project first and keeps one entry per real path', async () => {
    const directory = await fixture();
    const store = createRecentProjects(directory, clock());
    await store.record('/home/ana/plant');
    await store.record('/home/ana/line');
    await store.record('/home/ana/plant');
    const entries = await store.list();
    expect(entries.map((entry) => entry.path)).toEqual(['/home/ana/plant', '/home/ana/line']);
    expect(entries[0]!.lastOpenedAt).toBeGreaterThan(entries[1]!.lastOpenedAt);
    expect(entries[0]!.id).toBe(projectKey('/home/ana/plant'));
  });

  test('keeps at most ten entries and drops the oldest', async () => {
    const directory = await fixture();
    const store = createRecentProjects(directory, clock());
    for (let index = 0; index < 13; index++) await store.record(`/home/ana/p${index}`);
    const entries = await store.list();
    expect(RECENT_PROJECTS_LIMITS.maxEntries).toBe(10);
    expect(entries).toHaveLength(10);
    expect(entries[0]!.path).toBe('/home/ana/p12');
    expect(entries.at(-1)!.path).toBe('/home/ana/p3');
  });

  test('finds an entry by id and forgets it', async () => {
    const directory = await fixture();
    const store = createRecentProjects(directory, clock());
    await store.record('/home/ana/plant');
    await store.record('/home/ana/line');
    const id = projectKey('/home/ana/plant');
    await expect(store.get(id)).resolves.toMatchObject({ path: '/home/ana/plant' });
    await expect(store.get('0'.repeat(64))).resolves.toBeUndefined();
    await expect(store.forget(id)).resolves.toBe(true);
    await expect(store.forget(id)).resolves.toBe(false);
    expect((await store.list()).map((entry) => entry.path)).toEqual(['/home/ana/line']);
  });

  test('refuses a path that is not a plausible folder path', async () => {
    const directory = await fixture();
    const store = createRecentProjects(directory);
    for (const bad of ['', 'relative/path', `/x${'a'.repeat(RECENT_PROJECTS_LIMITS.maxPathChars)}`, '/with\0nul']) {
      await expect(store.record(bad)).rejects.toThrow('Invalid recent project');
    }
    await expect(store.list()).resolves.toEqual([]);
  });

  test('writes through a temporary file, with owner-only permissions, and leaves nothing behind', async () => {
    const directory = await fixture();
    const store = createRecentProjects(directory);
    await Promise.all([store.record('/a'), store.record('/b'), store.record('/c')]);
    expect((await readdir(directory)).sort()).toEqual([RECENT_PROJECTS_FILENAME]);
    const raw = await readFile(join(directory, RECENT_PROJECTS_FILENAME), 'utf8');
    expect(JSON.parse(raw)).toMatchObject({ schemaVersion: 1 });
    expect(JSON.parse(raw).projects).toHaveLength(3);
    const { statSync } = await import('node:fs');
    expect(statSync(join(directory, RECENT_PROJECTS_FILENAME)).mode & 0o777).toBe(0o600);
  });

  test('serialises concurrent records so none is lost', async () => {
    const directory = await fixture();
    const store = createRecentProjects(directory, clock());
    await Promise.all(Array.from({ length: 8 }, (_, index) => store.record(`/home/ana/p${index}`)));
    expect((await store.list()).map((entry) => entry.path).sort()).toEqual(
      Array.from({ length: 8 }, (_, index) => `/home/ana/p${index}`).sort(),
    );
  });

  test('reads a corrupt, oversized, wrongly shaped or linked file as an empty list and replaces it on the next record', async () => {
    const directory = await fixture();
    const file = join(directory, RECENT_PROJECTS_FILENAME);
    const store = createRecentProjects(directory, clock());
    for (const content of [
      '{broken',
      'x'.repeat(RECENT_PROJECTS_LIMITS.maxBytes + 1),
      '{"schemaVersion":2,"projects":[]}',
      '{"schemaVersion":1,"projects":[],"extra":1}',
      '[]',
      'null',
    ]) {
      await writeFile(file, content);
      await expect(store.list()).resolves.toEqual([]);
    }
    await rm(file);
    await symlink('/etc/passwd', file);
    await expect(store.list()).resolves.toEqual([]);
    await rm(file);
    await store.record('/home/ana/plant');
    expect((await store.list()).map((entry) => entry.path)).toEqual(['/home/ana/plant']);
  });

  test('does not write into a user-data path that is a link or missing parent chain is created privately', async () => {
    const directory = await fixture();
    const real = join(directory, 'real');
    await mkdir(real);
    const link = join(directory, 'link');
    await symlink(real, link);
    await expect(createRecentProjects(link).record('/home/ana/plant')).rejects.toThrow('Invalid recent projects directory');
    await expect(createRecentProjects(link).list()).resolves.toEqual([]);
    const fresh = join(directory, 'new', 'profile');
    await createRecentProjects(fresh).record('/home/ana/plant');
    expect(await readdir(fresh)).toEqual([RECENT_PROJECTS_FILENAME]);
  });
});

describe('recent projects file format', () => {
  const entry = (path: string, lastOpenedAt: number) => ({ id: projectKey(path), path, lastOpenedAt });
  const file = (projects: unknown[]) => JSON.stringify({ schemaVersion: 1, projects });

  test('accepts exact entries and orders them most recent first', () => {
    expect(parseRecentProjects(file([entry('/a', 1), entry('/b', 2)]))?.map((item) => item.path)).toEqual(['/b', '/a']);
  });

  test('rejects an id that is not the hash of the path, duplicates, extra keys, bad times and too many entries', () => {
    const good = entry('/a', 1);
    for (const projects of [
      [{ ...good, id: projectKey('/other') }],
      [good, good],
      [{ ...good, extra: true }],
      [{ id: good.id, path: good.path }],
      [{ ...good, lastOpenedAt: -1 }],
      [{ ...good, lastOpenedAt: 1.5 }],
      [{ ...good, lastOpenedAt: '1' }],
      [{ ...good, path: 'relative', id: projectKey('relative') }],
      Array.from({ length: 11 }, (_, index) => entry(`/p${index}`, index)),
    ])
      expect(parseRecentProjects(file(projects))).toBeUndefined();
    expect(parseRecentProjects('{"schemaVersion":1}')).toBeUndefined();
  });
});
