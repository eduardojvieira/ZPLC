/**
 * The agent-sized forms of a recorded trace (AIX-015, AI-03, AI-08, AI-12). A `trace_get` call with no new parameter answers
 * as 2.0 did; `changes`, `window` and `summary` read the same recorded trace, and the inputs and watched variables of the
 * run's sidecar, which is never part of the trace, so `traceSha256` stays the 2.0 one.
 */

/** The largest answer of a tool or a resource, in bytes of its JSON text. */
export const MAX_OUTPUT_BYTES = 512 * 1024;
/** The largest recorded trace the server reads (AI-03): bounded by the 10,000 samples of the scenario engine. */
export const MAX_INTERNAL_TRACE_BYTES = 16 * 1024 * 1024;
export const TRACE_MODES = ['changes', 'summary', 'window'] as const;
export type TraceMode = (typeof TRACE_MODES)[number];
/** What each new trace_get parameter means, as the tool's input schema describes it. */
export const TRACE_HELP = {
  mode:
    'changes: first sample, every change of a program signal, failed expectations, last sample; a fact: that is not a whole ' +
    'number counts only when signals names it. window: every sample of a range. summary: per signal.',
  signals: 'Only these signals, by name from availableSignals; all of them when omitted. Name a fact: here to count its every change.',
  includeInputs: 'Include the inputs the run wrote (default true).',
  watchSignals: 'Program variables or block members (Program.T1.ET) to read after each step; the recorded trace is unchanged.',
  fromMs: 'Start of the range, in ms of plant time.',
  toMs: 'End of the range, in ms of plant time.',
  fromSample: 'Start of the range, by sample index; nextCursor gives the next page.',
  limit: 'The most samples one answer returns (default 200).',
} as const;
const DEFAULT_LIMIT = 200;
const MAX_VALID_VALUES = 32;

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
};
type Value = boolean | number;
type Signals = Record<string, Value>;
/** The sidecar of a run (AI-08): one record per trace sample, or an empty list for a part the run did not record. */
export interface ObservedTrace {
  inputs: Signals[];
  watched: Signals[];
  facts: Signals[];
}
export type Replay = {
  traceSha256: string;
  samples: Array<{ atMs: number; outputs: Record<string, boolean>; plant?: unknown }>;
  assertions: Array<Record<string, unknown>>;
  totalSamples: number;
  evidence: Record<string, unknown>;
  execution: Record<string, unknown>;
  ok: boolean;
  observed?: ObservedTrace;
};
export interface TraceArgs {
  scenarioId?: string;
  mode?: TraceMode;
  signals?: string[];
  includeInputs?: boolean;
  watchSignals?: string[];
  fromMs?: number;
  toMs?: number;
  fromSample?: number;
  limit?: number;
}

const GROUPS = ['outputs', 'inputs', 'watched', 'facts'] as const;
type Group = (typeof GROUPS)[number];

function answer(structuredContent: Record<string, unknown>, isError: boolean): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent, ...(isError ? { isError: true } : {}) };
}

/** An actionable refusal (AIX-015): the code, what failed, what to do next, and the valid values when a name was wrong. */
export function traceError(error: string, message: string, nextStep: string, validValues?: readonly string[]): McpToolResult {
  const sorted = validValues && [...new Set(validValues)].sort();
  const more = sorted ? sorted.length - MAX_VALID_VALUES : 0;
  return answer(
    {
      ok: false,
      error,
      message,
      nextStep,
      ...(sorted ? { validValues: sorted.slice(0, MAX_VALID_VALUES) } : {}),
      ...(more > 0 ? { more } : {}),
    },
    true,
  );
}

/** The answer, or the refusal that says how to ask for less when it is over the output limit. */
// room for what the dispatcher adds to an answer (its evidence level), so a page that fits here fits there too
const ENVELOPE_MARGIN = 256;
const fits = (result: McpToolResult) => Buffer.byteLength(result.content[0]!.text, 'utf8') <= MAX_OUTPUT_BYTES - ENVELOPE_MARGIN;

function sized(content: Record<string, unknown>, isError: boolean, nextStep: string, validValues?: readonly string[]): McpToolResult {
  const result = answer(content, isError);
  const bytes = Buffer.byteLength(result.content[0]!.text, 'utf8');
  return fits(result)
    ? result
    : traceError(
        'MCP_OUTPUT_LIMIT',
        `The answer is ${Math.ceil(bytes / 1024)} KiB, over the 512 KiB an answer can hold.`,
        nextStep,
        validValues,
      );
}

/** A 2.0 call names only the scenario: it gets the 2.0 answer and asks the run for no sidecar. */
function isTraceV2(args: TraceArgs): boolean {
  return Object.keys(args).every((key) => key === 'scenarioId');
}

/** What the Tool API is asked to record beside the trace; nothing for a 2.0 call. */
export function traceObserve(args: TraceArgs): { inputs: boolean; watch: string[] } | undefined {
  return isTraceV2(args) ? undefined : { inputs: args.includeInputs !== false, watch: args.watchSignals ?? [] };
}

