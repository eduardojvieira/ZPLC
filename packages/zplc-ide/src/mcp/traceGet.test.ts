/**
 * AI-03, AI-08, AIX-015 through the dispatcher: a trace over 512 KiB is read (up to the 16 MiB internal cap, refused past it
 * with a next step), the input and watch sidecar is asked of the Tool API only by the new modes, and the recorded trace and
 * its `traceSha256` stay the 2.0 ones.
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, test } from 'bun:test';

import { itNative } from '../cli/nativeRuntimeGuard';
import { scenarioRun } from '../cli/toolApi';
import { createMcpDispatcher, openMcpWorkspace, type McpOperations } from './server';
import { MAX_INTERNAL_TRACE_BYTES } from './traceView';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-trace-get-'));
  temporary.push(root);
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'tests'));
  await writeFile(
    join(root, 'zplc.json'),
    JSON.stringify({
      schemaVersion: 2,
      name: 'safe',
      version: '1.0.0',
      target: { board: 'posix' },
      tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }],
    }),
  );
  await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM\n');
  await writeFile(join(root, 'tests', 'smoke.scenario.json'), JSON.stringify({ id: 'smoke', duration: '10ms', expect: [] }));
  return root;
}

const hash = 'a'.repeat(64);
const testSummary = { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [] };
/** A scenario_run value of the Tool API whose recorded trace is `bytes`; `extra` are its non-enumerable sidecar fields. */
function runValue(bytes: Uint8Array, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const value: Record<string, unknown> = {
    ok: true,
    summary: testSummary,
    evidence: {
      schemaVersion: 1,
      operation: 'scenario-run',
      outcome: 'passed',
      diagnostics: [],
      artifacts: [
        { kind: 'zplc', sha256: hash, byteLength: 1 },
        { kind: 'trace', sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength },
      ],
    },
  };
  Object.defineProperty(value, 'traceFile', { value: bytes });
  for (const [key, field] of Object.entries(extra)) Object.defineProperty(value, key, { value: field });
  return value;
}
/** An aggregate trace of `samples` samples, each with 20 outputs of long names: about 1 KiB a sample. */
function aggregate(samples: number): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: 1,
      backend: 'native-posix',
      mode: 'logical-cyclic-task-set-scan',
      scenarios: [
        {
          id: 'smoke',
          path: 'tests/smoke.scenario.json',
          passed: true,
          trace: Array.from({ length: samples }, (_, index) => ({
            atMs: index * 10,
            outputs: Object.fromEntries(Array.from({ length: 20 }, (_, n) => [`Main.LongOutputName${n}`, index >= 100])),
          })),
          assertions: [{ kind: 'AT', passed: true, atMs: 1000 }],
        },
      ],
    }),
  );
}
function operations(scenarioRun: McpOperations['scenarioRun']): McpOperations {
  const unused = async () => ({ ok: false });
  return {
    projectInspect: unused,
    projectValidate: unused,
    compilerCheck: unused,
    compilerCompile: unused,
    symbolsList: unused,
    safetyCheck: unused,
    testsRun: unused,
    scenarioRun,
    boardsList: unused,
    toolchainInspect: unused,
    firmwareBuild: unused,
  };
}
const content = (result: { structuredContent: Record<string, unknown> }) => result.structuredContent as Record<string, any>;
const signal = new AbortController().signal;

