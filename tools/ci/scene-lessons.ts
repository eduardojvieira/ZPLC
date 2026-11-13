// The scene-lesson guard (CRS-003, CRS-005, CRS-006, CRS-010).
//
//   bun tools/ci/scene-lessons.ts
//
// For every lesson whose manifest names a scene (none today: the guard then passes with nothing to grade): the scene directory
// exists; the scenario has a `scene` block and at least one expectation on a plant fact that the scene can answer; its hash is
// the pinned `scenario.sha256`; the reference solution passes and the starter fails through the application's own Check
// (`lessonCheck`), headless, each grade within 60 s of wall time (printed per lesson); a Ladder sibling shares the hash of its
// ST lesson. It also pins the scenario hash and the starter and solution projects of the ten 2.0 plant lessons: only a manifest's
// `tracks` and `unsupported` may change (CRS-010). `missingSceneLessons` states the rule "every scene has a lesson"; the last
// lesson task asserts it empty, so the command only reports it.
// Exit 0 when nothing is wrong, 1 otherwise; every problem is printed.
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { LESSON_INDEX } from '../../packages/zplc-ide/src/generated/lessonIndex';
import { lessonCheck } from '../../packages/zplc-ide/src/learn/lessonCheck';
import type { LessonIndexEntry } from '../../packages/zplc-ide/src/learn/lessonPackage';
import { scenarioHash } from '../../packages/zplc-ide/src/learn/lessonPackageFiles';
import { checkSceneFacts } from '../../packages/zplc-ide/src/plant/ci/sceneCheck';
import { parseScene } from '../../packages/zplc-ide/src/plant/core/scene';

const IDE = resolve(import.meta.dir, '../../packages/zplc-ide');
export const SCENES_DIRECTORY = join(IDE, 'plant-scenes');
export const PROJECTS_DIRECTORY = join(IDE, 'projects');
export const GRADE_LIMIT_MS = 60_000;

/**
 * The ten 2.0 plant lessons as they were at a2c80b32 (CRS-010). The pins are data in `plant-lesson-pins.json`, so lesson ids keep
 * one source in code (LRN-028).
 */
export const PLANT_LESSON_PINS: Readonly<Record<string, { sha256: string; starter: string; solution: string }>> = JSON.parse(
  readFileSync(join(import.meta.dir, 'plant-lesson-pins.json'), 'utf8'),
);

export function plantLessonPinFaults(lessons: readonly LessonIndexEntry[]): string[] {
  return Object.entries(PLANT_LESSON_PINS).flatMap(([id, pin]) => {
    const lesson = lessons.find((entry) => entry.id === id);
    if (!lesson) return [`${id}: a 2.0 plant lesson is missing (CRS-010)`];
    const faults: string[] = [];
    if (lesson.scenario.sha256 !== pin.sha256)
      faults.push(`${id}: scenario.sha256 ${lesson.scenario.sha256} is not the pinned ${pin.sha256}`);
    if (lesson.starter.project !== pin.starter)
      faults.push(`${id}: starter project ${lesson.starter.project} is not the pinned ${pin.starter}`);
    if (lesson.solution.project !== pin.solution)
      faults.push(`${id}: solution project ${lesson.solution.project} is not the pinned ${pin.solution}`);
    return faults;
  });
}

