import { afterEach, describe, expect, it } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { resolveMcpCommand, transientResources } from './mcpCommand';

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
    await mkdir(join(first, 'zplc-mcp')); // not a file: skipped on every host
    // the execute bit is not observable on a Windows host (X_OK always passes there), so this skip is checked only where chmod works
    const noBit = await scratch();
    if (process.platform !== 'win32') await binary(noBit, 'zplc-mcp', 0o644);
    expect(await resolveMcpCommand({ PATH: [first, noBit, second].join(delimiter) }, 'linux')).toBe(wanted);
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

  describe('the copy inside the installer', () => {
    const bundled = async (resources: string, name = 'zplc-mcp') => binary(join(resources, 'zplc-mcp'), name);

    it('is preferred over PATH in a packaged app, as an absolute path', async () => {
      const resources = await scratch();
      const onPath = await scratch();
      await binary(onPath);
      const wanted = await bundled(resources);
      expect(await resolveMcpCommand({ PATH: onPath }, 'linux', resources)).toBe(wanted);
    });

    it('looks for zplc-mcp.exe on Windows, where there is no execute bit', async () => {
      const resources = await scratch();
      const wanted = await bundled(resources, 'zplc-mcp.exe');
      expect(await resolveMcpCommand({}, 'win32', resources)).toBe(wanted);
    });

    it('lets ZPLC_MCP_BIN win, and still refuses a wrong one without falling back to the copy', async () => {
      const resources = await scratch();
      await bundled(resources);
      const chosen = await binary(await scratch(), 'my-mcp');
      expect(await resolveMcpCommand({ ZPLC_MCP_BIN: chosen }, 'linux', resources)).toBe(chosen);
      expect(await resolveMcpCommand({ ZPLC_MCP_BIN: join(resources, 'missing') }, 'linux', resources)).toBeNull();
    });

    // an AppImage mounts its resources on a new folder at each launch, the Windows portable unpacks them to a temporary folder it
    // deletes on exit, and macOS runs a quarantined or not-yet-moved app from a translocated or mounted copy: a path written there into
    // a client configuration stops existing, so the copy is not offered and PATH answers
    it.each([
      ['an AppImage', { APPIMAGE: '/home/u/zplc.AppImage' }, 'linux'],
      ['the Windows portable executable', { PORTABLE_EXECUTABLE_DIR: 'C:\\Users\\u\\Downloads' }, 'win32'],
    ] as const)('is not offered from %s, whose resources do not outlive the app', async (_name, env, platform) => {
      const resources = await scratch();
      const onPath = await scratch();
      const exe = platform === 'win32' ? 'zplc-mcp.exe' : 'zplc-mcp';
      const onPathBinary = await binary(onPath, exe);
      await bundled(resources, exe);
      expect(await resolveMcpCommand({ ...env, PATH: onPath }, platform, resources)).toBe(onPathBinary);
      expect(await resolveMcpCommand({ ...env }, platform, resources)).toBeNull();
    });

    it('is not offered from a translocated or mounted macOS app, and is offered from /Applications', () => {
      expect(transientResources({}, 'darwin', '/private/var/folders/x/AppTranslocation/ABC/d/ZPLC.app/Contents/Resources')).toBe(true);
      expect(transientResources({}, 'darwin', '/Volumes/ZPLC 2.1.0/ZPLC.app/Contents/Resources')).toBe(true);
      expect(transientResources({}, 'darwin', '/Applications/ZPLC.app/Contents/Resources')).toBe(false);
      expect(transientResources({}, 'linux', '/opt/ZPLC/resources')).toBe(false);
      expect(transientResources({}, 'win32', 'C:\\Program Files\\ZPLC\\resources')).toBe(false);
    });

    it('falls back to PATH when the copy is missing, and is not looked for outside a packaged app', async () => {
      const resources = await scratch();
      const onPath = await scratch();
      const onPathBinary = await binary(onPath);
      expect(await resolveMcpCommand({ PATH: onPath }, 'linux', resources)).toBe(onPathBinary);
      await bundled(resources);
      expect(await resolveMcpCommand({ PATH: onPath }, 'linux')).toBe(onPathBinary);
      expect(await resolveMcpCommand({}, 'linux')).toBeNull();
    });
  });
});
