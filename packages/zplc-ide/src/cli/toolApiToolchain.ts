// The local firmware-build prerequisites, the board list and the firmware build of the Tool API (IDE-014: split out of toolApi.ts).
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawnAllowed, type SpawnEntry, type ToolchainProbe } from '../../electron/spawnAllowList';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { load } from 'js-yaml';
import { supportLevelFromFiles } from '../boards/supportLevel';
import { directoryIdentity, runFirmwareBuild, sameDirectoryIdentity } from './firmwareBuildRunner';
import { type ToolDiagnostic } from './workspace';
import { evidence, failed, type ToolArtifact, type ToolEvidence, type ToolResult } from './toolEvidence';

const TOOLCHAIN_FILE_MAX_BYTES = 128 * 1024;
const TOOLCHAIN_COMMAND_OUTPUT_MAX_BYTES = 4096;
const TOOLCHAIN_COMMAND_TIMEOUT_MS = 3000;

export type ToolchainCheckStatus = 'ready' | 'missing' | 'invalid' | 'malformed' | 'timeout' | 'unavailable';
export interface ToolchainCheck {
  id: 'repository-manifest' | 'west' | 'python3' | 'cmake' | 'ninja' | 'zephyr-base' | 'zephyr-sdk' | 'arm-toolchain' | 'xtensa-toolchain';
  status: ToolchainCheckStatus;
  version?: string;
  requiredRevision?: string;
  observedRevision?: string;
}
export interface ToolchainSummary {
  scope: 'local-firmware-build-prerequisites';
  ready: boolean;
  checks: ToolchainCheck[];
  boards: Array<{ ideId: string; zephyrBoard: string; validationLevel: string }>;
}
export interface ToolchainInspectResult { ok: boolean; summary: ToolchainSummary; evidence: ToolEvidence; }
export interface BoardsListSummary { boards: Array<{ boardId: string; ideId: string; zephyrBoard: string; validationLevel: 'cross-build' | 'human-hil' }>; }
export type BoardsListResult = ToolResult<BoardsListSummary>;
export interface FirmwareBuildPlan {
  schemaVersion: 1;
  board: { boardId: string; ideId: string; zephyrBoard: string; validationLevel: 'cross-build' | 'human-hil' };
  applicationPath: 'firmware/app';
  expectedArtifacts: Array<{ role: 'cross-build-evidence'; relativePath: 'zephyr/zephyr.elf'; required: true }>;
}
export interface FirmwareBuildSummary {
  schemaVersion: 1;
  scope: 'local-ephemeral-cross-build';
  sourceIdentity: 'unverified';
  board: FirmwareBuildPlan['board'];
  artifact: ToolArtifact & { kind: 'firmware-elf' };
  output: { stdoutBytes: number; stderrBytes: number; truncated: boolean };
}


type ToolchainCheckId = ToolchainCheck['id'];
type BoardSummary = ToolchainSummary['boards'][number];
type ParsedBoard = BoardSummary & { boardId: string; validationLevel: FirmwareBuildPlan['board']['validationLevel'] };
const TOOLCHAIN_CHECK_IDS: ToolchainCheckId[] = ['repository-manifest', 'west', 'python3', 'cmake', 'ninja', 'zephyr-base', 'zephyr-sdk', 'arm-toolchain', 'xtensa-toolchain'];