/** The scene directories no lesson names (CRS-003). */
export function missingSceneLessons(lessons: readonly LessonIndexEntry[] = LESSON_INDEX.lessons, scenesDir = SCENES_DIRECTORY): string[] {
  const named = new Set(lessons.flatMap((lesson) => (lesson.scene ? [lesson.scene] : [])));
  return readdirSync(scenesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(scenesDir, entry.name, 'scene.json')) && !named.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

const hasFactKey = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.some(hasFactKey)
    : value !== null &&
      typeof value === 'object' &&
      Object.entries(value).some(([key, item]) => key.startsWith('fact:') || hasFactKey(item));

/** The rules that need no program: the scene, the scenario's scene block and fact expectations, the pinned hash. */
export function sceneLessonStaticFaults(lesson: LessonIndexEntry, scenesDir = SCENES_DIRECTORY): string[] {
  const at = `${lesson.id}:`;
  const sceneFile = join(scenesDir, lesson.scene ?? '', 'scene.json');
  const faults: string[] = [];
  let scenario: { scene?: unknown; expectations?: unknown };
  try {
    scenario = JSON.parse(lesson.scenario.canonical) as typeof scenario;
  } catch {
    return [`${at} the scenario is not JSON`];
  }
  if (scenarioHash(scenario) !== lesson.scenario.sha256) faults.push(`${at} scenario.sha256 is not the hash of the scenario (CRS-005)`);
  if (!scenario.scene || typeof scenario.scene !== 'object') faults.push(`${at} the scenario has no scene block (CRS-005)`);
  if (!hasFactKey(scenario.expectations)) faults.push(`${at} the scenario has no expectation on a plant fact (CRS-005)`);
  if (!lesson.scene || !existsSync(sceneFile))
    return [...faults, `${at} the scene "${lesson.scene}" has no directory with a scene.json (CRS-003)`];
  const parsed = parseScene(readFileSync(sceneFile, 'utf8'));
  if ('problems' in parsed) return [...faults, `${at} scene.json does not parse`];
  return [...faults, ...checkSceneFacts(scenario, parsed.scene).map((problem) => `${at} ${problem}`)];
}

export interface GuardOptions {
  lessons?: readonly LessonIndexEntry[];
  scenesDir?: string;
  projectsDir?: string;
  /** Wall clock in ms; a test seam. */
  now?: () => number;
  limitMs?: number;
  /** False skips the grading of the programs (the static rules and the siblings still run). */
  grade?: boolean;
}

/** Grades one program of a scene lesson through the application's Check, in a copy of the project. */
async function gradeProgram(
  lesson: LessonIndexEntry,
  project: string,
  options: GuardOptions,
): Promise<{ faults: string[]; ms: number; passed: boolean }> {
  const now = options.now ?? (() => performance.now());
  const source = join(options.projectsDir ?? PROJECTS_DIRECTORY, project);
  if (!existsSync(source)) return { faults: [`${lesson.id}: project ${project} does not exist`], ms: 0, passed: false };
  const root = mkdtempSync(join(tmpdir(), 'zplc-scene-guard-'));
  try {
    cpSync(source, root, { recursive: true });
    const missing = ['scene.json', 'plant-map.json'].filter((file) => !existsSync(join(root, file)));
    if (missing.length > 0)
      return { faults: [`${lesson.id}: project ${project} lacks ${missing.join(' and ')} at its root`], ms: 0, passed: false };
    const startedAt = now();
    const result = await lessonCheck(root, lesson.id, { lessons: [lesson] });
    const ms = now() - startedAt;
    if (!result.ok) {
      const why = (result.evidence?.diagnostics ?? []).map((d) => `${d.path} ${d.message}`).join('; ');
      return { faults: [`${lesson.id}: Check on ${project} did not grade (${result.reason}${why ? `: ${why}` : ''})`], ms, passed: false };
    }
    return { faults: [], ms, passed: result.record.result === 'passed' };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Every rule for every lesson that names a scene; `report` has one line per graded lesson with its wall times. */
export async function checkSceneLessons(options: GuardOptions = {}): Promise<{ problems: string[]; report: string[] }> {
  const lessons = options.lessons ?? LESSON_INDEX.lessons;
  const limit = options.limitMs ?? GRADE_LIMIT_MS;
  const problems: string[] = [];
  const report: string[] = [];
  const sceneLessons = lessons.filter((lesson) => lesson.scene !== undefined);
  for (const lesson of sceneLessons) {
    const staticFaults = sceneLessonStaticFaults(lesson, options.scenesDir);
    problems.push(...staticFaults);
    if (staticFaults.length > 0 || options.grade === false) continue;
    const starter = await gradeProgram(lesson, lesson.starter.project, options);
    const solution = await gradeProgram(lesson, lesson.solution.project, options);
    problems.push(...starter.faults, ...solution.faults);
    if (starter.faults.length === 0 && starter.passed) problems.push(`${lesson.id}: the starter passes; it must fail (CRS-005)`);
    if (solution.faults.length === 0 && !solution.passed) problems.push(`${lesson.id}: the reference solution does not pass (CRS-005)`);
    for (const [name, grade] of [
      ['starter', starter],
      ['solution', solution],
    ] as const)
      if (grade.ms > limit) problems.push(`${lesson.id}: the ${name} grade took ${Math.round(grade.ms)} ms, over ${limit} ms (CRS-006)`);
    report.push(`${lesson.id}: starter ${Math.round(starter.ms)} ms, solution ${Math.round(solution.ms)} ms`);
  }
  for (const sibling of sceneLessons.filter((lesson) => lesson.id.endsWith('-ladder'))) {
    const baseId = sibling.id.slice(0, -'-ladder'.length);
    const base = sceneLessons.find((lesson) => lesson.id === baseId);
    if (base && base.scenario.sha256 !== sibling.scenario.sha256)
      problems.push(`${sibling.id}: scenario.sha256 differs from ${baseId}; a sibling shares the scenario of its ST lesson (R7-L3)`);
  }
  return { problems, report };
}

if (import.meta.main) {
  process.env.ZPLC_NATIVE_SIM_BIN ??= resolve(IDE, '../../firmware/lib/zplc_core/build/zplc_runtime');
  const { problems, report } = await checkSceneLessons();
  problems.push(...plantLessonPinFaults(LESSON_INDEX.lessons));
  for (const line of report) console.log(line);
  const missing = missingSceneLessons();
  if (missing.length > 0) console.log(`scenes with no lesson yet (CRS-003, asserted empty by the last lesson task): ${missing.join(', ')}`);
  for (const problem of problems) console.error(problem);
  const scenes = LESSON_INDEX.lessons.filter((lesson) => lesson.scene).length;
  console.log(
    problems.length === 0 ? `scene lessons: ${scenes} checked, 10 plant lessons pinned` : `scene lessons: ${problems.length} problem(s)`,
  );
  process.exit(problems.length === 0 ? 0 : 1);
}
