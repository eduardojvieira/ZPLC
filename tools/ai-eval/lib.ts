/**
 * The fixed evaluation task set of AIX-009 and what both owner-launched runners share: loading and validating the set,
 * staging a disposable copy, grading by outcome with the Tool API, and the evidence record. Nothing here calls a model.
 */
import { cp, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compilerCheck, scenarioRun } from '../../packages/zplc-ide/src/cli/toolApi';

export const LANGUAGES = ['ST', 'IL', 'LD', 'FBD', 'SFC'] as const;
export const TYPES = ['write', 'repair', 'explain'] as const;
export interface Rubric {
  signal: string[];
  expectedVsObserved: string[];
  sourcePlace: string[];
}
export interface EvalTask {
  id: string;
  language: (typeof LANGUAGES)[number];
  type: (typeof TYPES)[number];
  level: 'must';
  title: string;
  prompt: string;
  /** The program the person edits or reads, relative to the project. */
  program: string;
  /** The scenario of `tests/`; a task whose failure is a build failure has none. */
  scenarioId?: string;
  /** What fails in `fixtures/<id>/project` today. */
  failure: 'scenario' | 'build';
  source: string;
  grading: string;
  rubric?: Rubric;
  referenceExplanation?: string;
  /** Absolute folder of the fixture: `project/` and, for write and repair, `reference/`. */
  dir: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
/** Files that define the check; they are restored from the fixture before grading, so a run cannot pass by editing them. */
const HARNESS = ['tests', 'scene.json', 'plant-map.json'];

export function loadTasks(file = join(HERE, 'tasks.json')): EvalTask[] {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { tasks: Omit<EvalTask, 'dir'>[] };
  return parsed.tasks.map((task) => ({ ...task, dir: join(HERE, 'fixtures', task.id) }));
}

export function validateTasks(tasks: readonly EvalTask[]): string[] {
  const problems: string[] = [];
  const bad = (task: EvalTask, message: string) => problems.push(`${task.id}: ${message}`);
  for (const task of tasks) {
    if (!LANGUAGES.includes(task.language)) bad(task, `language ${task.language} is not one of ${LANGUAGES.join(', ')}`);
    if (!TYPES.includes(task.type)) bad(task, `type ${task.type} is not one of ${TYPES.join(', ')}`);
    if (task.level !== 'must') bad(task, 'level must be "must"');
    if (!task.prompt || !task.grading) bad(task, 'prompt and grading are required');
    if (!existsSync(join(task.dir, 'project', task.program))) bad(task, `program ${task.program} is missing from the fixture`);
    if (task.failure === 'scenario' && !task.scenarioId) bad(task, 'a scenario failure needs a scenarioId');
    if (task.type !== 'explain' && !existsSync(join(task.dir, 'reference', task.program))) bad(task, 'the reference solution is missing');
    if (task.type === 'explain' && (!task.rubric || !task.referenceExplanation))
      bad(task, 'an explain task needs a rubric and a reference explanation');
    if (task.type === 'explain' && task.rubric)
      for (const key of ['signal', 'expectedVsObserved', 'sourcePlace'] as const)
        if (!task.rubric[key]?.length) bad(task, `rubric.${key} is empty`);
  }
  return problems;
}

/** A disposable copy of the project of the task under `scratch/<id>`. */
export async function stageTask(task: EvalTask, scratch: string): Promise<string> {
  const root = join(scratch, task.id);
  await mkdir(root, { recursive: true });
  await cp(join(task.dir, 'project'), root, { recursive: true });
  return root;
}

/** The reference solution or repair over the copy. */
export async function applyReference(task: EvalTask, root: string): Promise<void> {
  await cp(join(task.dir, 'reference'), root, { recursive: true });
}

async function restoreHarness(task: EvalTask, root: string): Promise<void> {
  for (const name of HARNESS)
    if (existsSync(join(task.dir, 'project', name)))
      await cp(join(task.dir, 'project', name), join(root, name), { recursive: true, force: true });
}

/** Outcome of a write or repair task: the check and the scenario, run by the Tool API on the copy. */
export async function gradeBuild(task: EvalTask, root: string): Promise<{ pass: boolean; check: boolean; scenario?: boolean }> {
  await restoreHarness(task, root);
  const check = (await compilerCheck(root)).ok;
  if (!check || !task.scenarioId) return { pass: false, check };
  const scenario = (await scenarioRun(root, task.scenarioId)).ok;
  return { pass: scenario, check, scenario };
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text: string, keywords: string[]) =>
  keywords.some((keyword) => new RegExp(`(^|[^A-Za-z0-9_])${escape(keyword)}($|[^A-Za-z0-9_])`, 'i').test(text));
/** An explanation passes when it names the failing signal or fact, the expected versus the observed condition, and the source place. */
export function gradeExplanation(text: string, rubric: Rubric): { pass: boolean; missing: string[] } {
  const missing = (['signal', 'expectedVsObserved', 'sourcePlace'] as const).filter((key) => !mentions(text, rubric[key]));
  return { pass: missing.length === 0, missing };
}

export interface TaskResult {
  id: string;
  language: EvalTask['language'];
  type: EvalTask['type'];
  pass: boolean;
  latencyMs: number;
  responseBytes: number;
  detail?: string;
}
export interface Evidence {
  schemaVersion: 1;
  evidenceLevel: 'manual-model-run';
  runner: 'run-claude-code-mcp' | 'run-assistant-eval';
  client: string;
  model: string;
  date: string;
  summary: { passed: number; total: number };
  results: TaskResult[];
}
export function buildEvidence(input: {
  runner: Evidence['runner'];
  client: string;
  model: string;
  date: string;
  results: TaskResult[];
}): Evidence {
  return {
    schemaVersion: 1,
    evidenceLevel: 'manual-model-run',
    runner: input.runner,
    client: input.client,
    model: input.model,
    date: input.date,
    summary: { passed: input.results.filter((result) => result.pass).length, total: input.results.length },
    results: input.results,
  };
}

export interface Io {
  stdout(line: string): void;
  stderr(line: string): void;
}
export const consoleIo: Io = { stdout: (line) => console.log(line), stderr: (line) => console.error(line) };

/** `--tasks a,b` or `all`: the selected tasks, or the unknown ids. */
export function selectTasks(all: readonly EvalTask[], filter: string | undefined): { tasks: EvalTask[] } | { unknown: string[] } {
  if (!filter || filter === 'all') return { tasks: [...all] };
  const ids = filter.split(',').map((id) => id.trim());
  const unknown = ids.filter((id) => !all.some((task) => task.id === id));
  return unknown.length ? { unknown } : { tasks: ids.map((id) => all.find((task) => task.id === id)!) };
}

/** The failure of a staged task as Studio hands it to the Assistant: the build diagnostics, or the failed assertions of the scenario. */
export async function failureContext(task: EvalTask, root: string) {
  if (task.failure === 'build') {
    const result = await compilerCheck(root);
    return {
      diagnostics: result.ok
        ? []
        : result.evidence.diagnostics.map(({ code, message, path, line, column, element }) => ({
            code,
            message,
            path,
            line,
            column,
            element,
          })),
    };
  }
  const run = await scenarioRun(root, task.scenarioId!);
  const failedScenarios = (run.preview?.scenarios ?? [])
    .filter((scenario) => !scenario.passed)
    .map((scenario) => ({
      id: scenario.id,
      assertions: scenario.assertions
        .filter((assertion) => !assertion.passed)
        .map((assertion) => ({
          index: assertion.index ?? 0,
          kind: assertion.kind,
          atMs: assertion.atMs ?? 0,
          checks: (assertion.checks ?? []).map(({ signal, expected, observed }) => ({ signal, expected, observed })),
        })),
    }));
  return { failedScenarios };
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
export async function writeEvidence(path: string, evidence: Evidence): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(evidence, null, 2)}\n`);
}
