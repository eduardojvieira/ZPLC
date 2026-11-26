/**
 * AIX-015, AI-03, AI-08, AI-12: trace_get answers a recorded run in agent-sized form. With no new parameter the answer is the
 * 2.0 one; `changes`, `window` and `summary` are opt-in, carry the compact envelope, and every refusal says what to do next.
 */
import { describe, expect, test } from 'bun:test';

import { MAX_OUTPUT_BYTES, TRACE_HELP, traceAnswer, type Replay } from './traceView';

const execution = {
  schemaVersion: 1,
  jobId: '6f1c7c1e-8f43-4f7e-9a51-2b1f0b6f8a10',
  actor: 'mcp',
  permission: 'tests:run',
  operation: 'scenario-run',
  outcome: 'failed',
  startedAt: '2026-11-26T10:00:00.000Z',
  finishedAt: '2026-11-26T10:00:01.250Z',
};
const evidence = { schemaVersion: 1, operation: 'scenario-run', outcome: 'failed', diagnostics: [], artifacts: [] };

/** Run rises at 20 ms; the box moves every sample; the count rises at 40 ms; the AT at 30 ms failed. */
function replay(): Replay {
  const runs = [false, false, true, true, true, true];
  const counts = [0, 0, 0, 0, 1, 1];
  return {
    ok: false,
    traceSha256: 'c'.repeat(64),
    totalSamples: 6,
    samples: runs.map((run, index) => ({ atMs: index * 10, outputs: { 'P.Run': run, 'fact:count:Eye': counts[index]! > 0 } })),
    assertions: [{ kind: 'AT', passed: false, atMs: 30 }],
    evidence,
    execution,
    observed: {
      inputs: runs.map((_, index) => ({ 'P.Start': index >= 1 && index <= 2 })),
      watched: runs.map((run) => ({ 'P.Running': run })),
      facts: counts.map((count, index) => ({ 'fact:count:Eye': count, 'fact:position:box:0': 0.105 + index * 0.013 })),
    },
  };
}
type Group = 'outputs' | 'inputs' | 'watched' | 'facts';
/** The fields of a trace_get answer or refusal the tests read. */
interface TraceBody {
  [key: string]: unknown;
  samples: Array<{ index: number; atMs: number; changed?: string[] } & Partial<Record<Group, Record<string, boolean | number>>>>;
  signalSummary: Record<string, Record<string, boolean | number>>;
  availableSignals: Record<string, string[]>;
  evidence: { artifacts: Array<{ kind: string; sha256: string }> };
  validValues: string[];
  message: string;
  nextStep: string;
}
const body = (result: { structuredContent: Record<string, unknown> }) => result.structuredContent as TraceBody;
const indices = (result: { structuredContent: Record<string, unknown> }) =>
  (body(result).samples as Array<{ index: number }>).map((sample) => sample.index);

describe('trace_get with no new parameter answers as 2.0 (AIX-015 contract)', () => {
  test('AI-12 the 2.0 keys, in the 2.0 order, with the whole trace', () => {
    const result = traceAnswer(replay(), 'belt', {});
    expect(Object.keys(body(result))).toEqual([
      'ok',
      'scope',
      'scenarioId',
      'traceSha256',
      'totalSamples',
      'assertions',
      'trace',
      'evidence',
      'execution',
      'note',
    ]);
    expect(body(result).trace).toEqual(replay().samples);
    expect(result.isError).toBe(true);
  });

  test('AI-03 a whole trace over 512 KiB is refused with the modes that read it', () => {
    const big = replay();
    big.samples = Array.from({ length: 3000 }, (_, index) => ({
      atMs: index * 10,
      outputs: Object.fromEntries(Array.from({ length: 20 }, (_, n) => [`Program.LongOutputName${n}`, index % 2 === 0])),
    }));
    big.totalSamples = big.samples.length;
    delete big.observed;
    const result = traceAnswer(big, 'belt', {});
    expect(body(result)).toMatchObject({ ok: false, error: 'MCP_OUTPUT_LIMIT', validValues: ['changes', 'summary', 'window'] });
    expect(body(result).message).toContain('512 KiB');
    expect(body(result).nextStep).toContain('mode');
    expect(result.content[0]!.text.length).toBeLessThan(2048);
  });
});

