import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

import { createProjectWatcher, relevantChange } from './projectWatcher';
import type { ProjectChange } from './projectFilesProtocol';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'zplc-watch-'));
  directories.push(directory);
  return directory;
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('which changes are worth telling the window about (IDE-004)', () => {
  test('keeps a project path and drops what Studio and the tools write for themselves', () => {
    expect(relevantChange('src/Motor.st')).toBe('src/Motor.st');
    expect(relevantChange('src\\lib\\Pump.st')).toBe('src/lib/Pump.st');
    for (const noise of [
      '.git/index',
      'node_modules/x/y.js',
      'build/out.bin',
      '.vscode/settings.json',
      'src/.Motor.st.0a1b2c3d4e5f.tmp',
      '',
      '..\\x',
      '../x',
      '/abs',
    ]) {
      expect(relevantChange(noise)).toBeNull();
    }
  });
});

describe('project watcher (IDE-004)', () => {
  // Bun's recursive fs.watch on Linux reports only the first change of a burst (Node, which the app runs on, reports each),
  // so what a real folder is asked for here is one change; batching and filtering are driven through a fake watch below.
  test('tells the window which path changed under its folder', async () => {
    const root = await fixture();
    await mkdir(join(root, 'src'));
    const events: Array<{ ownerId: number; change: ProjectChange }> = [];
    const watcher = createProjectWatcher({ send: (ownerId, change) => events.push({ ownerId, change }), debounceMs: 100 });
    watcher.start(7, 'root-1', root);
    await wait(150);
    await writeFile(join(root, 'src', 'Motor.st'), 'one');
    await wait(1_000);
    watcher.stopAll();
    expect(events.flatMap((event) => event.change.paths)).toContain('src/Motor.st');
    expect(events.every((event) => event.ownerId === 7 && event.change.rootId === 'root-1' && !event.change.overflow)).toBe(true);
  });

  test('sends a burst as one batch of distinct paths and leaves out what the tools write for themselves', async () => {
    let listener: ((event: string, filename: string | null) => void) | undefined;
    const fake = { on: () => fake, close: () => undefined };
    const events: ProjectChange[] = [];
    const watcher = createProjectWatcher({
      send: (_ownerId, change) => events.push(change),
      debounceMs: 20,
      watch: ((_path: string, _options: unknown, callback: (event: string, filename: string | null) => void) => {
        listener = callback;
        return fake;
      }) as never,
    });
    watcher.start(1, 'r', '/anywhere');
    for (const name of ['src/Motor.st', 'src/Motor.st', 'src/Pump.st', 'src/.Motor.st.0a1b2c3d4e5f.tmp', '.git/index', 'node_modules/x.js'])
      listener!('change', name);
    listener!('rename', null);
    await wait(120);
    expect(events).toEqual([{ rootId: 'r', paths: ['src/Motor.st', 'src/Pump.st'], overflow: false }]);
    watcher.stopAll();
  });

  test('says there were too many to list instead of listing them', async () => {
    // A fake watch that the test drives, so that "a burst" does not depend on when the operating system delivers events.
    let listener: ((event: string, filename: string | null) => void) | undefined;
    let closed = false;
    const fake = {
      on: () => fake,
      close: () => {
        closed = true;
      },
    };
    const events: ProjectChange[] = [];
    const watcher = createProjectWatcher({
      send: (_ownerId, change) => events.push(change),
      debounceMs: 20,
      maxPaths: 3,
      watch: ((_path: string, _options: unknown, callback: (event: string, filename: string | null) => void) => {
        listener = callback;
        return fake;
      }) as never,
    });
    watcher.start(1, 'r', '/anywhere');
    for (let index = 0; index < 10; index++) listener!('change', `F${index}.st`);
    await wait(120);
    expect(events).toEqual([{ rootId: 'r', paths: [], overflow: true }]);
    // The next batch starts clean.
    listener!('change', 'src/A.st');
    await wait(120);
    expect(events.at(-1)).toEqual({ rootId: 'r', paths: ['src/A.st'], overflow: false });
    watcher.stopAll();
    expect(closed).toBe(true);
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
