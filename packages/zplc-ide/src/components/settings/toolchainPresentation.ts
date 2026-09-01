const CHECK_IDS = [
  'repository-manifest', 'west', 'python3', 'cmake', 'ninja',
  'zephyr-base', 'zephyr-sdk', 'arm-toolchain', 'xtensa-toolchain',
] as const;

type CheckId = typeof CHECK_IDS[number];
type CheckStatus = 'ready' | 'missing' | 'invalid' | 'malformed' | 'timeout' | 'unavailable';

export interface ToolchainCheckPresentation {
  id: CheckId;
  label: string;
  status: CheckStatus;
  version?: string;
  remediation: string;
}

export interface ToolchainPresentation {
  kind: 'ready' | 'attention' | 'unavailable';
  message: 'Ready for local build' | 'Needs attention' | 'Unavailable in this app';
  checks: ToolchainCheckPresentation[];
  boardIdeIds: string[];
}

export type FirmwareBuildPresentation =
  | { kind: 'success'; ideId: string; sha256: string; byteLength: number }
  | { kind: 'cancelled' | 'cleanup-unconfirmed' | 'failed' };

const CHECK_DETAILS: Record<CheckId, { label: string; remediation: string }> = {
  'repository-manifest': { label: 'ZPLC checkout', remediation: 'Choose a ZPLC checkout with west.yml and firmware board profiles.' },
  west: { label: 'west', remediation: 'Install west, then check the checkout again.' },
  python3: { label: 'Python 3', remediation: 'Install Python 3, then check the checkout again.' },
  cmake: { label: 'CMake', remediation: 'Install CMake, then check the checkout again.' },
  ninja: { label: 'Ninja', remediation: 'Install Ninja, then check the checkout again.' },
  'zephyr-base': { label: 'Zephyr base', remediation: 'Activate the pinned Zephyr workspace for this checkout.' },
  'zephyr-sdk': { label: 'Zephyr SDK', remediation: 'Install or configure the Zephyr SDK for this checkout.' },
  'arm-toolchain': { label: 'ARM toolchain', remediation: 'Install the ARM toolchain from the configured Zephyr SDK.' },
  'xtensa-toolchain': { label: 'Xtensa ESP32-S3 toolchain', remediation: 'Install the Xtensa toolchain from the configured Zephyr SDK.' },
};

const CHECK_STATUSES = new Set<CheckStatus>(['ready', 'missing', 'invalid', 'malformed', 'timeout', 'unavailable']);
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const SHA40 = /^[a-f0-9]{40}$/;
const TOOLCHAIN_DIAGNOSTIC = /^TOOLCHAIN_[A-Z0-9_]{1,63}$/;
const TOOLCHAIN_MESSAGE = 'Toolchain prerequisite is unavailable';
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validStudioExecution(value: unknown, operation: 'toolchain-inspect' | 'firmware-build', permission: 'toolchain:inspect' | 'firmware:build', outcome: 'passed' | 'failed' | 'cancelled'): boolean {
  if (!record(value) || !hasExactKeys(value, ['schemaVersion', 'jobId', 'actor', 'permission', 'operation', 'outcome', 'startedAt', 'finishedAt'])) return false;
  const timestamp = (candidate: unknown): candidate is string => typeof candidate === 'string'
    && ISO_TIMESTAMP.test(candidate)
    && Number.isFinite(Date.parse(candidate))
    && new Date(candidate).toISOString() === candidate;
  const started = timestamp(value.startedAt) ? Date.parse(value.startedAt) : NaN;
  const finished = timestamp(value.finishedAt) ? Date.parse(value.finishedAt) : NaN;
  return value.schemaVersion === 1 && typeof value.jobId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.jobId)
    && value.actor === 'human-studio' && value.permission === permission && value.operation === operation && value.outcome === outcome
    && Number.isFinite(started) && Number.isFinite(finished) && finished >= started;
}

function hasResultKeys(value: Record<string, unknown>, keys: readonly string[], operation: 'toolchain-inspect' | 'firmware-build', permission: 'toolchain:inspect' | 'firmware:build', outcome: 'passed' | 'failed' | 'cancelled'): boolean {
  return hasExactKeys(value, keys) || (hasExactKeys(value, [...keys, 'execution']) && validStudioExecution(value.execution, operation, permission, outcome));
}

function isCheckId(value: unknown): value is CheckId {
  return typeof value === 'string' && (CHECK_IDS as readonly string[]).includes(value);
}

function unavailable(): ToolchainPresentation {
  return { kind: 'unavailable', message: 'Unavailable in this app', checks: [], boardIdeIds: [] };
}

