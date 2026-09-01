const NATIVE_SIMULATION_METHODS = new Set([
  'program.load',
  'execution.start',
  'execution.stop',
  'execution.pause',
  'execution.resume',
  'execution.step',
  'execution.reset',
  'status.get',
  'simulation.input.set',
  'memory.read',
  'memory.write',
  'breakpoint.add',
  'breakpoint.remove',
  'breakpoint.clear',
  'breakpoint.list',
  'force.set',
  'force.clear',
  'force.clear_all',
  'force.list',
]);

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,62}$/;
const HEX = /^[0-9A-Fa-f]+$/;
const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SCENARIO_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FIRMWARE_BUILD_ID = /^[a-z0-9][a-z0-9_]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CANDIDATE_PATH = /^src\/[^/\\\0\r\n]+\.st$/;
const AI_MODE = new Set(['ask', 'plan', 'edit', 'debug']);
const DIAGNOSTIC_CODE = /^[A-Z][A-Z0-9_]{0,95}$/;
const EVIDENCE_SCOPE = 'native-posix-host';
const EXECUTION_JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXECUTION_ACTORS = new Set(['human-studio', 'cli', 'mcp', 'agent']);
const EXECUTION_PERMISSION_BY_OPERATION = Object.freeze({
  cli: 'compiler:check', inspect: 'project:read', 'migrate-preview': 'project:read', migrate: 'project:migrate', validate: 'project:read',
  check: 'compiler:check', compile: 'compiler:check', 'symbols-list': 'compiler:check', 'safety-check': 'safety:check',
  test: 'tests:run', 'scenario-run': 'tests:run', 'change-set-review': 'tests:run', 'toolchain-inspect': 'toolchain:inspect', 'firmware-build-plan': 'firmware:build', 'firmware-build': 'firmware:build',
});
export const DEFAULT_DEVELOPMENT_RENDERER_PORT = 3000;
const DEVELOPMENT_RENDERER_PORT = /^(?:[1-9][0-9]*)$/;

/** Accepts only a canonical TCP port for the fixed localhost development renderer. */
export function parseTrustedDevelopmentRendererPort(value: string): number | null {
  if (!DEVELOPMENT_RENDERER_PORT.test(value)) return null;
  const port = Number(value);
  return Number.isSafeInteger(port) && port >= 1024 && port <= 65535 ? port : null;
}

export function trustedDevelopmentRendererUrl(port = DEFAULT_DEVELOPMENT_RENDERER_PORT): string {
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid trusted development renderer port');
  return `http://localhost:${port}/`;
}
const SAFETY_SIGNAL = /^[A-Za-z_][A-Za-z0-9_]{0,63}\.[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const SAFETY_DIAGNOSTIC_CODES = new Set([
  'SAFETY_OUTPUT_INVALID', 'SAFETY_OUTPUT_DUPLICATE', 'SAFETY_INTERLOCK_UNCOVERED', 'SAFETY_SCENARIO_INVALID', 'SAFETY_SCENARIOS_UNAVAILABLE',
  'SAFETY_UNBOUNDED_WHILE', 'SAFETY_UNBOUNDED_REPEAT',
  'WORKSPACE_INVALID', 'WORKSPACE_MISSING', 'WORKSPACE_INVALID_DIRECTORY', 'WORKSPACE_SYMLINK', 'WORKSPACE_INVALID_FILE', 'WORKSPACE_READ_FAILED', 'WORKSPACE_LIMIT', 'PROJECT_INVALID', 'PROGRAM_NOT_FOUND', 'COMPILATION_FAILED',
]);
const CANDIDATE_CONTENT_MAX_LENGTH = 256 * 1024;
const NATIVE_REQUEST_BUFFER_SIZE = 8192;
const NATIVE_REQUEST_LINE_MAX = NATIVE_REQUEST_BUFFER_SIZE - 1;

interface RendererFrame {
  url: string;
}

interface RendererContents {
  mainFrame: RendererFrame | null;
}

interface RendererEvent {
  sender: RendererContents;
  senderFrame: RendererFrame | null;
}

interface MainWindowLike {
  webContents: RendererContents;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function safeRecord(value: unknown): Record<string, unknown> | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) return null;
    const record = value as Record<string, unknown>;
    for (const key of Object.getOwnPropertyNames(record)) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    }
    return record;
  } catch { return null; }
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch { return undefined; }
}

function safeExactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  const record = safeRecord(value);
  try {
    if (!record) return null;
    const names = Object.getOwnPropertyNames(record);
    return names.length === keys.length && keys.every((key) => names.includes(key)) ? record : null;
  } catch { return null; }
}

function safeDenseArray(value: unknown, maxLength: number): unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0) return null;
    const length = Object.getOwnPropertyDescriptor(value, 'length');
    if (!length || !('value' in length) || !Number.isSafeInteger(length.value) || length.value < 0 || length.value > maxLength) return null;
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== length.value + 1 || !names.includes('length')) return null;
    const snapshot: unknown[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor)) return null;
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch { return null; }
}

function isUint16(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xFFFF;
}

function isNonZeroUint32(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 0xFFFF_FFFF;
}

function isNonEmptyHex(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length % 2 === 0
    && HEX.test(value);
}

function isHexBytes(value: unknown, maxBytes: number): value is string {
  return isNonEmptyHex(value) && value.length <= maxBytes * 2;
}

function isAddressRange(address: unknown, length: number): boolean {
  return isUint16(address) && address + length <= 0x10000;
}

function isAllowedNativeSimulationParams(
  method: string,
  params: Record<string, unknown>,
  request: Record<string, unknown>,
): boolean {
  switch (method) {
    case 'execution.start':
    case 'execution.stop':
    case 'execution.pause':
    case 'execution.resume':
    case 'execution.step':
    case 'execution.reset':
    case 'status.get':
    case 'breakpoint.clear':
    case 'breakpoint.list':
    case 'force.clear_all':
    case 'force.list':
      return hasExactKeys(params, []);
    case 'program.load':
      return hasExactKeys(params, ['bytecode_hex'])
        && isNonEmptyHex(params.bytecode_hex)
        && new TextEncoder().encode(`${JSON.stringify(request)}\n`).length <= NATIVE_REQUEST_LINE_MAX;
    case 'simulation.input.set':
      return hasExactKeys(params, ['input_id', 'active', 'program_generation'])
        && (params.input_id === 'motor.start' || params.input_id === 'motor.stop' || params.input_id === 'motor.estop')
        && typeof params.active === 'boolean'
        && isNonZeroUint32(params.program_generation);
    case 'memory.read':
      return hasExactKeys(params, ['address', 'length'])
        && Number.isInteger(params.length)
        && (params.length as number) >= 1
        && (params.length as number) <= 64
        && isAddressRange(params.address, params.length as number);
    case 'memory.write':
      return hasExactKeys(params, ['address', 'bytes_hex'])
        && isHexBytes(params.bytes_hex, 64)
        && isAddressRange(params.address, params.bytes_hex.length / 2);
    case 'force.set':
      return hasExactKeys(params, ['address', 'bytes_hex'])
        && isHexBytes(params.bytes_hex, 16)
        && isAddressRange(params.address, params.bytes_hex.length / 2);
    case 'force.clear':
      return hasExactKeys(params, ['address']) && isUint16(params.address);
    case 'breakpoint.add':
    case 'breakpoint.remove':
      return hasExactKeys(params, ['pc']) && isUint16(params.pc);
    default:
      return false;
  }
}

function documentUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

export function isExpectedRendererDocument(candidateUrl: string, expectedRendererUrl: string): boolean {
  const candidate = documentUrl(candidateUrl);
  const expected = documentUrl(expectedRendererUrl);
  return candidate !== null && candidate === expected;
}

export function isTrustedRenderer(
  event: RendererEvent,
  mainWindow: MainWindowLike | null,
  expectedRendererUrl: string,
): boolean {
  if (!mainWindow || event.sender !== mainWindow.webContents) return false;
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
  return isExpectedRendererDocument(event.senderFrame.url, expectedRendererUrl);
}