describe('trace_get changes (AIX-015, AI-03)', () => {
  test('AIX-015 answers the first sample, every change, the failed expectation and the last sample', () => {
    const result = traceAnswer(replay(), 'belt', { mode: 'changes' });
    expect(result.isError).toBe(true);
    // 1: Start rises; 2: Run and Running rise; 3: Start falls and the AT failed; 4: the count rises; 5: last
    expect(indices(result)).toEqual([0, 1, 2, 3, 4, 5]);
    const samples = body(result).samples;
    expect(samples[2]).toMatchObject({
      index: 2,
      atMs: 20,
      outputs: { 'P.Run': true },
      watched: { 'P.Running': true },
      changed: ['P.Run', 'P.Running'],
    });
    // a change sample carries only what changed; the failure at 30 ms and the last sample carry every signal
    expect(samples[2]!.inputs).toBeUndefined();
    expect(Object.keys(samples[3]!.outputs!)).toEqual(['P.Run', 'fact:count:Eye']);
    expect(Object.keys(samples[5]!.facts!)).toEqual(['fact:count:Eye', 'fact:position:box:0']);
    expect(body(result)).toMatchObject({
      ok: false,
      scenarioId: 'belt',
      mode: 'changes',
      traceSha256: 'c'.repeat(64),
      totalSamples: 6,
      returnedSamples: 6,
      truncated: false,
      availableSignals: {
        inputs: ['P.Start'],
        outputs: ['P.Run', 'fact:count:Eye'],
        watched: ['P.Running'],
        facts: ['fact:count:Eye', 'fact:position:box:0'],
      },
      assertions: [{ kind: 'AT', passed: false, atMs: 30 }],
    });
  });

  test('AIX-015 a position that moves every sample is reported, but is no change by itself', () => {
    const only = traceAnswer(replay(), 'belt', { mode: 'changes', signals: ['P.Run', 'fact:position:box:0'] });
    // the position is named, so each of its moves is a change
    expect(indices(only)).toEqual([0, 1, 2, 3, 4, 5]);
    const run = traceAnswer(replay(), 'belt', { mode: 'changes', signals: ['P.Run'] });
    expect(indices(run)).toEqual([0, 2, 3, 5]);
    expect(body(run).samples[1]).toEqual({
      index: 2,
      atMs: 20,
      outputs: { 'P.Run': true },
      changed: ['P.Run'],
    });
  });

  test('AIX-015 the limit cuts the answer and names where the next page starts', () => {
    const result = traceAnswer(replay(), 'belt', { mode: 'changes', signals: ['P.Run'], limit: 2 });
    expect(body(result)).toMatchObject({ returnedSamples: 2, truncated: true, nextCursor: { fromSample: 3, fromMs: 30 } });
    const next = traceAnswer(replay(), 'belt', { mode: 'changes', signals: ['P.Run'], fromSample: 3 });
    expect(indices(next)).toEqual([3, 5]);
  });

  test('AI-08 includeInputs false leaves the inputs out', () => {
    const result = traceAnswer(replay(), 'belt', { mode: 'changes', includeInputs: false });
    expect(body(result).availableSignals.inputs).toEqual([]);
    for (const sample of body(result).samples as Array<Record<string, unknown>>) expect(sample.inputs).toBeUndefined();
  });

  test('AI-12 the compact envelope: no scope or note, and audit beside execution', () => {
    const content = body(traceAnswer(replay(), 'belt', { mode: 'changes' }));
    expect(content.scope).toBeUndefined();
    expect(content.note).toBeUndefined();
    expect(content.audit).toEqual({ jobId: execution.jobId, permission: 'tests:run', durationMs: 1250 });
    expect(content.execution).toEqual(execution);
  });
});