function toolchainDiagnostic(code: string): ToolDiagnostic { return { code, message: 'Toolchain prerequisite is unavailable' }; }
function toolchainResult(checks: ToolchainCheck[], boards: BoardSummary[], diagnostics: ToolDiagnostic[]): ToolchainInspectResult {
  const ready = diagnostics.length === 0 && checks.every((check) => check.status === 'ready');
  return { ok: ready, summary: { scope: 'local-firmware-build-prerequisites', ready, checks, boards }, evidence: evidence('toolchain-inspect', ready ? 'passed' : 'failed', diagnostics) };
}
function emptyToolchainChecks(): ToolchainCheck[] { return TOOLCHAIN_CHECK_IDS.map((id) => ({ id, status: 'invalid' })); }
function replaceCheck(checks: ToolchainCheck[], check: ToolchainCheck): void { checks[TOOLCHAIN_CHECK_IDS.indexOf(check.id)] = check; }
function pathInside(root: string, candidate: string): boolean {
  const value = relative(root, candidate);
  return !isAbsolute(value) && value !== '..' && !value.startsWith(`..${sep}`);
}
function samePath(left: string, right: string): boolean { return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right; }
async function realDirectory(path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  try {
    const status = await lstat(path);
    if (status.isSymbolicLink() || !status.isDirectory()) return undefined;
    const canonical = await realpath(path);
    const canonicalStatus = await lstat(canonical);
    return !canonicalStatus.isSymbolicLink() && canonicalStatus.isDirectory() ? canonical : undefined;
  } catch { return undefined; }
}
async function containedFile(root: string, relativePath: string, maxBytes?: number): Promise<{ ok: true; path: string; text?: string } | { ok: false; status: ToolchainCheckStatus }> {
  if (isAbsolute(relativePath)) return { ok: false, status: 'invalid' };
  const candidate = resolve(root, relativePath);
  if (!pathInside(root, candidate)) return { ok: false, status: 'invalid' };
  const parts = relative(root, candidate).split(sep);
  let current = root;
  try {
    for (let index = 0; index < parts.length; index += 1) {
      current = join(current, parts[index]!);
      const status = await lstat(current);
      if (status.isSymbolicLink()) return { ok: false, status: 'invalid' };
      if (index < parts.length - 1 && !status.isDirectory()) return { ok: false, status: 'invalid' };
      if (index === parts.length - 1 && !status.isFile()) return { ok: false, status: 'invalid' };
      if (index === parts.length - 1 && maxBytes !== undefined && status.size > maxBytes) return { ok: false, status: 'invalid' };
    }
    const canonical = await realpath(candidate);
    if (!pathInside(root, canonical) || !samePath(canonical, candidate)) return { ok: false, status: 'invalid' };
    if (maxBytes === undefined) return { ok: true, path: canonical };
    const text = await readFile(canonical, 'utf8');
    return Buffer.byteLength(text) > maxBytes ? { ok: false, status: 'invalid' } : { ok: true, path: canonical, text };
  } catch { return { ok: false, status: 'missing' }; }
}
async function sdkToolchain(sdk: string | undefined, relativePath: string): Promise<boolean> {
  if (!sdk) return false;
  const candidate = resolve(sdk, relativePath);
  if (!pathInside(sdk, candidate)) return false;
  try {
    const status = await lstat(candidate);
    if (status.isSymbolicLink() || !status.isFile()) return false;
    return pathInside(sdk, await realpath(candidate));
  } catch { return false; }
}
function versionFrom(output: string): string | undefined { return output.match(/\b\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?\b/)?.[0]; }
async function inspectCommand(entry: SpawnEntry, cwd: string, revision = false): Promise<{ status: ToolchainCheckStatus; version?: string; observedRevision?: string }> {
  return new Promise((resolve) => {
    let settled = false; let output = ''; let exceeded = false;
    // The command and its arguments come from the allow-list of spawnAllowList.ts, never from a value of this file (IDE-017).
    const child = spawnAllowed(entry, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }) as ChildProcessWithoutNullStreams;
    const settle = (value: { status: ToolchainCheckStatus; version?: string; observedRevision?: string }) => { if (!settled) { settled = true; clearTimeout(timeout); resolve(value); } };
    const append = (chunk: Buffer) => {
      if (exceeded) return;
      const remaining = TOOLCHAIN_COMMAND_OUTPUT_MAX_BYTES - Buffer.byteLength(output);
      if (remaining <= 0 || chunk.byteLength > remaining) { exceeded = true; child.kill('SIGKILL'); return; }
      output += chunk.toString('utf8');
    };
    child.stdout.on('data', append); child.stderr.on('data', append);
    const timeout = setTimeout(() => { child.kill('SIGKILL'); settle({ status: 'timeout' }); }, TOOLCHAIN_COMMAND_TIMEOUT_MS);
    child.once('error', () => settle({ status: 'missing' }));
    child.once('close', (code) => {
      if (settled) return;
      if (exceeded || code !== 0) return settle({ status: 'unavailable' });
      if (revision) {
        const observedRevision = output.trim().match(/^[a-f0-9]{40}$/i)?.[0]?.toLowerCase();
        return settle(observedRevision ? { status: 'ready', observedRevision } : { status: 'malformed' });
      }
      const version = versionFrom(output);
      settle(version ? { status: 'ready', version } : { status: 'malformed' });
    });
  });
}
function parseWestRevision(text: string): string | undefined {
  try {
    const manifest = load(text) as { manifest?: { projects?: Array<{ name?: unknown; revision?: unknown }> } };
    const zephyr = manifest.manifest?.projects?.filter((project) => project.name === 'zephyr') ?? [];
    return zephyr.length === 1 && typeof zephyr[0]?.revision === 'string' && /^[a-f0-9]{40}$/i.test(zephyr[0].revision) ? zephyr[0].revision.toLowerCase() : undefined;
  } catch { return undefined; }
}
async function parseBoards(root: string, text: string): Promise<ParsedBoard[] | undefined> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return undefined; }
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) return undefined;
  const boards: ParsedBoard[] = []; const boardIds = new Set<string>(); const ideIds = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return undefined;
    const board = item as Record<string, unknown>;
    const required = ['board_id', 'display_name', 'ide_id', 'zephyr_board', 'variant', 'build_command', 'network_class', 'docs_ref'];
    const validString = (value: unknown, max = 256) => typeof value === 'string' && value.length > 0 && value.length <= max && [...value].every((character) => character >= ' ' && character !== '\x7f');
    if (required.some((field) => !validString(board[field])) || Object.hasOwn(board, 'validation_level')) return undefined;
    const boardId = board.board_id as string; const ideId = board.ide_id as string; const zephyrBoard = board.zephyr_board as string;
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(boardId) || !/^[a-z0-9][a-z0-9_]{0,63}$/.test(ideId) || !/^[a-z0-9][a-z0-9_/-]{0,127}$/.test(zephyrBoard) || boardIds.has(boardId) || ideIds.has(ideId) || !['serial-focused', 'network-capable', 'other'].includes(board.network_class as string)) return undefined;
    if (!Array.isArray(board.support_assets) || board.support_assets.length === 0 || board.support_assets.length > 16 || !board.support_assets.every((asset): asset is string => validString(asset) && /^firmware\/app\/boards\/[a-z0-9][a-z0-9_-]{0,127}\.(conf|overlay)$/.test(asset))) return undefined;
    if (!Array.isArray(board.evidence_refs) || board.evidence_refs.length > 16 || !board.evidence_refs.every((ref): ref is string => validString(ref))) return undefined;
    for (const asset of board.support_assets) if (!(await containedFile(root, asset)).ok) return undefined;
    const validationLevel = await supportLevelFromFiles(boardId, board.evidence_refs, async (ref) => { const file = await containedFile(root, ref, TOOLCHAIN_FILE_MAX_BYTES); return file.ok ? file.text : undefined; });
    boardIds.add(boardId); ideIds.add(ideId); boards.push({ boardId, ideId, zephyrBoard, validationLevel });
  }
  return boards.sort((left, right) => left.ideId.localeCompare(right.ideId));
}

