import { afterEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MCP_CLIENTS, previewClientConfig, writeClientConfig } from './clientConfig';

// AIX-007: the config of one client, in a temporary project folder (never the real home of the person running the tests).
const temporary: string[] = [];
const scratch = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zplc-mcp-client-'));
  temporary.push(directory);
  return directory;
};
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
const options = { command: 'zplc-mcp' };

describe('the MCP config of one client (AIX-007)', () => {
  it('names the three clients, each with the file and the key of its own', async () => {
    const folder = await scratch();
    expect([...MCP_CLIENTS]).toEqual(['claude-code', 'cursor', 'vscode']);
    const claude = await previewClientConfig('claude-code', folder, options);
    const cursor = await previewClientConfig('cursor', folder, options);
    const vscode = await previewClientConfig('vscode', folder, options);
    expect(claude.path).toBe(join(folder, '.mcp.json'));
    expect(cursor.path).toBe(join(folder, '.cursor', 'mcp.json'));
    expect(vscode.path).toBe(join(folder, '.vscode', 'mcp.json'));
    expect(JSON.parse(claude.text)).toEqual({
      mcpServers: { zplc: { type: 'stdio', command: 'zplc-mcp', args: ['--workspace', folder] } },
    });
    expect(JSON.parse(cursor.text)).toEqual({ mcpServers: { zplc: { command: 'zplc-mcp', args: ['--workspace', folder] } } });
    expect(JSON.parse(vscode.text)).toEqual({
      servers: { zplc: { type: 'stdio', command: 'zplc-mcp', args: ['--workspace', folder] } },
    });
    expect(claude.exists).toBe(false);
  });

  it('carries the user-data folder when there is one, and offers the command of Claude Code or the snippet to copy', async () => {
    const folder = await scratch();
    const withUserData = { ...options, userData: '/home/a/.config/zplc' };
    const claude = await previewClientConfig('claude-code', folder, withUserData);
    expect(claude.copy).toBe(`claude mcp add zplc -- zplc-mcp --workspace "${folder}" --user-data "/home/a/.config/zplc"`);
    expect(JSON.parse(claude.text).mcpServers.zplc.args).toEqual(['--workspace', folder, '--user-data', '/home/a/.config/zplc']);
    const cursor = await previewClientConfig('cursor', folder, options);
    expect(JSON.parse(cursor.copy)).toEqual(JSON.parse(cursor.text).mcpServers.zplc);
  });

  it('never carries a secret: the entry is the command and the folders, nothing else', async () => {
    const folder = await scratch();
    for (const client of MCP_CLIENTS) {
      const { text } = await previewClientConfig(client, folder, options);
      expect(text).not.toMatch(/key|token|secret|password|env/i);
    }
  });

  it('merges into an existing file and keeps every other entry and key', async () => {
    const folder = await scratch();
    await mkdir(join(folder, '.cursor'));
    await writeFile(
      join(folder, '.cursor', 'mcp.json'),
      JSON.stringify({ theme: 'x', mcpServers: { other: { command: 'o' }, zplc: { command: 'old' } } }),
    );
    const preview = await previewClientConfig('cursor', folder, options);
    expect(preview.exists).toBe(true);
    expect(JSON.parse(preview.text)).toEqual({
      theme: 'x',
      mcpServers: { other: { command: 'o' }, zplc: { command: 'zplc-mcp', args: ['--workspace', folder] } },
    });
  });

  it('writes exactly the previewed text atomically, and keeps the previous file as a backup next to it', async () => {
    const folder = await scratch();
    const file = join(folder, '.vscode', 'mcp.json');
    const first = await previewClientConfig('vscode', folder, options);
    await writeClientConfig('vscode', folder, options, first.text);
    expect(await readFile(file, 'utf8')).toBe(first.text);
    expect(await readdir(join(folder, '.vscode'))).toEqual(['mcp.json']);

    await writeFile(file, JSON.stringify({ servers: { other: { command: 'o' } } }));
    const second = await previewClientConfig('vscode', folder, { ...options, userData: '/u' });
    await writeClientConfig('vscode', folder, { ...options, userData: '/u' }, second.text);
    expect(await readFile(file, 'utf8')).toBe(second.text);
    expect(await readFile(`${file}.bak`, 'utf8')).toBe(JSON.stringify({ servers: { other: { command: 'o' } } }));
    expect((await readdir(join(folder, '.vscode'))).sort()).toEqual(['mcp.json', 'mcp.json.bak']);
  });

  it('refuses to write text other than the one it would preview now, so a file that changed after the preview is not overwritten', async () => {
    const folder = await scratch();
    const preview = await previewClientConfig('claude-code', folder, options);
    await writeFile(join(folder, '.mcp.json'), JSON.stringify({ mcpServers: { late: { command: 'l' } } }));
    await expect(writeClientConfig('claude-code', folder, options, preview.text)).rejects.toThrow('changed since');
    expect(JSON.parse(await readFile(join(folder, '.mcp.json'), 'utf8'))).toEqual({ mcpServers: { late: { command: 'l' } } });
    await expect(writeClientConfig('claude-code', folder, options, '{}')).rejects.toThrow('changed since');
  });

  it('refuses an existing file that is not valid JSON, or not an object, with a clear message, and never overwrites it', async () => {
    const folder = await scratch();
    const file = join(folder, '.mcp.json');
    for (const bad of ['{ "mcpServers": ', '[]', '"x"', '{ "mcpServers": [] }', '// a comment\n{}']) {
      await writeFile(file, bad);
      await expect(previewClientConfig('claude-code', folder, options)).rejects.toThrow(/not valid|is not an object|must be an object/);
      await expect(writeClientConfig('claude-code', folder, options, '{}')).rejects.toThrow();
      expect(await readFile(file, 'utf8')).toBe(bad);
    }
    expect(await readdir(folder)).toEqual(['.mcp.json']);
  });

  it('refuses a config file that is a link, and a folder that is not absolute or has a quote in it', async () => {
    const folder = await scratch();
    const target = join(folder, 'elsewhere.json');
    await writeFile(target, '{}');
    await symlink(target, join(folder, '.mcp.json'));
    await expect(previewClientConfig('claude-code', folder, options)).rejects.toThrow('link');
    await expect(previewClientConfig('cursor', 'relative/folder', options)).rejects.toThrow('absolute');
    await expect(previewClientConfig('cursor', `${folder}/a"b`, options)).rejects.toThrow();
    await expect(previewClientConfig('nope' as never, folder, options)).rejects.toThrow('client');
  });
});
