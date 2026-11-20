/**
 * TST-003 / IDE-031, contract C-E: only a failed assertion of the preview gains `index` and `checks`; a run with no failure is
 * serialised as before, and the trace evidence of a failed run keeps the bytes (and the hash) it had.
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect } from 'bun:test';

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
    // The MCP replay schema has no RISING/FALLING kind yet (a 2.0 limit, not touched here): drop them from the copy.
    const root = brokenCopy();
    const file = join(root, SCENARIO);
    const scenario = JSON.parse(readFileSync(file, 'utf8')) as { expectations: Array<{ kind: string }> };
    scenario.expectations = scenario.expectations.filter(({ kind }) => kind !== 'RISING' && kind !== 'FALLING');
    writeFileSync(file, JSON.stringify(scenario));
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
