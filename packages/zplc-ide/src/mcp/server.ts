import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { McpServer, ResourceTemplate, SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/server';
import { getBoardEvidenceSummary, getBoardNetworkType, getCompilerMemoryProfile } from '../config/boardProfiles';
import * as z from 'zod/v4';
import idePackage from '../../package.json';
import { directoryIdentity, sameDirectoryIdentity, type DirectoryIdentity } from '../cli/firmwareBuildRunner';
import * as toolApi from '../cli/toolApi';
import {
  EVIDENCE_LEVEL,
  MCP_BOUNDARY,
  MCP_INSTRUCTIONS,
  MCP_PROMPT_NAMES,
  MODERN_PROTOCOL_REVISION,
  courseProgressResource,
  type McpSelfCheck,
  formatResource,
  lessonCurrentResource,
  nativeSimulatorReady,
  plantInspect,
  plantMapResource,
  programsResource,
  registerPrompts,
  sceneResource,
  scenarioResource,
  scenariosList,
  scenariosResource,
  sourceResource,
} from './resources';

import {
  logicalPath,
  shortText,
  identifier,
  logicalPathSchema,
  evidenceSchema,
  executionSchema,
  compilerSummarySchema,
  testSummarySchema,
  savedInputSchema,
  boardsResultSchema,
  toolchainResultSchema,
  firmwareResultSchema,
  previewSchema,
  aggregateTraceSchema,
} from './resultSchemas';
import * as trace from './traceView';
import { workspaceWrite, type WorkspaceWriteArgs } from './workspaceWrite';
import { debugArgumentsError, isDebugTool, McpDebugSessionManager, type DebugArgs } from './debugSession';

type McpToolResult = trace.McpToolResult;

export { MCP_BOUNDARY, MCP_PROMPT_NAMES, courseProgressResource, programsResource, sourceResource } from './resources';
export { executionSchema } from './resultSchemas';
/** The largest answer of a tool or a resource, in bytes of its JSON text. */
export const MAX_OUTPUT_BYTES = trace.MAX_OUTPUT_BYTES;
const EMPTY_INPUT = z.object({}).strict();
const SCENARIO_INPUT = z
  .object({
    scenarioId: z
      .string()
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  })
  .strict();
const REPLAY_INPUT = z
  .object({
    scenarioId: z
      .string()
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    cursor: z.number().int().min(0).max(100_000),
    traceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
const TRACE_INPUT = z
  .object({
    scenarioId: z
      .string()
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    mode: z.enum(trace.TRACE_MODES).optional().describe(trace.TRACE_HELP.mode),
    signals: z.array(z.string().min(1).max(256)).max(64).optional().describe(trace.TRACE_HELP.signals),
    includeInputs: z.boolean().optional().describe(trace.TRACE_HELP.includeInputs),
    watchSignals: z.array(z.string().min(1).max(256)).max(32).optional().describe(trace.TRACE_HELP.watchSignals),
    fromMs: z.number().int().min(0).max(3_600_000).optional().describe(trace.TRACE_HELP.fromMs),
    toMs: z.number().int().min(0).max(3_600_000).optional().describe(trace.TRACE_HELP.toMs),
    fromSample: z.number().int().min(0).max(100_000).optional().describe(trace.TRACE_HELP.fromSample),
    limit: z.number().int().min(1).max(1000).optional().describe(trace.TRACE_HELP.limit),
  })
  .strict();
const PLANT_INSPECT_INPUT = z
  .object({
    sceneFile: z.string().max(256).refine(logicalPath).optional().describe('Scene path in the project; scene.json when omitted.'),
    mapFile: z.string().max(256).refine(logicalPath).optional().describe('Plant map path in the project; plant-map.json when omitted.'),
  })
  .strict();
const FIRMWARE_BUILD_INPUT = z
  .object({
    ideId: z
      .string()
      .max(64)
      .regex(/^[a-z0-9][a-z0-9_]{0,63}$/),
  })
  .strict();
/** One file of a batch of workspace_check_write or workspace_write (AIX-011): the path is checked by workspaceWrite.ts. */
const WRITE_FILE = z
  .object({
    path: z
      .string()
      .min(1)
      .max(512)
      .describe(
        'A project path: src/<name>.st|.il|.ld.json|.fbd.json|.sfc.json, zplc.json, tests/<name>.scenario.json, scene.json or ' +
          'plant-map.json.',
      ),
    content: z.string().min(1).max(524_288).describe('The whole new text of the file.'),
  })
  .strict();
const WORKSPACE_CHECK_INPUT = z
  .object({
    files: z.array(WRITE_FILE).min(1).max(8).describe('1 to 8 files to check together against the project.'),
    compileCheck: z.boolean().optional().describe('Also compile the project as it would be; true when omitted.'),
  })
  .strict();
const WORKSPACE_WRITE_INPUT = z
  .object({
    files: z.array(WRITE_FILE).min(1).max(8).describe('1 to 8 files to check and write.'),
    requireCompile: z.boolean().optional().describe('Refuse the write unless the project compiles; false when omitted.'),
    expectedBaseSha256: z
      .record(z.string().max(512), z.string().regex(/^[0-9a-f]{64}$/))
      .refine((record) => Object.keys(record).length <= 8)
      .optional()
      .describe('The sha256 of each replaced file as you read it; a file changed since is refused.'),
  })
  .strict();
/** The private simulation debugger (AIX-014): a session is named by the unguessable id debug_session_start answered. */
const DEBUG_NAME = z.string().min(1).max(256);
const DEBUG_LOCATION = z
  .object({
    file: logicalPathSchema.describe('A program of src, as compiled: src/Main.st, src/Belt.ld.json.'),
    line: z.number().int().min(1).max(1_000_000).optional().describe('The line of an ST or IL source.'),
    element: z
      .string()
      .min(3)
      .max(128)
      .regex(/^[a-z]+:\S+$/)
      .optional()
      .describe('line:8, rung:r1, rung:r1/cell:0,2, block:ton_1, step:s1, transition:t1 or action:a1.'),
  })
  .strict()
  .refine((location) => (location.line === undefined) !== (location.element === undefined), 'give exactly one of line or element');
const DEBUG_PLANT_ACTION = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('operate'), signal: DEBUG_NAME, value: z.union([z.boolean(), z.number().finite()]) }).strict(),
  z
    .object({
      kind: z.literal('emit'),
      item: z.string().min(1).max(64),
      at: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
    })
    .strict(),
  z.object({ kind: z.literal('fault'), part: z.string().min(1).max(128), action: z.string().min(1).max(64) }).strict(),
]);
const DEBUG_START_INPUT = z
  .object({
    withScene: z.enum(['auto', 'always', 'never']).optional().describe('Couple scene.json and plant-map.json: auto when both exist.'),
    sceneFile: z.string().max(256).refine(logicalPath).optional().describe('Scene path in the project; scene.json when omitted.'),
    mapFile: z.string().max(256).refine(logicalPath).optional().describe('Plant map path in the project; plant-map.json when omitted.'),
  })
  .strict();
const DEBUG_STOP_INPUT = z.object({ sessionId: z.string().uuid() }).strict();
const DEBUG_INPUTS_INPUT = z
  .object({
    sessionId: z.string().uuid(),
    inputs: z
      .record(DEBUG_NAME, z.union([z.boolean(), z.number().finite()]))
      .refine((record) => Object.keys(record).length <= 64, 'at most 64 inputs')
      .optional()
      .describe('Program inputs (IPI) by name, Program.Variable: true or false for a BOOL, a number otherwise.'),
    plantActions: z.array(DEBUG_PLANT_ACTION).max(16).optional().describe('operate a panel signal, emit an item or fault a part.'),
  })
  .strict();