const own = (record: object, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
};

/** A scenarioId the project has no scenario for (AIX-015): MCP_NOT_FOUND with the ids it has. Undefined otherwise. */
export function scenarioNotFound(value: unknown, scenarioId: string): McpToolResult | undefined {
  const ids = value && typeof value === 'object' ? own(value, 'scenarioIds') : undefined;
  return Array.isArray(ids)
    ? traceError(
        'MCP_NOT_FOUND',
        `The project has no scenario ${JSON.stringify(scenarioId)}.`,
        'Call scenarios_list, or use one of validValues.',
        ids as string[],
      )
    : undefined;
}

/**
 * The refusal of a scenario run before its trace is read: a recorded trace over the 16 MiB the server reads (AI-03), or a
 * watched name no variable has (AIX-015). Undefined when the run can be read.
 */
export function traceRefusal(value: unknown, scenarioId: string): McpToolResult | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const missing = scenarioNotFound(value, scenarioId);
  if (missing) return missing;
  const traceFile = own(value, 'traceFile');
  if (traceFile instanceof Uint8Array && traceFile.byteLength > MAX_INTERNAL_TRACE_BYTES)
    return traceError(
      'MCP_TRACE_TOO_LARGE',
      `The recorded trace is ${Math.ceil(traceFile.byteLength / 1024 / 1024)} MiB, over the 16 MiB the server reads.`,
      'Shorten durationMs of the scenario, or name fewer signals in its expectations, and run it again.',
    );
  const watch = own(value, 'watchUnknown') as { unknown: string[]; validValues: string[] } | undefined;
  if (watch)
    return traceError(
      'MCP_NOT_FOUND',
      `No variable of the program is named ${watch.unknown.join(', ')}.`,
      'Watch names from validValues: Program.variable, or Program.instance.member of a block.',
      watch.validValues,
    );
  return undefined;
}

/** The refusal of a trace_get argument (AIX-015): a wrong mode is answered with the valid modes. */
export function traceArgumentsError(args: Record<string, unknown>): McpToolResult {
  const mode = own(args, 'mode');
  if (mode !== undefined && !TRACE_MODES.includes(mode as TraceMode))
    return traceError('MCP_INVALID_ARGUMENTS', `mode ${JSON.stringify(mode)} is not a trace mode.`, 'Use one of validValues.', TRACE_MODES);
  return traceError(
    'MCP_INVALID_ARGUMENTS',
    'The arguments of trace_get are not valid.',
    'Pass scenarioId from scenarios_list, and only the parameters of the trace_get input schema.',
  );
}

function audit(execution: Record<string, unknown>): Record<string, unknown> {
  return {
    jobId: execution.jobId,
    permission: execution.permission,
    durationMs: Date.parse(String(execution.finishedAt)) - Date.parse(String(execution.startedAt)),
  };
}

