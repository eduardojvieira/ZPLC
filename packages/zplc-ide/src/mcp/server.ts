import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { getBoardEvidenceSummary, getBoardNetworkType, getCompilerMemoryProfile } from '../config/boardProfiles';
import * as z from 'zod/v4';
import idePackage from '../../package.json';
import { directoryIdentity, sameDirectoryIdentity, type DirectoryIdentity } from '../cli/firmwareBuildRunner';
import * as toolApi from '../cli/toolApi';

const MAX_OUTPUT_BYTES = 512 * 1024;
const LEARN_LESSON_IDS = ['motor-start-stop-safe', 'pedestrian-crossing-states', 'tank-level-fault-reset', 'conveyor-classification-jam', 'blinky-ladder-timer-feedback', 'motor-plant-feedback', 'edge-counter-pulses', 'scan-cycle-one-scan-memory', 'temporal-assertions-jam-fault', 'conveyor-two-parts-diagnosis'] as const;
const shortText = z.string().min(1).max(256);
const identifier = z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_.:-]*$/);
const EMPTY_INPUT = z.object({}).strict();
const SCENARIO_INPUT = z.object({ scenarioId: z.string().max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/) }).strict();
const REPLAY_INPUT = z.object({ scenarioId: z.string().max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/), cursor: z.number().int().min(0).max(100_000), traceSha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
const FIRMWARE_BUILD_INPUT = z.object({ ideId: z.string().max(64).regex(/^[a-z0-9][a-z0-9_]{0,63}$/) }).strict();
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const FIRMWARE_BUILD_ONLY = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

export const MCP_TOOL_NAMES = ['project_inspect', 'project_validate', 'compiler_check', 'compiler_compile', 'symbols_list', 'safety_check', 'tests_run', 'scenario_run', 'simulation_start', 'simulation_step', 'runtime_snapshot', 'trace_get', 'boards_list', 'toolchain_inspect', 'firmware_build'] as const;
export const MCP_RESOURCE_URIS = ['zplc://project/manifest', 'zplc://project/symbols', 'zplc://project/io-map', 'zplc://project/diagnostics', 'zplc://target/capabilities', 'zplc://runtime/trace', 'zplc://runtime/snapshot', 'zplc://course/progress', 'zplc://docs/evidence', 'zplc://docs/safety', 'zplc://docs/testing'] as const;
export const MCP_SERVER_VERSION = idePackage.version;
type McpToolName = typeof MCP_TOOL_NAMES[number];
type ToolArguments = Record<string, unknown>;
export interface McpOperations {
  projectInspect(root: string): Promise<unknown>; projectValidate(root: string): Promise<unknown>; compilerCheck(root: string): Promise<unknown>; compilerCompile(root: string): Promise<unknown>;
  symbolsList(root: string): Promise<unknown>; safetyCheck(root: string): Promise<unknown>; testsRun(root: string, options?: toolApi.TestsRunOptions): Promise<unknown>;
  scenarioRun(root: string, scenarioId: string, options?: toolApi.TestsRunOptions): Promise<unknown>;
  boardsList(repository: string): Promise<unknown>; toolchainInspect(repository: string): Promise<unknown>; firmwareBuild(repository: string, ideId: string, options?: { signal?: AbortSignal }): Promise<unknown>;
}
export interface McpWorkspace { readonly root: string; readonly identity: DirectoryIdentity; readonly repository?: { readonly root: string; readonly identity: DirectoryIdentity }; readonly userData?: { readonly root: string; readonly identity: DirectoryIdentity }; }
type McpToolResult = { content: Array<{ type: 'text'; text: string }>; structuredContent: Record<string, unknown>; isError?: boolean };

function errorResult(error: 'MCP_BUSY' | 'MCP_CANCELLED' | 'MCP_INVALID_ARGUMENTS' | 'MCP_INTERNAL_ERROR' | 'MCP_OUTPUT_LIMIT' | 'MCP_WORKSPACE_CHANGED' | 'MCP_CAPABILITY_UNAVAILABLE'): McpToolResult {
  const structuredContent = { ok: false, error };
  return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent, isError: true };
}

function ownValue(record: object, key: string): unknown | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function safeJson(value: unknown, depth = 0): unknown | undefined {
  try {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (depth > 32 || typeof value !== 'object' || Object.getOwnPropertySymbols(value).length > 0) return undefined;
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return undefined;
      const rawLength = ownValue(value, 'length'); if (typeof rawLength !== 'number' || !Number.isSafeInteger(rawLength) || rawLength < 0) return undefined;
      const length = rawLength; const names = Object.getOwnPropertyNames(value);
      if (names.length !== length + 1 || !names.includes('length')) return undefined;
      const output: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const key = String(index); const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return undefined;
        const safe = safeJson(descriptor.value, depth + 1); if (safe === undefined) return undefined; output.push(safe);
      }
      return output;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return undefined;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || !('value' in descriptor)) return undefined;
      const safe = safeJson(descriptor.value, depth + 1); if (safe === undefined) return undefined; output[key] = safe;
    }
    return output;
  } catch { return undefined; }
}

