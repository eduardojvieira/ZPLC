/**
 * Grades the workspace program for one lesson (LRN-022, LRN-023, LRN-026).
 *
 * The scenario is the one the lesson package carries, taken from the generated index and checked against the hash the
 * manifest pins. The workspace's own scenario files are never read: the program (`zplc.json` and its sources, read through
 * the same validated reader every other tool uses) is copied into a fresh folder together with the package scenario and
 * run there on a fresh native POSIX session, so a scenario edited or deleted in the learner's folder changes nothing.
 *
 * A program that builds and runs gets a grade record, passed or failed. A program that does not build, a runtime that is
 * not there or a run that is cut short gets no record, only the evidence of what happened.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import productManifest from '../../../../package.json';
import type { GradeRecord } from '../../electron/learnProgressModel';
import { NativeSimulationSupervisor } from '../../electron/nativeSimulationSupervisor';
import { scenarioRun, type TestRunResult, type TestsRunOptions, type ToolEvidence } from '../cli/toolApi';
import { readWorkspace } from '../cli/workspace';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { gradeRecordOf, type TraceSample } from './gradeRecord';
import { parseScenarioFile } from './lessonPackage';

/**
 * Runs the program of `root` against one scenario the caller supplies, ignoring the `tests/` folder of `root`.
 * ponytail: the program is copied to a scratch folder because the Tool API reads scenarios from the folder it runs; a
 * `scenarios` option on `runWorkspaceScenarios` would avoid the copy, but toolApi.ts is above its size ratchet.
 */
export async function runSuppliedScenario(root: string, scenario: { path: string; bytes: Uint8Array }, scenarioId: string, options: TestsRunOptions = {}): Promise<TestRunResult> {
  const loaded = await readWorkspace(root);
  if (!loaded.ok) return { ok: false, evidence: { schemaVersion: 1, operation: 'scenario-run', outcome: 'failed', diagnostics: loaded.diagnostics, artifacts: [] } };
  const scratch = await mkdtemp(join(tmpdir(), 'zplc-lesson-check-'));
  try {
    await writeFile(join(scratch, 'zplc.json'), loaded.workspace.manifestBytes, { mode: 0o600 });
    for (const source of loaded.workspace.sources) {
      await mkdir(dirname(join(scratch, source.path)), { recursive: true, mode: 0o700 });
      await writeFile(join(scratch, source.path), source.bytes, { mode: 0o600 });
    }
    await mkdir(dirname(join(scratch, scenario.path)), { recursive: true, mode: 0o700 });
    await writeFile(join(scratch, scenario.path), scenario.bytes, { mode: 0o600 });
    return await scenarioRun(scratch, scenarioId, options);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

let runtimeVersionRead: { key: string; version: Promise<string> } | undefined;
/** The version the native runtime reports in its hello; read once per runtime binary. */
function nativeRuntimeVersion(environment: NodeJS.ProcessEnv): Promise<string> {
  const key = environment.ZPLC_NATIVE_SIM_BIN ?? '';
  if (runtimeVersionRead?.key === key) return runtimeVersionRead.version;
  const version = (async () => {
    const persistRoot = await mkdtemp(join(tmpdir(), 'zplc-runtime-version-'));
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-learn-check',
      clientVersion: productManifest.version,
      environment: { ...environment, ZPLC_PERSIST_ROOT: persistRoot, ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1' },
    });
    try {
      const hello = await supervisor.startSession();
      return hello.runtime_version;
    } finally {
      await supervisor.stopSession().catch(() => undefined);
      await rm(persistRoot, { recursive: true, force: true });
    }
  })();
  runtimeVersionRead = { key, version };
  version.catch(() => { if (runtimeVersionRead?.version === version) runtimeVersionRead = undefined; });
  return version;
}

export interface LessonCheckOptions extends TestsRunOptions {
  /** The wall clock of the grade record; the one thing a repeated check changes. */
  clock?: () => Date;
  /** Overrides the runtime version read from the native runtime (tests). */
  runtimeVersion?: string;
}
export type LessonCheckResult =
  | { ok: true; record: GradeRecord; evidence: ToolEvidence }
  | { ok: false; reason: 'unknown-lesson' | 'index-tampered' | 'not-graded'; evidence?: ToolEvidence };

export async function lessonCheck(root: string, lessonId: string, options: LessonCheckOptions = {}): Promise<LessonCheckResult> {
  const lesson = LESSON_INDEX.lessons.find((entry) => entry.id === lessonId);
  if (!lesson) return { ok: false, reason: 'unknown-lesson' };
  const bytes = new TextEncoder().encode(lesson.scenario.canonical);
  if (createHash('sha256').update(bytes).digest('hex') !== lesson.scenario.sha256) return { ok: false, reason: 'index-tampered' };
  const parsed = parseScenarioFile(JSON.parse(lesson.scenario.canonical) as unknown);
  if (!parsed.scenario) return { ok: false, reason: 'index-tampered' };
  const result = await runSuppliedScenario(root, { path: lesson.scenario.path, bytes }, lesson.scenario.id, options);
  const codes = result.evidence.diagnostics.map(({ code }) => code);
  const zplc = result.evidence.artifacts.find((artifact) => artifact.kind === 'zplc');
  const traceArtifact = result.evidence.artifacts.find((artifact) => artifact.kind === 'trace');
  // Only a finished run is graded: either every assertion passed, or the only complaint is that some assertion failed.
  const finished = result.ok || (codes.length > 0 && codes.every((code) => code === 'SCENARIO_ASSERTION_FAILED'));
  if (!finished || !zplc || !traceArtifact) return { ok: false, reason: 'not-graded', evidence: result.evidence };
  let trace: TraceSample[] = [];
  let assertions = result.preview?.scenarios[0]?.assertions ?? [];
  try {
    const full = JSON.parse(new TextDecoder().decode(result.traceFile)) as { scenarios?: Array<{ id?: unknown; trace?: TraceSample[]; assertions?: Array<{ kind: string; passed: boolean; atMs?: number }> }> };
    const run = full.scenarios?.find((entry) => entry.id === lesson.scenario.id);
    if (run?.trace && run.assertions) { trace = run.trace; assertions = run.assertions as typeof assertions; }
  } catch { /* the preview holds the failing samples; the record then carries less of the trace */ }
  if (trace.length === 0) trace = (result.preview?.scenarios[0]?.samples ?? []).map(({ atMs, outputs }) => ({ atMs, outputs }));
  if (assertions.length !== lesson.scenario.assertions) return { ok: false, reason: 'not-graded', evidence: result.evidence };
  const runtimeVersion = options.runtimeVersion ?? await nativeRuntimeVersion(process.env);
  const record = gradeRecordOf({
    lessonId: lesson.id, lessonVersion: lesson.version, scenario: parsed.scenario, scenarioSha256: lesson.scenario.sha256,
    programSha256: zplc.sha256, runtimeVersion, time: (options.clock ?? (() => new Date()))(), assertions, trace, traceSha256: traceArtifact.sha256,
  });
  return { ok: true, record, evidence: result.evidence };
}
