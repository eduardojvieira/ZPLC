/**
 * The hardware check of a lesson (LRN-024, LRN-026): the lesson's reference scenario, the same file and hash the simulation
 * grades against, evaluated on a trace recorded from the learner's board, with the tolerances the lesson declares. Pure: it
 * takes the scenario, the trace and the tolerances, and returns a result labelled `hardware`, never a simulation pass.
 *
 * Alignment rule. In simulation the scenario writes its inputs at exact times. On a board the learner makes those input
 * changes by pressing buttons, so their times are human. The check therefore does not read the trace at the scenario's
 * absolute times:
 *  1. Each input event of the scenario, in time order, is found in the trace: it is observed at the first sample, at or after
 *     the sample where the previous event was observed, whose values hold everything the event sets. An event that is never
 *     observed leaves every later event unobserved too.
 *  2. A scenario time T is moved onto the trace through the input event it depends on, the last event at or before T:
 *     observed time of that event + (T - its scenario time). Before the first event the trace starts at scenario time 0.
 *  3. Each assertion is then evaluated as the simulation does, on the moved times, with `timeMs` of slack either way: a window
 *     that must contain a match (AT, WITHIN, EVENTUALLY, RISING, FALLING) grows by `timeMs` at both ends, and a window that
 *     must hold throughout (FOR, the body of UNTIL) shrinks by `timeMs` at both ends. ALWAYS and NEVER cover the trace up
 *     to the moved end of the scenario.
 *  4. An assertion whose time depends on an event that was never observed fails with nothing observed.
 *  5. Start anchor ("arm, then the learner presses Run"). When the trace begins at the first scan of a run, its time 0 is
 *     the program's start, as in simulation, so the times before the first input event the learner makes are read where the
 *     scenario puts them: the blink of a program is aligned with its start. The input events at scenario time 0 are the
 *     state of the inputs at the start; they are taken at trace time 0 and not searched for, so a button held at the start
 *     does not shift the rest of the scenario: the assertions see the input the program saw.
 *
 * The scenario format holds boolean conditions only, so `analogPercent` has nothing to compare yet; it is carried so that
 * the tolerances the lesson declares reach the check unchanged.
 */
import type { FailedAssertion, GradeRecord } from '../../electron/learnProgressModel';
import { snapshotUri } from './gradeRecord';
import type { ScenarioExpectation, ScenarioFile } from './lessonPackage';

/** One sample read from the board: when, in whole ms since the recording started, and the lesson's inputs and outputs then. */
export interface HardwareSample { atMs: number; values: Record<string, boolean | number> }
/** What the lesson manifest declares under `hardware.tolerances`. */
export interface HardwareTolerances { timeMs: number; analogPercent: number }
export interface HardwareResult { track: 'hardware'; passed: boolean; assertions: { total: number; passed: number }; failures: FailedAssertion[] }

type Trace = readonly HardwareSample[];

const matches = (condition: Record<string, boolean>, values: HardwareSample['values']): boolean =>
  Object.entries(condition).every(([signal, value]) => values[signal] === value);

const eventsOf = (scenario: ScenarioFile) => [...scenario.events].sort((left, right) => left.atMs - right.atMs);

/**
 * Where each input event of the scenario, in time order, was observed in the trace (its sample's `atMs`); null when it was
 * not. In an anchored trace (time 0 is the start of the run) the events at scenario time 0 are taken at its first sample.
 */
export function alignEvents(scenario: ScenarioFile, trace: Trace, anchored = false): Array<number | null> {
  const observed: Array<number | null> = [];
  let from = 0;
  for (const event of eventsOf(scenario)) {
    if (anchored && event.atMs === 0) { observed.push(trace.length > 0 ? trace[0]!.atMs : null); continue; }
    const index = from < 0 ? -1 : trace.findIndex((sample, position) => position >= from && matches(event.set, sample.values));
    observed.push(index < 0 ? null : trace[index]!.atMs);
    from = index;
  }
  return observed;
}