const DEBUG_BREAKPOINTS_INPUT = z
  .object({
    sessionId: z.string().uuid(),
    action: z.enum(['list', 'set', 'add', 'remove', 'clear']),
    locations: z.array(DEBUG_LOCATION).max(32).optional().describe('Where to stop, for set, add and remove.'),
  })
  .strict();
const DEBUG_STEP_INPUT = z
  .object({
    sessionId: z.string().uuid(),
    mode: z.enum(['cycles', 'ms', 'continue']).optional().describe('cycles (default), ms, or continue to a breakpoint.'),
    cycles: z.number().int().min(1).max(1000).optional().describe('Scans to run in mode cycles; 1 when omitted.'),
    durationMs: z.number().int().min(1).max(60_000).optional().describe('Virtual time to run in mode ms, a multiple of the scan.'),
    maxCycles: z.number().int().min(1).max(5000).optional().describe('The most scans continue runs; 1000 when omitted.'),
    watch: z.array(DEBUG_NAME).max(32).optional().describe('Variables to read when the step stops.'),
    includeFacts: z.boolean().optional().describe('Also answer the plant facts.'),
  })
  .strict();
const DEBUG_INSPECT_INPUT = z
  .object({
    sessionId: z.string().uuid(),
    signals: z.array(DEBUG_NAME).max(64).optional().describe('Variables to read; the inputs and outputs when omitted.'),
    functionBlocks: z.array(z.string().min(1).max(128)).max(16).optional().describe('Instances to expand, Main.Delay1.'),
    includeSfc: z.boolean().optional().describe('Active SFC steps and transitions; true when omitted.'),
    includePlant: z.boolean().optional().describe('Plant signals and facts; true when omitted.'),
  })
  .strict();
const DEBUG_SCHEMAS = {
  debug_session_start: DEBUG_START_INPUT,
  debug_session_stop: DEBUG_STOP_INPUT,
  debug_set_inputs: DEBUG_INPUTS_INPUT,
  debug_breakpoints: DEBUG_BREAKPOINTS_INPUT,
  debug_step: DEBUG_STEP_INPUT,
  debug_inspect: DEBUG_INSPECT_INPUT,
} as const;
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WORKSPACE_WRITE_ONLY = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;
const FIRMWARE_BUILD_ONLY = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const DEBUG_ONLY = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const DEBUG_READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const MCP_TOOL_NAMES = [
  'project_inspect',
  'project_validate',
  'compiler_check',
  'compiler_compile',
  'symbols_list',
  'safety_check',
  'tests_run',
  'scenario_run',
  'simulation_start',
  'simulation_step',
  'runtime_snapshot',
  'trace_get',
  'boards_list',
  'toolchain_inspect',
  'firmware_build',
  'plant_inspect',
  'scenarios_list',
  'server_self_check',
  'workspace_check_write',
  'workspace_write',
  'debug_session_start',
  'debug_session_stop',
  'debug_set_inputs',
  'debug_breakpoints',
  'debug_step',
  'debug_inspect',
] as const;
export const MCP_RESOURCE_URIS = [
  'zplc://project/manifest',
  'zplc://project/programs',
  'zplc://project/symbols',
  'zplc://project/io-map',
  'zplc://project/diagnostics',
  'zplc://target/capabilities',
  'zplc://runtime/trace',
  'zplc://runtime/snapshot',
  'zplc://course/progress',
  'zplc://docs/evidence',
  'zplc://docs/safety',
  'zplc://docs/testing',
  'zplc://project/scene',
  'zplc://project/plant-map',
  'zplc://project/scenarios',
  'zplc://lesson/current',
  'zplc://formats/ld',
  'zplc://formats/fbd',
  'zplc://formats/sfc',
  'zplc://formats/scene',
  'zplc://formats/plant-map',
  'zplc://formats/scenario',
] as const;
export const MCP_RESOURCE_TEMPLATES = [
  'zplc://project/source/{name}',
  'zplc://project/scenario/{scenarioId}',
  'zplc://runtime/trace/{scenarioId}',
  'zplc://runtime/snapshot/{scenarioId}/{cursor}/{traceSha256}',
] as const;
export const MCP_SERVER_VERSION = idePackage.version;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];
type ToolArguments = Record<string, unknown>;
export interface McpOperations {
  projectInspect(root: string): Promise<unknown>;
  projectValidate(root: string): Promise<unknown>;
  compilerCheck(root: string): Promise<unknown>;
  compilerCompile(root: string): Promise<unknown>;
  symbolsList(root: string): Promise<unknown>;
  safetyCheck(root: string): Promise<unknown>;
  testsRun(root: string, options?: toolApi.TestsRunOptions): Promise<unknown>;
  scenarioRun(root: string, scenarioId: string, options?: toolApi.ScenarioRunOptions): Promise<unknown>;
  boardsList(repository: string): Promise<unknown>;
  toolchainInspect(repository: string): Promise<unknown>;
  firmwareBuild(repository: string, ideId: string, options?: { signal?: AbortSignal }): Promise<unknown>;
}
export interface McpWorkspace {
  readonly root: string;
  readonly identity: DirectoryIdentity;
  readonly repository?: { readonly root: string; readonly identity: DirectoryIdentity };
  readonly userData?: { readonly root: string; readonly identity: DirectoryIdentity };
}

function errorResult(
  error:
    | 'MCP_BUSY'
    | 'MCP_CANCELLED'
    | 'MCP_INVALID_ARGUMENTS'
    | 'MCP_INTERNAL_ERROR'
    | 'MCP_OUTPUT_LIMIT'
    | 'MCP_WORKSPACE_CHANGED'
    | 'MCP_CAPABILITY_UNAVAILABLE',
): McpToolResult {
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
      const rawLength = ownValue(value, 'length');
      if (typeof rawLength !== 'number' || !Number.isSafeInteger(rawLength) || rawLength < 0) return undefined;
      const length = rawLength;
      const names = Object.getOwnPropertyNames(value);
      if (names.length !== length + 1 || !names.includes('length')) return undefined;
      const output: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const key = String(index);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return undefined;
        const safe = safeJson(descriptor.value, depth + 1);
        if (safe === undefined) return undefined;
        output.push(safe);
      }
      return output;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return undefined;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return undefined;
      const safe = safeJson(descriptor.value, depth + 1);
      if (safe === undefined) return undefined;
      output[key] = safe;
    }
    return output;
  } catch {
    return undefined;
  }
}