function logicalPath(value: string): boolean {
  if (value.length === 0 || value.length > 512 || value.includes('\0') || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  return value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}
const logicalPathSchema = z.string().max(512).refine(logicalPath);
const diagnosticSchema = z.object({ code: z.string().min(1).max(96).regex(/^[A-Z0-9_:-]+$/), message: z.string().min(1).max(512), path: logicalPathSchema.optional(), phase: z.enum(['lexer', 'parser', 'codegen', 'assembler']).optional(), line: z.number().int().optional(), column: z.number().int().optional() }).strict();
const artifactSchema = z.object({ kind: z.enum(['zplc', 'bytecode', 'trace', 'firmware-elf', 'project-manifest']), sha256: z.string().regex(/^[0-9a-f]{64}$/), byteLength: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
const evidenceSchema = z.object({ schemaVersion: z.literal(1), operation: z.string().min(1).max(64).regex(/^[a-z][a-z-]*$/), outcome: z.enum(['passed', 'failed']), diagnostics: z.array(diagnosticSchema).max(256), artifacts: z.array(artifactSchema).max(8) }).strict();
const executionSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string().uuid(),
  actor: z.literal('mcp'),
  permission: z.enum(['project:read', 'compiler:check', 'safety:check', 'tests:run', 'toolchain:inspect', 'firmware:build']),
  operation: z.string().min(1).max(64).regex(/^[a-z][a-z-]*$/),
  outcome: z.enum(['passed', 'failed', 'cancelled']),
  startedAt: z.string().datetime({ offset: false }),
  finishedAt: z.string().datetime({ offset: false }),
}).strict();
const compilerSummarySchema = z.object({ name: shortText, version: z.string().min(1).max(64), taskCount: z.number().int().nonnegative(), codeSize: z.number().int().nonnegative() }).strict();
const testSummarySchema = z.object({ backend: z.literal('native-posix'), mode: z.literal('logical-cyclic-task-set-scan'), scenarios: z.array(z.object({ id: identifier, path: logicalPathSchema.refine((path) => path.startsWith('tests/')), passed: z.boolean(), traceSha256: z.string().regex(/^[0-9a-f]{64}$/), traceByteLength: z.number().int().nonnegative() }).strict()).max(8) }).strict();
const savedInputSchema = z.object({ schemaVersion: z.literal(1), sha256: z.string().regex(/^[0-9a-f]{64}$/), fileCount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
const boardSummarySchema = z.object({ boardId: z.string().max(64).regex(/^[a-z0-9][a-z0-9-]*$/), ideId: z.string().max(64).regex(/^[a-z0-9][a-z0-9_]*$/), zephyrBoard: z.string().max(128).regex(/^[a-z0-9][a-z0-9_/-]*$/), validationLevel: z.enum(['cross-build', 'human-hil']) }).strict();
const boardsResultSchema = z.object({ ok: z.boolean(), summary: z.object({ boards: z.array(boardSummarySchema).max(16) }).strict().optional(), evidence: evidenceSchema }).strict();
const toolchainCheckSchema = z.object({ id: z.enum(['repository-manifest', 'west', 'python3', 'cmake', 'ninja', 'zephyr-base', 'zephyr-sdk', 'arm-toolchain', 'xtensa-toolchain']), status: z.enum(['ready', 'missing', 'invalid', 'malformed', 'timeout', 'unavailable']), version: z.string().max(64).optional(), requiredRevision: z.string().regex(/^[0-9a-f]{40}$/).optional(), observedRevision: z.string().regex(/^[0-9a-f]{40}$/).optional() }).strict();
const toolchainResultSchema = z.object({ ok: z.boolean(), summary: z.object({ scope: z.literal('local-firmware-build-prerequisites'), ready: z.boolean(), checks: z.array(toolchainCheckSchema).max(16), boards: z.array(z.object({ ideId: z.string().max(64), zephyrBoard: z.string().max(128), validationLevel: z.enum(['cross-build', 'human-hil']) }).strict()).max(16) }).strict(), evidence: evidenceSchema }).strict();
const firmwareResultSchema = z.object({ ok: z.boolean(), summary: z.object({ schemaVersion: z.literal(1), scope: z.literal('local-ephemeral-cross-build'), sourceIdentity: z.literal('unverified'), board: boardSummarySchema, artifact: artifactSchema.extend({ kind: z.literal('firmware-elf') }).strict(), output: z.object({ stdoutBytes: z.number().int().nonnegative().max(8 * 1024 * 1024), stderrBytes: z.number().int().nonnegative().max(8 * 1024 * 1024), truncated: z.boolean() }).strict() }).strict().optional(), evidence: evidenceSchema }).strict();
const outputName = z.string().min(1).max(128).regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/);
const outputsSchema = z.record(outputName, z.boolean()).refine((outputs) => Object.keys(outputs).length <= 64);
const plantSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('motor-v1'), atSpeedInput: z.boolean(), speedPermilleAfterTick: z.number().int().min(0).max(1000) }).strict(),
  z.object({ kind: z.literal('conveyor-v1'), seed: z.literal(0), partAtClassifierInput: z.boolean(), metalDetectedInput: z.boolean(), partAtDiverterInput: z.boolean(), jamDetectedInput: z.boolean(), classifiedCountAfterTick: z.number().int().min(0).max(1_000_000) }).strict(),
  z.object({ kind: z.literal('tank-v1'), levelLowInput: z.boolean(), levelHighInput: z.boolean(), levelPermilleAfterTick: z.number().int().min(0).max(1000) }).strict(),
  z.object({ kind: z.literal('pedestrian-v1'), requestInput: z.boolean(), phaseAfterTick: z.enum(['approaching', 'waiting', 'crossing', 'cleared']) }).strict(),
]);
const traceSampleSchema = z.object({ atMs: z.number().int().min(0).max(3_600_000), outputs: outputsSchema, plant: plantSchema.optional() }).strict();
const assertionSchema = z.object({ kind: z.enum(['AT', 'WITHIN', 'EVENTUALLY', 'ALWAYS', 'NEVER', 'UNTIL', 'FOR']), passed: z.boolean(), atMs: z.number().int().min(0).max(3_600_000).optional() }).strict();
const aggregateScenarioSchema = z.object({ id: z.string().max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/), path: logicalPathSchema.refine((path) => path.startsWith('tests/')), passed: z.boolean(), trace: z.array(traceSampleSchema).min(1).max(100_000), assertions: z.array(assertionSchema).max(4096) }).strict();
const aggregateTraceSchema = z.object({ schemaVersion: z.literal(1), backend: z.literal('native-posix'), mode: z.literal('logical-cyclic-task-set-scan'), scenarios: z.array(aggregateScenarioSchema).min(1).max(8) }).strict();

