import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MCP_TOOL_NAMES } from '../src/mcp/server';
import { spawnVector } from '../shared/spawnAllowList';
import { IPC_INVOKE_CHANNELS, MCP_CONNECTION_CHANNEL } from './ipcContract';
import { createMcpConfigHandlers } from './mcpConfigIpc';

// AIX-007: the three channels of the MCP connection panel; every config path here is inside a temporary folder.
const temporary: string[] = [];
const scratch = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zplc-mcp-ipc-'));
  temporary.push(directory);
  return directory;
};
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

type Owner = { ownerId: number };
const handlersFor = (folder: string | null, selfCheck = async () => ({ code: 0 as number | null, stdout: '{"ready":true}' })) => {
  const asked: unknown[] = [];
  const handlers = createMcpConfigHandlers<Owner>({
    folder: (ownerId) => (ownerId === 7 ? folder : null),
    userData: () => '/user/data',
    command: () => 'zplc-mcp',
    selfCheck: async (request) => {
      asked.push(request);
      return selfCheck();
    },
  });
  return { handlers, asked };
};
const { PREVIEW, WRITE, SELF_CHECK } = MCP_CONNECTION_CHANNEL;

describe('the MCP connection channels (AIX-007)', () => {
  it('are in the contract, answer exactly those three, and name no physical operation', () => {
    for (const channel of [PREVIEW, WRITE, SELF_CHECK]) {
      expect(IPC_INVOKE_CHANNELS).toContain(channel);
      expect(channel).not.toMatch(/flash|deploy|serial|shell|:force|:run-?program|:stop$/);
    }
    expect(Object.keys(handlersFor('/x').handlers).sort()).toEqual([PREVIEW, SELF_CHECK, WRITE].sort());
    expect(MCP_TOOL_NAMES.filter((name) => /connection|client|config/i.test(name))).toEqual([]);
  });

  it('accept one client name, one client with the text to write, and no argument, and nothing else', () => {
    const { handlers } = handlersFor('/x');
    expect(handlers[PREVIEW]!.accepts(['cursor'])).toBe(true);
    for (const bad of [[], ['cursor', 'x'], ['emacs'], [{ client: 'cursor' }], [null], ['../../etc'], ['/home/a/.mcp.json']])
      expect(handlers[PREVIEW]!.accepts(bad)).toBe(false);
    expect(handlers[WRITE]!.accepts([{ client: 'vscode', expected: '{}' }])).toBe(true);
    for (const bad of [
      [],
      [{ client: 'vscode' }],
      [{ client: 'vscode', expected: 1 }],
      [{ client: 'emacs', expected: '{}' }],
      [{ client: 'vscode', expected: '{}', path: '/etc/passwd' }],
      [{ client: 'vscode', expected: 'x'.repeat(70_000) }],
      ['vscode', '{}'],
    ])
      expect(handlers[WRITE]!.accepts(bad)).toBe(false);
    expect(handlers[SELF_CHECK]!.accepts([])).toBe(true);
    expect(handlers[SELF_CHECK]!.accepts(['/some/folder'])).toBe(false);
  });

  it('compute the config path in the main process from the window folder and the client, never from the window', async () => {
    const folder = await scratch();
    const { handlers } = handlersFor(folder);
    const preview = (await handlers[PREVIEW]!.run({ ownerId: 7 }, ['cursor'])) as { ok: true; path: string; text: string };
    expect(preview.path).toBe(join(folder, '.cursor', 'mcp.json'));
    expect(JSON.parse(preview.text).mcpServers.zplc.args).toEqual(['--workspace', folder, '--user-data', '/user/data']);
    // a window with no project folder has nothing to connect
    await expect(handlers[PREVIEW]!.run({ ownerId: 8 }, ['cursor'])).rejects.toThrow();
  });

  it('write only the text that was previewed, and answer a refusal as a message when the file is not valid', async () => {
    const folder = await scratch();
    const { handlers } = handlersFor(folder);
    const preview = (await handlers[PREVIEW]!.run({ ownerId: 7 }, ['claude-code'])) as { text: string };
    expect(await handlers[WRITE]!.run({ ownerId: 7 }, [{ client: 'claude-code', expected: '{}' }])).toMatchObject({ ok: false });
    expect(await handlers[WRITE]!.run({ ownerId: 7 }, [{ client: 'claude-code', expected: preview.text }])).toMatchObject({
      ok: true,
      path: join(folder, '.mcp.json'),
      backup: null,
    });
    expect(await readFile(join(folder, '.mcp.json'), 'utf8')).toBe(preview.text);
    await writeFile(join(folder, '.mcp.json'), '{ broken');
    const refused = (await handlers[PREVIEW]!.run({ ownerId: 7 }, ['claude-code'])) as { ok: boolean; message: string };
    expect(refused.ok).toBe(false);
    expect(refused.message).toContain('not valid JSON');
    expect(await readFile(join(folder, '.mcp.json'), 'utf8')).toBe('{ broken');
  });

  it('run the self-check of the open folder only, through the allow-list, and say what it answered', async () => {
    const folder = await scratch();
    const report = JSON.stringify({ ready: false, problems: [{ cause: 'c', nextStep: 'n' }] });
    const { handlers, asked } = handlersFor(folder, async () => ({ code: 1, stdout: report }));
    expect(await handlers[SELF_CHECK]!.run({ ownerId: 7 }, [])).toEqual({ ok: true, ready: false, report: JSON.parse(report) });
    expect(asked).toEqual([{ command: 'zplc-mcp', workspace: folder, userData: '/user/data' }]);
    const broken = handlersFor(folder, async () => ({ code: 2, stdout: 'not json' }));
    expect(await broken.handlers[SELF_CHECK]!.run({ ownerId: 7 }, [])).toMatchObject({ ok: false });
  });

  it('start the self-check as a literal vector of the allow-list: the server, the folders and --self-check, no shell, no device', () => {
    expect(spawnVector({ kind: 'mcp-self-check', command: 'zplc-mcp', workspace: '/p', userData: '/u' })).toEqual({
      command: 'zplc-mcp',
      args: ['--workspace', '/p', '--user-data', '/u', '--self-check'],
    });
    expect(spawnVector({ kind: 'mcp-self-check', command: '/opt/zplc-mcp', workspace: '/p' }).args).toEqual([
      '--workspace',
      '/p',
      '--self-check',
    ]);
    expect(() => spawnVector({ kind: 'mcp-self-check', command: 'zplc-mcp --x', workspace: '/p' })).toThrow('Refused to spawn');
  });
});
