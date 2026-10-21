// LRN-015: Learn never starts a physical operation by itself. Bun tests here have no DOM renderer, so this test drives what
// every Learn control is bound to (the Learn home, the lesson panel, the lesson check, the board choice and the hardware check)
// and spies on every seam that reaches a device: the connection manager, Web Serial, and every operation of the desktop bridge
// outside the ones Learn owns. A journey drives the same controls in the real window; tools/ci/learn-physical-guard.ts keeps
// a later edit from adding a call this test does not drive.
import { afterAll, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { GradeRecord } from '../../shared/learnProgressModel';
import { LESSON_INDEX } from '../generated/lessonIndex';
import type { IDebugAdapter, WatchVariable } from '../runtime/debugAdapter';
import type { DeviceTrace } from '../runtime/deviceTrace';
import { evaluateHardwareTrace } from './hardwareCheck';
import { recordHardwareTrace } from './hardwareRecorder';
import { useLearnBoard } from './learnBoard';
import { projectLoaderStub } from '../test/projectLoaderStub';

// The store imports the bundled-example loader that only exists under Vite (import.meta.glob).
await mock.module('../utils/projectLoader', () => projectLoaderStub());
const { connectionManager } = await import('../runtime/connectionManager');
const { useAppSettings } = await import('../store/useAppSettings');
const { useIDEStore } = await import('../store/useIDEStore');
const { openLearnHome, useLearnUi } = await import('./learnUi');
const { useLearnProgress } = await import('./progressState');
const { useLessonCheck } = await import('./useLessonCheck');
const { boardSessionOf } = await import('../runtime/boardSession');
const { runBoardCheck } = await import('./boardCheck');
const { chooseLearnerBoard } = await import('../components/learnBoardWords');

const LESSON = LESSON_INDEX.lessons[0]!.id;
const PHYSICAL = [
  'connect',
  'disconnect',
  'start',
  'stop',
  'reset',
  'sendRaw',
  'enablePassthrough',
  'triggerNetworkBringUp',
  'setModbusAddress',
  'clearModbusAddress',
] as const;
/** The operations of the desktop bridge Learn may use: its progress, its workspaces, the shown project's files and the lesson check. */
const LEARN_BRIDGE =
  /^(?:learnProgress|learnWorkspace|projectFiles)\.\w+$|^workspaceTests\.(?:lessonCheck|cancel|registerProjectRoot|registerProjectFile)$/;

const bridgeCalls: string[] = [];
const serialCalls: string[] = [];
const recording = (prefix: string, calls: string[], answers: Record<string, unknown> = {}) =>
  new Proxy(
    {},
    {
      get: (_target, method) =>
        typeof method === 'string' && method !== 'then'
          ? async () => {
              calls.push(`${prefix}${method}`);
              return answers[`${prefix}${method}`];
            }
          : undefined,
    },
  );
const electronAPI = new Proxy(
  {},
  {
    get: (_target, name) =>
      typeof name === 'string' && name !== 'then'
        ? recording(`${name}.`, bridgeCalls, { 'workspaceTests.lessonCheck': { ok: false, reason: 'refused', codes: ['NO_PROJECT'] } })
        : undefined,
  },
);
const spies = PHYSICAL.map((name) => spyOn(connectionManager, name).mockImplementation((async () => undefined) as never));
const items = new Map<string, string>();
const hadWindow = 'window' in globalThis;
// The stores are shared by every test file of the run: each one this test changes is put back as it was.
const stores = [useIDEStore, useAppSettings, useLearnUi, useLearnProgress, useLearnBoard] as Array<{
  getState(): object;
  setState(state: object, replace: true): void;
}>;
const saved = stores.map((store) => store.getState());

beforeAll(() => {
  Object.assign(globalThis, {
    window: {
      electronAPI,
      localStorage: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => {
          items.set(key, value);
        },
        removeItem: (key: string) => {
          items.delete(key);
        },
      },
    },
  });
  Object.defineProperty(globalThis.navigator, 'serial', { configurable: true, value: recording('serial.', serialCalls) });
});
afterAll(() => {
  if (!hadWindow) delete (globalThis as { window?: unknown }).window;
  delete (globalThis.navigator as { serial?: unknown }).serial;
  for (const spy of spies) spy.mockRestore();
  stores.forEach((store, index) => store.setState(saved[index]!, true));
});