function summarySchema(tool: McpToolName): z.ZodType {
  switch (tool) {
    case 'project_inspect': return z.object({ schemaVersion: z.literal(2), sourceSchemaVersion: z.union([z.literal(1), z.literal(2)]), migrated: z.boolean(), name: shortText, version: z.string().min(1).max(64), taskCount: z.number().int().nonnegative(), sources: z.array(z.object({ name: z.string().min(1).max(128), language: z.enum(['ST', 'IL', 'LD', 'FBD', 'SFC']) }).strict()).max(256), target: z.object({ board: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i) }).strict().optional() }).strict();
    case 'project_validate': return z.object({ name: shortText, taskCount: z.number().int().nonnegative() }).strict();
    case 'compiler_check': case 'compiler_compile': return compilerSummarySchema;
    case 'symbols_list': return z.object({ symbols: z.array(z.object({ pou: identifier, name: identifier, type: z.string().min(1).max(64), region: z.enum(['IPI', 'OPI', 'WORK', 'RETAIN', 'CODE']), address: z.number().int().nonnegative(), size: z.number().int().nonnegative(), sourceRef: logicalPathSchema.refine((path) => path.startsWith('src/')).optional(), bitOffset: z.number().int().nonnegative().optional(), declarationLine: z.number().int().positive().optional() }).strict()).max(4096) }).strict();
    case 'safety_check': return z.object({ configured: z.boolean(), declared: z.array(z.object({ outputs: z.tuple([identifier, identifier]) }).strict()).max(128), covered: z.array(z.object({ outputs: z.tuple([identifier, identifier]) }).strict()).max(128), uncovered: z.array(z.object({ outputs: z.tuple([identifier, identifier]) }).strict()).max(128) }).strict();
    case 'tests_run': case 'scenario_run': return testSummarySchema;
  }
}

function expectedOperation(tool: McpToolName): string {
  return tool === 'project_inspect' ? 'inspect' : tool === 'project_validate' ? 'validate' : tool === 'compiler_check' ? 'check' : tool === 'compiler_compile' ? 'compile' : tool === 'symbols_list' ? 'symbols-list' : tool === 'safety_check' ? 'safety-check' : tool === 'tests_run' ? 'test' : tool === 'boards_list' ? 'boards-list' : tool === 'toolchain_inspect' ? 'toolchain-inspect' : tool === 'firmware_build' ? 'firmware-build' : 'scenario-run';
}

function auxToolResult(tool: 'boards_list' | 'toolchain_inspect' | 'firmware_build', value: unknown, execution: unknown): McpToolResult {
  const safe = safeJson(value); const safeExecution = safeJson(execution); if (!safe || typeof safe !== 'object' || Array.isArray(safe) || !safeExecution) return errorResult('MCP_INTERNAL_ERROR');
  const parsed = (tool === 'boards_list' ? boardsResultSchema : tool === 'toolchain_inspect' ? toolchainResultSchema : firmwareResultSchema).safeParse(safe);
  const executionParsed = executionSchema.safeParse(safeExecution);
  if (!parsed.success || !executionParsed.success || parsed.data.evidence.operation !== expectedOperation(tool) || parsed.data.evidence.outcome !== (parsed.data.ok ? 'passed' : 'failed') || executionParsed.data.operation !== expectedOperation(tool) || executionParsed.data.permission !== toolApi.executionPermission(expectedOperation(tool) as toolApi.ToolOperation) || executionParsed.data.outcome !== parsed.data.evidence.outcome) return errorResult('MCP_INTERNAL_ERROR');
  if (parsed.data.ok && !parsed.data.summary) return errorResult('MCP_INTERNAL_ERROR');
  const artifacts = parsed.data.evidence.artifacts;
  if ((tool === 'boards_list' || tool === 'toolchain_inspect') && artifacts.length !== 0) return errorResult('MCP_INTERNAL_ERROR');
  if (tool === 'firmware_build') {
    if (!parsed.data.ok && (parsed.data.summary !== undefined || artifacts.length !== 0)) return errorResult('MCP_INTERNAL_ERROR');
    if (parsed.data.ok && (artifacts.length !== 1 || artifacts[0]?.kind !== 'firmware-elf' || JSON.stringify(artifacts[0]) !== JSON.stringify(parsed.data.summary?.artifact))) return errorResult('MCP_INTERNAL_ERROR');
  }
  const structuredContent = { ok: parsed.data.ok, scope: tool === 'firmware_build' ? 'local-ephemeral-cross-build' : 'local-repository-inspection', ...(parsed.data.summary ? { summary: parsed.data.summary } : {}), evidence: parsed.data.evidence, execution: executionParsed.data, ...(tool === 'firmware_build' ? { note: 'Local ephemeral cross-build only; not flash, deploy, hardware, or HIL.' } : {}) };
  const text = JSON.stringify(structuredContent); return Buffer.byteLength(text, 'utf8') <= MAX_OUTPUT_BYTES ? { content: [{ type: 'text', text }], structuredContent, ...(structuredContent.ok === false ? { isError: true } : {}) } : errorResult('MCP_OUTPUT_LIMIT');
}