export function isAllowedNativeSimulationRequest(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  if (Object.keys(value).length !== 4) return false;
  if (!Object.hasOwn(value, 'id') || !Object.hasOwn(value, 'type')
    || !Object.hasOwn(value, 'method') || !Object.hasOwn(value, 'params')) return false;

  return typeof value.id === 'string'
    && REQUEST_ID.test(value.id)
    && value.type === 'request'
    && typeof value.method === 'string'
    && NATIVE_SIMULATION_METHODS.has(value.method)
    && isPlainObject(value.params)
    && isAllowedNativeSimulationParams(value.method, value.params, value);
}

/** Validates the opaque workspace token envelope accepted by future desktop IPC. */
export function isAllowedWorkspaceTestRequest(value: unknown): value is { workspaceId: string } {
  return isPlainObject(value)
    && hasExactKeys(value, ['workspaceId'])
    && typeof value.workspaceId === 'string'
    && WORKSPACE_ID.test(value.workspaceId);
}

/** Validates the narrow optional scenario selector without widening compile admission. */
export function isAllowedWorkspaceTestRunRequest(value: unknown): value is { workspaceId: string; scenarioId?: string } {
  if (!isPlainObject(value)
    || !Object.hasOwn(value, 'workspaceId')
    || typeof value.workspaceId !== 'string'
    || !WORKSPACE_ID.test(value.workspaceId)) return false;
  if (hasExactKeys(value, ['workspaceId'])) return true;
  return hasExactKeys(value, ['workspaceId', 'scenarioId'])
    && typeof value.scenarioId === 'string'
    && SCENARIO_ID.test(value.scenarioId);
}

/** Validates the sole, root-free firmware build request accepted from the renderer. */
export function isAllowedFirmwareBuildRequest(value: unknown): value is { ideId: string } {
  return isPlainObject(value)
    && hasExactKeys(value, ['ideId'])
    && typeof value.ideId === 'string'
    && FIRMWARE_BUILD_ID.test(value.ideId);
}

/** Validates the sole renderer request that may review, never apply, one existing ST replacement. */
export function isAllowedCandidateChangeSetReviewRequest(value: unknown): value is { workspaceId: string; edit: { path: string; content: string } } {
  const request = safeExactRecord(value, ['workspaceId', 'edit']);
  if (!request) return false;
  const workspaceId = ownValue(request, 'workspaceId');
  const edit = safeExactRecord(ownValue(request, 'edit'), ['path', 'content']);
  if (!edit) return false;
  const candidatePath = ownValue(edit, 'path');
  const content = ownValue(edit, 'content');
  return typeof workspaceId === 'string'
    && WORKSPACE_ID.test(workspaceId)
    && typeof candidatePath === 'string'
    && candidatePath.length <= 512
    && CANDIDATE_PATH.test(candidatePath)
    && typeof content === 'string'
    && content.length <= CANDIDATE_CONTENT_MAX_LENGTH;
}

function safeAiDiagnostic(value: unknown): boolean {
  const diagnostic = safeExactRecord(value, ['code']) ?? safeExactRecord(value, ['code', 'path']) ?? safeExactRecord(value, ['code', 'path', 'line']) ?? safeExactRecord(value, ['code', 'path', 'line', 'column']);
  if (!diagnostic || typeof ownValue(diagnostic, 'code') !== 'string' || !DIAGNOSTIC_CODE.test(ownValue(diagnostic, 'code') as string)) return false;
  const path = ownValue(diagnostic, 'path'); const line = ownValue(diagnostic, 'line'); const column = ownValue(diagnostic, 'column');
  return (path === undefined || Boolean(safeEvidencePath(path))) && (line === undefined || Boolean(safeEvidenceLocation(line))) && (column === undefined || Boolean(safeEvidenceLocation(column)));
}

