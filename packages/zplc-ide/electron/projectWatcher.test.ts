import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

import { createProjectWatcher, relevantChange } from './projectWatcher';
import type { ProjectChange } from './projectFilesProtocol';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
async function fixture(): Promise<string> { const directory = await mkdtemp(join(tmpdir(), 'zplc-watch-')); directories.push(directory); return directory; }
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('which changes are worth telling the window about (IDE-004)', () => {
  test('keeps a project path and drops what Studio and the tools write for themselves', () => {
    expect(relevantChange('src/Motor.st')).toBe('src/Motor.st');
    expect(relevantChange('src\\lib\\Pump.st')).toBe('src/lib/Pump.st');
    for (const noise of ['.git/index', 'node_modules/x/y.js', 'build/out.bin', '.vscode/settings.json', 'src/.Motor.st.0a1b2c3d4e5f.tmp', '', '..\\x', '../x', '/abs']) {
      expect(relevantChange(noise)).toBeNull();
    }
  });
});

describe('project watcher (IDE-004)', () => {
  test('tells the window which paths changed under its folder, once for a burst of writes', async () => {
    const root = await fixture();
    await mkdir(join(root, 'src'));
    const events: Array<{ ownerId: number; change: ProjectChange }> = [];
    const watcher = createProjectWatcher({ send: (ownerId, change) => events.push({ ownerId, change }), debounceMs: 50 });
    watcher.start(7, 'root-1', root);
    await wait(100);
    await writeFile(join(root, 'src', 'Motor.st'), 'one');
    await writeFile(join(root, 'src', 'Motor.st'), 'two');
    await writeFile(join(root, 'src', 'Pump.st'), 'pump');
    await wait(600);
    watcher.stopAll();
    const paths = new Set(events.flatMap((event) => event.change.paths));
    expect(paths.has('src/Motor.st')).toBe(true);
    expect(paths.has('src/Pump.st')).toBe(true);
    expect(events.every((event) => event.ownerId === 7 && event.change.rootId === 'root-1' && !event.change.overflow)).toBe(true);
    expect(events.length).toBeLessThanOrEqual(3);
  });

  test('says there were too many to list instead of listing them', async () => {
    const root = await fixture();
    const events: ProjectChange[] = [];
    const watcher = createProjectWatcher({ send: (_ownerId, change) => events.push(change), debounceMs: 80, maxPaths: 3 });
    watcher.start(1, 'r', root);
    await wait(100);
    for (let index = 0; index < 10; index++) await writeFile(join(root, `F${index}.st`), 'x');
    await wait(700);
    watcher.stopAll();
    expect(events.some((change) => change.overflow && change.paths.length === 0)).toBe(true);
  });

  test('stops telling after stop, and a second start replaces the first watch', async () => {
    const first = await fixture();
    const second = await fixture();
    const events: ProjectChange[] = [];
    const watcher = createProjectWatcher({ send: (_ownerId, change) => events.push(change), debounceMs: 30 });
    watcher.start(1, 'first', first);
    watcher.start(1, 'second', second);
    await wait(100);
    await writeFile(join(first, 'A.st'), 'x');
    await wait(300);
    expect(events).toEqual([]);
    await writeFile(join(second, 'B.st'), 'x');
    await wait(400);
    expect(events.map((change) => change.rootId)).toEqual(['second']);
    watcher.stop(1);
    await writeFile(join(second, 'C.st'), 'x');
    await wait(300);
    expect(events).toHaveLength(1);
    watcher.stopAll();
  });

  test('survives a folder that cannot be watched', () => {
    const watcher = createProjectWatcher({ send: () => undefined });
    expect(() => watcher.start(1, 'r', '/definitely/not/a/folder')).not.toThrow();
    watcher.stopAll();
  });
});