/** Lists the declared board profiles without probing a toolchain or a device. */
export async function boardsList(repositoryRoot: string): Promise<BoardsListResult> {
  const root = await realDirectory(repositoryRoot);
  if (!root) return failed('boards-list', [{ code: 'BOARDS_REPOSITORY_INVALID', message: 'Board profiles are unavailable' }]);
  const manifest = await containedFile(root, 'firmware/app/boards/boards.json', TOOLCHAIN_FILE_MAX_BYTES);
  const boards = manifest.ok && manifest.text ? await parseBoards(root, manifest.text) : undefined;
  if (!boards) return failed('boards-list', [{ code: 'BOARDS_MANIFEST_INVALID', message: 'Board profiles are unavailable' }]);
  return { ok: true, summary: { boards: boards.map(({ boardId, ideId, zephyrBoard, validationLevel }) => ({ boardId, ideId, zephyrBoard, validationLevel })) }, evidence: evidence('boards-list', 'passed') };
}

function firmwareBuildPlanFailure(): ToolResult<FirmwareBuildPlan> {
  return failed('firmware-build-plan', [{ code: 'FIRMWARE_BUILD_PLAN_UNAVAILABLE', message: 'Firmware build plan is unavailable' }]);
}

/** Static local cross-build expectation only. It does not inspect toolchains or execute a build. */
export async function firmwareBuildPlan(repositoryRoot: string, ideId: string): Promise<ToolResult<FirmwareBuildPlan>> {
  const root = await realDirectory(repositoryRoot);
  if (!root || typeof ideId !== 'string') return firmwareBuildPlanFailure();
  const [appCmake, boardManifest] = await Promise.all([
    containedFile(root, 'firmware/app/CMakeLists.txt', TOOLCHAIN_FILE_MAX_BYTES),
    containedFile(root, 'firmware/app/boards/boards.json', TOOLCHAIN_FILE_MAX_BYTES),
  ]);
  if (!appCmake.ok || !boardManifest.ok) return firmwareBuildPlanFailure();
  const board = (await parseBoards(root, boardManifest.text!))?.find((candidate) => candidate.ideId === ideId);
  if (!board) return firmwareBuildPlanFailure();
  return {
    ok: true,
    summary: {
      schemaVersion: 1,
      board: { boardId: board.boardId, ideId: board.ideId, zephyrBoard: board.zephyrBoard, validationLevel: board.validationLevel },
      applicationPath: 'firmware/app',
      expectedArtifacts: [{ role: 'cross-build-evidence', relativePath: 'zephyr/zephyr.elf', required: true }],
    },
    evidence: evidence('firmware-build-plan', 'passed'),
  };
}

