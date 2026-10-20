/**
 * The check on the board of a lesson (LRN-013, LRN-024), as the lesson panel runs it after the learner presses "Check on
 * board". It reads a session the learner opened, through the read-only view of `src/runtime/boardSession.ts`, and never
 * connects, deploys, starts, stops, forces or writes (LRN-015): until the learner has connected the board they chose,
 * deployed a build and started it, the check says what is missing and does not run.
 *
 * During the run it follows the recorded trace: each input event of the reference scenario is a step that the learner
 * makes on the part the wiring names ("press the Test button on DI0"), the step shown is the first one not yet seen in the
 * trace, and the recording ends by itself once the last step is seen and the rest of the scenario has passed, with the
 * lesson's time tolerance. The run is then graded by `hardwareCheck.ts` and labelled a hardware run.
 *
 * Recording: when the board keeps a per-scan I/O trace (`zplc dbg trace`), the check reads it and grades it with the
 * tolerance the lesson declares; otherwise it reads the Watch values every 100 ms and widens the tolerance by a polling
 * period (`pollingTimeToleranceMs`). "Arm, then the learner presses Run": when the program is stopped as the check begins,
 * the check arms the recording and asks the learner to press Run in the toolbar; the first scan of the run is then scenario
 * time 0, as in simulation. A lesson whose assertions before the learner's first action depend on when the program
 * started (a blink) can only be checked that way, so a running program is first stopped by the learner.
 *
 * The program hash of the grade is the SHA-256 of the artifact the deploy flow last sent (`src/store/deployedProgram.ts`), or,
 * when no deploy of this session is known, of the build's debug map: a build is a function of its sources.
 */
import type { GradeRecord } from '../../electron/learnProgressModel';
import type { WiringBoard, WiringFile, WiringLocale } from '../boards/wiring/wiring';
import { partsFor } from '../boards/wiring/wiring';
import type { DebugMap } from '../compiler';
import type { BoardSessionView } from '../runtime/boardSession';
import { MEMORY_MAP, type WatchVariable } from '../runtime/debugAdapter';
import { findSignalVariable } from '../test-engine';
import { recordDeviceTrace } from './deviceTraceRecorder';
import { alignEvents, hardwareGradeRecordOf, traceSha256Of, type HardwareTolerances } from './hardwareCheck';
import { recordHardwareTrace } from './hardwareRecorder';
import type { LearnerBoard } from './learnBoard';
import { HARDWARE_SAMPLE_INTERVAL_MS, pollingTimeToleranceMs, type ScenarioFile } from './lessonPackage';

export type BoardCheckBlock = 'no-board' | 'not-connected' | 'not-running' | 'stop-first' | 'no-build' | 'board-unreported' | 'wrong-board';
export type BoardCheckReadiness = { ready: true } | { ready: false; block: BoardCheckBlock; reported: string | null };

/**
 * Whether the scenario asserts something about the program before the learner's first action, other than at time 0: then
 * its result depends on when the program started, and the check has to begin with the run.
 */
export function needsRunStart(scenario: ScenarioFile): boolean {
  const firstAction = Math.min(...scenario.events.filter((event) => event.atMs > 0).map((event) => event.atMs), Infinity);
  return scenario.expectations.some((expectation) => {
    const at = expectation.kind === 'AT' ? expectation.atMs ?? 0 : expectation.fromMs ?? 0;
    return at > 0 && at < firstAction;
  });
}

/** Whether the check may run now, and if not, the first thing the learner still has to do. */
export function boardCheckReadiness(board: LearnerBoard | null, view: BoardSessionView | null, debugMap: DebugMap | null, scenario: ScenarioFile | null = null): BoardCheckReadiness {
  const blocked = (block: BoardCheckBlock, reported: string | null = null): BoardCheckReadiness => ({ ready: false, block, reported });
  if (board === null) return blocked('no-board');
  if (view === null || !view.session.connected) return blocked('not-connected');
  // A stopped program is started by the learner once the check is armed; a paused or faulted one is not ready.
  if (view.session.state !== 'running' && view.session.state !== 'idle') return blocked('not-running');
  if (view.session.state === 'running' && scenario !== null && needsRunStart(scenario)) return blocked('stop-first');
  if (debugMap === null) return blocked('no-build');
  // The identity step: the firmware names the board of its I/O description, and it must be the board the learner chose.
  if (view.boardId === null) return blocked('board-unreported');
  if (view.boardId !== board) return blocked('wrong-board', view.boardId);
  return { ready: true };
}

/** Every signal of the scenario, in the order it first appears: the events, then the conditions. */
function signalsOf(scenario: ScenarioFile): string[] {
  const names = [
    ...scenario.events.flatMap((event) => Object.keys(event.set)),
    ...scenario.expectations.flatMap((expectation) => [...Object.keys(expectation.condition), ...Object.keys(expectation.until ?? {})]),
  ];
  return [...new Set(names)];
}

/** What the recorder reads: each signal of the scenario as a BOOL of the Watch read; `missing` names the ones the build lacks. */
export function lessonWatchVariables(scenario: ScenarioFile, debugMap: DebugMap): { variables: WatchVariable[]; missing: string[] } {
  const variables: WatchVariable[] = [];
  const missing: string[] = [];
  for (const signal of signalsOf(scenario)) {
    const found = findSignalVariable(debugMap, signal);
    if (!found) { missing.push(signal); continue; }
    variables.push({ name: signal, address: found.variable.addr, ...(found.variable.bitOffset === undefined ? {} : { bitOffset: found.variable.bitOffset }), type: 'BOOL', forceable: false });
  }
  return { variables, missing };
}

