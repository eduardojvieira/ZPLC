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
import type { GradeRecord } from '../../shared/learnProgressModel';
import { NativeSimulationSupervisor } from '../../shared/nativeSimulationSupervisor';
import { createNativeScenarioSession } from '../cli/nativeScenarioRuntime';
import { scenarioRun, type TestRunResult, type TestsRunOptions, type ToolEvidence } from '../cli/toolApi';
import { artifactEvidence, evidence } from '../cli/toolEvidence';
import { readWorkspace, type ToolDiagnostic, type WorkspaceProject } from '../cli/workspace';
import { assertTaskProgramCardinality, compileMultiTaskProject } from '../compiler';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { createPlantCore } from '../plant/core/plantCore';
import { compileScenario, runScenario } from '../test-engine';
import { resolveProgramSource } from '../utils/programSourceResolution';
import { loadSceneContext, sceneBindingProblem } from './sceneRun';
import { gradeRecordOf, type ObservedAssertion, type TraceSample } from './gradeRecord';
import { parseScenarioFile, type LessonIndexEntry } from './lessonPackage';

/**
 * Runs the program of `root` against one scenario the caller supplies, ignoring the `tests/` folder of `root`.
 * ponytail: the program is copied to a scratch folder because the Tool API reads scenarios from the folder it runs; a
 * `scenarios` option on `runWorkspaceScenarios` would avoid the copy, but toolApi.ts is above its size ratchet.
 */
