import { afterEach, describe, expect, it } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { resolveMcpCommand } from './mcpCommand';

// AIX-007: where zplc-mcp is, with a temporary PATH; the real PATH and home are never read.
const temporary: string[] = [];
const scratch = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zplc-mcp-bin-'));
  temporary.push(directory);
  return directory;
};
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
const binary = async (directory: string, name = 'zplc-mcp', mode = 0o755) => {
  await mkdir(directory, { recursive: true });
  const path = join(directory, name);
  await writeFile(path, '#!/bin/sh\n');
  await chmod(path, mode);
  return path;
};

describe('where the MCP server is (AIX-007)', () => {
  it('is not found when ZPLC_MCP_BIN is unset and nothing on PATH is named zplc-mcp', async () => {
    const empty = await scratch();
    expect(await resolveMcpCommand({ PATH: empty }, 'linux')).toBeNull();
    expect(await resolveMcpCommand({}, 'linux')).toBeNull();
  });

  it('is found on PATH as an absolute path, the first folder that has it', async () => {
    const first = await scratch();
    const second = await scratch();
    const wanted = await binary(second);
    await binary(first, 'zplc-mcp', 0o644); // not executable: skipped
    expect(await resolveMcpCommand({ PATH: [first, second].join(delimiter) }, 'linux')).toBe(wanted);
  });

  it('is found through ZPLC_MCP_BIN first, when it is an absolute executable file', async () => {
    const onPath = await scratch();
    await binary(onPath);
    const elsewhere = await scratch();
    const chosen = await binary(elsewhere, 'my-mcp');
    expect(await resolveMcpCommand({ ZPLC_MCP_BIN: chosen, PATH: onPath }, 'linux')).toBe(chosen);
  });

  it('does not fall back to PATH when ZPLC_MCP_BIN names something that is not an executable file, or is relative', async () => {
    const onPath = await scratch();
    await binary(onPath);
    for (const bad of [join(onPath, 'missing'), onPath, 'relative/zplc-mcp'])
      expect(await resolveMcpCommand({ ZPLC_MCP_BIN: bad, PATH: onPath }, 'linux')).toBeNull();
  });
});