function safeAiTrace(value: unknown): boolean {
  const trace = safeExactRecord(value, ['atMs', 'signal', 'value']);
  if (!trace) return false;
  const atMs = ownValue(trace, 'atMs'); const signal = ownValue(trace, 'signal'); const signalValue = ownValue(trace, 'value');
  return typeof atMs === 'number' && Number.isSafeInteger(atMs) && atMs >= 0 && atMs <= 86_400_000
    && typeof signal === 'string' && /^[A-Za-z_][A-Za-z0-9_.]{0,127}$/.test(signal)
    && ((typeof signalValue === 'boolean') || (typeof signalValue === 'number' && Number.isFinite(signalValue) && Math.abs(signalValue) <= 1e12));
}

/** Rejects every renderer-controlled provider, source, filesystem, and physical-control field. */
export function isAllowedAiProviderRequest(value: unknown): value is { workspaceId: string; mode: 'ask' | 'plan' | 'edit' | 'debug'; prompt: string; activeFile?: { fileId: string; path: string }; diagnostics?: Array<{ code: string; path?: string; line?: number; column?: number }>; trace?: Array<{ atMs: number; signal: string; value: boolean | number }> } {
  const request = safeRecord(value);
  if (!request) return false;
  const keys = Object.getOwnPropertyNames(request);
  if (!keys.every((key) => ['workspaceId', 'mode', 'prompt', 'activeFile', 'diagnostics', 'trace'].includes(key))) return false;
  const workspaceId = ownValue(request, 'workspaceId'); const mode = ownValue(request, 'mode'); const prompt = ownValue(request, 'prompt');
  if (typeof workspaceId !== 'string' || !WORKSPACE_ID.test(workspaceId) || typeof mode !== 'string' || !AI_MODE.has(mode) || typeof prompt !== 'string' || prompt.length === 0 || Buffer.byteLength(prompt) > 4 * 1024) return false;
  const activeFile = ownValue(request, 'activeFile'); const diagnostics = ownValue(request, 'diagnostics'); const trace = ownValue(request, 'trace');
  if (mode === 'edit') {
    const file = safeExactRecord(activeFile, ['fileId', 'path']);
    const path = file && ownValue(file, 'path'); const fileId = file && ownValue(file, 'fileId');
    if (!file || typeof path !== 'string' || !CANDIDATE_PATH.test(path) || fileId !== `file:${path}`) return false;
  } else if (activeFile !== undefined) return false;
  const allowedDiagnostics = diagnostics === undefined ? [] : safeDenseArray(diagnostics, 32);
  const allowedTrace = trace === undefined ? [] : safeDenseArray(trace, 32);
  if (!allowedDiagnostics || !allowedTrace || !allowedDiagnostics.every(safeAiDiagnostic) || !allowedTrace.every(safeAiTrace)) return false;
  return mode === 'debug' || (diagnostics === undefined && trace === undefined);
}

export function isAllowedAiProviderConfig(value: unknown): value is { enabled: boolean; endpoint: string; model: string } {
  const config = safeExactRecord(value, ['enabled', 'endpoint', 'model']);
  return Boolean(config && typeof ownValue(config, 'enabled') === 'boolean' && typeof ownValue(config, 'endpoint') === 'string' && typeof ownValue(config, 'model') === 'string');
}

export function isAllowedAiProviderKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 16 * 1024 && !/\s/.test(value) && !Array.from(value).some((character) => { const code = character.codePointAt(0) ?? 0; return code < 0x20 || code === 0x7F; });
}

function safeSha256(value: unknown): string | undefined {
  return typeof value === 'string' && value.length === 64 && SHA256.test(value) ? value : undefined;
}

function safeByteLength(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= CANDIDATE_CONTENT_MAX_LENGTH ? value : undefined;
}

function safeArtifactByteLength(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 64 * 1024 * 1024 ? value : undefined;
}

function safeEvidencePath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || value.includes('\0') || value.startsWith('/') || value.startsWith('\\') || /^[a-zA-Z]:/.test(value)) return undefined;
  return value.split(/[\\/]/).some((part) => part === '..') ? undefined : value;
}

