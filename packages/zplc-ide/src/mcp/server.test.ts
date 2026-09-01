import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { parseMcpWorkspaceArgument } from './index';
import { MCP_RESOURCE_URIS, MCP_SERVER_VERSION, MCP_TOOL_NAMES, courseProgressResource, createMcpDispatcher, openMcpRepository, openMcpUserData, openMcpWorkspace, projectResource, toMcpToolResult, type McpOperations } from './server';

const temporary: string[] = [];
async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-mcp-test-')); temporary.push(root);
  await mkdir(join(root, 'src')); await mkdir(join(root, 'tests'));
  await writeFile(join(root, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'MCP test', version: '1.0.0', target: { board: 'posix' }, tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }] }));
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
    boardsList: async () => ({ ok: true as const, summary: { boards: [] }, evidence: evidence('boards-list') }),
    toolchainInspect: async () => ({ ok: true as const, summary: { scope: 'local-firmware-build-prerequisites', ready: false, checks: [], boards: [] }, evidence: evidence('toolchain-inspect') }),
    firmwareBuild: async () => ({ ok: false as const, evidence: evidence('firmware-build', 'failed') }),
    ...overrides,
  };
}

describe('local MCP adapter', () => {
  test('exposes only the fixed safe tool allowlist', () => {
    expect(MCP_SERVER_VERSION).toBe('2.0.0-rc.3');
    expect(MCP_TOOL_NAMES).toEqual(['project_inspect', 'project_validate', 'compiler_check', 'compiler_compile', 'symbols_list', 'safety_check', 'tests_run', 'scenario_run', 'simulation_start', 'simulation_step', 'runtime_snapshot', 'trace_get', 'boards_list', 'toolchain_inspect', 'firmware_build']);
    expect(MCP_RESOURCE_URIS).toEqual(['zplc://project/manifest', 'zplc://project/symbols', 'zplc://project/io-map', 'zplc://project/diagnostics', 'zplc://target/capabilities', 'zplc://runtime/trace', 'zplc://runtime/snapshot', 'zplc://course/progress', 'zplc://docs/evidence', 'zplc://docs/safety', 'zplc://docs/testing']);
    expect(MCP_TOOL_NAMES.filter((name) => ['flash', 'deploy', 'force', 'stop', 'serial', 'shell', 'write'].some((forbidden) => name.includes(forbidden)))).toEqual([]);
  });

  test('accepts exactly one explicit workspace option and no extra CLI surface', () => {
    expect(parseMcpWorkspaceArgument(['--workspace', '/safe'])).toEqual({ workspace: '/safe' });
    expect(parseMcpWorkspaceArgument(['--workspace=/safe'])).toEqual({ workspace: '/safe' });
    expect(parseMcpWorkspaceArgument(['--workspace', '/safe', '--repository', '/repo'])).toEqual({ workspace: '/safe', repository: '/repo' });
    expect(parseMcpWorkspaceArgument(['--workspace', '/safe', '--user-data', '/user-data'])).toEqual({ workspace: '/safe', userData: '/user-data' });
    expect(parseMcpWorkspaceArgument(['--workspace', '/safe', '--workspace', '/other'])).toBeUndefined();
    expect(parseMcpWorkspaceArgument(['--workspace', '/safe', '--other'])).toBeUndefined();
    expect(parseMcpWorkspaceArgument(['--workspace'])).toBeUndefined();
    expect(parseMcpWorkspaceArgument(['--workspace', '/safe', '--user-data', '/one', '--user-data', '/two'])).toBeUndefined();
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

  test('projects explicit current Learn progress and fails closed for malformed or linked data', async () => {
    const root = await workspace(); const userData = await mkdtemp(join(tmpdir(), 'zplc-mcp-user-data-')); temporary.push(userData);
    const bound = await openMcpWorkspace(root); const user = await openMcpUserData(userData); expect(bound).toBeDefined(); expect(user).toBeDefined(); if (!bound || !user) return;
    await expect(courseProgressResource({ ...bound, userData: user })).resolves.toEqual({ ok: true, schemaVersion: 1, mastered: [], completed: 0, total: 10 });
    await writeFile(join(userData, 'zplc-learn-mastery.v1.json'), '{"schemaVersion":1,"mastered":["motor-start-stop-safe"]}');
    await expect(courseProgressResource({ ...bound, userData: user })).resolves.toEqual({ ok: true, schemaVersion: 1, mastered: ['motor-start-stop-safe'], completed: 1, total: 10 });
    await writeFile(join(userData, 'zplc-learn-mastery.v1.json'), '{"schemaVersion":1,"mastered":["unknown"]}');
    await expect(courseProgressResource({ ...bound, userData: user })).resolves.toEqual({ ok: false, error: 'MCP_INTERNAL_ERROR' });
    await rm(join(userData, 'zplc-learn-mastery.v1.json')); await symlink('/etc/passwd', join(userData, 'zplc-learn-mastery.v1.json'));
    await expect(courseProgressResource({ ...bound, userData: user })).resolves.toEqual({ ok: false, error: 'MCP_INTERNAL_ERROR' });
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
    expect(toMcpToolResult('compiler_compile', { ok: true, summary: compilerSummary, evidence: evidence('compile') }, { schemaVersion: 1, actor: 'mcp', permission: 'compiler:check', operation: 'compile', outcome: 'passed', startedAt: '2026-08-31T00:00:00.000Z', finishedAt: '2026-08-31T00:00:01.000Z', extra: true }).isError).toBe(true);
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
    expect(await dispatcher('scenario_run', { scenarioId: 'safe-id:1.0' }, signal)).toMatchObject({ structuredContent: { ok: true, execution: { schemaVersion: 1, actor: 'mcp', permission: 'tests:run', operation: 'scenario-run', outcome: 'passed', jobId: expect.any(String), startedAt: expect.any(String), finishedAt: expect.any(String) } } });
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

  test('replays a deterministic host trace without retaining a session and fences every cursor by hash', async () => {
    const root = await workspace(); const bound = await openMcpWorkspace(root); expect(bound).toBeDefined(); if (!bound) return;
    let calls = 0;
    const replayBytes = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'smoke', path: 'tests/smoke.scenario.json', passed: true, trace: [{ atMs: 0, outputs: { 'Main.Q': false } }, { atMs: 10, outputs: { 'Main.Q': true } }], assertions: [{ kind: 'AT', passed: true, atMs: 10 }] }] }));
    const replayHash = createHash('sha256').update(replayBytes).digest('hex');
    const replayValue = () => {
      const value: Record<string, unknown> = { ok: true, summary: testSummary, evidence: { ...evidence('scenario-run'), artifacts: [{ kind: 'zplc', sha256: hash, byteLength: 1 }, { kind: 'trace', sha256: replayHash, byteLength: replayBytes.byteLength }] } };
      Object.defineProperty(value, 'traceFile', { value: replayBytes }); return value;
    };
    const dispatcher = createMcpDispatcher(bound, operations({ scenarioRun: async () => { calls++; return replayValue(); } })); const signal = new AbortController().signal;
    const started = await dispatcher('simulation_start', { scenarioId: 'smoke' }, signal);
    expect(started).toMatchObject({ structuredContent: { ok: true, scope: 'recorded-native-posix-host', cursor: 0, totalSamples: 2, traceSha256: replayHash } });
    expect(await dispatcher('simulation_step', { scenarioId: 'smoke', cursor: 0, traceSha256: replayHash }, signal)).toMatchObject({ structuredContent: { cursor: 1, done: true } });
    expect(await dispatcher('runtime_snapshot', { scenarioId: 'smoke', cursor: 2, traceSha256: replayHash }, signal)).toMatchObject({ isError: true, structuredContent: { error: 'MCP_INVALID_ARGUMENTS' } });
    expect(await dispatcher('simulation_step', { scenarioId: 'smoke', cursor: 0, traceSha256: 'b'.repeat(64) }, signal)).toMatchObject({ isError: true, structuredContent: { error: 'MCP_WORKSPACE_CHANGED' } });
    expect(calls).toBe(4);
  });

  test('fails closed for replay artifact mismatches and every non-canonical aggregate trace shape', async () => {
    const root = await workspace(); const bound = await openMcpWorkspace(root); expect(bound).toBeDefined(); if (!bound) return;
    const aggregate = {
      schemaVersion: 1,
      backend: 'native-posix',
      mode: 'logical-cyclic-task-set-scan',
      scenarios: [{
        id: 'smoke',
        path: 'tests/smoke.scenario.json',
        passed: true,
        trace: [{ atMs: 0, outputs: { 'Main.Q': false } }],
        assertions: [{ kind: 'AT', passed: true, atMs: 0 }],
      }],
    };
    const cases: Array<{ name: string; payload: unknown; mutation?: 'hash' | 'byteLength' }> = [
      { name: 'actual byte hash mismatch', payload: aggregate, mutation: 'hash' },
      { name: 'actual byte length mismatch', payload: aggregate, mutation: 'byteLength' },
      { name: 'aggregate extra key', payload: { ...aggregate, private: true } },
      { name: 'scenario extra key', payload: { ...aggregate, scenarios: [{ ...aggregate.scenarios[0], private: true }] } },
      { name: 'absolute scenario path', payload: { ...aggregate, scenarios: [{ ...aggregate.scenarios[0], path: '/tests/smoke.scenario.json' }] } },
      { name: 'escaping scenario path', payload: { ...aggregate, scenarios: [{ ...aggregate.scenarios[0], path: 'tests/../secret.scenario.json' }] } },
      { name: 'invalid output value', payload: { ...aggregate, scenarios: [{ ...aggregate.scenarios[0], trace: [{ atMs: 0, outputs: { 'Main.Q': 'true' } }] }] } },
    ];
    for (const entry of cases) {
      const bytes = new TextEncoder().encode(JSON.stringify(entry.payload));
      const actualHash = createHash('sha256').update(bytes).digest('hex');
      const trace = { sha256: entry.mutation === 'hash' ? 'b'.repeat(64) : actualHash, byteLength: entry.mutation === 'byteLength' ? bytes.byteLength + 1 : bytes.byteLength };
      const result: Record<string, unknown> = {
        ok: true,
        summary: testSummary,
        evidence: { ...evidence('scenario-run'), artifacts: [{ kind: 'zplc', sha256: hash, byteLength: 1 }, { kind: 'trace', ...trace }] },
      };
      Object.defineProperty(result, 'traceFile', { value: bytes });
      const dispatcher = createMcpDispatcher(bound, operations({ scenarioRun: async () => result }));
      expect(await dispatcher('simulation_start', { scenarioId: 'smoke' }, new AbortController().signal), entry.name).toMatchObject({ isError: true, structuredContent: { error: 'MCP_INTERNAL_ERROR' } });
    }
  });

  test('keeps failed scenario evidence while replaying it as an MCP error', async () => {
    const root = await workspace(); const bound = await openMcpWorkspace(root); expect(bound).toBeDefined(); if (!bound) return;
    const bytes = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'smoke', path: 'tests/smoke.scenario.json', passed: false, trace: [{ atMs: 0, outputs: { 'Main.Q': false } }], assertions: [{ kind: 'NEVER', passed: false, atMs: 0 }] }] }));
    const traceSha256 = createHash('sha256').update(bytes).digest('hex');
    const failed: Record<string, unknown> = {
      ok: false,
      summary: testSummary,
      evidence: { ...evidence('scenario-run', 'failed'), artifacts: [{ kind: 'zplc', sha256: hash, byteLength: 1 }, { kind: 'trace', sha256: traceSha256, byteLength: bytes.byteLength }] },
    };
    Object.defineProperty(failed, 'traceFile', { value: bytes });
    const result = await createMcpDispatcher(bound, operations({ scenarioRun: async () => failed }))('simulation_start', { scenarioId: 'smoke' }, new AbortController().signal);
    expect(result).toMatchObject({ isError: true, structuredContent: { ok: false, evidence: { operation: 'scenario-run', outcome: 'failed', artifacts: [{ kind: 'zplc' }, { kind: 'trace', sha256: traceSha256, byteLength: bytes.byteLength }] } } });
  });

  test('fences replay after workspace replacement during its awaited scenario operation', async () => {
    const root = await workspace(); const bound = await openMcpWorkspace(root); expect(bound).toBeDefined(); if (!bound) return;
    let release!: () => void; let entered!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; }); const started = new Promise<void>((resolve) => { entered = resolve; });
    const dispatcher = createMcpDispatcher(bound, operations({ scenarioRun: async () => { entered(); await delayed; return { ok: false as const, evidence: evidence('scenario-run', 'failed') }; } }));
    const pending = dispatcher('simulation_start', { scenarioId: 'smoke' }, new AbortController().signal);
    await started;
    await rm(root, { recursive: true, force: true }); await mkdir(root); await mkdir(join(root, 'src')); await writeFile(join(root, 'zplc.json'), '{}');
    release(); expect(await pending).toMatchObject({ isError: true, structuredContent: { error: 'MCP_WORKSPACE_CHANGED' } });
  });

  test('fences separate repository replacement while repository operations await', async () => {
    for (const tool of ['boards_list', 'toolchain_inspect'] as const) {
      const root = await workspace(); const bound = await openMcpWorkspace(root); expect(bound).toBeDefined(); if (!bound) return;
      const repositoryRoot = await workspace(); const repository = await openMcpWorkspace(repositoryRoot); expect(repository).toBeDefined(); if (!repository) return;
      let release!: () => void; let entered!: () => void;
      const delayed = new Promise<void>((resolve) => { release = resolve; }); const started = new Promise<void>((resolve) => { entered = resolve; });
      const dispatcher = createMcpDispatcher({ ...bound, repository: { root: repository.root, identity: repository.identity } }, operations({
        boardsList: async () => { entered(); await delayed; return { ok: true as const, summary: { boards: [] }, evidence: evidence('boards-list') }; },
        toolchainInspect: async () => { entered(); await delayed; return { ok: true as const, summary: { scope: 'local-firmware-build-prerequisites', ready: false, checks: [], boards: [] }, evidence: evidence('toolchain-inspect') }; },
      }));
      const pending = dispatcher(tool, {}, new AbortController().signal);
      await started;
      await rm(repositoryRoot, { recursive: true, force: true }); await mkdir(repositoryRoot);
      release(); expect(await pending).toMatchObject({ isError: true, structuredContent: { error: 'MCP_WORKSPACE_CHANGED' } });
    }
  });

  test('cancels a pending firmware build without exposing its result', async () => {
    const root = await workspace(); const bound = await openMcpWorkspace(root); expect(bound).toBeDefined(); if (!bound) return;
    const repository = await openMcpWorkspace(await workspace()); expect(repository).toBeDefined(); if (!repository) return;
    let release!: () => void; let entered!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; }); const started = new Promise<void>((resolve) => { entered = resolve; }); const controller = new AbortController();
    const dispatcher = createMcpDispatcher({ ...bound, repository: { root: repository.root, identity: repository.identity } }, operations({
      firmwareBuild: async () => { entered(); await delayed; return { ok: true as const, summary: { schemaVersion: 1, scope: 'local-ephemeral-cross-build', sourceIdentity: 'unverified', board: { boardId: 'posix', ideId: 'posix', zephyrBoard: 'native_sim', validationLevel: 'cross-build' }, artifact: { kind: 'firmware-elf', sha256: hash, byteLength: 1 }, output: { stdoutBytes: 0, stderrBytes: 0, truncated: false } }, evidence: { ...evidence('firmware-build'), artifacts: [{ kind: 'firmware-elf', sha256: hash, byteLength: 1 }] } }; },
    }));
    const pending = dispatcher('firmware_build', { ideId: 'posix' }, controller.signal);
    await started; controller.abort(); release(); const result = await pending;
    expect(result).toMatchObject({ isError: true, structuredContent: { error: 'MCP_CANCELLED' } });
    expect(JSON.stringify(result)).not.toContain('firmware-elf');
  });

  test('rejects an explicit non-repository root without throwing', async () => {
    const invalid = await mkdtemp(join(tmpdir(), 'zplc-mcp-repository-invalid-')); temporary.push(invalid);
    await expect(openMcpRepository(invalid)).resolves.toBeUndefined();
  });

  test('does not invoke repository tools without an explicit repository identity', async () => {
    const root = await workspace(); const bound = await openMcpWorkspace(root); expect(bound).toBeDefined(); if (!bound) return;
    let calls = 0;
    const dispatcher = createMcpDispatcher(bound, operations({ boardsList: async () => { calls++; return { ok: true as const, summary: { boards: [] }, evidence: evidence('boards-list') }; } }));
    expect(await dispatcher('boards_list', {}, new AbortController().signal)).toMatchObject({ isError: true, structuredContent: { error: 'MCP_CAPABILITY_UNAVAILABLE' } });
    expect(calls).toBe(0);
  });

  test('projects repository results through exact schemas and never accepts extra fields', async () => {
    const root = await workspace(); const bound = await openMcpWorkspace(root); expect(bound).toBeDefined(); if (!bound) return;
    const withRepository = { ...bound, repository: { root: bound.root, identity: bound.identity } };
    const dispatcher = createMcpDispatcher(withRepository, operations({
      boardsList: async () => ({ ok: true as const, summary: { boards: [], privatePath: '/secret' }, evidence: evidence('boards-list') }),
    }));
    expect(await dispatcher('boards_list', {}, new AbortController().signal)).toMatchObject({ isError: true, structuredContent: { error: 'MCP_INTERNAL_ERROR' } });
  });

  test('fails closed when a resource source contains private fields or accessors', () => {
    const hostile: Record<string, unknown> = { ok: true, summary: { ...compilerSummary, source: '/private' }, evidence: evidence('check') };
    Object.defineProperty(hostile, 'leak', { enumerable: true, get: () => { throw new Error('/private'); } });
    const projected = projectResource('compiler_check', hostile, 'diagnostics');
    expect(projected).toEqual({ ok: false, error: 'MCP_INTERNAL_ERROR' });
    expect(JSON.stringify(projected)).not.toContain('/private');
  });
});