function summarySchema(tool: McpToolName): z.ZodType {
  switch (tool) {
    case 'project_inspect':
      return z
        .object({
          schemaVersion: z.literal(2),
          sourceSchemaVersion: z.union([z.literal(1), z.literal(2)]),
          migrated: z.boolean(),
          name: shortText,
          version: z.string().min(1).max(64),
          taskCount: z.number().int().nonnegative(),
          sources: z
            .array(
              z
                .object({
                  name: z.string().min(1).max(128),
                  language: z.enum(['ST', 'IL', 'LD', 'FBD', 'SFC']),
                  library: z.string().min(1).max(128).optional(),
                })
                .strict(),
            )
            .max(256),
          target: z
            .object({ board: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i) })
            .strict()
            .optional(),
        })
        .strict();
    case 'project_validate':
      return z.object({ name: shortText, taskCount: z.number().int().nonnegative() }).strict();
    case 'compiler_check':
    case 'compiler_compile':
      return compilerSummarySchema;
    case 'symbols_list':
      return z
        .object({
          symbols: z
            .array(
              z
                .object({
                  pou: identifier,
                  name: identifier,
                  type: z.string().min(1).max(64),
                  region: z.enum(['IPI', 'OPI', 'WORK', 'RETAIN', 'CODE']),
                  address: z.number().int().nonnegative(),
                  size: z.number().int().nonnegative(),
                  sourceRef: logicalPathSchema.refine((path) => path.startsWith('src/')).optional(),
                  bitOffset: z.number().int().nonnegative().optional(),
                  declarationLine: z.number().int().positive().optional(),
                })
                .strict(),
            )
            .max(4096),
        })
        .strict();
    case 'safety_check':
      return z
        .object({
          configured: z.boolean(),
          declared: z.array(z.object({ outputs: z.tuple([identifier, identifier]) }).strict()).max(128),
          covered: z.array(z.object({ outputs: z.tuple([identifier, identifier]) }).strict()).max(128),
          uncovered: z.array(z.object({ outputs: z.tuple([identifier, identifier]) }).strict()).max(128),
        })
        .strict();
    case 'tests_run':
    case 'scenario_run':
      return testSummarySchema;
    // The recorded-replay and repository tools build their own results and never reach the generic public result.
    default:
      return z.never();
  }
}

function expectedOperation(tool: McpToolName): string {
  return tool === 'project_inspect'
    ? 'inspect'
    : tool === 'project_validate'
      ? 'validate'
      : tool === 'compiler_check'
        ? 'check'
        : tool === 'compiler_compile'
          ? 'compile'
          : tool === 'symbols_list'
            ? 'symbols-list'
            : tool === 'safety_check'
              ? 'safety-check'
              : tool === 'tests_run'
                ? 'test'
                : tool === 'boards_list'
                  ? 'boards-list'
                  : tool === 'toolchain_inspect'
                    ? 'toolchain-inspect'
                    : tool === 'firmware_build'
                      ? 'firmware-build'
                      : 'scenario-run';
}

type AuxToolName = 'boards_list' | 'toolchain_inspect' | 'firmware_build';
function isAuxTool(tool: McpToolName): tool is AuxToolName {
  return tool === 'boards_list' || tool === 'toolchain_inspect' || tool === 'firmware_build';
}

function auxToolResult(tool: AuxToolName, value: unknown, execution: unknown): McpToolResult {
  const safe = safeJson(value);
  const safeExecution = safeJson(execution);
  if (!safe || typeof safe !== 'object' || Array.isArray(safe) || !safeExecution) return errorResult('MCP_INTERNAL_ERROR');
  const parsed = (
    tool === 'boards_list' ? boardsResultSchema : tool === 'toolchain_inspect' ? toolchainResultSchema : firmwareResultSchema
  ).safeParse(safe);
  const executionParsed = executionSchema.safeParse(safeExecution);
  if (
    !parsed.success ||
    !executionParsed.success ||
    parsed.data.evidence.operation !== expectedOperation(tool) ||
    parsed.data.evidence.outcome !== (parsed.data.ok ? 'passed' : 'failed') ||
    executionParsed.data.operation !== expectedOperation(tool) ||
    executionParsed.data.permission !== toolApi.executionPermission(expectedOperation(tool) as toolApi.ToolOperation) ||
    executionParsed.data.outcome !== parsed.data.evidence.outcome
  )
    return errorResult('MCP_INTERNAL_ERROR');
  if (parsed.data.ok && !parsed.data.summary) return errorResult('MCP_INTERNAL_ERROR');
  const artifacts = parsed.data.evidence.artifacts;
  if ((tool === 'boards_list' || tool === 'toolchain_inspect') && artifacts.length !== 0) return errorResult('MCP_INTERNAL_ERROR');
  if (tool === 'firmware_build') {
    if (!parsed.data.ok && (parsed.data.summary !== undefined || artifacts.length !== 0)) return errorResult('MCP_INTERNAL_ERROR');
    if (
      parsed.data.ok &&
      (artifacts.length !== 1 ||
        artifacts[0]?.kind !== 'firmware-elf' ||
        JSON.stringify(artifacts[0]) !==
          JSON.stringify(parsed.data.summary && 'artifact' in parsed.data.summary ? parsed.data.summary.artifact : undefined))
    )
      return errorResult('MCP_INTERNAL_ERROR');
  }
  const structuredContent = {
    ok: parsed.data.ok,
    scope: tool === 'firmware_build' ? 'local-ephemeral-cross-build' : 'local-repository-inspection',
    ...(parsed.data.summary ? { summary: parsed.data.summary } : {}),
    evidence: parsed.data.evidence,
    execution: executionParsed.data,
    ...(tool === 'firmware_build' ? { note: 'Local ephemeral cross-build only; not flash, deploy, hardware, or HIL.' } : {}),
  };
  const text = JSON.stringify(structuredContent);
  return Buffer.byteLength(text, 'utf8') <= MAX_OUTPUT_BYTES
    ? { content: [{ type: 'text', text }], structuredContent, ...(structuredContent.ok === false ? { isError: true } : {}) }
    : errorResult('MCP_OUTPUT_LIMIT');
}

function validArtifacts(tool: McpToolName, ok: boolean, artifacts: Array<{ kind: string }>): boolean {
  const kinds = artifacts.map((artifact) => artifact.kind);
  if (new Set(kinds).size !== kinds.length) return false;
  const allowed =
    tool === 'compiler_check' || tool === 'compiler_compile'
      ? ['zplc']
      : tool === 'tests_run' || tool === 'scenario_run'
        ? ['zplc', 'trace']
        : [];
  if (kinds.some((kind) => !allowed.includes(kind))) return false;
  if (!ok) return !kinds.includes('trace') || kinds.includes('zplc');
  if (tool === 'compiler_check' || tool === 'compiler_compile') return kinds.length === 1 && kinds[0] === 'zplc';
  if (tool === 'tests_run' || tool === 'scenario_run') return kinds.length === 2 && kinds[0] === 'zplc' && kinds[1] === 'trace';
  return kinds.length === 0;
}

function publicResult(tool: McpToolName, value: unknown, execution?: unknown): Record<string, unknown> | undefined {
  try {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.getOwnPropertySymbols(value).length > 0
    )
      return undefined;
    const allowed = new Set(['ok', 'summary', 'evidence', 'preview', 'savedTestInputIdentity']);
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!allowed.has(key) || !descriptor || !('value' in descriptor)) return undefined;
    }
    const ok = ownValue(value, 'ok');
    const evidence = ownValue(value, 'evidence');
    if (typeof ok !== 'boolean' || evidence === undefined) return undefined;
    const output: Record<string, unknown> = { ok, evidence: safeJson(evidence) };
    const summary = ownValue(value, 'summary');
    if (summary !== undefined) output.summary = safeJson(summary);
    const saved = ownValue(value, 'savedTestInputIdentity');
    if (saved !== undefined) output.savedTestInputIdentity = safeJson(saved);
    const preview = ownValue(value, 'preview');
    if (preview !== undefined && (tool === 'tests_run' || tool === 'scenario_run')) output.preview = safeJson(preview);
    if (Object.values(output).some((item) => item === undefined)) return undefined;
    if (execution !== undefined) output.execution = safeJson(execution);
    if (Object.values(output).some((item) => item === undefined)) return undefined;
    const schema = z
      .object({
        ok: z.boolean(),
        summary: summarySchema(tool).optional(),
        evidence: evidenceSchema,
        savedTestInputIdentity: savedInputSchema.optional(),
        preview: previewSchema.optional(),
        execution: executionSchema.optional(),
      })
      .strict();
    const parsed = schema.safeParse(output);
    if (!parsed.success || (parsed.data.ok && parsed.data.summary === undefined)) return undefined;
    if (
      parsed.data.evidence.operation !== expectedOperation(tool) ||
      parsed.data.evidence.outcome !== (parsed.data.ok ? 'passed' : 'failed') ||
      !validArtifacts(tool, parsed.data.ok, parsed.data.evidence.artifacts)
    )
      return undefined;
    if (
      parsed.data.execution &&
      (parsed.data.execution.operation !== expectedOperation(tool) ||
        parsed.data.execution.permission !== toolApi.executionPermission(expectedOperation(tool) as toolApi.ToolOperation) ||
        parsed.data.execution.outcome !==
          (parsed.data.evidence.diagnostics.some((diagnostic) => diagnostic.code === 'TEST_CANCELLED')
            ? 'cancelled'
            : parsed.data.evidence.outcome) ||
        Date.parse(parsed.data.execution.finishedAt) < Date.parse(parsed.data.execution.startedAt))
    )
      return undefined;
    if (!['tests_run', 'scenario_run'].includes(tool) && parsed.data.savedTestInputIdentity !== undefined) return undefined;
    return parsed.data as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Serializes only exact public Tool API summaries and evidence. Private compiler payloads stay internal. */