function validEvidence(value: unknown, ok: boolean): boolean {
  if (!record(value) || !hasExactKeys(value, ['schemaVersion', 'operation', 'outcome', 'diagnostics', 'artifacts'])
    || value.schemaVersion !== 1
    || value.operation !== 'toolchain-inspect'
    || value.outcome !== (ok ? 'passed' : 'failed')
    || !Array.isArray(value.artifacts) || value.artifacts.length !== 0
    || !Array.isArray(value.diagnostics) || value.diagnostics.length > CHECK_IDS.length
    || (ok && value.diagnostics.length !== 0)
    || (!ok && value.diagnostics.length === 0)) return false;
  return value.diagnostics.every((diagnostic) => record(diagnostic)
    && hasExactKeys(diagnostic, ['code', 'message'])
    && typeof diagnostic.code === 'string'
    && TOOLCHAIN_DIAGNOSTIC.test(diagnostic.code)
    && diagnostic.message === TOOLCHAIN_MESSAGE);
}

function validBoards(value: unknown): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value) || (value.length !== 0 && value.length !== 6)) return false;
  const ideIds = new Set<string>();
  const zephyrBoards = new Set<string>();
  return value.every((board) => {
    if (!record(board) || !hasExactKeys(board, ['ideId', 'zephyrBoard', 'validationLevel'])
      || typeof board.ideId !== 'string'
      || typeof board.zephyrBoard !== 'string'
      || typeof board.validationLevel !== 'string'
      || !/^[a-z0-9][a-z0-9_]{0,63}$/.test(board.ideId)
      || !/^[a-z0-9][a-z0-9_/-]{0,127}$/.test(board.zephyrBoard)
      || !['cross-build', 'human-hil'].includes(board.validationLevel)
      || ideIds.has(board.ideId)
      || zephyrBoards.has(board.zephyrBoard)) return false;
    ideIds.add(board.ideId);
    zephyrBoards.add(board.zephyrBoard);
    return true;
  });
}

/** Safely reduces the untrusted desktop response to copy that is safe to render. */
export function presentToolchainInspectResult(value: unknown): ToolchainPresentation {
  if (!record(value) || !hasResultKeys(value, ['ok', 'summary', 'evidence'], 'toolchain-inspect', 'toolchain:inspect', value.ok === true ? 'passed' : 'failed') || typeof value.ok !== 'boolean' || !validEvidence(value.evidence, value.ok) || !record(value.summary)) return unavailable();
  const summary = value.summary;
  if (!hasExactKeys(summary, ['scope', 'ready', 'checks', 'boards'])
    || summary.scope !== 'local-firmware-build-prerequisites'
    || typeof summary.ready !== 'boolean'
    || !Array.isArray(summary.checks) || summary.checks.length !== CHECK_IDS.length
    || !validBoards(summary.boards)) return unavailable();

  const seen = new Set<CheckId>();
  const checks: ToolchainCheckPresentation[] = [];
  for (const candidate of summary.checks) {
    if (!record(candidate)
      || !hasOnlyKeys(candidate, ['id', 'status', 'version', 'requiredRevision', 'observedRevision'])
      || !isCheckId(candidate.id)
      || typeof candidate.status !== 'string'
      || !CHECK_STATUSES.has(candidate.status as CheckStatus)
      || seen.has(candidate.id)
      || (candidate.version !== undefined && (typeof candidate.version !== 'string' || !SAFE_VERSION.test(candidate.version)))
      || (candidate.requiredRevision !== undefined && (typeof candidate.requiredRevision !== 'string' || !SHA40.test(candidate.requiredRevision)))
      || (candidate.observedRevision !== undefined && (typeof candidate.observedRevision !== 'string' || !SHA40.test(candidate.observedRevision)))) return unavailable();
    seen.add(candidate.id);
    const detail = CHECK_DETAILS[candidate.id];
    checks.push({ id: candidate.id, label: detail.label, status: candidate.status as CheckStatus, ...(typeof candidate.version === 'string' ? { version: candidate.version } : {}), remediation: detail.remediation });
  }
  if (seen.size !== CHECK_IDS.length || CHECK_IDS.some((id) => !seen.has(id))) return unavailable();

  const allReady = checks.every((check) => check.status === 'ready');
  if (value.ok !== summary.ready || summary.ready !== allReady || (allReady && summary.boards.length !== 6)) return unavailable();
  return allReady
    ? { kind: 'ready', message: 'Ready for local build', checks, boardIdeIds: summary.boards.map((board) => board.ideId as string) }
    : { kind: 'attention', message: 'Needs attention', checks, boardIdeIds: [] };
}

