import { constants, type BigIntStats } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { parseAndMigrateProject, type ProjectMigrationChange } from '../project/projectModel';
import { getLanguageFromFilename, type PLCLanguage, type ZPLCProjectV2 } from '../types';

export interface ToolDiagnostic { code: string; message: string; path?: string; phase?: 'lexer' | 'parser' | 'codegen' | 'assembler'; line?: number; column?: number; }
export interface WorkspaceSource { name: string; path: string; content: string; language: PLCLanguage; bytes: Uint8Array; }
export interface WorkspaceProject { root: string; project: ZPLCProjectV2; sourceSchemaVersion: 1 | 2; migrated: boolean; migrationChanges: ProjectMigrationChange[]; manifestBytes: Uint8Array; sources: WorkspaceSource[]; }
export interface WorkspaceScenario { path: string; input: unknown; bytes: Uint8Array; }
export type WorkspaceFailure = { ok: false; diagnostics: ToolDiagnostic[] };
export type WorkspaceResult = { ok: true; workspace: WorkspaceProject } | WorkspaceFailure;
export type WorkspaceScenarioResult = { ok: true; scenarios: WorkspaceScenario[] } | WorkspaceFailure;

const MANIFEST_MAX_BYTES = 128 * 1024;
const SOURCE_MAX_BYTES = 256 * 1024;
const SOURCES_MAX_COUNT = 128;
const SOURCES_MAX_BYTES = 2 * 1024 * 1024;
const SUPPORTED_SOURCE = /\.(st|il|ld\.json|fbd\.json|sfc\.json)$/i;
const SCENARIO_MAX_BYTES = 128 * 1024;
const SCENARIOS_MAX_COUNT = 64;
const SCENARIOS_MAX_BYTES = 512 * 1024;
const SCENARIO_FILE = /\.scenario\.json$/i;

interface FileFingerprint { dev: bigint; ino: bigint; size: bigint; ctimeNs: bigint; mtimeNs: bigint; }
interface DirectoryIdentity extends FileFingerprint { path: string; }
interface StableFile { path: string; fingerprint: FileFingerprint; }

/** @internal Test-only deterministic seam for replacing a pathname after its initial lstat. */
export const __workspaceReadTestHooks: { afterFileLstat?: (path: string) => void | Promise<void> } = {};

function failed(code: string, message: string, path?: string): WorkspaceFailure { return { ok: false, diagnostics: [{ code, message, ...(path ? { path } : {}) }] }; }
function isNotFound(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'; }
function withBytes<T extends object>(value: T, bytes: Uint8Array): T & { bytes: Uint8Array } {
  Object.defineProperty(value, 'bytes', { value: Uint8Array.from(bytes), enumerable: false });
  return value as T & { bytes: Uint8Array };
}
async function directoryIdentity(path: string): Promise<DirectoryIdentity | undefined> {
  try {
    const initial = await lstat(path, { bigint: true });
    if (initial.isSymbolicLink() || !initial.isDirectory()) return undefined;
    const canonical = await realpath(path); const status = await lstat(canonical, { bigint: true });
    return status.isSymbolicLink() || !status.isDirectory() || !sameFingerprint(initial, status) ? undefined : { path: canonical, ...fingerprint(status) };
  } catch { return undefined; }
}
async function sameDirectory(identity: DirectoryIdentity): Promise<boolean> {
  const current = await directoryIdentity(identity.path);
  return !!current && current.path === identity.path && sameFingerprint(identity, current);
}
async function sameDirectories(identities: readonly DirectoryIdentity[]): Promise<boolean> {
  for (const identity of identities) if (!(await sameDirectory(identity))) return false;
  return true;
}
function fingerprint(status: BigIntStats): FileFingerprint { return { dev: status.dev, ino: status.ino, size: status.size, ctimeNs: status.ctimeNs, mtimeNs: status.mtimeNs }; }
function sameFingerprint(left: FileFingerprint, right: FileFingerprint): boolean { return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.ctimeNs === right.ctimeNs && left.mtimeNs === right.mtimeNs; }
async function sameFiles(files: readonly StableFile[]): Promise<boolean> {
  try {
    for (const file of files) { const current = await lstat(file.path, { bigint: true }); if (current.isSymbolicLink() || !current.isFile() || !sameFingerprint(file.fingerprint, current)) return false; }
    return true;
  } catch { return false; }
}
async function readStableFile(path: string, logicalPath: string, maxBytes: number, directories: readonly DirectoryIdentity[]): Promise<{ ok: true; bytes: Uint8Array; file: StableFile } | { ok: false; result: WorkspaceFailure }> {
  try {
    if (!(await sameDirectories(directories))) return { ok: false, result: failed('WORKSPACE_READ_FAILED', 'Workspace changed while reading', logicalPath) };
    const initial = await lstat(path, { bigint: true });
    if (initial.isSymbolicLink()) return { ok: false, result: failed('WORKSPACE_SYMLINK', 'Symbolic links are not allowed', logicalPath) };
    if (!initial.isFile()) return { ok: false, result: failed('WORKSPACE_INVALID_FILE', 'Expected a regular file', logicalPath) };
    if (initial.size > BigInt(maxBytes)) return { ok: false, result: failed('WORKSPACE_LIMIT', logicalPath === 'zplc.json' ? 'Manifest exceeds the size limit' : logicalPath.startsWith('tests/') ? 'Scenario file exceeds the size limit' : 'Source file exceeds the size limit', logicalPath) };
    await __workspaceReadTestHooks.afterFileLstat?.(path);
    const handle = await open(path, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK));
    try {
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || !sameFingerprint(initial, before) || before.size > BigInt(maxBytes)) return { ok: false, result: failed('WORKSPACE_READ_FAILED', 'Workspace changed while reading', logicalPath) };
      const bytes = await handle.readFile(); const after = await handle.stat({ bigint: true }); const final = await lstat(path, { bigint: true });
      if (bytes.byteLength !== Number(before.size) || bytes.byteLength > maxBytes || !sameFingerprint(before, after) || final.isSymbolicLink() || !final.isFile() || !sameFingerprint(before, final) || !(await sameDirectories(directories))) return { ok: false, result: failed('WORKSPACE_READ_FAILED', 'Workspace changed while reading', logicalPath) };
      return { ok: true, bytes, file: { path, fingerprint: fingerprint(before) } };
    } finally { await handle.close(); }
  } catch (error) {
    return { ok: false, result: failed(isNotFound(error) ? 'WORKSPACE_MISSING' : 'WORKSPACE_READ_FAILED', 'Unable to read workspace file', logicalPath) };
  }
}

