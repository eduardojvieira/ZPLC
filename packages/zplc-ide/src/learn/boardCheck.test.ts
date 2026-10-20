// The check on the board of a lesson (LRN-013, LRN-024, LRN-015): when it may run, what it asks the learner to do, and the
// grade it makes from a recorded run. Every session here is a FAKE that records every call, and every trace is SYNTHETIC:
// no board is involved.
import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import type { BoardSessionView } from '../runtime/boardSession';
import type { VMState, WatchVariable } from '../runtime/debugAdapter';
import { boardCheckReadiness, boardCheckSteps, lessonWatchVariables, runBoardCheck } from './boardCheck';
import { learnerBoardOf } from './learnerBoards';
import type { ScenarioFile } from './lessonPackage';

const variable = (addr: number, bitOffset: number, region: 'IPI' | 'OPI') => ({ addr, bitOffset, type: 'BOOL', region, size: 1 });
const DEBUG_MAP = {
  version: '1', programName: 'VerifyBoard', compilerVersion: 'test',
  pou: { VerifyBoard: { type: 'PROGRAM', vars: { Button: variable(0x0000, 0, 'IPI'), Led: variable(0x1000, 0, 'OPI') }, sourceMap: [], breakpoints: [] } },
  memoryLayout: { ipiBase: 0, ipiSize: 4096, opiBase: 4096, opiSize: 4096, workBase: 8192, workSize: 8192, retainBase: 16384, retainSize: 4096, codeBase: 20480, codeSize: 0 },
} as unknown as DebugMap;
const WIRING = { schemaVersion: 1 as const, parts: [
  { id: 'led', kind: 'led', channel: 'DO0', color: 'red', resistorOhms: 330, label: { en: 'LED', es: 'LED' } },
  { id: 'button', kind: 'button', channel: 'DI0', label: { en: 'Test button', es: 'Pulsador de prueba' } },
] };
const SCENARIO: ScenarioFile = {
  schemaVersion: 1, id: 'Press', tickMs: 10, durationMs: 600,
  events: [{ atMs: 0, set: { 'VerifyBoard.Button': false } }, { atMs: 200, set: { 'VerifyBoard.Button': true } }, { atMs: 400, set: { 'VerifyBoard.Button': false } }],
  expectations: [{ kind: 'WITHIN', fromMs: 200, withinMs: 50, condition: { 'VerifyBoard.Led': true } }, { kind: 'WITHIN', fromMs: 400, withinMs: 50, condition: { 'VerifyBoard.Led': false } }],
};

function fakeView(state: VMState, boardId: string | null, button: (atMs: number) => boolean, now: () => number) {
  const calls: string[] = [];
  const session = new Proxy({ connected: true, state } as Record<string, unknown>, {
    get: (target, key) => (key === 'connected' || key === 'state' ? target[key]
      : key === 'readWatchVariables' ? async (variables: WatchVariable[]) => {
        calls.push('readWatchVariables');
        const pressed = button(now());
        return variables.map((item) => ({ ...item, value: item.name === 'VerifyBoard.Button' ? pressed : pressed }));
      }
        : typeof key === 'string' ? async () => { calls.push(key); } : undefined),
  });
  return { view: { session, boardId, runtimeVersion: '2.0.0' } as unknown as BoardSessionView & { session: { state: VMState } }, calls };
}

describe('when the check on the board may run (LRN-013, LRN-015)', () => {
  const view = (state: VMState, boardId: string | null) => fakeView(state, boardId, () => false, () => 0).view;
  it('LRN-015 waits for the learner: a chosen board, a connected session, a running program and a build', () => {
    expect(boardCheckReadiness(null, view('running', 'rpi-pico-rp2040'), DEBUG_MAP)).toEqual({ ready: false, block: 'no-board', reported: null });
    expect(boardCheckReadiness('rpi-pico-rp2040', null, DEBUG_MAP)).toEqual({ ready: false, block: 'not-connected', reported: null });
    expect(boardCheckReadiness('rpi-pico-rp2040', view('idle', 'rpi-pico-rp2040'), DEBUG_MAP)).toEqual({ ready: false, block: 'not-running', reported: null });
    expect(boardCheckReadiness('rpi-pico-rp2040', view('running', 'rpi-pico-rp2040'), null)).toEqual({ ready: false, block: 'no-build', reported: null });
    expect(boardCheckReadiness('rpi-pico-rp2040', view('running', 'rpi-pico-rp2040'), DEBUG_MAP)).toEqual({ ready: true });
  });

  it('LRN-013 names a board that is not the one the learner chose, and one that does not say which it is', () => {
    expect(boardCheckReadiness('rpi-pico-rp2040', view('running', 'esp32-s3-devkitc'), DEBUG_MAP)).toEqual({ ready: false, block: 'wrong-board', reported: 'esp32-s3-devkitc' });
    expect(boardCheckReadiness('rpi-pico-rp2040', view('running', null), DEBUG_MAP)).toEqual({ ready: false, block: 'board-unreported', reported: null });
  });
});