describe('trace_get reads a trace over 512 KiB (AI-03)', () => {
  test('AI-03 a 1 MiB trace replays, its whole form says how to ask for less, and its summary is small', async () => {
    const bytes = aggregate(1000);
    expect(bytes.byteLength).toBeGreaterThan(512 * 1024);
    const dispatch = createMcpDispatcher(
      (await openMcpWorkspace(await workspace()))!,
      operations(async () => runValue(bytes)),
    );
    const traceSha256 = createHash('sha256').update(bytes).digest('hex');
    expect(content(await dispatch('simulation_start', { scenarioId: 'smoke' }, signal))).toMatchObject({
      ok: true,
      cursor: 0,
      traceSha256,
    });
    const whole = await dispatch('trace_get', { scenarioId: 'smoke' }, signal);
    expect(content(whole)).toMatchObject({ ok: false, error: 'MCP_OUTPUT_LIMIT', validValues: ['changes', 'summary', 'window'] });
    expect(content(whole).nextStep).toContain('mode');
    const summary = await dispatch('trace_get', { scenarioId: 'smoke', mode: 'summary' }, signal);
    expect(content(summary)).toMatchObject({
      ok: true,
      evidenceLevel: 'host-simulation',
      mode: 'summary',
      traceSha256,
      totalSamples: 1000,
    });
    expect(summary.content[0]!.text.length).toBeLessThan(8 * 1024);
    const changes = await dispatch('trace_get', { scenarioId: 'smoke', mode: 'changes' }, signal);
    expect((content(changes).samples as Array<{ index: number }>).map((sample) => sample.index)).toEqual([0, 100, 999]);
  });

  test('AI-03 a trace over the 16 MiB internal cap is refused with its cause and a next step, not a crash', async () => {
    const bytes = new Uint8Array(MAX_INTERNAL_TRACE_BYTES + 1).fill(0x20);
    const dispatch = createMcpDispatcher(
      (await openMcpWorkspace(await workspace()))!,
      operations(async () => runValue(bytes)),
    );
    const started = performance.now();
    for (const [tool, args] of [
      ['trace_get', { scenarioId: 'smoke' }],
      ['trace_get', { scenarioId: 'smoke', mode: 'summary' }],
      ['simulation_start', { scenarioId: 'smoke' }],
    ] as const) {
      const result = await dispatch(tool, args, signal);
      expect(result.isError).toBe(true);
      expect(content(result)).toMatchObject({ ok: false, error: 'MCP_TRACE_TOO_LARGE' });
      expect(content(result).message).toContain('16 MiB');
      expect(content(result).nextStep).toBeString();
    }
    expect(performance.now() - started).toBeLessThan(5000);
  });
});

describe('trace_get asks for the sidecar only in the new modes (AI-08)', () => {
  test('AI-08 a 2.0 call asks for no sidecar; a new mode asks for the inputs and the watched names', async () => {
    const seen: unknown[] = [];
    const bytes = aggregate(2);
    const dispatch = createMcpDispatcher(
      (await openMcpWorkspace(await workspace()))!,
      operations(async (_root, _id, options) => {
        seen.push((options as { observe?: unknown }).observe);
        return runValue(bytes);
      }),
    );
    await dispatch('trace_get', { scenarioId: 'smoke' }, signal);
    await dispatch('scenario_run', { scenarioId: 'smoke' }, signal);
    await dispatch('trace_get', { scenarioId: 'smoke', mode: 'changes', watchSignals: ['Main.Count'] }, signal);
    await dispatch('trace_get', { scenarioId: 'smoke', includeInputs: false }, signal);
    expect(seen).toEqual([undefined, undefined, { inputs: true, watch: ['Main.Count'] }, { inputs: false, watch: [] }]);
  });

  test('AIX-015 an unknown watched name is MCP_NOT_FOUND with the names that can be watched', async () => {
    const bytes = aggregate(2);
    const dispatch = createMcpDispatcher(
      (await openMcpWorkspace(await workspace()))!,
      operations(async () => {
        const failed = runValue(bytes, { watchUnknown: { unknown: ['Main.Cuont'], validValues: ['Main.Count', 'Main.Q'] } });
        return failed;
      }),
    );
    const result = await dispatch('trace_get', { scenarioId: 'smoke', watchSignals: ['Main.Cuont'] }, signal);
    expect(result.isError).toBe(true);
    expect(content(result)).toMatchObject({ ok: false, error: 'MCP_NOT_FOUND', validValues: ['Main.Count', 'Main.Q'] });
    expect(content(result).message).toContain('Main.Cuont');
  });

  test('AIX-015 a wrong mode is MCP_INVALID_ARGUMENTS with the valid modes', async () => {
    const dispatch = createMcpDispatcher(
      (await openMcpWorkspace(await workspace()))!,
      operations(async () => runValue(aggregate(2))),
    );
    const result = await dispatch('trace_get', { scenarioId: 'smoke', mode: 'all' }, signal);
    expect(content(result)).toMatchObject({ ok: false, error: 'MCP_INVALID_ARGUMENTS', validValues: ['changes', 'summary', 'window'] });
    expect(content(result).nextStep).toBeString();
  });
});

