import { isAbsolute } from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import idePackage from '../../package.json';
import { directoryIdentity, type DirectoryIdentity } from '../cli/firmwareBuildRunner';
import * as toolApi from '../cli/toolApi';

const MAX_OUTPUT_BYTES = 512 * 1024;
const EMPTY_INPUT = z.object({}).strict();
const SCENARIO_INPUT = z.object({ scenarioId: z.string().max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/) }).strict();
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const MCP_TOOL_NAMES = ['project_inspect', 'project_validate', 'compiler_check', 'compiler_compile', 'symbols_list', 'safety_check', 'tests_run', 'scenario_run'] as const;
export const MCP_SERVER_VERSION = idePackage.version;
type McpToolName = typeof MCP_TOOL_NAMES[number];
type ToolArguments = Record<string, unknown>;
export interface McpOperations {
  projectInspect(root: string): Promise<unknown>; projectValidate(root: string): Promise<unknown>; compilerCheck(root: string): Promise<unknown>; compilerCompile(root: string): Promise<unknown>;
  symbolsList(root: string): Promise<unknown>; safetyCheck(root: string): Promise<unknown>; testsRun(root: string, options?: toolApi.TestsRunOptions): Promise<unknown>;
  scenarioRun(root: string, scenarioId: string, options?: toolApi.TestsRunOptions): Promise<unknown>;
}
export interface McpWorkspace { readonly root: string; readonly identity: DirectoryIdentity; }
type McpToolResult = { content: Array<{ type: 'text'; text: string }>; structuredContent: Record<string, unknown>; isError?: boolean };