function firmwareBuildFailure(code: string): ToolResult<FirmwareBuildSummary> {
  return failed('firmware-build', [{ code, message: 'Firmware build is unavailable' }]);
}

function inspectedBoardMatchesPlan(inspected: ToolchainInspectResult, board: FirmwareBuildPlan['board']): boolean {
  const matches = inspected.summary.boards.filter((candidate) => candidate.ideId === board.ideId);
  return matches.length === 1
    && matches[0]!.zephyrBoard === board.zephyrBoard
    && matches[0]!.validationLevel === board.validationLevel;
}

/** Runs a local POSIX west cross-build; it neither flashes nor qualifies hardware. */
export async function firmwareBuild(repositoryRoot: string, ideId: string, options?: { signal?: AbortSignal }): Promise<ToolResult<FirmwareBuildSummary>> {
  const root = await directoryIdentity(repositoryRoot);
  if (!root) return firmwareBuildFailure('FIRMWARE_BUILD_UNAVAILABLE');
  const admitted = await firmwareBuildPlan(root.path, ideId);
  if (!admitted.ok) return firmwareBuildFailure('FIRMWARE_BUILD_UNAVAILABLE');
  if (options?.signal?.aborted) return firmwareBuildFailure('FIRMWARE_BUILD_CANCELLED');
  let inspected: ToolchainInspectResult;
  try { inspected = await toolchainInspect(root.path); }
  catch { return firmwareBuildFailure('FIRMWARE_BUILD_TOOLCHAIN_UNAVAILABLE'); }
  if (options?.signal?.aborted) return firmwareBuildFailure('FIRMWARE_BUILD_CANCELLED');
  if (!inspected.ok || !inspected.summary.ready || !inspectedBoardMatchesPlan(inspected, admitted.summary.board)) return firmwareBuildFailure('FIRMWARE_BUILD_TOOLCHAIN_UNAVAILABLE');
  const run = await runFirmwareBuild(root.path, admitted.summary.board.zephyrBoard, options);
  if (!run.ok) return firmwareBuildFailure(`FIRMWARE_BUILD_${run.failure.replace(/-/g, '_').toUpperCase()}`);
  const currentRoot = await directoryIdentity(root.path); const revalidated = sameDirectoryIdentity(root, currentRoot) ? await firmwareBuildPlan(root.path, ideId) : undefined;
  if (!revalidated?.ok || JSON.stringify(revalidated.summary) !== JSON.stringify(admitted.summary)) return firmwareBuildFailure('FIRMWARE_BUILD_PLAN_STALE');
  const artifact: ToolArtifact & { kind: 'firmware-elf' } = { kind: 'firmware-elf', ...run.artifact };
  return { ok: true, summary: { schemaVersion: 1, scope: 'local-ephemeral-cross-build', sourceIdentity: 'unverified', board: admitted.summary.board, artifact, output: run.output }, evidence: evidence('firmware-build', 'passed', [], [artifact]) };
}