function safeEvidenceLocation(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 1_000_000 ? value : undefined;
}

function safeExecutionTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return undefined;
  const parsed = Date.parse(value); return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? value : undefined;
}

/** Projects metadata only. This intentionally excludes roots, request payloads, logs, values, and source text. */
export function sanitizeToolExecution(value: unknown): { schemaVersion: 1; jobId: string; actor: string; permission: string; operation: string; outcome: 'passed' | 'failed' | 'cancelled'; startedAt: string; finishedAt: string } | null {
  const execution = safeExactRecord(value, ['schemaVersion', 'jobId', 'actor', 'permission', 'operation', 'outcome', 'startedAt', 'finishedAt']);
  if (!execution || ownValue(execution, 'schemaVersion') !== 1) return null;
  const jobId = ownValue(execution, 'jobId'); const actor = ownValue(execution, 'actor'); const permission = ownValue(execution, 'permission'); const operation = ownValue(execution, 'operation'); const outcome = ownValue(execution, 'outcome');
  const startedAt = safeExecutionTimestamp(ownValue(execution, 'startedAt')); const finishedAt = safeExecutionTimestamp(ownValue(execution, 'finishedAt'));
  if (typeof jobId !== 'string' || !EXECUTION_JOB_ID.test(jobId) || typeof actor !== 'string' || !EXECUTION_ACTORS.has(actor)
    || typeof operation !== 'string' || !Object.hasOwn(EXECUTION_PERMISSION_BY_OPERATION, operation)
    || typeof permission !== 'string' || permission !== EXECUTION_PERMISSION_BY_OPERATION[operation as keyof typeof EXECUTION_PERMISSION_BY_OPERATION]
    || (outcome !== 'passed' && outcome !== 'failed' && outcome !== 'cancelled') || !startedAt || !finishedAt || Date.parse(finishedAt) < Date.parse(startedAt)) return null;
  return { schemaVersion: 1, jobId, actor, permission, operation, outcome, startedAt, finishedAt };
}

function safeCandidateDiagnostic(value: unknown): { code: string } | null {
  const diagnostic = safeRecord(value);
  const code = diagnostic && ownValue(diagnostic, 'code');
  return typeof code === 'string' && DIAGNOSTIC_CODE.test(code) ? { code } : null;
}

function safeEvidenceDiagnostic(value: unknown): { code: string; path?: string; line?: number; column?: number } | null {
  const diagnostic = safeRecord(value);
  if (!diagnostic) return null;
  const code = ownValue(diagnostic, 'code');
  if (typeof code !== 'string' || !DIAGNOSTIC_CODE.test(code)) return null;
  const path = ownValue(diagnostic, 'path'); const line = ownValue(diagnostic, 'line'); const column = ownValue(diagnostic, 'column');
  return {
    code,
    ...(safeEvidencePath(path) ? { path: safeEvidencePath(path) } : {}),
    ...(safeEvidenceLocation(line) ? { line: safeEvidenceLocation(line) } : {}),
    ...(safeEvidenceLocation(column) ? { column: safeEvidenceLocation(column) } : {}),
  };
}