export function toMcpToolResult(tool: McpToolName, value: unknown, execution?: unknown): McpToolResult {
  const publicValue = publicResult(tool, value, execution);
  if (!publicValue) return errorResult('MCP_INTERNAL_ERROR');
  let text: string;
  try {
    text = JSON.stringify(publicValue);
  } catch {
    return errorResult('MCP_INTERNAL_ERROR');
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_OUTPUT_BYTES) return errorResult('MCP_OUTPUT_LIMIT');
  return {
    content: [{ type: 'text', text }],
    structuredContent: JSON.parse(text) as Record<string, unknown>,
    ...(publicValue.ok === false ? { isError: true } : {}),
  };
}

const sameIdentity = sameDirectoryIdentity;

export async function openMcpWorkspace(root: string): Promise<McpWorkspace | undefined> {
  try {
    if (!isAbsolute(root)) return undefined;
    const identity = await directoryIdentity(root);
    if (!identity) return undefined;
    const inspected = await toolApi.projectInspect(identity.path);
    if (!inspected.ok || !sameIdentity(identity, await directoryIdentity(identity.path))) return undefined;
    return { root: identity.path, identity };
  } catch {
    return undefined;
  }
}

export async function openMcpRepository(root: string | undefined): Promise<{ root: string; identity: DirectoryIdentity } | undefined> {
  try {
    if (!root || !isAbsolute(root)) return undefined;
    const identity = await directoryIdentity(root);
    if (!identity) return undefined;
    const boards = await toolApi.boardsList(identity.path);
    return boards.ok && sameIdentity(identity, await directoryIdentity(identity.path)) ? { root: identity.path, identity } : undefined;
  } catch {
    return undefined;
  }
}
export async function openMcpUserData(root: string | undefined): Promise<{ root: string; identity: DirectoryIdentity } | undefined> {
  try {
    if (!root || !isAbsolute(root)) return undefined;
    const identity = await directoryIdentity(root);
    return identity ? { root: identity.path, identity } : undefined;
  } catch {
    return undefined;
  }
}

function sameRepository(repository: McpWorkspace['repository']): Promise<boolean> {
  return repository
    ? directoryIdentity(repository.root).then((current) => sameIdentity(repository.identity, current))
    : Promise.resolve(false);
}

function replayFromScenario(value: unknown, scenarioId: string, execution: unknown): trace.Replay | undefined {
  try {
    const publicValue = publicResult('scenario_run', value, execution);
    if (!publicValue) return undefined;
    if (!value || typeof value !== 'object') return undefined;
    const traceFile = Object.getOwnPropertyDescriptor(value, 'traceFile')?.value;
    if (!(traceFile instanceof Uint8Array) || traceFile.byteLength > trace.MAX_INTERNAL_TRACE_BYTES) return undefined;
    const aggregate = aggregateTraceSchema.safeParse(JSON.parse(new TextDecoder().decode(traceFile)) as unknown);
    if (!aggregate.success) return undefined;
    const selected = aggregate.data.scenarios.filter((scenario) => scenario.id === scenarioId);
    if (selected.length !== 1) return undefined;
    const artifacts = (publicValue.evidence as { artifacts?: Array<{ kind?: string; sha256?: string; byteLength?: number }> }).artifacts;
    const traceArtifact = artifacts?.filter((artifact) => artifact.kind === 'trace');
    const traceSha256 = traceArtifact?.[0]?.sha256;
    if (
      traceArtifact?.length !== 1 ||
      traceArtifact[0]?.byteLength !== traceFile.byteLength ||
      traceSha256 !== createHash('sha256').update(traceFile).digest('hex')
    )
      return undefined;
    const scenario = selected[0]!;
    return {
      traceSha256,
      samples: scenario.trace,
      assertions: scenario.assertions,
      totalSamples: scenario.trace.length,
      evidence: publicValue.evidence as Record<string, unknown>,
      execution: publicValue.execution as Record<string, unknown>,
      ok: publicValue.ok as boolean,
      observed: ownValue(value, 'observed') as trace.ObservedTrace | undefined,
    };
  } catch {
    return undefined;
  }
}

function replayResult(replay: trace.Replay, cursor: number): McpToolResult {
  if (cursor < 0 || cursor >= replay.totalSamples) return errorResult('MCP_INVALID_ARGUMENTS');
  const structuredContent = {
    ok: replay.ok,
    scope: 'recorded-native-posix-host',
    cursor,
    totalSamples: replay.totalSamples,
    done: cursor + 1 >= replay.totalSamples,
    snapshot: replay.samples[cursor],
    traceSha256: replay.traceSha256,
    evidence: replay.evidence,
    execution: replay.execution,
    note: 'Recorded native POSIX host result; not live runtime, hardware, or HIL.',
  };
  const text = JSON.stringify(structuredContent);
  return Buffer.byteLength(text, 'utf8') <= MAX_OUTPUT_BYTES
    ? { content: [{ type: 'text', text }], structuredContent, ...(replay.ok ? {} : { isError: true }) }
    : errorResult('MCP_OUTPUT_LIMIT');
}

function validArguments(tool: McpToolName, args: ToolArguments): boolean {
  if (
    !args ||
    Object.getPrototypeOf(args) !== Object.prototype ||
    Object.getOwnPropertySymbols(args).length > 0 ||
    Object.keys(args).some((key) => !('value' in (Object.getOwnPropertyDescriptor(args, key) ?? {})))
  )
    return false;
  if (tool === 'trace_get') return TRACE_INPUT.safeParse(args).success && trace.fullOption(args) === undefined;
  if (tool === 'simulation_start' || tool === 'scenario_run') return SCENARIO_INPUT.safeParse(args).success;
  if (tool === 'simulation_step' || tool === 'runtime_snapshot') return REPLAY_INPUT.safeParse(args).success;
  if (tool === 'firmware_build') return FIRMWARE_BUILD_INPUT.safeParse(args).success;
  if (tool === 'plant_inspect') return PLANT_INSPECT_INPUT.safeParse(args).success;
  if (tool === 'workspace_check_write') return WORKSPACE_CHECK_INPUT.safeParse(args).success;
  if (tool === 'workspace_write') return WORKSPACE_WRITE_INPUT.safeParse(args).success;
  if (isDebugTool(tool)) return DEBUG_SCHEMAS[tool].safeParse(args).success;
  return Object.keys(args).length === 0;
}