const BELT = fileURLToPath(new URL('../../projects/plant_belt_to_sensor/', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'zplc-trace-get-native-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
function belt(): string {
  const root = join(scratch, `belt-${Math.random().toString(36).slice(2)}`);
  cpSync(BELT, root, { recursive: true });
  return root;
}

describe('trace_get on a shipped plant lesson (AI-03, AI-08)', () => {
  itNative(
    'AI-08 the changes of belt-to-sensor carry its inputs and a watched variable, under the 2.0 traceSha256',
    async () => {
      const dispatch = createMcpDispatcher((await openMcpWorkspace(belt()))!);
      const run = content(await dispatch('scenario_run', { scenarioId: 'belt-to-sensor' }, signal));
      const traceSha256 = run.evidence.artifacts.find((artifact: { kind: string }) => artifact.kind === 'trace').sha256;
      const result = await dispatch(
        'trace_get',
        { scenarioId: 'belt-to-sensor', mode: 'changes', watchSignals: ['BeltToSensor.Running'] },
        signal,
      );
      const body = content(result);
      expect(body).toMatchObject({ ok: true, mode: 'changes', traceSha256 });
      expect(body.availableSignals.inputs).toEqual(['BeltToSensor.EyeFar', 'BeltToSensor.Start']);
      expect(body.availableSignals.watched).toEqual(['BeltToSensor.Running']);
      expect(body.samples.some((sample: { inputs?: Record<string, boolean> }) => sample.inputs?.['BeltToSensor.Start'] === true)).toBe(
        true,
      );
      expect(body.samples.some((sample: { watched?: Record<string, boolean> }) => sample.watched?.['BeltToSensor.Running'] === true)).toBe(
        true,
      );
      expect(result.content[0]!.text.length).toBeLessThan(64 * 1024);
      const summary = await dispatch('trace_get', { scenarioId: 'belt-to-sensor', mode: 'summary' }, signal);
      expect(content(summary)).toMatchObject({ ok: true, traceSha256 });
      expect(summary.content[0]!.text.length).toBeLessThan(16 * 1024);
      const unknown = await dispatch('trace_get', { scenarioId: 'belt-to-sensor', watchSignals: ['BeltToSensor.Runing'] }, signal);
      expect(content(unknown)).toMatchObject({ ok: false, error: 'MCP_NOT_FOUND' });
      expect(content(unknown).validValues).toContain('BeltToSensor.Running');
    },
    120_000,
  );

  itNative(
    'AI-08 the sidecar is not in the Tool API result, and the recorded trace keeps its bytes',
    async () => {
      const root = belt();
      const plain = await scenarioRun(root, 'belt-to-sensor');
      const observed = await scenarioRun(root, 'belt-to-sensor', { observe: { inputs: true, watch: ['BeltToSensor.Running'] } });
      expect(JSON.stringify(observed)).toBe(JSON.stringify(plain));
      const traceFile = (value: object) => (value as { traceFile: Uint8Array }).traceFile;
      expect(Buffer.from(traceFile(observed)).equals(Buffer.from(traceFile(plain)))).toBe(true);
      expect(Object.keys(observed)).not.toContain('observed');
      const sidecar = (observed as { observed?: { inputs: unknown[] } }).observed;
      expect(sidecar?.inputs.length).toBe(observed.preview!.scenarios[0]!.totalSamples);
    },
    120_000,
  );
});