function safeEvidence(value: unknown): { schemaVersion: 1; operation: 'test'; outcome: 'passed' | 'failed'; diagnostics: Array<{ code: string; path?: string; line?: number; column?: number }>; artifacts: Array<{ kind: 'zplc' | 'trace'; sha256: string; byteLength: number }> } | null {
  const evidence = safeRecord(value);
  if (!evidence || ownValue(evidence, 'schemaVersion') !== 1 || ownValue(evidence, 'operation') !== 'test') return null;
  const outcome = ownValue(evidence, 'outcome'); const diagnostics = safeDenseArray(ownValue(evidence, 'diagnostics'), 128); const artifacts = safeDenseArray(ownValue(evidence, 'artifacts'), 2);
  if ((outcome !== 'passed' && outcome !== 'failed') || !diagnostics || !artifacts || artifacts.length !== 2) return null;
  const projectedDiagnostics = diagnostics.map(safeEvidenceDiagnostic);
  if (projectedDiagnostics.some((diagnostic) => diagnostic === null)) return null;
  const projectedArtifacts = artifacts.map((item) => {
    const artifact = safeRecord(item);
    const kind = artifact && ownValue(artifact, 'kind'); const sha256 = artifact && safeSha256(ownValue(artifact, 'sha256')); const byteLength = artifact && safeArtifactByteLength(ownValue(artifact, 'byteLength'));
    return (kind === 'zplc' || kind === 'trace') && sha256 && byteLength !== undefined ? { kind, sha256, byteLength } : null;
  });
  if (projectedArtifacts.some((artifact) => artifact === null) || new Set(projectedArtifacts.map((artifact) => artifact!.kind)).size !== 2) return null;
  return { schemaVersion: 1, operation: 'test', outcome, diagnostics: projectedDiagnostics as Array<{ code: string; path?: string; line?: number; column?: number }>, artifacts: projectedArtifacts as Array<{ kind: 'zplc' | 'trace'; sha256: string; byteLength: number }> };
}

/** Removes private candidate-workspace data and derives acceptance solely from verified host evidence. */
export function sanitizeCandidateChangeSetReview(value: unknown, requestedPath: string): unknown | null {
  try {
    if (typeof requestedPath !== 'string' || requestedPath.length > 512 || !CANDIDATE_PATH.test(requestedPath)) return null;
    const result = safeRecord(value);
    if (!result || ownValue(result, 'schemaVersion') !== 1 || ownValue(result, 'evidenceScope') !== EVIDENCE_SCOPE) return null;
    const evidence = safeEvidence(ownValue(result, 'evidence'));
    const diagnosticsValue = ownValue(result, 'diagnostics');
    const diagnosticItems = diagnosticsValue === undefined ? undefined : safeDenseArray(diagnosticsValue, 32);
    if (diagnosticsValue !== undefined && !diagnosticItems) return null;
    const diagnostics = diagnosticItems?.map(safeCandidateDiagnostic);
    if (diagnostics?.some((diagnostic) => diagnostic === null)) return null;
    const changeSet = safeRecord(ownValue(result, 'changeSet'));
    const changes = changeSet && safeDenseArray(ownValue(changeSet, 'changes'), 1);
    const change = changes?.length === 1 ? safeExactRecord(changes[0], ['path', 'kind', 'before', 'after']) : null;
    const before = change && safeExactRecord(ownValue(change, 'before'), ['sha256', 'byteLength']);
    const after = change && safeExactRecord(ownValue(change, 'after'), ['sha256', 'byteLength']);
    const changeSetSha = changeSet && safeSha256(ownValue(changeSet, 'sha256'));
    const beforeSha = before && safeSha256(ownValue(before, 'sha256')); const beforeByteLength = before && safeByteLength(ownValue(before, 'byteLength'));
    const afterSha = after && safeSha256(ownValue(after, 'sha256')); const afterByteLength = after && safeByteLength(ownValue(after, 'byteLength'));
    const candidate = change && ownValue(change, 'path') === requestedPath && ownValue(change, 'kind') === 'modify' && changeSetSha && beforeSha && beforeByteLength !== undefined && afterSha && afterByteLength !== undefined
      ? { sha256: changeSetSha, changes: [{ path: requestedPath, kind: 'modify' as const, before: { sha256: beforeSha, byteLength: beforeByteLength }, after: { sha256: afterSha, byteLength: afterByteLength } }] }
      : undefined;
    const identity = safeExactRecord(ownValue(result, 'savedTestInputIdentity'), ['schemaVersion', 'sha256', 'fileCount']);
    const savedTestInputIdentity = identity && ownValue(identity, 'schemaVersion') === 1 && safeSha256(ownValue(identity, 'sha256')) && typeof ownValue(identity, 'fileCount') === 'number' && Number.isSafeInteger(ownValue(identity, 'fileCount')) && (ownValue(identity, 'fileCount') as number) >= 1 && (ownValue(identity, 'fileCount') as number) <= 4096
      ? { schemaVersion: 1 as const, sha256: ownValue(identity, 'sha256') as string, fileCount: ownValue(identity, 'fileCount') as number }
      : undefined;
    const accepted = ownValue(result, 'accepted') === true && evidence?.outcome === 'passed' && candidate !== undefined && savedTestInputIdentity !== undefined;
    if (ownValue(result, 'accepted') === true && !accepted) return null;
    return {
      schemaVersion: 1,
      accepted,
      evidenceScope: EVIDENCE_SCOPE,
      ...(candidate ? { changeSet: candidate } : {}),
      ...(diagnostics ? { diagnostics } : {}),
      ...(evidence ? { evidence } : {}),
      ...(savedTestInputIdentity ? { savedTestInputIdentity } : {}),
    };
  } catch { return null; }
}

