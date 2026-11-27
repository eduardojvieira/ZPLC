/**
 * The MCP config of one named client (AIX-007, AI-11): what to write, where, and the safe write of it.
 *
 * Three clients, each with a project-scoped file inside the open project's folder: Claude Code `.mcp.json`, Cursor
 * `.cursor/mcp.json`, VS Code `.vscode/mcp.json`. The entry is the local `zplc-mcp` command and the folders, never a secret. The
 * path is computed here from the client and the folder; nothing a window sends is a path. A write merges `zplc` into the file
 * that is there, keeps every other entry, keeps the previous file as `<file>.bak` and renames a finished temporary file over it.
 * A file that is not a JSON object is refused and left as it is. No Electron import (IDE-033).
 */
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, sep } from 'node:path';

export const MCP_CLIENTS = ['claude-code', 'cursor', 'vscode'] as const;
export type McpClient = (typeof MCP_CLIENTS)[number];
export const isMcpClient = (value: unknown): value is McpClient => MCP_CLIENTS.includes(value as McpClient);

export interface ClientConfigOptions {
  /** The command of the server: `zplc-mcp`, or the path of the binary. */
  command: string;
  /** The user-data folder of Studio, so lessons hide their solutions; optional. */
  userData?: string;
}

export interface ClientConfigPreview {
  /** The file the write would replace or create. */
  path: string;
  exists: boolean;
  /** The whole file after the write. */
  text: string;
  /** What "Copy command" puts on the clipboard: the `claude mcp add` line, or the entry snippet. */
  copy: string;
}

const FILES: Record<McpClient, { segments: string[]; key: 'mcpServers' | 'servers'; typed: boolean }> = {
  'claude-code': { segments: ['.mcp.json'], key: 'mcpServers', typed: true },
  cursor: { segments: ['.cursor', 'mcp.json'], key: 'mcpServers', typed: false },
  vscode: { segments: ['.vscode', 'mcp.json'], key: 'servers', typed: true },
};

const unsafe = (value: string): boolean => /["\0\r\n]/.test(value);

function check(client: McpClient, folder: string, options: ClientConfigOptions): void {
  if (!isMcpClient(client)) throw new Error('The client is not one of Claude Code, Cursor or VS Code.');
  if (!isAbsolute(folder)) throw new Error('The project folder must be an absolute path.');
  for (const value of [folder, options.command, options.userData ?? ''])
    if (unsafe(value)) throw new Error('A path or command with a quote or a line break cannot be written into a config.');
  if (options.command.length === 0) throw new Error('The command of the server is empty.');
}

/** Every folder of the client's path below the project folder is a real folder, never a link: a link could lead the write elsewhere. */
async function checkSegments(folder: string, segments: string[]): Promise<void> {
  let current = folder;
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    const info = await lstat(current).catch(() => null);
    if (info === null) return; // nothing below a missing folder exists yet; the write creates it and checks again
    if (info.isSymbolicLink())
      throw new Error(`${segment} is a link; the config is only written inside the project folder, so nothing was written.`);
    if (!info.isDirectory()) throw new Error(`${current} is not a folder; nothing was written.`);
  }
}

/** The real folder that holds the file lies inside the real project folder. */
async function checkInside(folder: string, directory: string): Promise<void> {
  const root = await realpath(folder);
  const real = await realpath(directory);
  if (real !== root && !real.startsWith(root.endsWith(sep) ? root : root + sep))
    throw new Error('The config folder is outside the project folder; nothing was written.');
}

async function readExisting(path: string): Promise<{ exists: boolean; value: Record<string, unknown> }> {
  const info = await lstat(path).catch(() => null);
  if (info === null) return { exists: false, value: {} };
  if (info.isSymbolicLink()) throw new Error(`${path} is a link; replace it with a real file first.`);
  if (!info.isFile()) throw new Error(`${path} is not a file.`);
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error(`${path} is not valid JSON (comments are not read); fix or remove it, it was not changed.`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${path} is not an object; fix or remove it, it was not changed.`);
  return { exists: true, value: value as Record<string, unknown> };
}

export async function previewClientConfig(client: McpClient, folder: string, options: ClientConfigOptions): Promise<ClientConfigPreview> {
  check(client, folder, options);
  const { segments, key, typed } = FILES[client];
  await checkSegments(folder, segments);
  const path = join(folder, ...segments);
  const args = ['--workspace', folder, ...(options.userData ? ['--user-data', options.userData] : [])];
  const entry = { ...(typed ? { type: 'stdio' } : {}), command: options.command, args };
  const { exists, value } = await readExisting(path);
  const servers = value[key] ?? {};
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers))
    throw new Error(`"${key}" in ${path} must be an object; fix or remove it, it was not changed.`);
  const text = `${JSON.stringify({ ...value, [key]: { ...servers, zplc: entry } }, null, 2)}\n`;
  const copy =
    client === 'claude-code'
      ? `claude mcp add zplc -- ${options.command} ${args.map((arg, index) => (index % 2 === 1 ? `"${arg}"` : arg)).join(' ')}`
      : JSON.stringify(entry, null, 2);
  return { path, exists, text, copy };
}

const MAX_BACKUPS = 10;
/** `<file>.bak` the first time, then `.bak.1`, `.bak.2`...: the oldest backups are kept and none is overwritten. */
async function freeBackupName(path: string): Promise<string> {
  for (let n = 0; n < MAX_BACKUPS; n++) {
    const name = n === 0 ? `${path}.bak` : `${path}.bak.${n}`;
    if (!(await lstat(name).catch(() => null))) return name;
  }
  throw new Error(`There are already ${MAX_BACKUPS} backups next to ${path}; delete the old ones (.bak, .bak.1...) and try again.`);
}

/**
 * Writes the config of a client, but only the text that the preview shows now: a file that changed since the person looked at it
 * is not overwritten. The previous file is copied to `<file>.bak`, the new one is written to a temporary file next to it and renamed.
 */
export async function writeClientConfig(
  client: McpClient,
  folder: string,
  options: ClientConfigOptions,
  expectedText: string,
): Promise<{ path: string; backup: string | null }> {
  const preview = await previewClientConfig(client, folder, options);
  if (preview.text !== expectedText) throw new Error('The config changed since it was shown; look at it again before writing.');
  const directory = dirname(preview.path);
  await mkdir(directory, { recursive: true });
  await checkInside(folder, directory);
  let backup: string | null = null;
  if (preview.exists) {
    backup = await freeBackupName(preview.path);
    await copyFile(preview.path, backup, constants.COPYFILE_EXCL);
  }
  const temporary = `${preview.path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, preview.text, { flag: 'wx' });
    await checkSegments(folder, FILES[client].segments);
    await checkInside(folder, directory);
    await rename(temporary, preview.path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return { path: preview.path, backup };
}