/** Read-only local firmware-build prerequisite inspection. It does not build, connect, or qualify a target. */
export async function toolchainInspect(repositoryRoot: string): Promise<ToolchainInspectResult> {
  const checks = emptyToolchainChecks(); const diagnostics: ToolDiagnostic[] = []; let boards: BoardSummary[] = [];
  const root = await realDirectory(repositoryRoot);
  if (!root) return toolchainResult(checks, boards, [toolchainDiagnostic('TOOLCHAIN_REPOSITORY_INVALID')]);
  const [appCmake, boardManifest, westManifest] = await Promise.all([
    containedFile(root, 'firmware/app/CMakeLists.txt', TOOLCHAIN_FILE_MAX_BYTES),
    containedFile(root, 'firmware/app/boards/boards.json', TOOLCHAIN_FILE_MAX_BYTES),
    containedFile(root, 'west.yml', TOOLCHAIN_FILE_MAX_BYTES),
  ]);
  const requiredRevision = westManifest.ok && westManifest.text ? parseWestRevision(westManifest.text) : undefined;
  if (!appCmake.ok || !boardManifest.ok || !requiredRevision) {
    replaceCheck(checks, { id: 'repository-manifest', status: !appCmake.ok ? appCmake.status : !boardManifest.ok ? boardManifest.status : 'malformed' });
    diagnostics.push(toolchainDiagnostic('TOOLCHAIN_REPOSITORY_MANIFEST_INVALID'));
  } else {
    const parsedBoards = await parseBoards(root, boardManifest.text!);
    if (!parsedBoards) { replaceCheck(checks, { id: 'repository-manifest', status: 'malformed' }); diagnostics.push(toolchainDiagnostic('TOOLCHAIN_BOARDS_MALFORMED')); }
    else { boards = parsedBoards.map(({ ideId, zephyrBoard, validationLevel }) => ({ ideId, zephyrBoard, validationLevel })); replaceCheck(checks, { id: 'repository-manifest', status: 'ready' }); }
  }
  for (const probe of ['west', 'cmake', 'ninja'] as const) {
    const id = probe;
    const observed = await inspectCommand({ kind: 'toolchain-probe', probe }, root);
    replaceCheck(checks, { id, ...observed });
    if (observed.status !== 'ready') diagnostics.push(toolchainDiagnostic(`TOOLCHAIN_${id.toUpperCase()}_${observed.status.toUpperCase()}`));
  }
  const pythonProbes: ToolchainProbe[] = process.platform === 'win32' ? ['python-launcher', 'python'] : ['python3'];
  let python = await inspectCommand({ kind: 'toolchain-probe', probe: pythonProbes[0]! }, root);
  if (process.platform === 'win32' && python.status !== 'ready') python = await inspectCommand({ kind: 'toolchain-probe', probe: pythonProbes[1]! }, root);
  replaceCheck(checks, { id: 'python3', ...python });
  if (python.status !== 'ready') diagnostics.push(toolchainDiagnostic(`TOOLCHAIN_PYTHON3_${python.status.toUpperCase()}`));
  const zephyrBase = await realDirectory(process.env.ZEPHYR_BASE);
  const revision = zephyrBase && requiredRevision ? await inspectCommand({ kind: 'zephyr-revision', zephyrBase }, root, true) : undefined;
  const zephyrStatus: ToolchainCheckStatus = !zephyrBase ? process.env.ZEPHYR_BASE ? 'invalid' : 'missing' : !requiredRevision ? 'invalid' : revision?.status !== 'ready' ? revision?.status ?? 'unavailable' : revision.observedRevision === requiredRevision ? 'ready' : 'invalid';
  replaceCheck(checks, { id: 'zephyr-base', status: zephyrStatus, ...(requiredRevision ? { requiredRevision } : {}), ...(revision?.observedRevision ? { observedRevision: revision.observedRevision } : {}) });
  if (zephyrStatus !== 'ready') diagnostics.push(toolchainDiagnostic('TOOLCHAIN_ZEPHYR_BASE_INVALID'));
  const sdk = await realDirectory(process.env.ZEPHYR_SDK_INSTALL_DIR);
  replaceCheck(checks, { id: 'zephyr-sdk', status: sdk ? 'ready' : process.env.ZEPHYR_SDK_INSTALL_DIR ? 'invalid' : 'missing' });
  if (!sdk) diagnostics.push(toolchainDiagnostic('TOOLCHAIN_ZEPHYR_SDK_INVALID'));
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const armReady = await sdkToolchain(sdk, `arm-zephyr-eabi/bin/arm-zephyr-eabi-gcc${suffix}`);
  const xtensaReady = await sdkToolchain(sdk, `xtensa-espressif_esp32s3_zephyr-elf/bin/xtensa-espressif_esp32s3_zephyr-elf-gcc${suffix}`);
  replaceCheck(checks, { id: 'arm-toolchain', status: armReady ? 'ready' : 'missing' });
  replaceCheck(checks, { id: 'xtensa-toolchain', status: xtensaReady ? 'ready' : 'missing' });
  if (!armReady) diagnostics.push(toolchainDiagnostic('TOOLCHAIN_ARM_MISSING'));
  if (!xtensaReady) diagnostics.push(toolchainDiagnostic('TOOLCHAIN_XTENSA_MISSING'));
  return toolchainResult(checks, boards, diagnostics);
}