/** The answer of trace_get for one recorded run. */
export function traceAnswer(replay: Replay, scenarioId: string, args: TraceArgs): McpToolResult {
  if (isTraceV2(args))
    return sized(
      {
        ok: replay.ok,
        scope: 'recorded-native-posix-host',
        scenarioId,
        traceSha256: replay.traceSha256,
        totalSamples: replay.totalSamples,
        assertions: replay.assertions,
        trace: replay.samples,
        evidence: replay.evidence,
        execution: replay.execution,
        note: 'Recorded native POSIX host result; not live runtime, hardware, or HIL.',
      },
      !replay.ok,
      'Call trace_get again with mode "changes", "window" or "summary".',
      TRACE_MODES,
    );
  const total = replay.samples.length;
  const sidecar = (rows: Signals[] | undefined) => (rows && rows.length === total ? rows : undefined);
  const rows: Record<Group, Signals[] | undefined> = {
    outputs: replay.samples.map((sample) => sample.outputs),
    inputs: args.includeInputs === false ? undefined : sidecar(replay.observed?.inputs),
    watched: sidecar(replay.observed?.watched),
    facts: sidecar(replay.observed?.facts),
  };
  const available = Object.fromEntries(
    GROUPS.map((group) => [group, [...new Set((rows[group] ?? []).flatMap((row) => Object.keys(row)))].sort()]),
  ) as Record<Group, string[]>;
  const every = GROUPS.flatMap((group) => available[group]);
  const named = new Set(args.signals ?? []);
  const unknown = [...named].filter((signal) => !every.includes(signal));
  if (unknown.length > 0)
    return traceError(
      'MCP_NOT_FOUND',
      `No signal of the run is named ${unknown.join(', ')}.`,
      'Name signals from validValues, or leave signals out for all of them.',
      every,
    );
  const selected = Object.fromEntries(
    GROUPS.map((group) => [group, args.signals ? available[group].filter((signal) => named.has(signal)) : available[group]]),
  ) as Record<Group, string[]>;

  const fromMs = args.fromMs;
  const toMs = args.toMs;
  const start = args.fromSample ?? (fromMs === undefined ? 0 : replay.samples.findIndex((sample) => sample.atMs >= fromMs));
  const end = toMs === undefined ? total - 1 : replay.samples.findLastIndex((sample) => sample.atMs <= toMs);
  if (start < 0 || start >= total || end < start)
    return traceError(
      'MCP_INVALID_ARGUMENTS',
      `The range holds no sample: the run has ${total} samples, from 0 to ${replay.samples.at(-1)?.atMs ?? 0} ms.`,
      'Pick fromSample below totalSamples, or fromMs and toMs inside the run.',
    );
  const value = (group: Group, index: number, signal: string) => rows[group]![index]![signal];
  const mode = args.mode ?? 'changes';
  const limit = args.limit ?? DEFAULT_LIMIT;
  const head = { ok: replay.ok, scenarioId, mode, traceSha256: replay.traceSha256, totalSamples: replay.totalSamples };
  const tail = { evidence: replay.evidence, execution: replay.execution, audit: audit(replay.execution) };
  const limitStep = 'Lower limit, name fewer signals, or narrow fromMs and toMs; mode "summary" is the smallest answer.';

  if (mode === 'summary') {
    const signalSummary: Record<string, Record<string, Value>> = {};
    for (const group of GROUPS)
      for (const signal of selected[group]) {
        const values: Value[] = [];
        let firstTrueMs: number | undefined;
        let lastTrueMs: number | undefined;
        for (let index = start; index <= end; index++) {
          const current = value(group, index, signal);
          if (current === undefined) continue;
          values.push(current);
          if (current === true) {
            firstTrueMs ??= replay.samples[index]!.atMs;
            lastTrueMs = replay.samples[index]!.atMs;
          }
        }
        if (values.length === 0) continue;
        const numbers = values.filter((item): item is number => typeof item === 'number');
        // a fact output (true when the fact holds) and the raw fact share a name: the raw number, the later group, is kept
        signalSummary[signal] = {
          first: values[0]!,
          last: values.at(-1)!,
          transitions: values.filter((item, index) => index > 0 && item !== values[index - 1]).length,
          ...(firstTrueMs === undefined ? {} : { firstTrueMs, lastTrueMs: lastTrueMs! }),
          ...(numbers.length > 0 ? { min: Math.min(...numbers), max: Math.max(...numbers) } : {}),
        };
      }
    return sized(
      { ...head, returnedSamples: 0, truncated: false, availableSignals: available, assertions: replay.assertions, signalSummary, ...tail },
      !replay.ok,
      limitStep,
    );
  }

  // every change of a program signal counts; a plant fact that is not a whole number (a box position, which moves every
  // step) counts only when `signals` names it
  const counts = (group: Group, signal: string, before: Value | undefined, after: Value | undefined) =>
    group !== 'facts' || typeof after === 'boolean' || named.has(signal) || (Number.isInteger(before) && Number.isInteger(after));
  const changedAt = (index: number) =>
    [
      ...new Set(
        GROUPS.flatMap((group) =>
          selected[group].filter((signal) => {
            const before = value(group, index - 1, signal);
            const after = value(group, index, signal);
            return before !== after && counts(group, signal, before, after);
          }),
        ),
      ),
    ].sort();
  const failedAt = new Set(replay.assertions.flatMap((assertion) => (assertion.passed === false ? [assertion.atMs] : [])));
  const candidates: number[] = [];
  for (let index = start; index <= end; index++)
    if (mode === 'window' || index === start || index === end || failedAt.has(replay.samples[index]!.atMs) || changedAt(index).length > 0)
      candidates.push(index);
  const samples = candidates.slice(0, limit).map((index, position) => {
    const atMs = replay.samples[index]!.atMs;
    const sample: Record<string, unknown> = { index, atMs };
    const changed = mode === 'changes' && index > start ? changedAt(index) : [];
    // a change sample carries only what changed; the first of a page, the last and a failure carry every selected signal
    const whole = mode === 'window' || position === 0 || index === end || failedAt.has(atMs);
    for (const group of GROUPS) {
      const signals = whole ? selected[group] : selected[group].filter((signal) => changed.includes(signal));
      if (signals.length > 0) sample[group] = Object.fromEntries(signals.map((signal) => [signal, value(group, index, signal)]));
    }
    if (changed.length > 0) sample.changed = changed;
    return sample;
  });
  const page = (count: number) => {
    const next = candidates[count];
    return answer(
      {
        ...head,
        returnedSamples: count,
        truncated: next !== undefined,
        ...(next === undefined ? {} : { nextCursor: { fromSample: next, fromMs: replay.samples[next]!.atMs } }),
        availableSignals: available,
        assertions: replay.assertions,
        samples: samples.slice(0, count),
        ...tail,
      },
      !replay.ok,
    );
  };
  // a page over the output limit is cut to the most samples that fit; the cursor names where the next page starts
  if (fits(page(samples.length))) return page(samples.length);
  let low = 0;
  let high = samples.length;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (fits(page(middle))) low = middle;
    else high = middle;
  }
  return low > 0 ? page(low) : sized(page(1).structuredContent, !replay.ok, limitStep);
}
