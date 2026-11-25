/**
 * TST-003 / IDE-031, contract C-E: only a failed assertion of the preview gains `index` and `checks`; a run with no failure is
 * serialised as before, and the trace evidence of a failed run keeps the bytes (and the hash) it had.
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect } from 'bun:test';

import { presentWorkspaceTestResult } from '../components/workspaceTestPresentation';
import { createMcpDispatcher, openMcpWorkspace } from '../mcp/server';
import { itNative } from './nativeRuntimeGuard';
import { testsRun } from './toolApi';

const BLINKY = new URL('../../projects/blinky_st/', import.meta.url).pathname;
const SCENARIO = 'tests/blinky-st.scenario.json';
const scratch = mkdtempSync(join(tmpdir(), 'zplc-failure-detail-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A copy of the bundled blinky_st whose first AT expectation (250 ms, LED off) wants the LED on. */
function brokenCopy(): string {
  const root = join(scratch, `broken-${Math.random().toString(36).slice(2)}`);
  cpSync(BLINKY, root, { recursive: true });
  const file = join(root, SCENARIO);
  const text = readFileSync(file, 'utf8');
  const broken = text.replace(
    '"atMs": 250, "condition": { "Blinky.LED_Output": false }',
    '"atMs": 250, "condition": { "Blinky.LED_Output": true }',
  );
  expect(broken).not.toBe(text);
  writeFileSync(file, broken);
  return root;
}

describe('failure detail in the Tool API preview (TST-003, IDE-031)', () => {
  itNative('TST-003 the preview carries the checks of a failed assertion', async () => {
    const result = await testsRun(brokenCopy());
    expect(result.ok).toBe(false);
    const assertions = result.preview!.scenarios[0]!.assertions;
    expect(assertions[0]).toEqual({
      kind: 'AT',
      passed: false,
      atMs: 250,
      index: 0,
      checks: [{ signal: 'Blinky.LED_Output', expected: true, observed: false }],
    });
    for (const passed of assertions.slice(1)) expect(Object.keys(passed)).toEqual(['kind', 'passed', 'atMs']);
    // The trace evidence is what a run without the new fields recorded: same bytes, same hash (2.0 value, measured at 8ae85a67).
    expect(result.evidence.artifacts.find((artifact) => artifact.kind === 'trace')).toEqual({
      kind: 'trace',
      sha256: '78204d5957a3995b912974a635eb8d6c05b91d1a4473be444e3445ff7441464b',
      byteLength: 11451,
    });
  });

  itNative('TST-003 the MCP trace of a failed run still replays and keeps the 2.0 assertion keys', async () => {
    const root = brokenCopy();
    const workspace = await openMcpWorkspace(root);
    const result = await createMcpDispatcher(workspace!)('trace_get', { scenarioId: 'BlinkyST' }, new AbortController().signal);
    const content = result.structuredContent as { assertions: Array<Record<string, unknown>>; traceSha256: string };
    expect(content.traceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(content.assertions[0]).toEqual({ kind: 'AT', passed: false, atMs: 250 });
  });

  itNative('IDE-031 a run with no failure serialises byte for byte as before', async () => {
    const result = await testsRun(BLINKY);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.preview!.scenarios[0]!.assertions)).toBe(
      '[{"kind":"AT","passed":true,"atMs":250},{"kind":"AT","passed":true,"atMs":750},{"kind":"AT","passed":true,"atMs":1250},' +
        '{"kind":"AT","passed":true,"atMs":1750},{"kind":"FOR","passed":true,"atMs":490},{"kind":"RISING","passed":true,"atMs":500},' +
        '{"kind":"FOR","passed":true,"atMs":1000},{"kind":"FALLING","passed":true,"atMs":1010},{"kind":"FOR","passed":true,"atMs":1500},' +
        '{"kind":"RISING","passed":true,"atMs":1520},{"kind":"FOR","passed":true,"atMs":2020},{"kind":"FALLING","passed":true,"atMs":2030' +
        '}]',
    );
    // The whole serialised result, as the 2.0 build produced it for this project (8ae85a67).
    expect(createHash('sha256').update(JSON.stringify(result)).digest('hex')).toBe(
      '29a0a362dcd1993e0429da1cecf085d4ee411ec14450f789734814ab74d1862b',
    );
  });
});

const BELT = new URL('../../projects/plant_belt_to_sensor/', import.meta.url).pathname;
const BELT_SCENARIO = 'tests/belt-to-sensor.scenario.json';
function numericProject(extra: unknown[]): string {
  const root = join(scratch, `numeric-${Math.random().toString(36).slice(2)}`);
  cpSync(BELT, root, { recursive: true });
  const file = join(root, BELT_SCENARIO);
  const scenario = JSON.parse(readFileSync(file, 'utf8'));
  scenario.expectations.push(...extra);
  writeFileSync(file, JSON.stringify(scenario, null, 2));
  return root;
}