type SafetyPair = { outputs: [string, string] };

function safeSafetyPair(value: unknown): SafetyPair | null {
  const pair = safeExactRecord(value, ['outputs']);
  const outputs = pair && safeDenseArray(ownValue(pair, 'outputs'), 2);
  if (!outputs || outputs.length !== 2 || !outputs.every((output) => typeof output === 'string' && output.length <= 128 && SAFETY_SIGNAL.test(output))) return null;
  if (outputs[0] === outputs[1]) return null;
  return { outputs: [outputs[0] as string, outputs[1] as string] };
}

function safetyPairKey(pair: SafetyPair): string { return [...pair.outputs].sort().join('\0'); }

function safeSafetyPairs(value: unknown): SafetyPair[] | null {
  const values = safeDenseArray(value, 64);
  if (!values) return null;
  const pairs = values.map(safeSafetyPair);
  if (pairs.some((pair) => pair === null)) return null;
  const keys = pairs.map((pair) => safetyPairKey(pair!));
  return new Set(keys).size === keys.length ? pairs as SafetyPair[] : null;
}

function safeSafetyDiagnostic(value: unknown): { code: string; path?: string; line?: number; column?: number } | null {
  const diagnostic = safeRecord(value);
  if (!diagnostic) return null;
  const keys = Object.getOwnPropertyNames(diagnostic);
  if (!keys.every((key) => ['code', 'path', 'line', 'column', 'message', 'phase'].includes(key))) return null;
  const code = ownValue(diagnostic, 'code');
  const rawPath = ownValue(diagnostic, 'path'); const rawLine = ownValue(diagnostic, 'line'); const rawColumn = ownValue(diagnostic, 'column');
  const path = safeEvidencePath(rawPath); const line = safeEvidenceLocation(rawLine); const column = safeEvidenceLocation(rawColumn);
  const message = ownValue(diagnostic, 'message'); const phase = ownValue(diagnostic, 'phase');
  if (typeof code !== 'string' || !SAFETY_DIAGNOSTIC_CODES.has(code)
    || (rawPath !== undefined && !path) || (rawLine !== undefined && !line) || (rawColumn !== undefined && !column)
    || (message !== undefined && (typeof message !== 'string' || message.length > 512))
    || (phase !== undefined && (typeof phase !== 'string' || phase.length > 64))) return null;
  return { code, ...(path ? { path } : {}), ...(line ? { line } : {}), ...(column ? { column } : {}) };
}

