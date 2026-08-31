import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { parseMcpWorkspaceArgument } from './index';
import { MCP_SERVER_VERSION, MCP_TOOL_NAMES, createMcpDispatcher, openMcpWorkspace, toMcpToolResult, type McpOperations } from './server';

const temporary: string[] = [];
async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-mcp-test-')); temporary.push(root);
  await mkdir(join(root, 'src')); await mkdir(join(root, 'tests'));
  await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'MCP test', version: '1.0.0', target: { board: 'posix' }, tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, watchdog_ms: 100, programs: ['Main.st'] }] }));
  await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM\n');
  await writeFile(join(root, 'tests', 'smoke.scenario.json'), JSON.stringify({ id: 'smoke', duration: '10ms', expect: [] }));
  return root;
}
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

const hash = 'a'.repeat(64);
function evidence(operation: string, outcome: 'passed' | 'failed' = 'passed') {
  const artifacts = outcome === 'failed' ? [] : operation === 'check' || operation === 'compile' ? [{ kind: 'zplc', sha256: hash, byteLength: 1 }] : operation === 'test' || operation === 'scenario-run' ? [{ kind: 'zplc', sha256: hash, byteLength: 1 }, { kind: 'trace', sha256: hash, byteLength: 1 }] : [];
  return { schemaVersion: 1, operation, outcome, diagnostics: [], artifacts };
}
const inspectSummary = { schemaVersion: 2, sourceSchemaVersion: 2, migrated: false, name: 'safe', version: '1.0.0', taskCount: 1, sources: [{ name: 'Main.st', language: 'ST' }] };
const validateSummary = { name: 'safe', taskCount: 1 };
const compilerSummary = { name: 'safe', version: '1.0.0', taskCount: 1, codeSize: 1 };
const testSummary = { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [] };
function operations(overrides: Partial<McpOperations> = {}): McpOperations {
  return {
    projectInspect: async () => ({ ok: true as const, summary: inspectSummary, evidence: evidence('inspect') }),
    projectValidate: async () => ({ ok: true as const, summary: validateSummary, evidence: evidence('validate') }),
    compilerCheck: async () => ({ ok: true as const, summary: compilerSummary, evidence: evidence('check') }),
    compilerCompile: async () => ({ ok: true as const, summary: compilerSummary, evidence: evidence('compile') }),
    symbolsList: async () => ({ ok: true as const, summary: { symbols: [] }, evidence: evidence('symbols-list') }),
    safetyCheck: async () => ({ ok: true as const, summary: { configured: false, declared: [], covered: [], uncovered: [] }, evidence: evidence('safety-check') }),
    testsRun: async () => ({ ok: true as const, summary: testSummary, evidence: evidence('test') }),
    scenarioRun: async () => ({ ok: true as const, summary: testSummary, evidence: evidence('scenario-run') }),
    ...overrides,
  };
}