async function callTool(
  tool: McpToolName,
  root: string,
  args: ToolArguments,
  signal: AbortSignal,
  operations: McpOperations,
): Promise<unknown> {
  switch (tool) {
    case 'project_inspect':
      return operations.projectInspect(root);
    case 'project_validate':
      return operations.projectValidate(root);
    case 'compiler_check':
      return operations.compilerCheck(root);
    case 'compiler_compile':
      return operations.compilerCompile(root);
    case 'symbols_list':
      return operations.symbolsList(root);
    case 'safety_check':
      return operations.safetyCheck(root);
    case 'tests_run':
      return operations.testsRun(root, { signal });
    case 'scenario_run':
      return operations.scenarioRun(root, ownValue(args, 'scenarioId') as string, { signal });
    case 'trace_get': {
      const observe = trace.traceObserve(args as trace.TraceArgs);
      return operations.scenarioRun(root, ownValue(args, 'scenarioId') as string, { signal, ...(observe ? { observe } : {}) });
    }
    case 'simulation_start':
    case 'simulation_step':
    case 'runtime_snapshot':
      return operations.scenarioRun(root, ownValue(args, 'scenarioId') as string, { signal });
    default:
      throw new Error('unsupported dispatch');
  }
}

/** Compiles the program and answers its public variables, or undefined when it does not compile. */
function compiledSymbols(root: string, operations: Pick<McpOperations, 'symbolsList'>) {
  return async (): Promise<Array<{ pou: string; name: string }> | undefined> => {
    const read = projectResource('symbols_list', await operations.symbolsList(root), 'symbols');
    return read.ok === true ? (read.symbols as Array<{ pou: string; name: string }>) : undefined;
  };
}

/** A result as text and structured content; an answer over the output limit is MCP_OUTPUT_LIMIT. */
function asResult(structuredContent: Record<string, unknown>, isError: boolean): McpToolResult {
  const text = JSON.stringify(structuredContent);
  if (Buffer.byteLength(text, 'utf8') > MAX_OUTPUT_BYTES) return errorResult('MCP_OUTPUT_LIMIT');
  return { content: [{ type: 'text', text }], structuredContent, ...(isError ? { isError: true } : {}) };
}

/** The answer of a read tool of `resources.ts`: its body as it is, an error when `ok` is false. */
const readResult = (body: Record<string, unknown>) => asResult(body, body.ok !== true);

/** Adds the evidence level after `ok` to every result that is not an error envelope. */
function withEvidenceLevel(tool: McpToolName, result: McpToolResult): McpToolResult {
  const { ok, ...rest } = result.structuredContent;
  // AI-12: every reply that carries the 2.0 execution adds its compact audit beside it; execution is unchanged
  const audit = rest.execution && !('audit' in rest) ? { audit: trace.audit(rest.execution as Record<string, unknown>) } : {};
  if ('error' in rest) return 'audit' in audit ? asResult({ ok, ...rest, ...audit }, true) : result;
  return asResult({ ok, evidenceLevel: EVIDENCE_LEVEL[tool], ...rest, ...audit }, result.isError === true);
}

/**
 * What the server would serve (AIX-007): the project by its name, the optional folders, the simulator binary, the protocol
 * revisions, the counts and the boundary. It reads the project with the Tool API's inspection and looks at files; it starts no
 * process and opens no board, port or socket (AGENTS.md rule 8).
 */
export async function mcpSelfCheck(workspace: McpWorkspace | undefined): Promise<McpSelfCheck> {
  let workspaceName: string | undefined;
  let workspaceValid = false;
  if (workspace && sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) {
    const inspected = await toolApi.projectInspect(workspace.root);
    workspaceValid = inspected.ok && sameIdentity(workspace.identity, await directoryIdentity(workspace.root));
    if (inspected.ok) workspaceName = inspected.summary.name;
  }
  return {
    serverVersion: MCP_SERVER_VERSION,
    ...(workspaceName === undefined ? {} : { workspaceName }),
    workspaceValid,
    hasRepository: workspace?.repository !== undefined,
    hasUserData: workspace?.userData !== undefined,
    nativeSimulatorReady: nativeSimulatorReady(),
    protocolsServed: [MODERN_PROTOCOL_REVISION, ...SUPPORTED_PROTOCOL_VERSIONS],
    toolCount: MCP_TOOL_NAMES.length,
    resourceCount: MCP_RESOURCE_URIS.length + MCP_RESOURCE_TEMPLATES.length,
    promptCount: MCP_PROMPT_NAMES.length,
    boundary: MCP_BOUNDARY,
  };
}

/** @internal Small test seam; production uses the canonical Tool API functions. */
export function createMcpDispatcher(
  workspace: McpWorkspace,
  operations: McpOperations = toolApi,
  debug: McpDebugSessionManager = new McpDebugSessionManager(workspace),
): (tool: McpToolName, args: ToolArguments, signal: AbortSignal) => Promise<McpToolResult> {
  const dispatch = dispatcher(workspace, operations, debug);
  return async (tool, args, signal) => withEvidenceLevel(tool, await dispatch(tool, args, signal));
}