export async function runSuppliedScenario(
  root: string,
  scenario: { path: string; bytes: Uint8Array },
  scenarioId: string,
  options: TestsRunOptions = {},
): Promise<TestRunResult> {
  const loaded = await readWorkspace(root);
  if (!loaded.ok)
    return {
      ok: false,
      evidence: { schemaVersion: 1, operation: 'scenario-run', outcome: 'failed', diagnostics: loaded.diagnostics, artifacts: [] },
    };
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

const SCENE_RUN_TIMEOUT_MS = 30_000;
const greatestCommonDivisor = (a: number, b: number): number => (b === 0 ? a : greatestCommonDivisor(b, a % b));
const problem = (code: string, path: string, message: string): ToolDiagnostic => ({ code, message, path });

/**
 * Compiles the project of `workspace` the way the Tool API does for a lesson (one cyclic task per program, the other sources of
 * `src` as libraries). ponytail: a copy of the helpers private to toolApi.ts (above its size ratchet); one shared home when U2 splits it.
 */
function compileLessonProject(workspace: WorkspaceProject): {
  zplcFile: Uint8Array;
  debugMap: ReturnType<typeof compileMultiTaskProject>['debugMap'];
  tickMs: number;
} {
  assertTaskProgramCardinality(workspace.project);
  const programSources = workspace.sources.filter((source) => source.library === undefined);
  let tickMs = 0;
  const programs = new Map<string, NonNullable<ReturnType<typeof resolveProgramSource>>>();
  for (const task of workspace.project.tasks) {
    if (task.trigger !== 'cyclic' || !Number.isInteger(task.interval_ms) || task.interval_ms! < 1)
      throw new Error('the lesson project must have cyclic tasks with an interval');
    tickMs = greatestCommonDivisor(tickMs, task.interval_ms!);
    for (const program of task.programs) {
      const source = resolveProgramSource(program, programSources);
      if (!source) throw new Error(`task program "${program}" could not be resolved from src`);
      programs.set(program, source);
    }
  }
  const bytesByPath = new Map(workspace.sources.map((source) => [source.path, source.bytes]));
  const run = new Set([...programs.values()].map((source) => source.sourceRef));
  const sources = [
    ...[...programs].map(([name, source]) => ({
      ...source,
      name,
      sourceRef: source.sourceRef!,
      bytes: bytesByPath.get(source.sourceRef!)!,
    })),
    ...workspace.sources
      .filter((source) => source.language === 'ST' && !run.has(source.path))
      .map((source) => ({
        name: source.path,
        content: source.content,
        language: source.language,
        sourceRef: source.path,
        bytes: source.bytes,
        ...(source.library === undefined ? {} : { library: source.library }),
      })),
  ];
  const compiled = compileMultiTaskProject(workspace.project, sources);
  return { zplcFile: compiled.zplcFile, debugMap: compiled.debugMap, tickMs };
}

/** What a run of a lesson hands the grade record: either a finished run, or the evidence of why there is none. */
type LessonRunAssertions = Array<{ kind: string; passed: boolean; atMs?: number; checks?: ObservedAssertion['checks'] }>;
type LessonRun =
  | { finished: false; evidence: ToolEvidence }
  | {
      finished: true;
      evidence: ToolEvidence;
      zplcSha256: string;
      traceSha256: string;
      trace: TraceSample[];
      assertions: LessonRunAssertions;
    };

/**
 * Runs the program of `root` on the scene of the project (R-K1): `scene.json` and `plant-map.json` are read from the project root,
 * at the paths the scenario's `scene` block names, and the run is built exactly as the CI scene harness builds it (`sceneCheck.ts`),
 * so a lesson's verdict in the application is the harness's verdict. Anything wrong with the files is a located message, never a
 * silent false: a scene or map that does not parse, a mapped signal the scene or the program lacks, a `fact:` naming a missing part.
 */
async function runSceneLesson(
  root: string,
  scenarioInput: { scene: { file: string; map: string } },
  options: TestsRunOptions,
): Promise<LessonRun> {
  const fail = (...diagnostics: ToolDiagnostic[]): LessonRun => ({
    finished: false,
    evidence: evidence('scenario-run', 'failed', diagnostics),
  });
  const loaded = await readWorkspace(root);
  if (!loaded.ok) return fail(...loaded.diagnostics);
  const { file, map: mapFile } = scenarioInput.scene;
  const context = await loadSceneContext(root, scenarioInput);
  if (!context.ok) return fail(...context.diagnostics);
  const { scene, map } = context;
  let compiledProject: ReturnType<typeof compileLessonProject>;
  try {
    compiledProject = compileLessonProject(loaded.workspace);
  } catch (error) {
    return fail(problem('COMPILE_FAILED', 'src', error instanceof Error ? error.message : String(error)));
  }
  const core = await createPlantCore(scene);
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    AbortSignal.timeout(options.timeoutMs ?? SCENE_RUN_TIMEOUT_MS),
  ]);
  try {
    let compiled: ReturnType<typeof compileScenario>;
    try {
      compiled = compileScenario(scenarioInput, compiledProject.debugMap, { port: { core, map }, scene });
    } catch (error) {
      // The engine names the signal or the variable it could not bind; the map is where the learner fixes it.
      return fail(sceneBindingProblem(mapFile, error));
    }
    if (compiled.tickMs !== compiledProject.tickMs)
      return fail(
        problem(
          'SCENARIO_TICK_MISMATCH',
          'zplc.json',
          `the scenario ticks every ${compiled.tickMs} ms and the tasks every ${compiledProject.tickMs} ms`,
        ),
      );
    const session = await createNativeScenarioSession(process.env, { signal });
    let result: Awaited<ReturnType<typeof runScenario>>;
    const closeOnAbort = () => void session.close().catch(() => undefined);
    signal.addEventListener('abort', closeOnAbort, { once: true });
    try {
      result = await runScenario(compiled, compiledProject.zplcFile, session.runtime);
    } catch {
      return fail(problem('RUNTIME_FAILED', file, 'The scene run did not finish'));
    } finally {
      signal.removeEventListener('abort', closeOnAbort);
      await session.close().catch(() => undefined);
    }
    const zplc = artifactEvidence('zplc', compiledProject.zplcFile);
    const traceBytes = new TextEncoder().encode(JSON.stringify(result.trace));
    const trace = artifactEvidence('trace', traceBytes);
    const failures = result.passed ? [] : [problem('SCENARIO_ASSERTION_FAILED', file, 'A scenario assertion failed')];
    return {
      finished: true,
      evidence: evidence('scenario-run', result.passed ? 'passed' : 'failed', failures, [zplc, trace]),
      zplcSha256: zplc.sha256,
      traceSha256: trace.sha256,
      trace: result.trace as TraceSample[],
      assertions: result.assertions,
    };
  } finally {
    core.dispose();
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
  version.catch(() => {
    if (runtimeVersionRead?.version === version) runtimeVersionRead = undefined;
  });
  return version;
}