const IDE_ID = /^[a-z0-9][a-z0-9_]{0,63}$/;
const ZEPHYR_BOARD = /^[a-z0-9][a-z0-9_/-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_ELF_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

function validArtifact(value: unknown): value is { kind: 'firmware-elf'; sha256: string; byteLength: number } {
  return record(value)
    && hasExactKeys(value, ['kind', 'sha256', 'byteLength'])
    && value.kind === 'firmware-elf'
    && typeof value.sha256 === 'string' && SHA256.test(value.sha256)
    && typeof value.byteLength === 'number' && Number.isSafeInteger(value.byteLength) && value.byteLength > 0 && value.byteLength <= MAX_ELF_BYTES;
}

/** Safely reduces a firmware-build result to evidence suitable for the renderer. */
export function presentFirmwareBuildResult(value: unknown): FirmwareBuildPresentation {
  if (!record(value) || typeof value.ok !== 'boolean' || !record(value.evidence)) return { kind: 'failed' };
  const evidence = value.evidence;
  if (!hasExactKeys(evidence, ['schemaVersion', 'operation', 'outcome', 'diagnostics', 'artifacts'])
    || evidence.schemaVersion !== 1 || evidence.operation !== 'firmware-build'
    || !Array.isArray(evidence.diagnostics) || !Array.isArray(evidence.artifacts)) return { kind: 'failed' };
  if (!value.ok) {
    if (!hasResultKeys(value, ['ok', 'evidence'], 'firmware-build', 'firmware:build', evidence.diagnostics.some((diagnostic) => record(diagnostic) && diagnostic.code === 'FIRMWARE_BUILD_CANCELLED') ? 'cancelled' : 'failed') || evidence.outcome !== 'failed' || evidence.artifacts.length !== 0 || evidence.diagnostics.length !== 1) return { kind: 'failed' };
    const diagnostic = evidence.diagnostics[0];
    if (!record(diagnostic) || !hasExactKeys(diagnostic, ['code', 'message']) || diagnostic.message !== 'Firmware build is unavailable' || typeof diagnostic.code !== 'string') return { kind: 'failed' };
    if (diagnostic.code === 'FIRMWARE_BUILD_CANCELLED') return { kind: 'cancelled' };
    if (diagnostic.code === 'FIRMWARE_BUILD_CLEANUP_FAILED') return { kind: 'cleanup-unconfirmed' };
    return { kind: 'failed' };
  }
  if (!hasResultKeys(value, ['ok', 'summary', 'evidence'], 'firmware-build', 'firmware:build', 'passed') || evidence.outcome !== 'passed' || evidence.diagnostics.length !== 0 || evidence.artifacts.length !== 1 || !record(value.summary)) return { kind: 'failed' };
  const summary = value.summary;
  if (!hasExactKeys(summary, ['schemaVersion', 'scope', 'sourceIdentity', 'board', 'artifact', 'output'])
    || summary.schemaVersion !== 1 || summary.scope !== 'local-ephemeral-cross-build' || summary.sourceIdentity !== 'unverified'
    || !record(summary.board) || !hasExactKeys(summary.board, ['boardId', 'ideId', 'zephyrBoard', 'validationLevel'])
    || typeof summary.board.boardId !== 'string' || typeof summary.board.ideId !== 'string' || !IDE_ID.test(summary.board.ideId)
    || typeof summary.board.zephyrBoard !== 'string' || !ZEPHYR_BOARD.test(summary.board.zephyrBoard)
    || !['cross-build', 'human-hil'].includes(summary.board.validationLevel as string)
    || !validArtifact(summary.artifact) || !validArtifact(evidence.artifacts[0])
    || JSON.stringify(summary.artifact) !== JSON.stringify(evidence.artifacts[0])
    || !record(summary.output) || !hasExactKeys(summary.output, ['stdoutBytes', 'stderrBytes', 'truncated'])
    || typeof summary.output.stdoutBytes !== 'number' || typeof summary.output.stderrBytes !== 'number'
    || !Number.isSafeInteger(summary.output.stdoutBytes) || !Number.isSafeInteger(summary.output.stderrBytes)
    || summary.output.stdoutBytes < 0 || summary.output.stderrBytes < 0
    || summary.output.stdoutBytes + summary.output.stderrBytes > MAX_OUTPUT_BYTES
    || summary.output.truncated !== false) return { kind: 'failed' };
  return { kind: 'success', ideId: summary.board.ideId, sha256: summary.artifact.sha256, byteLength: summary.artifact.byteLength };
}