/** Reads direct JSON scenario files without interpreting their test schema. */
export async function readWorkspaceScenarios(root: string): Promise<WorkspaceScenarioResult> {
  const directory = join(root, 'tests');
  let entries: Awaited<ReturnType<typeof readdir>>;
  let testsStatus: Awaited<ReturnType<typeof lstat>>;
  try { testsStatus = await lstat(directory); }
  catch { return failed('WORKSPACE_MISSING', 'Tests directory is unavailable', 'tests'); }
  const rootIdentity = await directoryIdentity(root); const testsIdentity = await directoryIdentity(directory);
  if (!rootIdentity) return failed('WORKSPACE_MISSING', 'Workspace root is unavailable');
  if (testsStatus.isSymbolicLink() || !testsStatus.isDirectory() || !testsIdentity) return failed('WORKSPACE_INVALID_DIRECTORY', 'Tests directory must be a real directory', 'tests');
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch { return failed('WORKSPACE_MISSING', 'Tests directory is unavailable', 'tests'); }
  if (!(await sameDirectories([rootIdentity, testsIdentity]))) return failed('WORKSPACE_READ_FAILED', 'Workspace changed while reading', 'tests');

  const scenarios: WorkspaceScenario[] = [];
  const scenarioFiles: StableFile[] = [];
  const names = new Set<string>();
  let totalBytes = 0;
  for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const logicalPath = `tests/${entry.name}`;
    try { if ((await lstat(join(directory, entry.name))).isSymbolicLink()) return failed('WORKSPACE_SYMLINK', 'Symbolic links are not allowed', logicalPath); }
    catch { return failed('WORKSPACE_READ_FAILED', 'Unable to read scenario file', logicalPath); }
    if (!SCENARIO_FILE.test(entry.name)) continue;
    if (scenarios.length >= SCENARIOS_MAX_COUNT) return failed('WORKSPACE_LIMIT', 'Workspace has too many scenario files', 'tests');
    const normalizedName = entry.name.toLowerCase();
    if (names.has(normalizedName)) return failed('WORKSPACE_DUPLICATE_SCENARIO', 'Scenario filenames must be unique regardless of case', logicalPath);
    names.add(normalizedName);
    const read = await readStableFile(join(directory, entry.name), logicalPath, SCENARIO_MAX_BYTES, [rootIdentity, testsIdentity]);
    if (!read.ok) return read.result;
    const bytes = read.bytes; const actualBytes = bytes.byteLength;
    totalBytes += actualBytes;
    if (totalBytes > SCENARIOS_MAX_BYTES) return failed('WORKSPACE_LIMIT', 'Workspace scenario files exceed the size limit', 'tests');
    try { scenarios.push(withBytes({ path: logicalPath, input: JSON.parse(Buffer.from(bytes).toString('utf8')) }, bytes)); scenarioFiles.push(read.file); }
    catch { return failed('TEST_SCENARIO_INVALID', 'Scenario is not valid JSON', logicalPath); }
  }
  if (scenarios.length === 0) return failed('TEST_SCENARIOS_MISSING', 'Workspace has no scenario files', 'tests');
  if (!(await sameFiles(scenarioFiles)) || !(await sameDirectories([rootIdentity, testsIdentity]))) return failed('WORKSPACE_READ_FAILED', 'Workspace changed while reading', 'tests');
  return { ok: true, scenarios };
}