function dispatcher(
  workspace: McpWorkspace,
  operations: McpOperations,
  debug: McpDebugSessionManager,
): (tool: McpToolName, args: ToolArguments, signal: AbortSignal) => Promise<McpToolResult> {
  let busy = false;
  return async (tool, args, signal) => {
    if (busy) return errorResult('MCP_BUSY');
    if (signal.aborted) return errorResult('MCP_CANCELLED');
    if (!validArguments(tool, args)) {
      if (isDebugTool(tool)) return readResult(debugArgumentsError(DEBUG_SCHEMAS[tool].safeParse(args).error?.issues ?? []));
      return tool === 'trace_get' ? trace.traceArgumentsError(args) : errorResult('MCP_INVALID_ARGUMENTS');
    }
    busy = true;
    try {
      if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return errorResult('MCP_WORKSPACE_CHANGED');
      if (signal.aborted) return errorResult('MCP_CANCELLED');
      if (tool === 'server_self_check') return readResult({ ok: true, summary: await mcpSelfCheck(workspace) });
      if (tool === 'scenarios_list') return readResult(await scenariosList(workspace));
      if (isDebugTool(tool)) return readResult(await debug.call(tool, args as unknown as DebugArgs[typeof tool], signal));
      if (tool === 'workspace_check_write' || tool === 'workspace_write')
        return readResult(await workspaceWrite(workspace, args as unknown as WorkspaceWriteArgs, tool === 'workspace_write'));
      if (tool === 'plant_inspect')
        return readResult(
          await plantInspect(workspace, args as { sceneFile?: string; mapFile?: string }, compiledSymbols(workspace.root, operations)),
        );
      if (['simulation_start', 'simulation_step', 'runtime_snapshot', 'trace_get'].includes(tool)) {
        const executionStart = toolApi.startToolExecution('mcp', 'tests:run', 'scenario-run');
        const value = await callTool(tool, workspace.root, args, signal, operations);
        if (signal.aborted) return errorResult('MCP_CANCELLED');
        if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return errorResult('MCP_WORKSPACE_CHANGED');
        const refusal = trace.traceRefusal(value, ownValue(args, 'scenarioId') as string);
        if (refusal) return refusal;
        const replay = replayFromScenario(
          value,
          ownValue(args, 'scenarioId') as string,
          toolApi.finishToolExecution(executionStart, value),
        );
        if (!replay) return errorResult('MCP_INTERNAL_ERROR');
        const requestedHash = ownValue(args, 'traceSha256');
        if (requestedHash !== undefined && requestedHash !== replay.traceSha256) return errorResult('MCP_WORKSPACE_CHANGED');
        if (signal.aborted || !sameIdentity(workspace.identity, await directoryIdentity(workspace.root)))
          return signal.aborted ? errorResult('MCP_CANCELLED') : errorResult('MCP_WORKSPACE_CHANGED');
        if (tool === 'trace_get') return trace.traceAnswer(replay, ownValue(args, 'scenarioId') as string, args as trace.TraceArgs);
        const cursor = tool === 'simulation_start' ? 0 : (ownValue(args, 'cursor') as number);
        return replayResult(replay, tool === 'simulation_step' ? cursor + 1 : cursor);
      }
      if (isAuxTool(tool)) {
        if (!workspace.repository || !(await sameRepository(workspace.repository))) return errorResult('MCP_CAPABILITY_UNAVAILABLE');
        const operation = expectedOperation(tool) as toolApi.ToolOperation;
        const executionStart = toolApi.startToolExecution('mcp', toolApi.executionPermission(operation), operation);
        const value =
          tool === 'boards_list'
            ? await operations.boardsList(workspace.repository.root)
            : tool === 'toolchain_inspect'
              ? await operations.toolchainInspect(workspace.repository.root)
              : await operations.firmwareBuild(workspace.repository.root, ownValue(args, 'ideId') as string, { signal });
        if (signal.aborted) return errorResult('MCP_CANCELLED');
        if (!(await sameRepository(workspace.repository)) || !sameIdentity(workspace.identity, await directoryIdentity(workspace.root)))
          return errorResult('MCP_WORKSPACE_CHANGED');
        return auxToolResult(tool, value, toolApi.finishToolExecution(executionStart, value));
      }
      const operation = expectedOperation(tool) as toolApi.ToolOperation;
      const executionStart = toolApi.startToolExecution('mcp', toolApi.executionPermission(operation), operation);
      const value = await callTool(tool, workspace.root, args, signal, operations);
      if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return errorResult('MCP_WORKSPACE_CHANGED');
      if (signal.aborted) return errorResult('MCP_CANCELLED');
      const result = toMcpToolResult(tool, value, toolApi.finishToolExecution(executionStart, value));
      // a wrong scenarioId keeps the 2.0 evidence and execution and adds the valid ids beside them (AIX-015)
      const missing = tool === 'scenario_run' ? trace.scenarioNotFound(value, ownValue(args, 'scenarioId') as string) : undefined;
      return missing ? asResult({ ...result.structuredContent, ...missing.structuredContent }, true) : result;
    } catch {
      return errorResult('MCP_INTERNAL_ERROR');
    } finally {
      busy = false;
    }
  };
}