/** Projects the bounded logical interlock report; it deliberately carries no runtime or physical evidence. */
export function sanitizeWorkspaceSafetyCheck(value: unknown): unknown | null {
  try {
    const result = safeRecord(value);
    if (!result || !Object.hasOwn(result, 'ok') || !Object.hasOwn(result, 'evidence')
      || Object.getOwnPropertyNames(result).length < 2 || Object.getOwnPropertyNames(result).length > 4
      || typeof ownValue(result, 'ok') !== 'boolean') return null;
    const ok = ownValue(result, 'ok') as boolean;
    const summaryValue = ownValue(result, 'summary');
    const hasSummary = summaryValue !== undefined;
    if (!hasSummary && ok) return null;
    const executionValue = ownValue(result, 'execution'); const execution = executionValue === undefined ? undefined : sanitizeToolExecution(executionValue);
    if (executionValue !== undefined && !execution) return null;
    if (hasSummary && !safeExactRecord(result, execution ? ['ok', 'summary', 'evidence', 'execution'] : ['ok', 'summary', 'evidence'])) return null;
    if (!hasSummary && !safeExactRecord(result, execution ? ['ok', 'evidence', 'execution'] : ['ok', 'evidence'])) return null;
    const evidence = safeExactRecord(ownValue(result, 'evidence'), ['schemaVersion', 'operation', 'outcome', 'diagnostics', 'artifacts']);
    const diagnostics = evidence && safeDenseArray(ownValue(evidence, 'diagnostics'), 64);
    const artifacts = evidence && safeDenseArray(ownValue(evidence, 'artifacts'), 0);
    const outcome = evidence && ownValue(evidence, 'outcome');
    if (!evidence || ownValue(evidence, 'schemaVersion') !== 1 || ownValue(evidence, 'operation') !== 'safety-check'
      || (outcome !== 'passed' && outcome !== 'failed') || !diagnostics || !artifacts || artifacts.length !== 0) return null;
    const projectedDiagnostics = diagnostics.map(safeSafetyDiagnostic);
    if (projectedDiagnostics.some((diagnostic) => diagnostic === null)) return null;
    if (!hasSummary) return !ok && outcome === 'failed' && projectedDiagnostics.length > 0
      ? { ok: false, evidence: { schemaVersion: 1, operation: 'safety-check', outcome: 'failed', diagnostics: projectedDiagnostics, artifacts: [] }, ...(execution ? { execution } : {}) }
      : null;
    const summary = safeExactRecord(summaryValue, ['configured', 'declared', 'covered', 'uncovered']);
    const configured = summary && ownValue(summary, 'configured');
    const declared = summary && safeSafetyPairs(ownValue(summary, 'declared'));
    const covered = summary && safeSafetyPairs(ownValue(summary, 'covered'));
    const uncovered = summary && safeSafetyPairs(ownValue(summary, 'uncovered'));
    if (!summary || typeof configured !== 'boolean' || !declared || !covered || !uncovered) return null;
    const declaredKeys = new Set(declared.map(safetyPairKey));
    const coverageKeys = [...covered, ...uncovered].map(safetyPairKey);
    if (coverageKeys.length !== declared.length || new Set(coverageKeys).size !== coverageKeys.length || coverageKeys.some((key) => !declaredKeys.has(key))) return null;
    if ((!configured && (declared.length !== 0 || covered.length !== 0 || uncovered.length !== 0)) || (configured && declared.length === 0)) return null;
    const uncoveredDiagnostic = projectedDiagnostics.length === 1 && projectedDiagnostics[0]?.code === 'SAFETY_INTERLOCK_UNCOVERED' && projectedDiagnostics[0].path === undefined;
    if (ok !== (uncovered.length === 0) || (outcome === 'passed') !== ok || (ok ? projectedDiagnostics.length !== 0 : !uncoveredDiagnostic)) return null;
    return {
      ok,
      summary: { configured, declared, covered, uncovered },
      evidence: { schemaVersion: 1, operation: 'safety-check', outcome, diagnostics: projectedDiagnostics, artifacts: [] },
      ...(execution ? { execution } : {}),
    };
  } catch { return null; }
}

export function createContentSecurityPolicy(isDev: boolean, developmentRendererPort = DEFAULT_DEVELOPMENT_RENDERER_PORT): string {
  const sources = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'none'",
  ];

  if (isDev) {
    const developmentRendererUrl = trustedDevelopmentRendererUrl(developmentRendererPort);
    const developmentWebSocketUrl = developmentRendererUrl.replace(/^http:/, 'ws:').replace(/\/$/, '');
    sources[1] = "script-src 'self' 'unsafe-inline'";
    sources[6] = `connect-src 'self' ${developmentRendererUrl.slice(0, -1)} ${developmentWebSocketUrl}`;
  }

  return sources.join('; ');
}