describe('what the check asks the learner to do (LRN-013)', () => {
  it('LRN-013 turns each input event of the scenario into a step on the part and channel the wiring names', () => {
    const steps = boardCheckSteps(SCENARIO, DEBUG_MAP, learnerBoardOf('rpi-pico-rp2040')!, WIRING, 'en');
    expect(steps).toEqual([
      { atMs: 0, signals: [{ signal: 'VerifyBoard.Button', value: false, channel: 'DI0', part: 'Test button', kind: 'button' }] },
      { atMs: 200, signals: [{ signal: 'VerifyBoard.Button', value: true, channel: 'DI0', part: 'Test button', kind: 'button' }] },
      { atMs: 400, signals: [{ signal: 'VerifyBoard.Button', value: false, channel: 'DI0', part: 'Test button', kind: 'button' }] },
    ]);
    expect(boardCheckSteps(SCENARIO, DEBUG_MAP, learnerBoardOf('rpi-pico-rp2040')!, WIRING, 'es')[1]!.signals[0]!.part).toBe('Pulsador de prueba');
  });

  it('LRN-024 reads every signal of the scenario as a BOOL of the Watch read, and names one the build does not have', () => {
    expect(lessonWatchVariables(SCENARIO, DEBUG_MAP)).toEqual({
      variables: [
        { name: 'VerifyBoard.Button', address: 0, bitOffset: 0, type: 'BOOL', forceable: false },
        { name: 'VerifyBoard.Led', address: 0x1000, bitOffset: 0, type: 'BOOL', forceable: false },
      ],
      missing: [],
    });
    expect(lessonWatchVariables({ ...SCENARIO, expectations: [{ kind: 'AT', atMs: 0, condition: { 'VerifyBoard.Gone': true } }] }, DEBUG_MAP).missing).toEqual(['VerifyBoard.Gone']);
  });
});

describe('a check on the board grades a run on hardware (LRN-024, LRN-015)', () => {
  const run = async (button: (atMs: number) => boolean, options: { cancelAt?: number; stopAt?: number } = {}) => {
    let now = 0;
    const { view, calls } = fakeView('running', 'rpi-pico-rp2040', (at) => button(at), () => now);
    const cancel = new AbortController();
    const steps: number[] = [];
    const outcome = await runBoardCheck({
      lessonId: 'verify-my-board', lessonVersion: 1, scenario: SCENARIO, scenarioSha256: 'a'.repeat(64), tolerances: { timeMs: 130, analogPercent: 5 },
      debugMap: DEBUG_MAP, view, variables: lessonWatchVariables(SCENARIO, DEBUG_MAP).variables, now: () => now,
      wait: async (ms) => { now += ms; if (options.cancelAt !== undefined && now >= options.cancelAt) cancel.abort(); if (options.stopAt !== undefined && now >= options.stopAt) view.session.state = 'idle'; },
      cancel: cancel.signal, onStep: (step) => steps.push(step), time: () => new Date('2026-10-20T10:00:00.000Z'),
    });
    return { outcome, calls, steps };
  };
  // The learner presses the button at 1500 ms and lets go at 2600 ms; the LED follows it (SYNTHETIC).
  const learner = (at: number) => at >= 1500 && at < 2600;

  it('LRN-024 follows the learner through the steps, ends by itself, and grades the run as a hardware run', async () => {
    const { outcome, calls, steps } = await run(learner);
    expect(steps).toEqual([1, 2, -1]);
    expect(outcome.kind).toBe('graded');
    if (outcome.kind !== 'graded') return;
    expect(outcome.record).toMatchObject({ track: 'hardware', lessonId: 'verify-my-board', result: 'passed', runtimeVersion: '2.0.0', scenarioSha256: 'a'.repeat(64) });
    expect(outcome.record.programSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(calls)).toEqual(new Set(['readWatchVariables']));
  });

  it('LRN-015 makes no grade when the learner cancels or the session stops, and never restarts it', async () => {
    const cancelled = await run(learner, { cancelAt: 1000 });
    expect(cancelled.outcome).toEqual({ kind: 'cancelled' });
    const stopped = await run(learner, { stopAt: 1000 });
    expect(stopped.outcome).toEqual({ kind: 'stopped', reason: 'session-ended' });
    expect(new Set([...cancelled.calls, ...stopped.calls])).toEqual(new Set(['readWatchVariables']));
  });
});
