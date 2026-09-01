import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { lstat, mkdir, mkdtemp, open, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export type FirmwareBuildFailure = 'unavailable' | 'cancelled' | 'timeout' | 'output-limit' | 'failed' | 'artifact-invalid' | 'cleanup-failed';
export interface FirmwareBuildOutput { stdoutBytes: number; stderrBytes: number; truncated: boolean; }
export interface FirmwareBuildArtifact { sha256: string; byteLength: number; }
export type FirmwareBuildRunResult = { ok: true; artifact: FirmwareBuildArtifact; output: FirmwareBuildOutput } | { ok: false; failure: FirmwareBuildFailure; output: FirmwareBuildOutput };
export interface DirectoryIdentity { path: string; dev: bigint; ino: bigint; ctimeNs: bigint; }

const TIMEOUT_MS = 12 * 60 * 1000; const OUTPUT_LIMIT = 8 * 1024 * 1024; const ELF_MAX_BYTES = 64 * 1024 * 1024; const KILL_GRACE_MS = 1500;
type SpawnProcess = (command: string, args: string[], options: Parameters<typeof spawn>[2]) => ChildProcess;
export interface FirmwareBuildRunnerOptions {
  signal?: AbortSignal; platform?: NodeJS.Platform; spawnProcess?: SpawnProcess; timeoutMs?: number; outputLimit?: number; killGraceMs?: number; tempRoot?: string; remove?: typeof rm; makeTempDirectory?: (prefix: string) => Promise<string>;
  /** Test seams only; the public Tool API does not expose process control. */
  sendGroupSignal?: (pid: number | undefined, signal: NodeJS.Signals) => void;
  isGroupAlive?: (pid: number | undefined) => boolean;
  pollMs?: number;
}
function inside(root: string, candidate: string): boolean { const value = relative(root, candidate); return !isAbsolute(value) && value !== '..' && !value.startsWith(`..${sep}`); }
function output(): FirmwareBuildOutput { return { stdoutBytes: 0, stderrBytes: 0, truncated: false }; }
export async function directoryIdentity(path: string): Promise<DirectoryIdentity | undefined> {
  try { const initial = await lstat(path, { bigint: true }); if (initial.isSymbolicLink() || !initial.isDirectory()) return undefined; const canonical = await realpath(path); const status = await lstat(canonical, { bigint: true }); return !status.isSymbolicLink() && status.isDirectory() ? { path: canonical, dev: status.dev, ino: status.ino, ctimeNs: status.ctimeNs } : undefined; } catch { return undefined; }
}
export function sameDirectoryIdentity(left: DirectoryIdentity, right: DirectoryIdentity | undefined): boolean { return !!right && left.path === right.path && left.dev === right.dev && left.ino === right.ino && left.ctimeNs === right.ctimeNs; }
async function sameDirectory(identity: DirectoryIdentity): Promise<boolean> { return sameDirectoryIdentity(identity, await directoryIdentity(identity.path)); }
function executableElfHeader(bytes: Buffer): boolean {
  if (bytes.length < 16 || bytes[0] !== 0x7f || bytes.toString('ascii', 1, 4) !== 'ELF' || ![1, 2].includes(bytes[4]!) || ![1, 2].includes(bytes[5]!) || bytes[6] !== 1) return false;
  const elfClass = bytes[4]!; const littleEndian = bytes[5] === 1; const headerSize = elfClass === 1 ? 52 : 64; const headerSizeOffset = elfClass === 1 ? 40 : 52;
  if (bytes.length < headerSize) return false;
  const u16 = (offset: number) => littleEndian ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset);
  const u32 = (offset: number) => littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
  return [2, 3].includes(u16(16)) && u16(18) !== 0 && u32(20) === 1 && u16(headerSizeOffset) === headerSize && headerSize <= bytes.length;
}
async function readArtifact(root: string): Promise<FirmwareBuildArtifact | undefined> {
  const elf = resolve(root, 'zephyr/zephyr.elf'); if (!inside(root, elf)) return undefined;
  try {
    const parent = await lstat(join(root, 'zephyr')); const initial = await lstat(elf);
    if (parent.isSymbolicLink() || !parent.isDirectory() || initial.isSymbolicLink() || !initial.isFile() || initial.size <= 0 || initial.size > ELF_MAX_BYTES) return undefined;
    const canonical = await realpath(elf); if (!inside(root, canonical)) return undefined;
    const handle = await open(elf, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW));
    try {
      const before = await handle.stat(); if (!before.isFile() || before.size <= 0 || before.size > ELF_MAX_BYTES || before.dev !== initial.dev || before.ino !== initial.ino) return undefined;
      const bytes = await handle.readFile(); const after = await handle.stat(); const finalParent = await lstat(join(root, 'zephyr')); const final = await lstat(elf);
      if (bytes.length !== before.size || bytes.length > ELF_MAX_BYTES || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || finalParent.isSymbolicLink() || !finalParent.isDirectory() || final.isSymbolicLink() || final.dev !== before.dev || final.ino !== before.ino || final.size !== before.size) return undefined;
      if (!executableElfHeader(bytes)) return undefined;
      return { sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength };
    } finally { await handle.close(); }
  } catch { return undefined; }
}
function defaultSignal(pid: number | undefined, signal: NodeJS.Signals): void { if (pid) { try { process.kill(-pid, signal); } catch (error) { if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH')) return; } } }
function defaultAlive(pid: number | undefined): boolean { if (!pid) return false; try { process.kill(-pid, 0); return true; } catch (error) { return !(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH'); } }

/** POSIX-local only. A descendant calling setsid escapes its group; this is not a sandbox. */
export async function runFirmwareBuild(repositoryRoot: string, zephyrBoard: string, options: FirmwareBuildRunnerOptions = {}): Promise<FirmwareBuildRunResult> {
  const observed = output(); const platform = options.platform ?? process.platform;
  if (platform === 'win32' || options.signal?.aborted) return { ok: false, failure: platform === 'win32' ? 'unavailable' : 'cancelled', output: observed };
  const root = await directoryIdentity(repositoryRoot); if (!root) return { ok: false, failure: 'unavailable', output: observed };
  let ownedPath: string; try { ownedPath = await (options.makeTempDirectory ?? mkdtemp)(join(options.tempRoot ?? tmpdir(), 'zplc-firmware-build-')); } catch { return { ok: false, failure: 'unavailable', output: observed }; }
  const buildPath = join(ownedPath, 'build');
  try { await mkdir(buildPath); } catch { return { ok: false, failure: 'cleanup-failed', output: observed }; }
  const owned = await directoryIdentity(ownedPath); if (!owned) return { ok: false, failure: 'cleanup-failed', output: observed };
  if (options.signal?.aborted) { if (!(await sameDirectory(owned))) return { ok: false, failure: 'cleanup-failed', output: observed }; try { await (options.remove ?? rm)(owned.path, { recursive: true, force: true }); } catch { return { ok: false, failure: 'cleanup-failed', output: observed }; } return { ok: false, failure: 'cancelled', output: observed }; }
  let result: FirmwareBuildRunResult;
  try {
    result = await new Promise<FirmwareBuildRunResult>((finish) => {
      const send = options.sendGroupSignal ?? defaultSignal; const alive = options.isGroupAlive ?? defaultAlive; const limit = options.outputLimit ?? OUTPUT_LIMIT; const poll = options.pollMs ?? 10; let cause: FirmwareBuildFailure | undefined; let leaderClosed = false; let completed = false; let killTimer: ReturnType<typeof setTimeout> | undefined;
      const child = (options.spawnProcess ?? spawn)('west', ['build', '-b', zephyrBoard, 'firmware/app', '-d', buildPath, '--pristine'], { cwd: root.path, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: true });
      const stop = (why: FirmwareBuildFailure) => { if (cause || completed) return; cause = why; send(child.pid, 'SIGTERM'); killTimer = setTimeout(() => send(child.pid, 'SIGKILL'), options.killGraceMs ?? KILL_GRACE_MS); };
      const settle = async (code?: number | null) => {
        if (completed || !leaderClosed) return;
        if (alive(child.pid)) { if (!cause) stop('failed'); setTimeout(() => void settle(code), poll); return; }
        completed = true; if (killTimer) clearTimeout(killTimer); clearTimeout(timeout); options.signal?.removeEventListener('abort', abort);
        if (cause) return finish({ ok: false, failure: cause, output: observed });
        if (code !== 0) return finish({ ok: false, failure: 'failed', output: observed });
        const artifact = await readArtifact(buildPath); finish(artifact ? { ok: true, artifact, output: observed } : { ok: false, failure: 'artifact-invalid', output: observed });
      };
      const append = (key: 'stdoutBytes' | 'stderrBytes', chunk: Buffer) => { observed[key] = Math.min(Number.MAX_SAFE_INTEGER, observed[key] + chunk.byteLength); if (!cause && observed.stdoutBytes + observed.stderrBytes > limit) { observed.truncated = true; stop('output-limit'); } };
      const abort = () => stop('cancelled'); options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
      const timeout = setTimeout(() => stop('timeout'), options.timeoutMs ?? TIMEOUT_MS);
      child.stdout?.on('data', (chunk: Buffer) => append('stdoutBytes', chunk)); child.stderr?.on('data', (chunk: Buffer) => append('stderrBytes', chunk));
      child.stdout?.on('error', () => stop('failed')); child.stderr?.on('error', () => stop('failed'));
      child.once('error', () => stop('unavailable')); child.once('close', (code) => { leaderClosed = true; void settle(code); });
    });
  } catch { result = { ok: false, failure: 'unavailable', output: observed }; }
  if (!(await sameDirectory(owned))) return { ok: false, failure: 'cleanup-failed', output: observed };
  try { await (options.remove ?? rm)(owned.path, { recursive: true, force: true }); } catch { return { ok: false, failure: 'cleanup-failed', output: observed }; }
  return result;
}
