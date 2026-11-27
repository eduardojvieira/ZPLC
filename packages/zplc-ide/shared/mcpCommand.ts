/**
 * Where the local MCP server `zplc-mcp` is (AIX-007): `ZPLC_MCP_BIN` when it names an absolute executable file, otherwise the
 * first folder of `PATH` that holds one named `zplc-mcp`. Answers the absolute path, or null. It only looks at files: no shell,
 * no process. When `ZPLC_MCP_BIN` is set but wrong, the answer is null rather than a quiet fall back to another binary.
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

export async function resolveMcpCommand(
  env: { ZPLC_MCP_BIN?: string | undefined; PATH?: string | undefined },
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const chosen = env.ZPLC_MCP_BIN;
  if (chosen) return isAbsolute(chosen) && (await executableFile(chosen, platform)) ? chosen : null;
  const name = platform === 'win32' ? 'zplc-mcp.exe' : 'zplc-mcp';
  for (const folder of (env.PATH ?? '').split(delimiter)) {
    if (!isAbsolute(folder)) continue;
    const candidate = join(folder, name);
    if (await executableFile(candidate, platform)) return candidate;
  }
  return null;
}