export interface BoardCheckSignal { signal: string; value: boolean; channel: string | null; part: string | null; kind: string | null }
export interface BoardCheckStep { atMs: number; signals: BoardCheckSignal[] }

/** The IEC address of a BOOL of the process image, as the board I/O description writes its channels. */
function addressOf(debugMap: DebugMap, signal: string): string | null {
  const found = findSignalVariable(debugMap, signal);
  if (!found) return null;
  const { addr, bitOffset, region } = found.variable;
  const base = region === 'IPI' ? MEMORY_MAP.ipi.baseAddress : region === 'OPI' ? MEMORY_MAP.opi.baseAddress : null;
  return base === null ? null : `%${region === 'IPI' ? 'I' : 'Q'}X${addr - base}.${bitOffset ?? 0}`;
}

/** The steps of the run: each input event of the scenario, in time order, on the channel and part the wiring names. */
export function boardCheckSteps(scenario: ScenarioFile, debugMap: DebugMap, board: WiringBoard, wiring: WiringFile, locale: WiringLocale): BoardCheckStep[] {
  const parts = partsFor(wiring, board);
  return [...scenario.events].sort((left, right) => left.atMs - right.atMs).map((event) => ({
    atMs: event.atMs,
    signals: Object.entries(event.set).map(([signal, value]) => {
      const address = addressOf(debugMap, signal);
      const channel = board.io.channels.find((candidate) => candidate.address === address)?.id ?? null;
      const part = channel === null ? undefined : parts.find((candidate) => candidate.channel === channel);
      return { signal, value, channel, part: part ? part.label[locale] : null, kind: part ? part.kind : null };
    }),
  }));
}

/** The longest run: a learner who walks away does not leave a recording going. */
export const MAX_BOARD_CHECK_MS = 5 * 60_000;

export interface BoardCheckRun {
  lessonId: string;
  lessonVersion: number;
  /** The reference scenario of the lesson package and its content hash. */
  scenario: ScenarioFile;
  scenarioSha256: string;
  tolerances: HardwareTolerances;
  debugMap: DebugMap;
  view: BoardSessionView;
  variables: readonly WatchVariable[];
  now(): number;
  wait(ms: number): Promise<void>;
  /** Aborted when the learner cancels the check: no grade is made. */
  cancel?: AbortSignal;
  /** The index of the step the learner is on; -1 once every step was seen. */
  onStep?(step: number): void;
  /** Called with true when the check is armed and waits for the learner to press Run, and with false once the run began. */
  onWaitingForRun?(waiting: boolean): void;
  /** SHA-256 of the artifact the learner deployed, when the deploy flow published it. */
  programSha256?: string | null;
  time(): Date;
}

export type BoardCheckOutcome =
  | { kind: 'graded'; record: GradeRecord }
  | { kind: 'cancelled' }
  | { kind: 'stopped'; reason: 'not-connected' | 'not-running' | 'session-ended' | 'read-failed' };

const sha256Hex = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export async function runBoardCheck(run: BoardCheckRun): Promise<BoardCheckOutcome> {
  const events = [...run.scenario.events].sort((left, right) => left.atMs - right.atMs);
  const finish = new AbortController();
  const cancelled = (): boolean => run.cancel?.aborted === true;
  run.cancel?.addEventListener('abort', () => finish.abort());
  const awaitRun = run.view.session.state !== 'running';
  let step = -2;
  let anchored = awaitRun;
  let tolerances = run.tolerances;
  if (awaitRun) run.onWaitingForRun?.(true);
  const onSample = (trace: readonly { atMs: number; values: Record<string, boolean | number> }[]) => {
    if (awaitRun && trace.length === 1) run.onWaitingForRun?.(false);
    const observed = alignEvents(run.scenario, trace, anchored);
    const next = observed.findIndex((at) => at === null);
    if (next !== step) { step = next; run.onStep?.(next); }
    if (next !== -1) return;
    const last = events.at(-1);
    const end = last ? observed.at(-1)! + (run.scenario.durationMs - last.atMs) : run.scenario.durationMs;
    if (trace.at(-1)!.atMs >= end + tolerances.timeMs) finish.abort();
  };
  const options = { durationMs: MAX_BOARD_CHECK_MS, intervalMs: HARDWARE_SAMPLE_INTERVAL_MS, now: run.now, wait: run.wait, signal: finish.signal, onSample, awaitRun };
  let recording = run.view.trace ? await recordDeviceTrace(run.view.session, run.view.trace, run.variables, options) : null;
  if (recording === null && !cancelled()) {
    // No device trace on this board: the Watch values are polled, and the tolerance widens by a polling period.
    tolerances = { ...run.tolerances, timeMs: pollingTimeToleranceMs(run.tolerances.timeMs) };
    anchored = false;
    const polled = await recordHardwareTrace(run.view.session, run.variables, options);
    recording = { ...polled, anchored: false };
  }
  if (cancelled() || recording === null) return { kind: 'cancelled' };
  if (!recording.ok) return { kind: 'stopped', reason: recording.reason };
  if (recording.trace.length === 0) return { kind: 'stopped', reason: 'not-running' };
  const record = hardwareGradeRecordOf({
    lessonId: run.lessonId, lessonVersion: run.lessonVersion, scenario: run.scenario, scenarioSha256: run.scenarioSha256,
    programSha256: run.programSha256 ?? await sha256Hex(JSON.stringify(run.debugMap)), runtimeVersion: run.view.runtimeVersion ?? 'unreported', time: run.time(),
    trace: recording.trace, traceSha256: await traceSha256Of(recording.trace), tolerances, anchored: recording.anchored,
  });
  return { kind: 'graded', record };
}