function validArtifacts(tool: McpToolName, ok: boolean, artifacts: Array<{ kind: string }>): boolean {
  const kinds = artifacts.map((artifact) => artifact.kind); if (new Set(kinds).size !== kinds.length) return false;
  const allowed = tool === 'compiler_check' || tool === 'compiler_compile' ? ['zplc'] : tool === 'tests_run' || tool === 'scenario_run' ? ['zplc', 'trace'] : [];
  if (kinds.some((kind) => !allowed.includes(kind))) return false;
  if (!ok) return !kinds.includes('trace') || kinds.includes('zplc');
  if (tool === 'compiler_check' || tool === 'compiler_compile') return kinds.length === 1 && kinds[0] === 'zplc';
  if (tool === 'tests_run' || tool === 'scenario_run') return kinds.length === 2 && kinds[0] === 'zplc' && kinds[1] === 'trace';
  return kinds.length === 0;
}

function publicResult(tool: McpToolName, value: unknown, execution?: unknown): Record<string, unknown> | undefined {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length > 0) return undefined;
    const allowed = new Set(['ok', 'summary', 'evidence', 'preview', 'savedTestInputIdentity']);
    for (const key of Object.keys(value)) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!allowed.has(key) || !descriptor || !('value' in descriptor)) return undefined; }
    const ok = ownValue(value, 'ok'); const evidence = ownValue(value, 'evidence'); if (typeof ok !== 'boolean' || evidence === undefined) return undefined;
    const output: Record<string, unknown> = { ok, evidence: safeJson(evidence) };
    const summary = ownValue(value, 'summary'); if (summary !== undefined) output.summary = safeJson(summary);
    const saved = ownValue(value, 'savedTestInputIdentity'); if (saved !== undefined) output.savedTestInputIdentity = safeJson(saved);
    if (Object.values(output).some((item) => item === undefined)) return undefined;
    if (execution !== undefined) output.execution = safeJson(execution);
    if (Object.values(output).some((item) => item === undefined)) return undefined;
    const schema = z.object({ ok: z.boolean(), summary: summarySchema(tool).optional(), evidence: evidenceSchema, savedTestInputIdentity: savedInputSchema.optional(), execution: executionSchema.optional() }).strict();
    const parsed = schema.safeParse(output); if (!parsed.success || (parsed.data.ok && parsed.data.summary === undefined)) return undefined;
    if (parsed.data.evidence.operation !== expectedOperation(tool) || parsed.data.evidence.outcome !== (parsed.data.ok ? 'passed' : 'failed') || !validArtifacts(tool, parsed.data.ok, parsed.data.evidence.artifacts)) return undefined;
    if (parsed.data.execution && (parsed.data.execution.operation !== expectedOperation(tool) || parsed.data.execution.permission !== toolApi.executionPermission(expectedOperation(tool) as toolApi.ToolOperation) || parsed.data.execution.outcome !== (parsed.data.evidence.diagnostics.some((diagnostic) => diagnostic.code === 'TEST_CANCELLED') ? 'cancelled' : parsed.data.evidence.outcome) || Date.parse(parsed.data.execution.finishedAt) < Date.parse(parsed.data.execution.startedAt))) return undefined;
    if (!['tests_run', 'scenario_run'].includes(tool) && parsed.data.savedTestInputIdentity !== undefined) return undefined;
    return parsed.data as Record<string, unknown>;
  } catch { return undefined; }
}

/** Serializes only exact public Tool API summaries and evidence. Private compiler payloads stay internal. */
export function toMcpToolResult(tool: McpToolName, value: unknown, execution?: unknown): McpToolResult {
  const publicValue = publicResult(tool, value, execution); if (!publicValue) return errorResult('MCP_INTERNAL_ERROR');
  let text: string;
  try { text = JSON.stringify(publicValue); } catch { return errorResult('MCP_INTERNAL_ERROR'); }
  if (Buffer.byteLength(text, 'utf8') > MAX_OUTPUT_BYTES) return errorResult('MCP_OUTPUT_LIMIT');
  return { content: [{ type: 'text', text }], structuredContent: JSON.parse(text) as Record<string, unknown>, ...(publicValue.ok === false ? { isError: true } : {}) };
}

const sameIdentity = sameDirectoryIdentity;

export async function openMcpWorkspace(root: string): Promise<McpWorkspace | undefined> {
  try { if (!isAbsolute(root)) return undefined; const identity = await directoryIdentity(root); if (!identity) return undefined; const inspected = await toolApi.projectInspect(identity.path); if (!inspected.ok || !sameIdentity(identity, await directoryIdentity(identity.path))) return undefined; return { root: identity.path, identity }; }
  catch { return undefined; }
}

export async function openMcpRepository(root: string | undefined): Promise<{ root: string; identity: DirectoryIdentity } | undefined> {
  try { if (!root || !isAbsolute(root)) return undefined; const identity = await directoryIdentity(root); if (!identity) return undefined; const boards = await toolApi.boardsList(identity.path); return boards.ok && sameIdentity(identity, await directoryIdentity(identity.path)) ? { root: identity.path, identity } : undefined; }
  catch { return undefined; }
}
export async function openMcpUserData(root: string | undefined): Promise<{ root: string; identity: DirectoryIdentity } | undefined> {
  try { if (!root || !isAbsolute(root)) return undefined; const identity = await directoryIdentity(root); return identity ? { root: identity.path, identity } : undefined; }
  catch { return undefined; }
}