/** Reads the deliberately small local project layout without following links. */
export async function readWorkspace(rootInput: string): Promise<WorkspaceResult> {
  const rootIdentity = await directoryIdentity(rootInput);
  if (!rootIdentity) {
    try { const status = await lstat(rootInput); return failed(status.isSymbolicLink() || !status.isDirectory() ? 'WORKSPACE_INVALID' : 'WORKSPACE_MISSING', status.isSymbolicLink() || !status.isDirectory() ? 'Workspace root must be a real directory' : 'Workspace root is unavailable'); }
    catch { return failed('WORKSPACE_MISSING', 'Workspace root is unavailable'); }
  }
  const root = rootIdentity.path;
  const manifestPath = join(root, 'zplc.json');
  let rawManifest: unknown;
  const manifest = await readStableFile(manifestPath, 'zplc.json', MANIFEST_MAX_BYTES, [rootIdentity]);
  if (!manifest.ok) return manifest.result;
  const manifestBytes = manifest.bytes;
  const manifestText = Buffer.from(manifestBytes).toString('utf8');
  try { rawManifest = JSON.parse(manifestText); } catch { return failed('PROJECT_INVALID', 'Manifest is not valid JSON', 'zplc.json'); }
  const parsed = parseAndMigrateProject(rawManifest);
  if (!parsed.ok) return { ok: false, diagnostics: parsed.diagnostics.map((diagnostic) => ({ code: 'PROJECT_INVALID', message: diagnostic.message, path: diagnostic.path })) };

  const sourceDirectory = join(root, 'src');
  let entries: Awaited<ReturnType<typeof readdir>>;
  let sourceStatus: Awaited<ReturnType<typeof lstat>>;
  try { sourceStatus = await lstat(sourceDirectory); }
  catch { return failed('WORKSPACE_MISSING', 'Source directory is unavailable', 'src'); }
  const sourceIdentity = await directoryIdentity(sourceDirectory);
  if (sourceStatus.isSymbolicLink() || !sourceStatus.isDirectory() || !sourceIdentity) return failed('WORKSPACE_INVALID_DIRECTORY', 'Source directory must be a real directory', 'src');
  try {
    entries = await readdir(sourceDirectory, { withFileTypes: true });
  } catch { return failed('WORKSPACE_MISSING', 'Source directory is unavailable', 'src'); }
  if (!(await sameDirectories([rootIdentity, sourceIdentity]))) return failed('WORKSPACE_READ_FAILED', 'Workspace changed while reading', 'src');

  const sources: WorkspaceSource[] = [];
  const sourceFiles: StableFile[] = [];
  const names = new Set<string>();
  let totalBytes = 0;
  for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const logicalPath = `src/${entry.name}`;
    if (entry.isSymbolicLink()) return failed('WORKSPACE_SYMLINK', 'Symbolic links are not allowed', logicalPath);
    if (!entry.isFile() || !SUPPORTED_SOURCE.test(entry.name)) continue;
    if (sources.length >= SOURCES_MAX_COUNT) return failed('WORKSPACE_LIMIT', 'Workspace has too many source files', 'src');
    const normalizedName = entry.name.toLowerCase();
    if (names.has(normalizedName)) return failed('WORKSPACE_DUPLICATE_SOURCE', 'Source filenames must be unique regardless of case', logicalPath);
    names.add(normalizedName);
    const read = await readStableFile(join(sourceDirectory, entry.name), logicalPath, SOURCE_MAX_BYTES, [rootIdentity, sourceIdentity]);
    if (!read.ok) return read.result;
    const bytes = read.bytes; totalBytes += bytes.byteLength;
    if (totalBytes > SOURCES_MAX_BYTES) return failed('WORKSPACE_LIMIT', 'Workspace source files exceed the size limit', 'src');
    sources.push(withBytes({ name: entry.name, path: logicalPath, content: Buffer.from(bytes).toString('utf8'), language: getLanguageFromFilename(entry.name) }, bytes)); sourceFiles.push(read.file);
  }
  if (!(await sameFiles([manifest.file, ...sourceFiles])) || !(await sameDirectories([rootIdentity, sourceIdentity]))) return failed('WORKSPACE_READ_FAILED', 'Workspace changed while reading');
  const workspace: WorkspaceProject = { root, project: parsed.project, sourceSchemaVersion: parsed.sourceSchemaVersion, migrated: parsed.changed, migrationChanges: parsed.changes, manifestBytes: Uint8Array.from(manifestBytes), sources };
  Object.defineProperty(workspace, 'manifestBytes', { enumerable: false });
  return { ok: true, workspace };
}
