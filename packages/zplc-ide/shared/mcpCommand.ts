/**
 * Where the local MCP server `zplc-mcp` is (AIX-007): `ZPLC_MCP_BIN` when it names an absolute executable file; otherwise the
 * copy the installer carries in `<resourcesPath>/zplc-mcp/` (Electron sets `process.resourcesPath`; it is the version that
 * matches this build), unless those resources do not outlive the app; otherwise the first folder of `PATH` that holds one named
 * `zplc-mcp`. Answers the absolute path, or null.
 * It only looks at files: no shell, no process. When `ZPLC_MCP_BIN` is set but wrong, the answer is null rather than a quiet fall
 * back to another binary.
 */
import { access, constants, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';

async function executableFile(path: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the app runs from resources that do not outlive it, so a path under them must not be written into a client
 * configuration: an AppImage (a new mount at each launch), the Windows portable executable (unpacked to a temporary folder that is
 * deleted on exit), and on macOS a translocated copy or one run from the mounted disk image.
 */
export function transientResources(env: Record<string, string | undefined>, platform: NodeJS.Platform, resourcesPath: string): boolean {
  if (env['APPIMAGE'] || env['PORTABLE_EXECUTABLE_DIR']) return true;
  return platform === 'darwin' && (resourcesPath.startsWith('/Volumes/') || resourcesPath.includes('/AppTranslocation/'));
}

export async function resolveMcpCommand(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform = process.platform,
  resourcesPath: string | undefined = (process as { resourcesPath?: string }).resourcesPath,
): Promise<string | null> {
  const chosen = env['ZPLC_MCP_BIN'];
  if (chosen) return isAbsolute(chosen) && (await executableFile(chosen, platform)) ? chosen : null;
  const name = platform === 'win32' ? 'zplc-mcp.exe' : 'zplc-mcp';
  if (resourcesPath && isAbsolute(resourcesPath) && !transientResources(env, platform, resourcesPath)) {
    const bundled = join(resourcesPath, 'zplc-mcp', name);
    if (await executableFile(bundled, platform)) return bundled;
  }
  for (const folder of (env['PATH'] ?? '').split(delimiter)) {
    if (!isAbsolute(folder)) continue;
    const candidate = join(folder, name);
    if (await executableFile(candidate, platform)) return candidate;
  }
  return null;
}