export interface LessonCheckOptions extends TestsRunOptions {
  /** The wall clock of the grade record; the one thing a repeated check changes. */
  clock?: () => Date;
  /** Overrides the runtime version read from the native runtime (tests). */
  runtimeVersion?: string;
  /** Test seam: the lessons to look in instead of the generated index (a scene lesson fixture). */
  lessons?: readonly LessonIndexEntry[];
}
export type LessonCheckResult =
  | { ok: true; record: GradeRecord; evidence: ToolEvidence }
  | { ok: false; reason: 'unknown-lesson' | 'index-tampered' | 'not-graded'; evidence?: ToolEvidence };

/** The 2.0 route: the program is copied next to the package scenario and run by the Tool API on a fresh native session. */
async function runPlantLesson(root: string, lesson: LessonIndexEntry, bytes: Uint8Array, options: TestsRunOptions): Promise<LessonRun> {
  const result = await runSuppliedScenario(root, { path: lesson.scenario.path, bytes }, lesson.scenario.id, options);
  const codes = result.evidence.diagnostics.map(({ code }) => code);
  const zplc = result.evidence.artifacts.find((artifact) => artifact.kind === 'zplc');
  const traceArtifact = result.evidence.artifacts.find((artifact) => artifact.kind === 'trace');
  // Only a finished run is graded: either every assertion passed, or the only complaint is that some assertion failed.
  const finished = result.ok || (codes.length > 0 && codes.every((code) => code === 'SCENARIO_ASSERTION_FAILED'));
  if (!finished || !zplc || !traceArtifact) return { finished: false, evidence: result.evidence };
  let trace: TraceSample[] = [];
  let assertions: LessonRunAssertions = result.preview?.scenarios[0]?.assertions ?? [];
  try {
    const full = JSON.parse(new TextDecoder().decode(result.traceFile)) as {
      scenarios?: Array<{ id?: unknown; trace?: TraceSample[]; assertions?: LessonRunAssertions }>;
    };
    const run = full.scenarios?.find((entry) => entry.id === lesson.scenario.id);
    if (run?.trace && run.assertions) {
      trace = run.trace;
      assertions = run.assertions;
    }
  } catch {
    /* the preview holds the failing samples; the record then carries less of the trace */
  }
  if (trace.length === 0) trace = (result.preview?.scenarios[0]?.samples ?? []).map(({ atMs, outputs }) => ({ atMs, outputs }));
  return { finished: true, evidence: result.evidence, zplcSha256: zplc.sha256, traceSha256: traceArtifact.sha256, trace, assertions };
}

/** A lesson that names a scene runs on the scene of the learner's project; any other lesson runs as it did in 2.0. */
function runLesson(root: string, lesson: LessonIndexEntry, bytes: Uint8Array, options: TestsRunOptions): Promise<LessonRun> {
  return lesson.scene
    ? runSceneLesson(root, JSON.parse(lesson.scenario.canonical) as { scene: { file: string; map: string } }, options)
    : runPlantLesson(root, lesson, bytes, options);
}

export async function lessonCheck(root: string, lessonId: string, options: LessonCheckOptions = {}): Promise<LessonCheckResult> {
  const lesson = (options.lessons ?? LESSON_INDEX.lessons).find((entry) => entry.id === lessonId);
  if (!lesson) return { ok: false, reason: 'unknown-lesson' };
  const bytes = new TextEncoder().encode(lesson.scenario.canonical);
  if (createHash('sha256').update(bytes).digest('hex') !== lesson.scenario.sha256) return { ok: false, reason: 'index-tampered' };
  const parsed = parseScenarioFile(JSON.parse(lesson.scenario.canonical) as unknown);
  if (!parsed.scenario) return { ok: false, reason: 'index-tampered' };
  const lessonRun = await runLesson(root, lesson, bytes, options);
  if (!lessonRun.finished) return { ok: false, reason: 'not-graded', evidence: lessonRun.evidence };
  const { trace, assertions } = lessonRun;
  if (assertions.length !== lesson.scenario.assertions) return { ok: false, reason: 'not-graded', evidence: lessonRun.evidence };
  const runtimeVersion = options.runtimeVersion ?? (await nativeRuntimeVersion(process.env));
  const record = gradeRecordOf({
    lessonId: lesson.id,
    lessonVersion: lesson.version,
    scenario: parsed.scenario,
    scenarioSha256: lesson.scenario.sha256,
    programSha256: lessonRun.zplcSha256,
    runtimeVersion,
    time: (options.clock ?? (() => new Date()))(),
    assertions,
    trace,
    traceSha256: lessonRun.traceSha256,
  });
  return { ok: true, record, evidence: lessonRun.evidence };
}