const grade = (track: 'simulation' | 'hardware'): GradeRecord => ({
  schemaVersion: 1,
  lessonId: LESSON,
  lessonVersion: 1,
  track,
  scenarioId: 'S',
  scenarioSha256: 'a'.repeat(64),
  programSha256: 'b'.repeat(64),
  runtimeVersion: '2.0.0',
  time: '2026-10-20T10:00:00.000Z',
  result: 'passed',
  assertions: { total: 1, passed: 1 },
  failedAssertions: [],
});

describe('Learn starts no physical operation by itself (LRN-015)', () => {
  it('LRN-015 drives every Learn control and no connect, deploy, RUN, STOP, force, raw serial or flash happens', async () => {
    // The Learn home: open, close, the lesson list, Start or Continue, the two switches and the language.
    openLearnHome();
    useLearnUi.getState().hideHome();
    useLearnUi.getState().showHome();
    useLearnUi.getState().select(LESSON);
    useIDEStore.setState({
      recentProjects: [],
      refreshRecentProjects: async () => undefined,
      copyExampleProjectToFolder: async () => false,
    } as never);
    await useLearnUi
      .getState()
      .startLesson(LESSON)
      .catch(() => false);
    useAppSettings.getState().update({ unlockAllLessons: true, hideSolutions: true, language: 'es' });
    useAppSettings.getState().update({ unlockAllLessons: false, hideSolutions: false, language: 'en' });
    // The progress: load, the notes of the lesson panel (opened, hints, solution), a grade of each track, export and import.
    const progress = useLearnProgress.getState();
    await progress.load();
    for (const note of [{ started: true, last: true }, { hint: 1 }, { hint: 2 }, { solution: true }] as const)
      await progress.note({ lessonId: LESSON, ...note });
    await progress.recordGrade(grade('simulation'));
    await progress.recordGrade(grade('hardware'));
    await progress.markPassed(LESSON);
    const exported = await progress.exportText();
    if (exported) await progress.importText(exported);
    // The lesson panel: restore the starter, open Tests.
    await useLearnUi.getState().restoreLesson(LESSON);
    useIDEStore.getState().setActiveConsoleTab('tests');
    // The board of the hardware track.
    useLearnBoard.getState().choose('esp32-s3-devkitc');
    useLearnBoard.getState().choose('rpi-pico-rp2040');
    // Check, and Cancel: the hook of the lesson panel, rendered once to take its actions.
    useIDEStore.setState({
      isProjectOpen: true,
      workspaceScenarioLink: { projectSession: useIDEStore.getState().projectSession, workspaceId: 'w' },
    } as never);
    let check: ReturnType<typeof useLessonCheck> | undefined;
    const Harness = () => {
      check = useLessonCheck(() => undefined);
      return null;
    };
    renderToStaticMarkup(<Harness />);
    await check!.run(LESSON);
    check!.cancel();
    // The hardware check on a session the learner connected and started: it only reads.
    const session = new Proxy({ connected: true, state: 'running' } as Record<string, unknown>, {
      get: (target, key) =>
        key === 'connected' || key === 'state'
          ? target[key]
          : key === 'readWatchVariables'
            ? async (variables: WatchVariable[]) => variables.map((variable) => ({ ...variable, value: false }))
            : typeof key === 'string'
              ? async () => {
                  bridgeCalls.push(`session.${key}`);
                }
              : undefined,
    }) as unknown as IDebugAdapter;
    let now = 0;
    const recorded = await recordHardwareTrace(session, [{ name: 'Lamp', address: 0x1000, bitOffset: 0, type: 'BOOL', forceable: false }], {
      durationMs: 100,
      intervalMs: 50,
      now: () => now,
      wait: async (ms) => {
        now += ms;
      },
    });
    expect(recorded.ok).toBe(true);
    evaluateHardwareTrace(
      {
        schemaVersion: 1,
        id: 'S',
        tickMs: 50,
        durationMs: 100,
        events: [],
        expectations: [{ kind: 'ALWAYS', condition: { Lamp: false } }],
      },
      recorded.trace,
      { timeMs: 200, analogPercent: 5 },
      'c'.repeat(64),
    );
    // The lesson on the board: its board picker, the read-only view of the session, and a whole check on the board.
    chooseLearnerBoard('esp32-s3-devkitc', ((key: string) => key) as never);
    expect(boardSessionOf()).toBeNull();
    let clock = 0;
    const checked = await runBoardCheck({
      lessonId: LESSON,
      lessonVersion: 1,
      scenario: {
        schemaVersion: 1,
        id: 'S',
        tickMs: 50,
        durationMs: 300,
        events: [],
        expectations: [{ kind: 'ALWAYS', condition: { Lamp: false } }],
      },
      scenarioSha256: 'a'.repeat(64),
      tolerances: { timeMs: 130, analogPercent: 5 },
      debugMap: { pou: {} } as never,
      view: { session, trace: null, boardId: 'esp32-s3-devkitc', runtimeVersion: '2.0.0' },
      variables: [{ name: 'Lamp', address: 0x1000, bitOffset: 0, type: 'BOOL', forceable: false }],
      now: () => clock,
      wait: async (ms) => {
        clock += ms;
      },
      time: () => new Date('2026-10-20T10:00:00.000Z'),
    });
    expect(checked.kind).toBe('graded');
    // "Arm, then the learner presses Run" on a board that keeps a device trace: the check arms and reads the trace, and the
    // program is started by the learner (here the test), never by Learn.
    const traceCalls: string[] = [];
    const stopped = new Proxy({ connected: true, state: 'idle' } as Record<string, unknown>, {
      get: (target, key) =>
        key === 'connected' || key === 'state'
          ? target[key]
          : typeof key === 'string'
            ? async () => {
                bridgeCalls.push(`session.${key}`);
              }
            : undefined,
      set: (target, key, value) => {
        target[key as string] = value;
        return true;
      },
    }) as unknown as IDebugAdapter & { state: string };
    const status = { available: true, armed: true, capacity: 100, inBytes: 0, outBytes: 1, written: 0, first: 0, maxIoBytes: 32 };
    let scans = 0;
    const deviceTrace: DeviceTrace = {
      status: async () => {
        traceCalls.push('status');
        return status;
      },
      arm: async () => {
        traceCalls.push('arm');
        return status;
      },
      read: async (from) => {
        traceCalls.push('read');
        const samples = Array.from({ length: Math.max(0, scans - from) }, (_, index) => ({
          seq: from + index,
          tUs: (from + index) * 50_000,
          batch: from + index + 1,
          inputs: new Uint8Array(0),
          outputs: Uint8Array.of(0),
        }));
        return { from, next: from + samples.length, samples };
      },
      clear: async () => {
        traceCalls.push('clear');
        return status;
      },
    };
    let armedClock = 0;
    const armed = await runBoardCheck({
      lessonId: LESSON,
      lessonVersion: 1,
      scenario: {
        schemaVersion: 1,
        id: 'S',
        tickMs: 50,
        durationMs: 300,
        events: [],
        expectations: [{ kind: 'ALWAYS', condition: { Lamp: false } }],
      },
      scenarioSha256: 'a'.repeat(64),
      tolerances: { timeMs: 60, analogPercent: 5 },
      debugMap: { pou: {} } as never,
      view: { session: stopped, trace: deviceTrace, boardId: 'esp32-s3-devkitc', runtimeVersion: '2.0.0' },
      variables: [{ name: 'Lamp', address: 0x1000, bitOffset: 0, type: 'BOOL', forceable: false }],
      now: () => armedClock,
      time: () => new Date('2026-10-20T10:00:00.000Z'),
      wait: async (ms) => {
        armedClock += ms;
        if (armedClock >= 200) {
          stopped.state = 'running';
          scans += 2;
        }
      },
    });
    expect(armed.kind).toBe('graded');
    expect(new Set(traceCalls)).toEqual(new Set(['status', 'arm', 'read', 'clear']));

    // The check reached the lesson check of the bridge, so the controls above were really driven.
    expect(bridgeCalls).toContain('workspaceTests.lessonCheck');
    expect(bridgeCalls.filter((call) => !LEARN_BRIDGE.test(call))).toEqual([]);
    expect(serialCalls).toEqual([]);
    expect(Object.fromEntries(PHYSICAL.map((name, index) => [name, spies[index]!.mock.calls.length]))).toEqual(
      Object.fromEntries(PHYSICAL.map((name) => [name, 0])),
    );
  });
});