export function evaluateHardwareTrace(scenario: ScenarioFile, trace: Trace, tolerances: HardwareTolerances, traceSha256: string, anchored = false): HardwareResult {
  const events = eventsOf(scenario);
  const observed = alignEvents(scenario, trace, anchored);
  const slack = tolerances.timeMs;
  /** A scenario time moved onto the trace through the input event it depends on; null when that event was not observed. */
  const moved = (atMs: number): number | null => {
    const last = events.reduce((found, event, index) => (event.atMs <= atMs ? index : found), -1);
    if (last < 0) return atMs;
    const at = observed[last];
    return at === null || at === undefined ? null : at + (atMs - events[last]!.atMs);
  };
  const within = (from: number, to: number): number[] => trace.flatMap((sample, index) => (sample.atMs >= from && sample.atMs <= to ? [index] : []));

  const failure = (index: number, expectation: ScenarioExpectation, cursor: number | undefined): FailedAssertion => {
    const sample = cursor === undefined ? undefined : trace[cursor];
    const observedValues: Record<string, boolean | null> = {};
    for (const signal of Object.keys(expectation.condition)) {
      const value = sample?.values[signal];
      observedValues[signal] = typeof value === 'boolean' ? value : null;
    }
    return {
      index, kind: expectation.kind, atMs: sample ? sample.atMs : null, expected: { ...expectation.condition }, observed: observedValues,
      trace: sample ? { scenarioId: scenario.id, traceSha256, cursor: cursor!, atMs: sample.atMs, uri: snapshotUri(scenario.id, cursor!, traceSha256) } : null,
    };
  };

  /** The failure of one assertion, or null when it holds. */
  const check = (expectation: ScenarioExpectation, index: number): FailedAssertion | null => {
    const holds = (cursor: number): boolean => matches(expectation.condition, trace[cursor]!.values);
    const { kind } = expectation;
    const start = moved(kind === 'AT' ? expectation.atMs ?? 0 : expectation.fromMs ?? 0);
    const end = moved(kind === 'AT' ? expectation.atMs ?? 0
      : kind === 'FOR' ? (expectation.fromMs ?? 0) + (expectation.forMs ?? 0)
        : kind === 'UNTIL' || kind === 'ALWAYS' || kind === 'NEVER' ? scenario.durationMs
          : (expectation.fromMs ?? 0) + (expectation.withinMs ?? 0));
    if (start === null || end === null) return failure(index, expectation, undefined);
    if (kind === 'AT' || kind === 'WITHIN' || kind === 'EVENTUALLY') {
      const window = within(start - slack, end + slack);
      return window.some(holds) ? null : failure(index, expectation, window.at(-1));
    }
    if (kind === 'RISING' || kind === 'FALLING') {
      const target = kind === 'RISING';
      const signal = Object.keys(expectation.condition)[0] ?? '';
      const window = within(start - slack, end + slack);
      const edge = window.some((cursor) => cursor > 0 && trace[cursor]!.values[signal] === target && trace[cursor - 1]!.values[signal] !== target);
      return edge ? null : failure(index, expectation, window.at(-1));
    }
    if (kind === 'FOR') {
      const strict = within(start + slack, end - slack);
      if (strict.length > 0) { const broken = strict.find((cursor) => !holds(cursor)); return broken === undefined ? null : failure(index, expectation, broken); }
      // A window shorter than twice the slack has no sample that must hold: one match near it is enough.
      const loose = within(start - slack, end + slack);
      return loose.some(holds) ? null : failure(index, expectation, loose.at(-1));
    }
    if (kind === 'UNTIL') {
      const terminal = trace.findIndex((sample) => sample.atMs >= start && matches(expectation.until ?? {}, sample.values));
      if (terminal < 0) return failure(index, expectation, trace.length > 0 ? trace.length - 1 : undefined);
      const broken = within(start + slack, trace[terminal]!.atMs - 1).find((cursor) => !holds(cursor));
      return broken === undefined ? null : failure(index, expectation, broken);
    }
    // ALWAYS and NEVER: every sample up to the moved end of the scenario; a trace with none proves nothing.
    const window = within(0, end);
    if (window.length === 0) return failure(index, expectation, undefined);
    const offending = kind === 'ALWAYS' ? window.find((cursor) => !holds(cursor)) : window.find(holds);
    return offending === undefined ? null : failure(index, expectation, offending);
  };

  const failures = scenario.expectations.flatMap((expectation, index) => { const failed = check(expectation, index); return failed ? [failed] : []; });
  const total = scenario.expectations.length;
  return { track: 'hardware', passed: total > 0 && failures.length === 0, assertions: { total, passed: total - failures.length }, failures };
}

/** The identity of a trace: SHA-256 of its canonical text (samples in order, each sample's signals in name order). */
export async function traceSha256Of(trace: Trace): Promise<string> {
  const text = JSON.stringify(trace.map((sample) => [sample.atMs, Object.keys(sample.values).sort().map((signal) => [signal, sample.values[signal]])]));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface HardwareGradeInput {
  lessonId: string;
  lessonVersion: number;
  /** The reference scenario of the lesson package and its content hash, as the simulation grade uses them. */
  scenario: ScenarioFile;
  scenarioSha256: string;
  /** Hash of the compiled program the learner deployed to the board. */
  programSha256: string;
  /** The ZPLC version the board reported. */
  runtimeVersion: string;
  time: Date;
  trace: Trace;
  traceSha256: string;
  tolerances: HardwareTolerances;
  /** Time 0 of the trace is the first scan of the run (rule 5). */
  anchored?: boolean;
}

/** The grade of a hardware run: track `hardware`, so the progress store keeps it apart from a simulation pass (LRN-024). */
export function hardwareGradeRecordOf(input: HardwareGradeInput): GradeRecord {
  const result = evaluateHardwareTrace(input.scenario, input.trace, input.tolerances, input.traceSha256, input.anchored);
  return {
    schemaVersion: 1,
    lessonId: input.lessonId,
    lessonVersion: input.lessonVersion,
    track: 'hardware',
    scenarioId: input.scenario.id,
    scenarioSha256: input.scenarioSha256,
    programSha256: input.programSha256,
    runtimeVersion: input.runtimeVersion,
    time: input.time.toISOString(),
    result: result.passed ? 'passed' : 'failed',
    assertions: result.assertions,
    failedAssertions: result.failures,
  };
}