export function buildMcpServer(workspace: McpWorkspace): McpServer {
  const server = new McpServer({ name: 'zplc-local', version: MCP_SERVER_VERSION }, { instructions: MCP_INSTRUCTIONS });
  // the private debug sessions belong to this connection: they are torn down when it closes (AIX-014)
  const debug = new McpDebugSessionManager(workspace);
  const closed = server.server.onclose;
  server.server.onclose = () => {
    void debug.closeAll();
    closed?.();
  };
  const close = server.close.bind(server);
  server.close = async () => {
    await debug.closeAll();
    await close();
  };
  const dispatch = createMcpDispatcher(workspace, toolApi, debug);
  server.registerTool(
    'project_inspect',
    {
      title: 'Inspect project',
      description: 'Read the manifest summary: name, version, tasks, target and the programs of src with their language. Call it first.',
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('project_inspect', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'project_validate',
    {
      title: 'Validate project',
      description: 'Check that zplc.json, the tasks and each LD, FBD and SFC file load; a failure names the place and the accepted values.',
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('project_validate', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'compiler_check',
    {
      title: 'Check compiler',
      description: 'Compile every program in memory: pass or fail, the code size and the located diagnostics. Use it after each edit.',
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('compiler_check', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'compiler_compile',
    {
      title: 'Compile workspace',
      description: 'Compile the project to .zplc bytecode and answer its digest, size and diagnostics; the bytes stay on the server.',
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('compiler_compile', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'symbols_list',
    {
      title: 'List symbols',
      description: 'List the compiled variables with type, region and address; use the exact names in scenarios and plant maps.',
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('symbols_list', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'safety_check',
    {
      title: 'Check declared interlocks',
      description: 'Check that each incompatible output pair of zplc.json is covered by a NEVER expectation of a scenario in tests.',
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('safety_check', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'tests_run',
    {
      title: 'Run workspace tests',
      description: 'Run every scenario of tests on the host simulator: pass or fail per scenario, the failed checks, a trace digest.',
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('tests_run', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'scenario_run',
    {
      title: 'Run one scenario',
      description: 'Run one scenario, named by its id from scenarios_list, on the host simulator and answer its result and failed checks.',
      inputSchema: SCENARIO_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('scenario_run', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'simulation_start',
    {
      title: 'Start recorded simulation',
      description: 'Run one scenario on the host simulator and answer its first recorded sample and trace digest; no session is kept.',
      inputSchema: SCENARIO_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('simulation_start', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'simulation_step',
    {
      title: 'Step recorded simulation',
      description: 'Answer the recorded sample after cursor of a scenario run, pinned by its trace digest, to walk a run step by step.',
      inputSchema: REPLAY_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('simulation_step', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'runtime_snapshot',
    {
      title: 'Read recorded snapshot',
      description: 'Answer one recorded sample of a scenario run at cursor, pinned by its trace digest; a recording, not a live runtime.',
      inputSchema: REPLAY_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('runtime_snapshot', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'trace_get',
    {
      title: 'Get recorded trace',
      description: 'Run one scenario and answer its changes by default, a window, a summary, or mode full: the whole trace.',
      inputSchema: TRACE_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('trace_get', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'boards_list',
    {
      title: 'List board profiles',
      description: 'List the boards the repository declares and their validation level, without probing any hardware. Needs --repository.',
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('boards_list', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'toolchain_inspect',
    {
      title: 'Inspect toolchain',
      description: 'Check the local tools a firmware build needs (west, CMake, Ninja, Zephyr SDK) and which are ready. Needs --repository.',
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('toolchain_inspect', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'firmware_build',
    {
      title: 'Build firmware',
      description: 'Run a local ephemeral cross-build of the runtime for one board, answer the image digest; it never flashes or deploys.',
      inputSchema: FIRMWARE_BUILD_INPUT,
      annotations: FIRMWARE_BUILD_ONLY,
    },
    (args, ctx) => dispatch('firmware_build', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'plant_inspect',
    {
      title: 'Inspect plant scene and map',
      description: 'Read the plant scene, the signals it offers, the plant map and the map points the compiled program does not have.',
      inputSchema: PLANT_INSPECT_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('plant_inspect', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'scenarios_list',
    {
      title: 'List scenarios',
      description: 'List every scenario of tests with its id, timing, scene and a summary of each expectation; use the ids to run them.',
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('scenarios_list', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'server_self_check',
    {
      title: 'Check this server',
      description: 'Answer what this server serves: project name, optional folders, simulator, protocols, counts and the boundary.',
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('server_self_check', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'workspace_check_write',
    {
      title: 'Check a write',
      description: 'Check 1 to 8 files to create or replace as workspace_write checks them; it writes nothing and names each problem.',
      inputSchema: WORKSPACE_CHECK_INPUT,
      annotations: READ_ONLY,
    },
    (args, ctx) => dispatch('workspace_check_write', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'workspace_write',
    {
      title: 'Write project files',
      description: 'Check and write 1 to 8 files of src, tests, zplc.json, scene.json, plant-map.json; never deletes or renames.',
      inputSchema: WORKSPACE_WRITE_INPUT,
      annotations: WORKSPACE_WRITE_ONLY,
    },
    (args, ctx) => dispatch('workspace_write', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'debug_session_start',
    {
      title: 'Start a private debug session',
      description: 'Compile the project and start a host simulation private to you at 0 ms, with the scene; answers a sessionId.',
      inputSchema: DEBUG_START_INPUT,
      annotations: DEBUG_ONLY,
    },
    (args, ctx) => dispatch('debug_session_start', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'debug_session_stop',
    {
      title: 'Stop a private debug session',
      description: 'Stop a private debug session: its simulator process ends, its plant and temporary state are removed.',
      inputSchema: DEBUG_STOP_INPUT,
      annotations: DEBUG_ONLY,
    },
    (args, ctx) => dispatch('debug_session_stop', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'debug_set_inputs',
    {
      title: 'Set inputs of a private session',
      description: 'Set program inputs (IPI) by name, or operate, emit or fault in the scene, of a private debug session before stepping.',
      inputSchema: DEBUG_INPUTS_INPUT,
      annotations: DEBUG_ONLY,
    },
    (args, ctx) => dispatch('debug_set_inputs', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'debug_breakpoints',
    {
      title: 'Breakpoints of a private session',
      description: 'List, set, add, remove or clear breakpoints of a private session by file and line (ST, IL) or element (LD, FBD, SFC).',
      inputSchema: DEBUG_BREAKPOINTS_INPUT,
      annotations: DEBUG_ONLY,
    },
    (args, ctx) => dispatch('debug_breakpoints', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'debug_step',
    {
      title: 'Step a private session',
      description: 'Run a private session by cycles, by ms of virtual time, or continue until a breakpoint stops it mid-scan.',
      inputSchema: DEBUG_STEP_INPUT,
      annotations: DEBUG_ONLY,
    },
    (args, ctx) => dispatch('debug_step', args, ctx.mcpReq.signal),
  );
  server.registerTool(
    'debug_inspect',
    {
      title: 'Inspect a private session',
      description: 'Read a private session by name: variables, function block members, active SFC steps, plant signals and facts.',
      inputSchema: DEBUG_INSPECT_INPUT,
      annotations: DEBUG_READ,
    },
    (args, ctx) => dispatch('debug_inspect', args, ctx.mcpReq.signal),
  );
  const serve = (uri: string, body: Record<string, unknown>) => {
    const text = JSON.stringify(body);
    return {
      contents: [
        {
          uri,
          text: Buffer.byteLength(text, 'utf8') <= MAX_OUTPUT_BYTES ? text : JSON.stringify({ ok: false, error: 'MCP_OUTPUT_LIMIT' }),
        },
      ],
    };
  };
  const resource = (uri: string, title: string, description: string, read: () => Promise<Record<string, unknown>>) =>
    server.registerResource(uri, uri, { title, description, mimeType: 'application/json' }, async () => {
      try {
        return serve(uri, await read());
      } catch {
        return { contents: [{ uri, text: JSON.stringify({ ok: false, error: 'MCP_INTERNAL_ERROR' }) }] };
      }
    });
  resource(
    'zplc://project/manifest',
    'Project manifest',
    'The zplc.json summary: name, version, tasks and target, credentials left out.',
    async () => resourceProject(workspace, 'manifest'),
  );
  resource(
    'zplc://project/programs',
    'Programs',
    'The programs of src with their file name, path and language (ST, IL, LD, FBD, SFC).',
    async () => programsResource(workspace),
  );
  resource(
    'zplc://project/symbols',
    'Compiled symbols',
    'The compiled variables with their type, region (IPI, OPI, WORK, RETAIN, CODE) and address.',
    async () => resourceProject(workspace, 'symbols'),
  );
  resource(
    'zplc://project/io-map',
    'I/O map',
    'The compiled inputs (IPI) and outputs (OPI) with their addresses and bit offsets.',
    async () => resourceProject(workspace, 'io-map'),
  );
  resource(
    'zplc://project/diagnostics',
    'Compiler diagnostics',
    'The diagnostics of compiling the saved project now, each with its place.',
    async () => resourceProject(workspace, 'diagnostics'),
  );
  resource(
    'zplc://target/capabilities',
    'Target capabilities',
    'The declared target and its memory profile from the board catalogue; never the state of a connected device.',
    async () => resourceProject(workspace, 'capabilities'),
  );
  resource(
    'zplc://runtime/trace',
    'How to read a trace',
    'How to read a recorded host trace with zplc://runtime/trace/{scenarioId} or trace_get.',
    async () => ({
      ok: true,
      stateless: true,
      template: 'zplc://runtime/trace/{scenarioId}',
      scope: 'recorded-native-posix-host',
      note: 'Read a deterministic recorded host trace by scenario ID; not a live runtime, hardware, or HIL.',
    }),
  );
  resource(
    'zplc://runtime/snapshot',
    'How to read a snapshot',
    'How to read one recorded sample with zplc://runtime/snapshot/{scenarioId}/{cursor}/{traceSha256}.',
    async () => ({
      ok: true,
      stateless: true,
      template: 'zplc://runtime/snapshot/{scenarioId}/{cursor}/{traceSha256}',
      scope: 'recorded-native-posix-host',
      note: 'Read one fenced deterministic recorded host snapshot; not a live runtime, hardware, or HIL.',
    }),
  );
  resource(
    'zplc://course/progress',
    'Course progress',
    'The lessons passed and how many are done, read from --user-data; it never writes progress.',
    async () => courseProgressResource(workspace),
  );
  for (const topic of ['evidence', 'safety', 'testing'] as const)
    resource(
      `zplc://docs/${topic}`,
      topic === 'evidence' ? 'Evidence levels' : topic === 'safety' ? 'Physical boundary' : 'Testing',
      topic === 'evidence'
        ? 'What the evidence level of a result means, and why a host result is not hardware or HIL evidence.'
        : topic === 'safety'
          ? 'What this server never does on a device (AGENTS.md rule 8), and what safety_check checks.'
          : 'How to test a program with deterministic scenarios on the host simulator.',
      async () => ({
        topic,
        text:
          topic === 'evidence'
            ? 'Tool results are evidence; recorded host results are not HIL.'
            : topic === 'safety'
              ? 'MCP cannot flash, deploy, force, run, stop, recover, access serial, or run a shell.'
              : 'Use scenario_run or stateless simulation tools for deterministic native POSIX tests.',
      }),
    );
  resource(
    'zplc://project/scene',
    'Plant scene',
    'The plant scene of scene.json: its parts, the signals it offers and the fact names.',
    () => sceneResource(workspace),
  );
  resource(
    'zplc://project/plant-map',
    'Plant map',
    'The bindings of plant-map.json and the points the compiled program does not have.',
    () => plantMapResource(workspace, compiledSymbols(workspace.root, toolApi)),
  );
  resource(
    'zplc://project/scenarios',
    'Scenarios',
    'The scenarios of tests with their ids, timing and a summary of each expectation.',
    () => scenariosResource(workspace),
  );
  resource(
    'zplc://lesson/current',
    'Current lesson',
    'The goal, objectives and hints of the lesson this workspace belongs to. It never holds the solution.',
    async () => lessonCurrentResource(workspace),
  );
  resource(
    'zplc://formats/ld',
    'Ladder file format',
    'The JSON Schema of a .ld.json file, its accepted element values and worked examples.',
    async () => formatResource('ld'),
  );
  resource(
    'zplc://formats/fbd',
    'FBD file format',
    'The JSON Schema of a .fbd.json file, its accepted block and port values and worked examples.',
    async () => formatResource('fbd'),
  );
  resource(
    'zplc://formats/sfc',
    'SFC file format',
    'The JSON Schema of a .sfc.json file, its accepted step, transition and action values and examples.',
    async () => formatResource('sfc'),
  );
  resource(
    'zplc://formats/scene',
    'Scene file format',
    'The JSON Schema of scene.json, the catalogue part ids and their configs, and worked examples.',
    async () => formatResource('scene'),
  );
  resource(
    'zplc://formats/plant-map',
    'Plant map file format',
    'The JSON Schema of plant-map.json, the direction, type and range rules, and worked examples.',
    async () => formatResource('plant-map'),
  );
  resource(
    'zplc://formats/scenario',
    'Scenario file format',
    'The JSON Schema of a tests/*.scenario.json file, the expectation kinds, the plant fact names and worked examples.',
    async () => formatResource('scenario'),
  );
  const template = (
    name: string,
    pattern: string,
    title: string,
    description: string,
    read: (variables: Record<string, string | string[]>, signal: AbortSignal) => Promise<Record<string, unknown>>,
  ) =>
    server.registerResource(
      name,
      new ResourceTemplate(pattern, { list: undefined }),
      { title, description, mimeType: 'application/json' },
      async (uri, variables, ctx) => {
        try {
          return serve(uri.href, await read(variables, ctx.mcpReq.signal));
        } catch {
          return { contents: [{ uri: uri.href, text: JSON.stringify({ ok: false, error: 'MCP_INTERNAL_ERROR' }) }] };
        }
      },
    );
  const replayResource = async (
    tool: 'trace_get' | 'runtime_snapshot',
    variables: Record<string, string | string[]>,
    signal: AbortSignal,
  ) => {
    const scenarioId = variables.scenarioId;
    if (!SCENARIO_INPUT.safeParse({ scenarioId }).success) return { ok: false, error: 'MCP_INVALID_ARGUMENTS' };
    const args =
      tool === 'trace_get' ? { scenarioId } : { scenarioId, cursor: Number(variables.cursor), traceSha256: variables.traceSha256 };
    if (!validArguments(tool, args)) return { ok: false, error: 'MCP_INVALID_ARGUMENTS' };
    const result = await dispatch(tool, args, signal);
    return result.structuredContent;
  };
  template(
    'project-source',
    'zplc://project/source/{name}',
    'Program source',
    'The saved text and language of one program of src, named by its URL-encoded file name.',
    async (variables) => {
      // the template hands over the name as the URI wrote it, so a name with a space arrives as %20
      let name: string | undefined;
      try {
        name = typeof variables.name === 'string' ? decodeURIComponent(variables.name) : undefined;
      } catch {
        name = undefined;
      }
      return name === undefined ? { ok: false, error: 'MCP_INVALID_ARGUMENTS' } : sourceResource(workspace, name);
    },
  );
  template(
    'project-scenario',
    'zplc://project/scenario/{scenarioId}',
    'Scenario definition',
    'The whole saved JSON of one scenario of tests, named by its id; an unknown id answers the valid ids.',
    async (variables) => {
      const scenarioId = variables.scenarioId;
      return SCENARIO_INPUT.safeParse({ scenarioId }).success
        ? scenarioResource(workspace, scenarioId as string)
        : { ok: false, error: 'MCP_INVALID_ARGUMENTS' };
    },
  );
  template(
    'runtime-trace',
    'zplc://runtime/trace/{scenarioId}',
    'Recorded trace',
    'The recorded host trace of one scenario run, as trace_get answers it.',
    (variables, signal) => replayResource('trace_get', variables, signal),
  );
  template(
    'runtime-snapshot',
    'zplc://runtime/snapshot/{scenarioId}/{cursor}/{traceSha256}',
    'Recorded snapshot',
    'One recorded sample of a scenario run at cursor, pinned by its trace digest, as runtime_snapshot answers it.',
    (variables, signal) => replayResource('runtime_snapshot', variables, signal),
  );
  registerPrompts(server);
  return server;
}

async function resourceProject(
  workspace: McpWorkspace,
  kind: 'manifest' | 'symbols' | 'io-map' | 'diagnostics' | 'capabilities',
): Promise<Record<string, unknown>> {
  if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
  if (kind === 'manifest') {
    const result = await toolApi.projectInspect(workspace.root);
    if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
    return projectResource('project_inspect', result, 'manifest');
  }
  if (kind === 'symbols' || kind === 'io-map') {
    const result = await toolApi.symbolsList(workspace.root);
    if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
    return projectResource('symbols_list', result, kind);
  }
  if (kind === 'diagnostics') {
    const result = await toolApi.compilerCheck(workspace.root);
    if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
    return projectResource('compiler_check', result, 'diagnostics');
  }
  const result = await toolApi.projectInspect(workspace.root);
  if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
  if (!result.ok) return { ok: false, diagnostics: result.evidence.diagnostics };
  const board = result.summary.target?.board;
  if (board === 'posix')
    return {
      ok: true,
      kind: 'host',
      declaredBoard: 'posix',
      scope: 'declared-host-target-only',
      note: 'Declared project target only; not a connected device, hardware, or HIL.',
    };
  const evidence = getBoardEvidenceSummary(board);
  const memory = getCompilerMemoryProfile(board);
  return evidence && memory
    ? {
        ok: true,
        kind: 'catalogue',
        declaredBoard: board,
        zephyrBoard: evidence.zephyrBoard,
        network: getBoardNetworkType(board),
        compilerMemory: memory,
        validationLevel: evidence.validationLevel,
        evidenceCount: evidence.evidenceCount,
        scope: 'declared-catalogue-cross-build-evidence-only',
        note: 'Declared catalogue target only; not a connected device, hardware, or HIL.',
      }
    : { ok: false, error: 'MCP_CAPABILITY_UNAVAILABLE' };
}

/** @internal Exact resource projector test seam; paths and private tool payloads never cross this boundary. */
export function projectResource(
  tool: 'project_inspect' | 'symbols_list' | 'compiler_check',
  value: unknown,
  kind: 'manifest' | 'symbols' | 'io-map' | 'diagnostics',
): Record<string, unknown> {
  const publicValue = publicResult(tool, value);
  if (!publicValue) return { ok: false, error: 'MCP_INTERNAL_ERROR' };
  if (kind === 'manifest')
    return publicValue.ok
      ? { ok: true, manifest: publicValue.summary }
      : { ok: false, diagnostics: (publicValue.evidence as { diagnostics: unknown }).diagnostics };
  if (kind === 'diagnostics') return { ok: publicValue.ok, diagnostics: (publicValue.evidence as { diagnostics: unknown }).diagnostics };
  if (!publicValue.ok) return { ok: false, diagnostics: (publicValue.evidence as { diagnostics: unknown }).diagnostics };
  const symbols = (
    publicValue.summary as {
      symbols: Array<{ pou: string; name: string; type: string; region: string; address: number; size: number; bitOffset?: number }>;
    }
  ).symbols;
  return kind === 'symbols'
    ? { ok: true, symbols }
    : {
        ok: true,
        io: symbols
          .filter((symbol) => symbol.region === 'IPI' || symbol.region === 'OPI')
          .map(({ pou, name, type, region, address, size, bitOffset }) => ({
            pou,
            name,
            type,
            region,
            address,
            size,
            ...(bitOffset === undefined ? {} : { bitOffset }),
          })),
      };
}