function sameRepository(repository: McpWorkspace['repository']): Promise<boolean> {
  return repository ? directoryIdentity(repository.root).then((current) => sameIdentity(repository.identity, current)) : Promise.resolve(false);
}

type Replay = { traceSha256: string; samples: Array<Record<string, unknown>>; assertions: Array<Record<string, unknown>>; totalSamples: number; evidence: Record<string, unknown>; execution: Record<string, unknown>; ok: boolean };
function replayFromScenario(value: unknown, scenarioId: string, execution: unknown): Replay | undefined {
  try {
    const publicValue = publicResult('scenario_run', value, execution); if (!publicValue) return undefined;
    if (!value || typeof value !== 'object') return undefined;
    const traceFile = Object.getOwnPropertyDescriptor(value, 'traceFile')?.value;
    if (!(traceFile instanceof Uint8Array) || traceFile.byteLength > MAX_OUTPUT_BYTES) return undefined;
    const aggregate = aggregateTraceSchema.safeParse(JSON.parse(new TextDecoder().decode(traceFile)) as unknown); if (!aggregate.success) return undefined;
    const selected = aggregate.data.scenarios.filter((scenario) => scenario.id === scenarioId); if (selected.length !== 1) return undefined;
    const artifacts = (publicValue.evidence as { artifacts?: Array<{ kind?: string; sha256?: string; byteLength?: number }> }).artifacts;
    const traceArtifact = artifacts?.filter((artifact) => artifact.kind === 'trace'); const traceSha256 = traceArtifact?.[0]?.sha256;
    if (traceArtifact?.length !== 1 || traceArtifact[0]?.byteLength !== traceFile.byteLength || traceSha256 !== createHash('sha256').update(traceFile).digest('hex')) return undefined;
    const scenario = selected[0]!;
    return { traceSha256, samples: scenario.trace, assertions: scenario.assertions, totalSamples: scenario.trace.length, evidence: publicValue.evidence as Record<string, unknown>, execution: publicValue.execution as Record<string, unknown>, ok: publicValue.ok as boolean };
  } catch { return undefined; }
}

function replayResult(replay: Replay, cursor: number): McpToolResult {
  if (cursor < 0 || cursor >= replay.totalSamples) return errorResult('MCP_INVALID_ARGUMENTS');
  const structuredContent = { ok: replay.ok, scope: 'recorded-native-posix-host', cursor, totalSamples: replay.totalSamples, done: cursor + 1 >= replay.totalSamples, snapshot: replay.samples[cursor], traceSha256: replay.traceSha256, evidence: replay.evidence, execution: replay.execution, note: 'Recorded native POSIX host result; not live runtime, hardware, or HIL.' };
  const text = JSON.stringify(structuredContent); return Buffer.byteLength(text, 'utf8') <= MAX_OUTPUT_BYTES ? { content: [{ type: 'text', text }], structuredContent, ...(replay.ok ? {} : { isError: true }) } : errorResult('MCP_OUTPUT_LIMIT');
}

function validArguments(tool: McpToolName, args: ToolArguments): boolean {
  if (!args || Object.getPrototypeOf(args) !== Object.prototype || Object.getOwnPropertySymbols(args).length > 0 || Object.keys(args).some((key) => !('value' in (Object.getOwnPropertyDescriptor(args, key) ?? {})))) return false;
  if (tool === 'simulation_start' || tool === 'trace_get' || tool === 'scenario_run') return SCENARIO_INPUT.safeParse(args).success;
  if (tool === 'simulation_step' || tool === 'runtime_snapshot') return REPLAY_INPUT.safeParse(args).success;
  if (tool === 'firmware_build') return FIRMWARE_BUILD_INPUT.safeParse(args).success;
  return Object.keys(args).length === 0;
}

async function callTool(tool: McpToolName, root: string, args: ToolArguments, signal: AbortSignal, operations: McpOperations): Promise<unknown> {
  switch (tool) {
    case 'project_inspect': return operations.projectInspect(root);
    case 'project_validate': return operations.projectValidate(root);
    case 'compiler_check': return operations.compilerCheck(root);
    case 'compiler_compile': return operations.compilerCompile(root);
    case 'symbols_list': return operations.symbolsList(root);
    case 'safety_check': return operations.safetyCheck(root);
    case 'tests_run': return operations.testsRun(root, { signal });
    case 'scenario_run': return operations.scenarioRun(root, ownValue(args, 'scenarioId') as string, { signal });
    case 'simulation_start': case 'simulation_step': case 'runtime_snapshot': case 'trace_get': return operations.scenarioRun(root, ownValue(args, 'scenarioId') as string, { signal });
    default: throw new Error('unsupported dispatch');
  }
}

