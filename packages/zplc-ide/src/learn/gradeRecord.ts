/**
 * The grade of a lesson in simulation (LRN-023) and the account of a failed check (LRN-026). Pure: it takes what the
 * test engine reported and the reference scenario, and returns the record the progress store keeps.
 *
 * A record is a function of the program and of the scenario: running the same program against the same scenario gives
 * the same record, whatever the time of day, except for `time`, which the caller passes in.
 */
import type { FailedAssertion, GradeRecord, NumericExpect } from '../../shared/learnProgressModel';
import type { ScenarioExpectation, ScenarioFile } from './lessonPackage';

export interface ObservedAssertion {
  kind: string;
  passed: boolean;
  atMs?: number;
  /** The numeric and boolean checks the engine reports on a failed assertion. */
  checks?: ReadonlyArray<{ signal: string; expected: boolean | NumericExpect; observed?: boolean | number }>;
}
export interface TraceSample {
  atMs: number;
  outputs: Record<string, boolean>;
}

/** The address of one sample of a recorded trace in the replay resource (`zplc://runtime/snapshot/...`). */
export function snapshotUri(scenarioId: string, cursor: number, traceSha256: string): string {
  return `zplc://runtime/snapshot/${scenarioId}/${cursor}/${traceSha256}`;
}

const conditionText = (condition: Record<string, boolean>): string =>
  Object.entries(condition)
    .map(([signal, value]) => `${signal} = ${value}`)
    .join(', ');

/** One expectation as a learner reads it: its kind, its window and what it requires. */
export function describeExpectation(expectation: ScenarioExpectation): string {
  const { kind, atMs, fromMs, withinMs, forMs } = expectation;
  const window =
    kind === 'AT'
      ? ` ${atMs} ms`
      : kind === 'FOR'
        ? ` ${fromMs} to ${(fromMs ?? 0) + (forMs ?? 0)} ms`
        : fromMs !== undefined && withinMs !== undefined
          ? ` ${fromMs} to ${fromMs + withinMs} ms`
          : fromMs !== undefined
            ? ` from ${fromMs} ms`
            : '';
  const until = expectation.until ? ` until ${conditionText(expectation.until)}` : '';
  return `${kind}${window}: ${conditionText(expectation.condition)}${until}`;
}

/**
 * The failed assertions of one run. `trace` is the full trace of the scenario (one sample per tick, from 0), `traceSha256`
 * the hash of the trace evidence that holds it. An assertion carries the instant the engine found it failing, the values
 * it required, the values the trace holds then (null where the samples handed in do not hold them), and the address of
 * that sample in the trace.
 */
export function failedAssertionsOf(
  scenario: ScenarioFile,
  assertions: readonly ObservedAssertion[],
  trace: readonly TraceSample[],
  traceSha256: string,
): FailedAssertion[] {
  const result: FailedAssertion[] = [];
  assertions.forEach((assertion, index) => {
    if (assertion.passed) return;
    const expected = scenario.expectations[index]?.condition ?? {};
    const atMs = assertion.atMs ?? null;
    // The trace of a scenario has one sample per tick from 0, so a sample's index is its time over the tick. The samples
    // handed in may be a subset (a preview keeps some of them), which is why the index is computed and not searched.
    const onTimeline = atMs !== null && atMs % scenario.tickMs === 0 && atMs <= scenario.durationMs;
    const cursor = onTimeline ? atMs / scenario.tickMs : -1;
    const sample = onTimeline ? trace.find((item) => item.atMs === atMs) : undefined;
    const observed: Record<string, boolean | number | null> = {};
    for (const signal of Object.keys(expected))
      observed[signal] = sample && typeof sample.outputs[signal] === 'boolean' ? sample.outputs[signal]! : null;
    const required: Record<string, boolean | NumericExpect> = { ...expected };
    for (const check of assertion.checks ?? []) {
      if (typeof check.expected === 'boolean') continue;
      required[check.signal] = check.expected;
      observed[check.signal] = typeof check.observed === 'number' ? check.observed : null;
    }
    result.push({
      index,
      kind: assertion.kind,
      atMs,
      expected: required,
      observed,
      trace: onTimeline ? { scenarioId: scenario.id, traceSha256, cursor, atMs, uri: snapshotUri(scenario.id, cursor, traceSha256) } : null,
    });
  });
  return result;
}

const valueText = (value: boolean | number | NumericExpect | null, unknown: string, locale: 'en' | 'es'): string => {
  if (value === null) return unknown;
  if (typeof value !== 'object') return String(value);
  const { min, max } = value;
  if (min !== undefined && max !== undefined) return locale === 'es' ? `entre ${min} y ${max}` : `between ${min} and ${max}`;
  if (min !== undefined) return locale === 'es' ? `al menos ${min}` : `at least ${min}`;
  return locale === 'es' ? `como máximo ${max}` : `at most ${max}`;
};

const valuesText = (values: Record<string, boolean | number | NumericExpect | null>, unknown: string, locale: 'en' | 'es'): string =>
  Object.entries(values)
    .map(([signal, value]) => `${signal} = ${valueText(value, unknown, locale)}`)
    .join(', ');

/** One failed assertion as a sentence for the learner: what it required, at which instant, and what the trace holds. */
export function describeFailure(failure: FailedAssertion, expectation: ScenarioExpectation | undefined, locale: 'en' | 'es'): string {
  const what = expectation ? describeExpectation(expectation) : failure.kind;
  const when = failure.atMs === null ? '' : locale === 'es' ? `a ${failure.atMs} ms ` : `at ${failure.atMs} ms `;
  return locale === 'es'
    ? `${what} · ${when}se esperaba ${valuesText(
        failure.expected,
        'desconocido',
        locale,
      )}; se observó ${valuesText(failure.observed, 'desconocido', locale)}`
    : `${what} · ${when}expected ${valuesText(failure.expected, 'unknown', locale)}; ` +
        `observed ${valuesText(failure.observed, 'unknown', locale)}`;
}

export interface GradeInput {
  lessonId: string;
  lessonVersion: number;
  scenario: ScenarioFile;
  scenarioSha256: string;
  programSha256: string;
  runtimeVersion: string;
  time: Date;
  assertions: readonly ObservedAssertion[];
  trace: readonly TraceSample[];
  traceSha256: string;
}

export function gradeRecordOf(input: GradeInput): GradeRecord {
  const failures = failedAssertionsOf(input.scenario, input.assertions, input.trace, input.traceSha256);
  const total = input.assertions.length;
  return {
    schemaVersion: 1,
    lessonId: input.lessonId,
    lessonVersion: input.lessonVersion,
    track: 'simulation',
    scenarioId: input.scenario.id,
    scenarioSha256: input.scenarioSha256,
    programSha256: input.programSha256,
    runtimeVersion: input.runtimeVersion,
    time: input.time.toISOString(),
    result: failures.length === 0 && total > 0 ? 'passed' : 'failed',
    assertions: { total, passed: total - input.assertions.filter((assertion) => !assertion.passed).length },
    failedAssertions: failures,
  };
}