describe('SCN-005 numeric conditions end to end (plant_belt_to_sensor)', () => {
  itNative(
    'passing numeric conditions pass; failing ones report raw numbers through the Tool API, the presentation and MCP',
    async () => {
      const root = numericProject([
        { kind: 'AT', atMs: 8000, condition: { 'fact:count:EyeFar': 1 } },
        { kind: 'AT', atMs: 8000, condition: { 'fact:position:box:0': { min: -100, max: 100 } } },
        { kind: 'AT', atMs: 8000, condition: { 'fact:count:EyeFar': 99 } },
        { kind: 'AT', atMs: 8000, condition: { 'fact:position:box:0': { min: 50.25 } } },
      ]);
      try {
        const run = await testsRun(root);
        const assertions = run.preview!.scenarios[0]!.assertions as Array<Record<string, unknown>>;
        expect(assertions.map((a) => a.passed)).toEqual([true, true, true, true, true, true, false, false]);
        const [countCheck] = assertions[6]!.checks as Array<Record<string, unknown>>;
        expect(countCheck).toMatchObject({ signal: 'fact:count:EyeFar', expected: 99 });
        expect(Number.isInteger(countCheck!.observed)).toBe(true);
        const [rangeCheck] = assertions[7]!.checks as Array<Record<string, unknown>>;
        expect(rangeCheck).toMatchObject({ signal: 'fact:position:box:0', expected: { min: 50.25 } });
        expect(typeof rangeCheck!.observed).toBe('number');
        expect(Object.keys(assertions[7]!)).toEqual(['kind', 'passed', 'atMs', 'index', 'checks']);

        const shown = presentWorkspaceTestResult(run);
        expect(shown.kind).toBe('assertion-failed');
        expect(shown.preview?.scenarios[0]?.assertions).toEqual(assertions as never);

        // the recorded trace keeps the 2.0 assertion shape; its keys are valid MCP output names
        const trace = JSON.parse(new TextDecoder().decode((run as { traceFile: Uint8Array }).traceFile));
        expect(trace.scenarios[0].assertions[6]).toEqual({ kind: 'AT', passed: false, atMs: 8000 });
        const keys = Object.keys(trace.scenarios[0].trace[0].outputs);
        expect(keys).toContain('fact:count:EyeFar:eq-99');
        expect(keys).toContain('fact:position:box:0:min-50.25');

        const workspace = await openMcpWorkspace(root);
        expect(workspace).toBeDefined();
        const dispatch = createMcpDispatcher(workspace!);
        const signal = new AbortController().signal;
        const replay = await dispatch('trace_get', { scenarioId: 'belt-to-sensor' }, signal);
        expect((replay.structuredContent as { code?: string }).code).toBeUndefined();
        expect(replay.structuredContent).toMatchObject({ scope: 'recorded-native-posix-host', ok: false });
        const replayed = replay.structuredContent as { trace: Array<{ outputs: Record<string, boolean> }>; traceSha256: string };
        expect(Object.keys(replayed.trace[0]!.outputs)).toContain('fact:position:box:0:min-50.25');
        const snapshot = await dispatch(
          'runtime_snapshot',
          { scenarioId: 'belt-to-sensor', cursor: 800, traceSha256: replayed.traceSha256 },
          signal,
        );
        expect((snapshot.structuredContent as { snapshot?: { atMs: number } }).snapshot?.atMs).toBe(8000);
        const tests = await dispatch('tests_run', {}, signal);
        expect((tests.structuredContent as { code?: string }).code).toBeUndefined();
        expect(tests.structuredContent).toMatchObject({ ok: false, evidence: { outcome: 'failed' } });
        // AI-01: the MCP result carries the Tool API's failure detail, checks included
        const mcpPreview = (tests.structuredContent as { preview?: typeof run.preview }).preview;
        expect(mcpPreview).toBeDefined();
        expect(mcpPreview!.scenarios[0]!.assertions).toEqual(assertions as never);
        expect((mcpPreview!.scenarios[0]!.assertions[6] as { checks?: unknown }).checks).toEqual(assertions[6]!.checks);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    120_000,
  );

  itNative(
    'a refused numeric condition is a located TEST_SCENARIO_INVALID / binding diagnostic, not a run',
    async () => {
      const root = numericProject([{ kind: 'AT', atMs: 8000, condition: { 'fact:position:box:0': 3 } }]);
      try {
        const run = await testsRun(root);
        expect(run.ok).toBe(false);
        expect(JSON.stringify(run.evidence.diagnostics)).toContain('real fact');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