/** @internal Small test seam; production uses the canonical Tool API functions. */
export function createMcpDispatcher(workspace: McpWorkspace, operations: McpOperations = toolApi): (tool: McpToolName, args: ToolArguments, signal: AbortSignal) => Promise<McpToolResult> {
  let busy = false;
  return async (tool, args, signal) => {
    if (busy) return errorResult('MCP_BUSY');
    if (signal.aborted) return errorResult('MCP_CANCELLED');
    if (!validArguments(tool, args)) return errorResult('MCP_INVALID_ARGUMENTS');
    busy = true;
    try {
      if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return errorResult('MCP_WORKSPACE_CHANGED');
      if (signal.aborted) return errorResult('MCP_CANCELLED');
      if (['simulation_start', 'simulation_step', 'runtime_snapshot', 'trace_get'].includes(tool)) {
        const executionStart = toolApi.startToolExecution('mcp', 'tests:run', 'scenario-run');
        const value = await callTool(tool, workspace.root, args, signal, operations);
        if (signal.aborted) return errorResult('MCP_CANCELLED');
        if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return errorResult('MCP_WORKSPACE_CHANGED');
        const replay = replayFromScenario(value, ownValue(args, 'scenarioId') as string, toolApi.finishToolExecution(executionStart, value));
        if (!replay) return errorResult('MCP_INTERNAL_ERROR');
        const requestedHash = ownValue(args, 'traceSha256'); if (requestedHash !== undefined && requestedHash !== replay.traceSha256) return errorResult('MCP_WORKSPACE_CHANGED');
        if (signal.aborted || !sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return signal.aborted ? errorResult('MCP_CANCELLED') : errorResult('MCP_WORKSPACE_CHANGED');
        if (tool === 'trace_get') {
          const structuredContent = { ok: replay.ok, scope: 'recorded-native-posix-host', scenarioId: ownValue(args, 'scenarioId'), traceSha256: replay.traceSha256, totalSamples: replay.totalSamples, assertions: replay.assertions, trace: replay.samples, evidence: replay.evidence, execution: replay.execution, note: 'Recorded native POSIX host result; not live runtime, hardware, or HIL.' };
          const text = JSON.stringify(structuredContent); return Buffer.byteLength(text, 'utf8') <= MAX_OUTPUT_BYTES ? { content: [{ type: 'text', text }], structuredContent, ...(replay.ok ? {} : { isError: true }) } : errorResult('MCP_OUTPUT_LIMIT');
        }
        const cursor = tool === 'simulation_start' ? 0 : ownValue(args, 'cursor') as number;
        return replayResult(replay, tool === 'simulation_step' ? cursor + 1 : cursor);
      }
      if (['boards_list', 'toolchain_inspect', 'firmware_build'].includes(tool)) {
        if (!workspace.repository || !await sameRepository(workspace.repository)) return errorResult('MCP_CAPABILITY_UNAVAILABLE');
        const operation = expectedOperation(tool) as toolApi.ToolOperation; const executionStart = toolApi.startToolExecution('mcp', toolApi.executionPermission(operation), operation);
        const value = tool === 'boards_list' ? await operations.boardsList(workspace.repository.root) : tool === 'toolchain_inspect' ? await operations.toolchainInspect(workspace.repository.root) : await operations.firmwareBuild(workspace.repository.root, ownValue(args, 'ideId') as string, { signal });
        if (signal.aborted) return errorResult('MCP_CANCELLED');
        if (!await sameRepository(workspace.repository) || !sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return errorResult('MCP_WORKSPACE_CHANGED');
        return auxToolResult(tool, value, toolApi.finishToolExecution(executionStart, value));
      }
      const operation = expectedOperation(tool) as toolApi.ToolOperation;
      const executionStart = toolApi.startToolExecution('mcp', toolApi.executionPermission(operation), operation);
      const value = await callTool(tool, workspace.root, args, signal, operations);
      if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return errorResult('MCP_WORKSPACE_CHANGED');
      return signal.aborted ? errorResult('MCP_CANCELLED') : toMcpToolResult(tool, value, toolApi.finishToolExecution(executionStart, value));
    } catch { return errorResult('MCP_INTERNAL_ERROR'); }
    finally { busy = false; }
  };
}

export function buildMcpServer(workspace: McpWorkspace): McpServer {
  const server = new McpServer({ name: 'zplc-local', version: MCP_SERVER_VERSION }); const dispatch = createMcpDispatcher(workspace);
  server.registerTool('project_inspect', { title: 'Inspect project', description: 'Inspect the fixed ZPLC workspace.', inputSchema: EMPTY_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('project_inspect', args, ctx.mcpReq.signal));
  server.registerTool('project_validate', { title: 'Validate project', description: 'Validate the fixed ZPLC workspace.', inputSchema: EMPTY_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('project_validate', args, ctx.mcpReq.signal));
  server.registerTool('compiler_check', { title: 'Check compiler', description: 'Check the fixed workspace without producing a program payload.', inputSchema: EMPTY_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('compiler_check', args, ctx.mcpReq.signal));
  server.registerTool('compiler_compile', { title: 'Compile workspace', description: 'Compile the fixed workspace and return evidence only.', inputSchema: EMPTY_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('compiler_compile', args, ctx.mcpReq.signal));
  server.registerTool('symbols_list', { title: 'List symbols', description: 'List public compiler symbols for the fixed workspace.', inputSchema: EMPTY_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('symbols_list', args, ctx.mcpReq.signal));
  server.registerTool('safety_check', { title: 'Check declared interlocks', description: 'Check declared incompatible-output coverage.', inputSchema: EMPTY_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('safety_check', args, ctx.mcpReq.signal));
  server.registerTool('tests_run', { title: 'Run workspace tests', description: 'Run deterministic native POSIX workspace tests.', inputSchema: EMPTY_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('tests_run', args, ctx.mcpReq.signal));
  server.registerTool('scenario_run', { title: 'Run one scenario', description: 'Run one named deterministic workspace scenario.', inputSchema: SCENARIO_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('scenario_run', args, ctx.mcpReq.signal));
  server.registerTool('simulation_start', { title: 'Start recorded simulation', description: 'Re-run a deterministic native POSIX scenario without retaining a session.', inputSchema: SCENARIO_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('simulation_start', args, ctx.mcpReq.signal));
  server.registerTool('simulation_step', { title: 'Step recorded simulation', description: 'Return one deterministic recorded host sample with an explicit trace identity.', inputSchema: REPLAY_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('simulation_step', args, ctx.mcpReq.signal));
  server.registerTool('runtime_snapshot', { title: 'Read recorded snapshot', description: 'Read one explicit recorded host snapshot; no implicit runtime session exists.', inputSchema: REPLAY_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('runtime_snapshot', args, ctx.mcpReq.signal));
  server.registerTool('trace_get', { title: 'Get recorded trace', description: 'Return a bounded, sanitized deterministic native POSIX trace.', inputSchema: SCENARIO_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('trace_get', args, ctx.mcpReq.signal));
  server.registerTool('boards_list', { title: 'List board profiles', description: 'List declared repository board profiles without probing hardware.', inputSchema: EMPTY_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('boards_list', args, ctx.mcpReq.signal));
  server.registerTool('toolchain_inspect', { title: 'Inspect toolchain', description: 'Inspect local firmware-build prerequisites only.', inputSchema: EMPTY_INPUT, annotations: READ_ONLY }, (args, ctx) => dispatch('toolchain_inspect', args, ctx.mcpReq.signal));
  server.registerTool('firmware_build', { title: 'Build firmware', description: 'Run a local ephemeral cross-build only; never flash or deploy.', inputSchema: FIRMWARE_BUILD_INPUT, annotations: FIRMWARE_BUILD_ONLY }, (args, ctx) => dispatch('firmware_build', args, ctx.mcpReq.signal));
  const resource = (uri: string, read: () => Promise<Record<string, unknown>>) => server.registerResource(uri, uri, { title: uri, mimeType: 'application/json' }, async () => {
    try { const body = await read(); const text = JSON.stringify(body); return { contents: [{ uri, text: Buffer.byteLength(text, 'utf8') <= MAX_OUTPUT_BYTES ? text : JSON.stringify({ ok: false, error: 'MCP_OUTPUT_LIMIT' }) }] }; }
    catch { return { contents: [{ uri, text: JSON.stringify({ ok: false, error: 'MCP_INTERNAL_ERROR' }) }] }; }
  });
  resource('zplc://project/manifest', async () => resourceProject(workspace, 'manifest'));
  resource('zplc://project/symbols', async () => resourceProject(workspace, 'symbols'));
  resource('zplc://project/io-map', async () => resourceProject(workspace, 'io-map'));
  resource('zplc://project/diagnostics', async () => resourceProject(workspace, 'diagnostics'));
  resource('zplc://target/capabilities', async () => resourceProject(workspace, 'capabilities'));
  resource('zplc://runtime/trace', async () => ({ ok: true, stateless: true, template: 'zplc://runtime/trace/{scenarioId}', scope: 'recorded-native-posix-host', note: 'Read a deterministic recorded host trace by scenario ID; not a live runtime, hardware, or HIL.' }));
  resource('zplc://runtime/snapshot', async () => ({ ok: true, stateless: true, template: 'zplc://runtime/snapshot/{scenarioId}/{cursor}/{traceSha256}', scope: 'recorded-native-posix-host', note: 'Read one fenced deterministic recorded host snapshot; not a live runtime, hardware, or HIL.' }));
  resource('zplc://course/progress', async () => courseProgressResource(workspace));
  for (const topic of ['evidence', 'safety', 'testing'] as const) resource(`zplc://docs/${topic}`, async () => ({ topic, text: topic === 'evidence' ? 'Tool results are evidence; recorded host results are not HIL.' : topic === 'safety' ? 'MCP cannot flash, deploy, force, run, stop, recover, access serial, or run a shell.' : 'Use scenario_run or stateless simulation tools for deterministic native POSIX tests.' }));
  const template = (name: string, pattern: string, read: (variables: Record<string, string>, signal: AbortSignal) => Promise<Record<string, unknown>>) => server.registerResource(name, new ResourceTemplate(pattern, { list: undefined }), { title: name, mimeType: 'application/json' }, async (uri, variables, ctx) => {
    try { const body = await read(variables, ctx.mcpReq.signal); const text = JSON.stringify(body); return { contents: [{ uri: uri.href, text: Buffer.byteLength(text, 'utf8') <= MAX_OUTPUT_BYTES ? text : JSON.stringify({ ok: false, error: 'MCP_OUTPUT_LIMIT' }) }] }; }
    catch { return { contents: [{ uri: uri.href, text: JSON.stringify({ ok: false, error: 'MCP_INTERNAL_ERROR' }) }] }; }
  });
  const replayResource = async (tool: 'trace_get' | 'runtime_snapshot', variables: Record<string, string>, signal: AbortSignal) => {
    const scenarioId = variables.scenarioId;
    if (!SCENARIO_INPUT.safeParse({ scenarioId }).success) return { ok: false, error: 'MCP_INVALID_ARGUMENTS' };
    const args = tool === 'trace_get' ? { scenarioId } : { scenarioId, cursor: Number(variables.cursor), traceSha256: variables.traceSha256 };
    if (!validArguments(tool, args)) return { ok: false, error: 'MCP_INVALID_ARGUMENTS' };
    const result = await dispatch(tool, args, signal); return result.structuredContent;
  };
  template('runtime-trace', 'zplc://runtime/trace/{scenarioId}', (variables, signal) => replayResource('trace_get', variables, signal));
  template('runtime-snapshot', 'zplc://runtime/snapshot/{scenarioId}/{cursor}/{traceSha256}', (variables, signal) => replayResource('runtime_snapshot', variables, signal));
  return server;
}

/** @internal Small test seam; never returns paths or raw user-data. */
export async function courseProgressResource(workspace: McpWorkspace): Promise<Record<string, unknown>> {
  if (!workspace.userData) return { ok: false, error: 'MCP_CAPABILITY_UNAVAILABLE', reason: 'requires-explicit-user-data' };
  // This directory is user-managed progress storage, so its entry generation changes when the progress file is created.
  const sameUserData = async (): Promise<boolean> => {
    const current = await directoryIdentity(workspace.userData!.root);
    return !!current && workspace.userData!.identity.path === current.path && workspace.userData!.identity.dev === current.dev && workspace.userData!.identity.ino === current.ino;
  };
  if (!await sameUserData()) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
  const file = join(workspace.userData.root, 'zplc-learn-mastery.v1.json');
  try {
    const status = await lstat(file); if (status.isSymbolicLink() || !status.isFile() || status.size > 4096) return { ok: false, error: 'MCP_INTERNAL_ERROR' };
    const text = await readFile(file, 'utf8');
    if (Buffer.byteLength(text, 'utf8') > 4096 || !await sameUserData()) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype || Object.getOwnPropertyNames(parsed).sort().join(',') !== 'mastered,schemaVersion') return { ok: false, error: 'MCP_INTERNAL_ERROR' };
    const mastered = (parsed as { schemaVersion?: unknown; mastered?: unknown }).mastered;
    if ((parsed as { schemaVersion?: unknown }).schemaVersion !== 1 || !Array.isArray(mastered) || mastered.length > LEARN_LESSON_IDS.length || Object.getOwnPropertyNames(mastered).length !== mastered.length + 1) return { ok: false, error: 'MCP_INTERNAL_ERROR' };
    let previous = -1; for (const id of mastered) { const index = LEARN_LESSON_IDS.indexOf(id as typeof LEARN_LESSON_IDS[number]); if (typeof id !== 'string' || index <= previous) return { ok: false, error: 'MCP_INTERNAL_ERROR' }; previous = index; }
    return { ok: true, schemaVersion: 1, mastered, completed: mastered.length, total: LEARN_LESSON_IDS.length };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return await sameUserData() ? { ok: true, schemaVersion: 1, mastered: [], completed: 0, total: LEARN_LESSON_IDS.length } : { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
    return { ok: false, error: 'MCP_INTERNAL_ERROR' };
  }
}

async function resourceProject(workspace: McpWorkspace, kind: 'manifest' | 'symbols' | 'io-map' | 'diagnostics' | 'capabilities'): Promise<Record<string, unknown>> {
  if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
  if (kind === 'manifest') { const result = await toolApi.projectInspect(workspace.root); if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' }; return projectResource('project_inspect', result, 'manifest'); }
  if (kind === 'symbols' || kind === 'io-map') {
    const result = await toolApi.symbolsList(workspace.root); if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' }; return projectResource('symbols_list', result, kind);
  }
  if (kind === 'diagnostics') { const result = await toolApi.compilerCheck(workspace.root); if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' }; return projectResource('compiler_check', result, 'diagnostics'); }
  const result = await toolApi.projectInspect(workspace.root); if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
  if (!result.ok) return { ok: false, diagnostics: result.evidence.diagnostics };
  const board = result.summary.target?.board;
  if (board === 'posix') return { ok: true, kind: 'host', declaredBoard: 'posix', scope: 'declared-host-target-only', note: 'Declared project target only; not a connected device, hardware, or HIL.' };
  const evidence = getBoardEvidenceSummary(board); const memory = getCompilerMemoryProfile(board);
  return evidence && memory ? { ok: true, kind: 'catalogue', declaredBoard: board, zephyrBoard: evidence.zephyrBoard, network: getBoardNetworkType(board), compilerMemory: memory, validationLevel: evidence.validationLevel, evidenceCount: evidence.evidenceCount, scope: 'declared-catalogue-cross-build-evidence-only', note: 'Declared catalogue target only; not a connected device, hardware, or HIL.' } : { ok: false, error: 'MCP_CAPABILITY_UNAVAILABLE' };
}

/** @internal Exact resource projector test seam; paths and private tool payloads never cross this boundary. */
export function projectResource(tool: 'project_inspect' | 'symbols_list' | 'compiler_check', value: unknown, kind: 'manifest' | 'symbols' | 'io-map' | 'diagnostics'): Record<string, unknown> {
  const publicValue = publicResult(tool, value); if (!publicValue) return { ok: false, error: 'MCP_INTERNAL_ERROR' };
  if (kind === 'manifest') return publicValue.ok ? { ok: true, manifest: publicValue.summary } : { ok: false, diagnostics: (publicValue.evidence as { diagnostics: unknown }).diagnostics };
  if (kind === 'diagnostics') return { ok: publicValue.ok, diagnostics: (publicValue.evidence as { diagnostics: unknown }).diagnostics };
  if (!publicValue.ok) return { ok: false, diagnostics: (publicValue.evidence as { diagnostics: unknown }).diagnostics };
  const symbols = ((publicValue.summary as { symbols: Array<{ pou: string; name: string; type: string; region: string; address: number; size: number; bitOffset?: number }> }).symbols);
  return kind === 'symbols' ? { ok: true, symbols } : { ok: true, io: symbols.filter((symbol) => symbol.region === 'IPI' || symbol.region === 'OPI').map(({ pou, name, type, region, address, size, bitOffset }) => ({ pou, name, type, region, address, size, ...(bitOffset === undefined ? {} : { bitOffset }) })) };
}