describe('local MCP adapter', () => {
  test('exposes only the fixed safe tool allowlist', () => {
    expect(MCP_SERVER_VERSION).toBe('2.0.0-rc.1');
    expect(MCP_TOOL_NAMES).toEqual(['project_inspect', 'project_validate', 'compiler_check', 'compiler_compile', 'symbols_list', 'safety_check', 'tests_run', 'scenario_run']);
    expect(MCP_TOOL_NAMES.filter((name) => ['flash', 'deploy', 'force', 'stop', 'serial', 'shell', 'firmware', 'write'].some((forbidden) => name.includes(forbidden)))).toEqual([]);
  });

  test('accepts exactly one explicit workspace option and no extra CLI surface', () => {
    expect(parseMcpWorkspaceArgument(['--workspace', '/safe'])).toBe('/safe');
    expect(parseMcpWorkspaceArgument(['--workspace=/safe'])).toBe('/safe');
    expect(parseMcpWorkspaceArgument(['--workspace', '/safe', '--workspace', '/other'])).toBeUndefined();
    expect(parseMcpWorkspaceArgument(['--workspace', '/safe', '--other'])).toBeUndefined();
    expect(parseMcpWorkspaceArgument(['--workspace'])).toBeUndefined();
  });

  test('rejects relative, symlink, and invalid workspace roots', async () => {
    const root = await workspace();
    const link = `${root}-link`; temporary.push(link); await symlink(root, link);
    expect(await openMcpWorkspace('relative')).toBeUndefined();
    expect(await openMcpWorkspace(link)).toBeUndefined();
    const invalid = await mkdtemp(join(tmpdir(), 'zplc-mcp-invalid-')); temporary.push(invalid);
    expect(await openMcpWorkspace(invalid)).toBeUndefined();
    expect(await openMcpWorkspace(root)).toBeDefined();
  });

  test('serializes only public data and rejects accessors, buffers, prototypes, symbols, and oversize results', () => {
    const root = '/not-for-output'; const source = 'secret source'; const value: Record<string, unknown> = { ok: true, summary: compilerSummary, evidence: evidence('compile'), root, source };
    Object.defineProperty(value, 'bytes', { value: Buffer.from('private'), enumerable: false });
    Object.defineProperty(value, 'leak', { enumerable: true, get: () => { throw new Error('must not execute'); } });
    const result = toMcpToolResult('compiler_compile', value);
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain(root);
    expect(JSON.stringify(result)).not.toContain(source);
    const compiled: Record<string, unknown> = { ok: true, summary: compilerSummary, evidence: evidence('compile'), root, source };
    Object.defineProperty(compiled, 'bytes', { value: Buffer.from('private'), enumerable: false });
    expect(JSON.stringify(toMcpToolResult('compiler_compile', compiled))).not.toContain(root);
    expect(JSON.stringify(toMcpToolResult('compiler_compile', compiled))).not.toContain(source);
    expect(toMcpToolResult('compiler_compile', { ok: true, summary: { ...compilerSummary, name: 'x'.repeat(512 * 1024) }, evidence: evidence('compile') }).isError).toBe(true);
    expect(toMcpToolResult('compiler_compile', { ok: true, summary: Object.create({ inherited: 'no' }), evidence: evidence('compile') }).isError).toBe(true);
    expect(toMcpToolResult('compiler_compile', { ok: true, summary: { [Symbol('hidden')]: 'no' }, evidence: evidence('compile') }).isError).toBe(true);
  });

  test('projects exact tool shapes without reading hostile arrays, unknown summary fields, or proxies', () => {
    const source = 'PRIVATE_SOURCE_TEXT';
    expect(JSON.stringify(toMcpToolResult('compiler_compile', { ok: true, summary: { ...compilerSummary, sourceText: source }, evidence: evidence('compile') }))).not.toContain(source);
    expect(toMcpToolResult('compiler_compile', { ok: true, summary: compilerSummary, evidence: evidence('check') }).isError).toBe(true);
    expect(toMcpToolResult('compiler_compile', { ok: true, summary: compilerSummary, evidence: evidence('compile', 'failed') }).isError).toBe(true);
    let getterReads = 0; const getterArray: unknown[] = []; Object.defineProperty(getterArray, '0', { enumerable: true, get: () => { getterReads += 1; return {}; } }); getterArray.length = 1;
    expect(toMcpToolResult('compiler_compile', { ok: true, summary: compilerSummary, evidence: { ...evidence('compile'), diagnostics: getterArray } }).isError).toBe(true); expect(getterReads).toBe(0);
    const sparse = new Array(1); expect(toMcpToolResult('compiler_compile', { ok: true, summary: compilerSummary, evidence: { ...evidence('compile'), diagnostics: sparse } }).isError).toBe(true);
    const extra: unknown[] = []; Object.defineProperty(extra, 'extra', { value: true, enumerable: true }); expect(toMcpToolResult('compiler_compile', { ok: true, summary: compilerSummary, evidence: { ...evidence('compile'), diagnostics: extra } }).isError).toBe(true);
    const revocable = Proxy.revocable([], {}); revocable.revoke(); expect(() => toMcpToolResult('compiler_compile', { ok: true, summary: compilerSummary, evidence: { ...evidence('compile'), diagnostics: revocable.proxy } })).not.toThrow();
  });

  test('rejects root-bearing logical paths and incomplete successful artifact evidence', () => {
    const root = '/home/eduardo/private-workspace'; const windows = 'C:\\private\\workspace';
    const diagnostic = { ...evidence('compile'), diagnostics: [{ code: 'NOPE', message: 'Nope', path: root }] };
    expect(JSON.stringify(toMcpToolResult('compiler_compile', { ok: false, evidence: { ...diagnostic, outcome: 'failed' } }))).not.toContain(root);
    expect(JSON.stringify(toMcpToolResult('symbols_list', { ok: true, summary: { symbols: [{ pou: 'Main', name: 'Out', type: 'BOOL', region: 'OPI', address: 0, size: 1, sourceRef: windows }] }, evidence: evidence('symbols-list') }))).not.toContain(windows);
    expect(JSON.stringify(toMcpToolResult('tests_run', { ok: true, summary: { ...testSummary, scenarios: [{ id: 'one', path: root, passed: true, traceSha256: hash, traceByteLength: 1 }] }, evidence: evidence('test') }))).not.toContain(root);
    expect(toMcpToolResult('compiler_compile', { ok: true, summary: compilerSummary, evidence: { ...evidence('compile'), artifacts: [] } }).isError).toBe(true);
    expect(toMcpToolResult('compiler_compile', { ok: true, summary: compilerSummary, evidence: { ...evidence('compile'), artifacts: [{ kind: 'trace', sha256: hash, byteLength: 1 }] } }).isError).toBe(true);
    expect(toMcpToolResult('compiler_compile', { ok: true, summary: compilerSummary, evidence: { ...evidence('compile'), artifacts: [{ kind: 'zplc', sha256: 'A'.repeat(64), byteLength: 1 }] } }).isError).toBe(true);
    expect(toMcpToolResult('tests_run', { ok: true, summary: testSummary, evidence: { ...evidence('test'), artifacts: [{ kind: 'zplc', sha256: hash, byteLength: 1 }, { kind: 'zplc', sha256: hash, byteLength: 1 }] } }).isError).toBe(true);
    expect(toMcpToolResult('tests_run', { ok: true, summary: testSummary, evidence: evidence('test') }).isError).toBeUndefined();
    expect(toMcpToolResult('tests_run', { ok: true, summary: testSummary, evidence: evidence('test'), savedTestInputIdentity: { schemaVersion: 1, sha256: hash, fileCount: 1 } }).isError).toBeUndefined();
    expect(toMcpToolResult('tests_run', { ok: true, summary: testSummary, evidence: evidence('test'), savedTestInputIdentity: { schemaVersion: 1, sha256: 'A'.repeat(64), fileCount: 0 } }).isError).toBe(true);
  });

  test('rejects all tool arguments except a bounded scenario selector', async () => {
    const root = await workspace(); const bound = await openMcpWorkspace(root); expect(bound).toBeDefined(); if (!bound) return;
    const dispatcher = createMcpDispatcher(bound, operations()); const signal = new AbortController().signal;
    expect(await dispatcher('project_inspect', { path: '../escape' }, signal)).toMatchObject({ isError: true, structuredContent: { error: 'MCP_INVALID_ARGUMENTS' } });
    expect(await dispatcher('scenario_run', { scenarioId: '../escape' }, signal)).toMatchObject({ isError: true, structuredContent: { error: 'MCP_INVALID_ARGUMENTS' } });
    expect(await dispatcher('scenario_run', { scenarioId: 'safe-id:1.0' }, signal)).toMatchObject({ structuredContent: { ok: true } });
  });

  test('fails closed when the bound root identity changes and gates concurrent calls', async () => {
    const root = await workspace(); const bound = await openMcpWorkspace(root); expect(bound).toBeDefined(); if (!bound) return;
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const dispatcher = createMcpDispatcher(bound, operations({ projectInspect: async () => { await delayed; return { ok: true as const, summary: inspectSummary, evidence: evidence('inspect') }; } }));
    const first = dispatcher('project_inspect', {}, new AbortController().signal);
    expect(await dispatcher('project_validate', {}, new AbortController().signal)).toMatchObject({ isError: true, structuredContent: { error: 'MCP_BUSY' } });
    await rm(root, { recursive: true, force: true }); await mkdir(root); await mkdir(join(root, 'src')); await writeFile(join(root, 'zplc.json'), '{}');
    release(); expect(await first).toMatchObject({ isError: true, structuredContent: { error: 'MCP_WORKSPACE_CHANGED' } });
  });

  test('forwards cancellation to test operations and maps failed tool results to MCP errors', async () => {
    const root = await workspace(); const bound = await openMcpWorkspace(root); expect(bound).toBeDefined(); if (!bound) return;
    let received: AbortSignal | undefined;
    const controller = new AbortController(); controller.abort();
    const dispatcher = createMcpDispatcher(bound, operations({ testsRun: async (_root, options) => { received = options?.signal; return { ok: true as const, summary: testSummary, evidence: evidence('test') }; }, scenarioRun: async () => ({ ok: false as const, evidence: evidence('scenario-run', 'failed') }) }));
    expect(await dispatcher('tests_run', {}, controller.signal)).toMatchObject({ isError: true, structuredContent: { error: 'MCP_CANCELLED' } });
    expect(received).toBeUndefined();
    const live = new AbortController(); await dispatcher('tests_run', {}, live.signal); expect(received).toBe(live.signal);
    expect(await dispatcher('scenario_run', { scenarioId: 'smoke' }, live.signal)).toMatchObject({ isError: true, structuredContent: { ok: false } });
  });
});
