import { afterEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MCP_TOOL_NAMES } from '../src/mcp/server';
import { IPC_INVOKE_CHANNELS, LEARN_WORKSPACE_CHANNEL } from './ipcContract';
import { createLearnWorkspaceHandlers } from './learnWorkspaceIpc';
import { prepareLearnWorkspace } from './learnWorkspace';

const temporary: string[] = [];
const scratch = async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'zplc-learn-ws-')));
  temporary.push(directory);
  return directory;
};
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('the app-owned workspace of a lesson (LRN-003)', () => {
  it('creates the folder of a lesson under the learner workspaces, empty the first time and untouched on every reopen', async () => {
    const root = join(await scratch(), 'learn-workspaces');
    const first = await prepareLearnWorkspace(root, 'motor-start-stop-safe');
    expect(first).toEqual({ directory: join(root, 'motor-start-stop-safe'), fresh: true });
    // The learner's work: the renderer seeded the starter, then the learner edited it.
    await writeFile(join(first.directory, 'zplc.json'), '{}');
    await writeFile(join(first.directory, 'Motor.st'), 'edited by the learner');
    const again = await prepareLearnWorkspace(root, 'motor-start-stop-safe');
    expect(again).toEqual({ directory: first.directory, fresh: false });
    expect(await readFile(join(first.directory, 'Motor.st'), 'utf8')).toBe('edited by the learner');
    expect((await prepareLearnWorkspace(root, 'edge-counter-pulses')).fresh).toBe(true);
  });

  it('builds the path only from a lesson id, and refuses an id that could leave the folder or a link in its place', async () => {
    const parent = await scratch();
    const root = join(parent, 'learn-workspaces');
    for (const bad of ['', '..', '../escape', 'a/b', 'A-Upper', '.hidden', 'x'.repeat(80), 'with space', 'a\\b'])
      await expect(prepareLearnWorkspace(root, bad)).rejects.toThrow('Invalid lesson id');
    await mkdir(root, { recursive: true });
    await symlink(parent, join(root, 'linked-lesson'));
    await expect(prepareLearnWorkspace(root, 'linked-lesson')).rejects.toThrow('not a folder');
    await writeFile(join(root, 'plain-file'), 'x');
    await expect(prepareLearnWorkspace(root, 'plain-file')).rejects.toThrow('not a folder');
  });

  it('answers on one channel that takes exactly one lesson id and hands the folder to the window as its project', async () => {
    const parent = await scratch();
    const adopted: Array<[number, string]> = [];
    const handlers = createLearnWorkspaceHandlers<{ ownerId: number }>({
      root: () => join(parent, 'learn-workspaces'),
      adopt: async (ownerId, directory) => {
        adopted.push([ownerId, directory]);
        return { rootId: 'root-1', name: 'motor-start-stop-safe' };
      },
    });
    const handler = handlers[LEARN_WORKSPACE_CHANNEL.OPEN]!;
    expect(Object.keys(handlers)).toEqual([LEARN_WORKSPACE_CHANNEL.OPEN]);
    expect(handler.accepts(['motor-start-stop-safe'])).toBe(true);
    for (const bad of [[], ['motor-start-stop-safe', 'extra'], ['../x'], [42], [{ lessonId: 'motor-start-stop-safe' }], [null]])
      expect(handler.accepts(bad)).toBe(false);
    expect(await handler.run({ ownerId: 7 }, ['motor-start-stop-safe'])).toEqual({
      rootId: 'root-1',
      name: 'motor-start-stop-safe',
      fresh: true,
    });
    expect(adopted).toEqual([[7, join(parent, 'learn-workspaces', 'motor-start-stop-safe')]]);
  });

  it('fails closed when there is no user-data folder to build the path in', async () => {
    const handler = createLearnWorkspaceHandlers<{ ownerId: number }>({
      root: () => null,
      adopt: async () => ({ rootId: 'x', name: 'x' }),
    })[LEARN_WORKSPACE_CHANNEL.OPEN]!;
    await expect(handler.run({ ownerId: 1 }, ['motor-start-stop-safe'])).rejects.toThrow();
  });

  it('is not a shell, serial, deploy or flash operation, and no MCP tool can reach it', () => {
    expect(IPC_INVOKE_CHANNELS).toContain(LEARN_WORKSPACE_CHANNEL.OPEN);
    expect(LEARN_WORKSPACE_CHANNEL.OPEN).not.toMatch(/flash|deploy|serial|shell|:force|:run-?program|:stop$/);
    // The MCP server answers a closed list of tools; none opens a workspace, names a lesson or takes a folder.
    expect(MCP_TOOL_NAMES.filter((name) => /workspace|learn|lesson|folder|open/i.test(name))).toEqual([]);
  });
});