function errorResult(error: 'MCP_BUSY' | 'MCP_CANCELLED' | 'MCP_INVALID_ARGUMENTS' | 'MCP_INTERNAL_ERROR' | 'MCP_OUTPUT_LIMIT' | 'MCP_WORKSPACE_CHANGED'): McpToolResult {
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
const logicalPathSchema = z.string().refine(logicalPath);
const diagnosticSchema = z.object({ code: z.string(), message: z.string(), path: logicalPathSchema.optional(), phase: z.enum(['lexer', 'parser', 'codegen', 'assembler']).optional(), line: z.number().int().optional(), column: z.number().int().optional() }).strict();
const artifactSchema = z.object({ kind: z.enum(['zplc', 'bytecode', 'trace', 'firmware-elf', 'project-manifest']), sha256: z.string().regex(/^[0-9a-f]{64}$/), byteLength: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
const evidenceSchema = z.object({ schemaVersion: z.literal(1), operation: z.string(), outcome: z.enum(['passed', 'failed']), diagnostics: z.array(diagnosticSchema), artifacts: z.array(artifactSchema) }).strict();
const compilerSummarySchema = z.object({ name: z.string(), version: z.string(), taskCount: z.number().int().nonnegative(), codeSize: z.number().int().nonnegative() }).strict();
const testSummarySchema = z.object({ backend: z.literal('native-posix'), mode: z.literal('logical-cyclic-task-set-scan'), scenarios: z.array(z.object({ id: z.string(), path: logicalPathSchema.refine((path) => path.startsWith('tests/')), passed: z.boolean(), traceSha256: z.string().regex(/^[0-9a-f]{64}$/), traceByteLength: z.number().int().nonnegative() }).strict()) }).strict();
const savedInputSchema = z.object({ schemaVersion: z.literal(1), sha256: z.string().regex(/^[0-9a-f]{64}$/), fileCount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();

function summarySchema(tool: McpToolName): z.ZodType {
  switch (tool) {
    case 'project_inspect': return z.object({ schemaVersion: z.literal(2), sourceSchemaVersion: z.union([z.literal(1), z.literal(2)]), migrated: z.boolean(), name: z.string(), version: z.string(), taskCount: z.number().int().nonnegative(), sources: z.array(z.object({ name: z.string(), language: z.string() }).strict()) }).strict();
    case 'project_validate': return z.object({ name: z.string(), taskCount: z.number().int().nonnegative() }).strict();
    case 'compiler_check': case 'compiler_compile': return compilerSummarySchema;
    case 'symbols_list': return z.object({ symbols: z.array(z.object({ pou: z.string(), name: z.string(), type: z.string(), region: z.enum(['IPI', 'OPI', 'WORK', 'RETAIN', 'CODE']), address: z.number().int().nonnegative(), size: z.number().int().nonnegative(), sourceRef: logicalPathSchema.refine((path) => path.startsWith('src/')).optional(), bitOffset: z.number().int().nonnegative().optional(), declarationLine: z.number().int().positive().optional() }).strict()) }).strict();
    case 'safety_check': return z.object({ configured: z.boolean(), declared: z.array(z.object({ outputs: z.tuple([z.string(), z.string()]) }).strict()), covered: z.array(z.object({ outputs: z.tuple([z.string(), z.string()]) }).strict()), uncovered: z.array(z.object({ outputs: z.tuple([z.string(), z.string()]) }).strict()) }).strict();
    case 'tests_run': case 'scenario_run': return testSummarySchema;
  }
}

function expectedOperation(tool: McpToolName): string {
  return tool === 'project_inspect' ? 'inspect' : tool === 'project_validate' ? 'validate' : tool === 'compiler_check' ? 'check' : tool === 'compiler_compile' ? 'compile' : tool === 'symbols_list' ? 'symbols-list' : tool === 'safety_check' ? 'safety-check' : tool === 'tests_run' ? 'test' : 'scenario-run';
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

function publicResult(tool: McpToolName, value: unknown): Record<string, unknown> | undefined {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length > 0) return undefined;
    const allowed = new Set(['ok', 'summary', 'evidence', 'preview', 'savedTestInputIdentity']);
    for (const key of Object.keys(value)) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!allowed.has(key) || !descriptor || !('value' in descriptor)) return undefined; }
    const ok = ownValue(value, 'ok'); const evidence = ownValue(value, 'evidence'); if (typeof ok !== 'boolean' || evidence === undefined) return undefined;
    const output: Record<string, unknown> = { ok, evidence: safeJson(evidence) };
    const summary = ownValue(value, 'summary'); if (summary !== undefined) output.summary = safeJson(summary);
    const saved = ownValue(value, 'savedTestInputIdentity'); if (saved !== undefined) output.savedTestInputIdentity = safeJson(saved);
    if (Object.values(output).some((item) => item === undefined)) return undefined;
    const schema = z.object({ ok: z.boolean(), summary: summarySchema(tool).optional(), evidence: evidenceSchema, savedTestInputIdentity: savedInputSchema.optional() }).strict();
    const parsed = schema.safeParse(output); if (!parsed.success || (parsed.data.ok && parsed.data.summary === undefined)) return undefined;
    if (parsed.data.evidence.operation !== expectedOperation(tool) || parsed.data.evidence.outcome !== (parsed.data.ok ? 'passed' : 'failed') || !validArtifacts(tool, parsed.data.ok, parsed.data.evidence.artifacts)) return undefined;
    if (!['tests_run', 'scenario_run'].includes(tool) && parsed.data.savedTestInputIdentity !== undefined) return undefined;
    return parsed.data as Record<string, unknown>;
  } catch { return undefined; }
}

/** Serializes only exact public Tool API summaries and evidence. Private compiler payloads stay internal. */
export function toMcpToolResult(tool: McpToolName, value: unknown): McpToolResult {
  const publicValue = publicResult(tool, value); if (!publicValue) return errorResult('MCP_INTERNAL_ERROR');
  let text: string;
  try { text = JSON.stringify(publicValue); } catch { return errorResult('MCP_INTERNAL_ERROR'); }
  if (Buffer.byteLength(text, 'utf8') > MAX_OUTPUT_BYTES) return errorResult('MCP_OUTPUT_LIMIT');
  return { content: [{ type: 'text', text }], structuredContent: JSON.parse(text) as Record<string, unknown>, ...(publicValue.ok === false ? { isError: true } : {}) };
}

function sameIdentity(left: DirectoryIdentity, right: DirectoryIdentity | undefined): boolean {
  return !!right && left.path === right.path && left.dev === right.dev && left.ino === right.ino;
}

export async function openMcpWorkspace(root: string): Promise<McpWorkspace | undefined> {
  if (!isAbsolute(root)) return undefined;
  const identity = await directoryIdentity(root); if (!identity) return undefined;
  const inspected = await toolApi.projectInspect(identity.path); if (!inspected.ok) return undefined;
  return { root: identity.path, identity };
}

function validArguments(tool: McpToolName, args: ToolArguments): boolean {
  if (!args || Object.getPrototypeOf(args) !== Object.prototype || Object.getOwnPropertySymbols(args).length > 0 || Object.keys(args).some((key) => !('value' in (Object.getOwnPropertyDescriptor(args, key) ?? {})))) return false;
  if (tool !== 'scenario_run') return Object.keys(args).length === 0;
  const scenarioId = ownValue(args, 'scenarioId'); return Object.keys(args).length === 1 && typeof scenarioId === 'string' && scenarioId.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(scenarioId);
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
      const value = await callTool(tool, workspace.root, args, signal, operations);
      if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return errorResult('MCP_WORKSPACE_CHANGED');
      return signal.aborted ? errorResult('MCP_CANCELLED') : toMcpToolResult(tool, value);
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
  return server;
}