describe('trace_get window (AIX-015)', () => {
  test('AIX-015 answers every sample between fromMs and toMs', () => {
    const result = traceAnswer(replay(), 'belt', { mode: 'window', fromMs: 10, toMs: 30 });
    expect(indices(result)).toEqual([1, 2, 3]);
    expect(body(result)).toMatchObject({ mode: 'window', returnedSamples: 3, truncated: false });
    expect((body(result).samples as Array<Record<string, unknown>>)[0]!.changed).toBeUndefined();
  });

  test('AIX-015 pages from fromSample by limit', () => {
    const result = traceAnswer(replay(), 'belt', { mode: 'window', fromSample: 4, limit: 1 });
    expect(indices(result)).toEqual([4]);
    expect(body(result)).toMatchObject({ truncated: true, nextCursor: { fromSample: 5, fromMs: 50 } });
  });

  test('AIX-015 a window over 512 KiB is cut to the samples that fit, with the cursor of the next page', () => {
    const big = replay();
    big.samples = Array.from({ length: 1000 }, (_, index) => ({
      atMs: index * 10,
      outputs: Object.fromEntries(Array.from({ length: 64 }, (_, n) => [`Program.${'L'.repeat(100)}${n}`, true])),
    }));
    big.totalSamples = 1000;
    delete big.observed;
    const result = traceAnswer(big, 'belt', { mode: 'window', limit: 1000 });
    const content = body(result);
    expect(content).toMatchObject({ mode: 'window', truncated: true });
    const returned = content.returnedSamples as number;
    expect(returned).toBeGreaterThan(10);
    expect(returned).toBeLessThan(1000);
    expect(content.nextCursor).toEqual({ fromSample: returned, fromMs: returned * 10 });
    // room is left for the evidence level the dispatcher adds
    expect(Buffer.byteLength(result.content[0]!.text)).toBeLessThanOrEqual(MAX_OUTPUT_BYTES - 256);
    expect(Buffer.byteLength(result.content[0]!.text)).toBeGreaterThan(MAX_OUTPUT_BYTES / 2);
  });

  test('AIX-015 a single sample over 512 KiB is refused with how to ask for less', () => {
    const big = replay();
    big.samples = [
      { atMs: 0, outputs: Object.fromEntries(Array.from({ length: 4000 }, (_, n) => [`Program.${'L'.repeat(200)}${n}`, true])) },
    ];
    big.totalSamples = 1;
    delete big.observed;
    const result = traceAnswer(big, 'belt', { mode: 'window' });
    expect(body(result)).toMatchObject({ ok: false, error: 'MCP_OUTPUT_LIMIT' });
    expect(body(result).nextStep).toContain('signals');
  });
});

describe('trace_get counts every change of a program signal (AIX-015 follow-up)', () => {
  test('AIX-015 a REAL watched variable or output that changes is a change, unnamed', () => {
    const levels = [100, 100, 99.59, 98.58, 98.58, 98.58];
    const real: Replay = {
      ...replay(),
      assertions: [],
      samples: levels.map((_, index) => ({ atMs: index * 10, outputs: { 'P.Run': true } })),
      observed: { inputs: [], watched: levels.map((level) => ({ 'P.Level': level })), facts: [] },
    };
    const result = traceAnswer(real, 'belt', { mode: 'changes' });
    expect(indices(result)).toEqual([0, 2, 3, 5]);
    expect(body(result).samples[1]).toEqual({ index: 2, atMs: 20, watched: { 'P.Level': 99.59 }, changed: ['P.Level'] });
    // a plant fact that is not a whole number still counts only when named
    const facts = traceAnswer(replay(), 'belt', { mode: 'changes', signals: ['P.Run', 'fact:count:Eye'] });
    expect(indices(facts)).toEqual([0, 2, 3, 4, 5]);
  });

  test('AIX-015 the help of mode and signals says which changes count', () => {
    expect(TRACE_HELP.mode).toContain('fact:');
    expect(TRACE_HELP.signals).toContain('fact:');
  });
});

describe('trace_get summary (AIX-015)', () => {
  test('AIX-015 answers each signal: first, last, transitions, when it was true, and the range of a number', () => {
    const result = traceAnswer(replay(), 'belt', { mode: 'summary' });
    const content = body(result);
    expect(content.samples).toBeUndefined();
    expect(content.signalSummary['P.Run']).toEqual({ first: false, last: true, transitions: 1, firstTrueMs: 20, lastTrueMs: 50 });
    expect(content.signalSummary['P.Start']).toEqual({ first: false, last: false, transitions: 2, firstTrueMs: 10, lastTrueMs: 20 });
    expect(content.signalSummary['fact:position:box:0']).toMatchObject({ first: 0.105, transitions: 5, min: 0.105 });
    expect(content.signalSummary['fact:position:box:0']!.max as number).toBeCloseTo(0.17);
    expect(content).toMatchObject({ returnedSamples: 0, truncated: false });
  });
});

describe('trace_get refusals name the cause and the valid values (AIX-015)', () => {
  test('AIX-015 an unknown signal is MCP_NOT_FOUND with the signals of the run', () => {
    const result = traceAnswer(replay(), 'belt', { mode: 'changes', signals: ['P.Runn'] });
    expect(result.isError).toBe(true);
    expect(body(result)).toMatchObject({
      ok: false,
      error: 'MCP_NOT_FOUND',
      validValues: ['P.Run', 'P.Running', 'P.Start', 'fact:count:Eye', 'fact:position:box:0'],
    });
    expect(body(result).message).toContain('P.Runn');
    expect(body(result).nextStep).toBeString();
  });
});
