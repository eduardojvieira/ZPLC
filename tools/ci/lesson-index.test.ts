// The generated lesson index (LRN-028) and the lesson package format (LRN-027): the index is what the packages produce,
// a changed scenario must be re-pinned, and no product file keeps a hand-written list of lesson ids.
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';

import { LESSON_IDS, LESSON_INDEX } from '../../packages/zplc-ide/src/generated/lessonIndex';
import { LESSONS_DIRECTORY, buildIndex, loadCourse, loadLessonPackages } from '../../packages/zplc-ide/src/learn/lessonPackageFiles';
import { generate, updateHashes } from './generate-lesson-index';

const ROOT = resolve(import.meta.dir, '../..');
const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

function copyOfLessons(): string {
  const root = mkdtempSync(join(tmpdir(), 'zplc-lessons-'));
  temporary.push(root);
  cpSync(LESSONS_DIRECTORY, root, { recursive: true });
  return root;
}

describe('the generated lesson index (LRN-027, LRN-028)', () => {
  it('holds exactly what the lesson packages produce', () => {
    const { packages, problems } = loadLessonPackages();
    expect(problems).toEqual([]);
    const { course, problems: courseProblems } = loadCourse();
    expect(courseProblems).toEqual([]);
    const built = buildIndex(packages, course!);
    expect(built.problems).toEqual([]);
    expect(LESSON_INDEX).toEqual(built.index);
    expect<string[]>([...LESSON_IDS]).toEqual(built.index.lessons.map((lesson) => lesson.id));
  });

  it('refuses a lesson that names a plant without its mapping, or a mapping that names another plant (LRN-021)', () => {
    const root = copyOfLessons();
    rmSync(join(root, 'tank-level-fault-reset', 'plant-map.json'));
    writeFileSync(join(root, 'motor-plant-feedback', 'plant-map.json'), readFileSync(join(LESSONS_DIRECTORY, 'tank-level-fault-reset', 'plant-map.json'), 'utf8'));
    const { problems } = generate(root);
    expect(problems.some((problem) => problem.includes('tank-level-fault-reset') && problem.includes('has no plant-map.json'))).toBe(true);
    expect(problems.some((problem) => problem.includes('motor-plant-feedback/plant-map.json') && problem.includes('differs from the manifest plant'))).toBe(true);
  });

  it('is current as a file: `--check` of the generator exits 0', () => {
    const run = Bun.spawnSync(['bun', join(import.meta.dir, 'generate-lesson-index.ts'), '--check'], { cwd: ROOT });
    expect({ code: run.exitCode, out: run.stdout.toString(), err: run.stderr.toString() }).toEqual({ code: 0, out: 'lesson index is current\n', err: '' });
  });

  it('refuses a scenario that changed without its hash being re-pinned, then accepts it with a new version', () => {
    const lessons = copyOfLessons();
    const scenarioFile = join(lessons, 'motor-start-stop-safe', 'scenario.json');
    const scenario = JSON.parse(readFileSync(scenarioFile, 'utf8')) as { durationMs: number; expectations: unknown[] };
    scenario.expectations.pop();
    writeFileSync(scenarioFile, JSON.stringify(scenario));
    const stale = generate(lessons);
    expect(stale.problems.some((problem) => problem.includes('motor-start-stop-safe') && problem.includes('scenario hash'))).toBe(true);

    expect(updateHashes(lessons)).toEqual(['motor-start-stop-safe']);
    const pinned = generate(lessons);
    expect(pinned.problems.filter((problem) => problem.startsWith('motor-start-stop-safe: scenario hash'))).toEqual([]);
    const before = loadLessonPackages(LESSONS_DIRECTORY).packages.find((item) => item.id === 'motor-start-stop-safe')!;
    const after = loadLessonPackages(lessons).packages.find((item) => item.id === 'motor-start-stop-safe');
    expect(after?.manifest.version).toBe(before.manifest.version + 1);
    expect(after?.manifest.scenario.sha256).not.toBe(before.manifest.scenario.sha256);
  });

  it('holds the course structure of lessons/course.json, and refuses a missing or broken course file (LRN-005)', () => {
    expect(LESSON_INDEX.course.modules).toHaveLength(12);
    const missing = copyOfLessons();
    rmSync(join(missing, 'course.json'));
    expect(generate(missing).problems).toEqual(['course.json: the course file is missing']);
    const broken = copyOfLessons();
    const file = join(broken, 'course.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"requires": 1', '"requires": 5'));
    expect(generate(broken).problems.some((problem) => problem.startsWith('course.json: module 2') && problem.includes('requires'))).toBe(true);
  });

  it('refuses a lesson placed in a module the manifest cannot name or at another level than its module (LRN-005, LRN-007)', () => {
    const lessons = copyOfLessons();
    const file = join(lessons, 'scan-cycle-one-scan-memory', 'lesson.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"module": 1', '"module": 40'));
    expect(generate(lessons).problems.some((problem) => problem.startsWith('scan-cycle-one-scan-memory/lesson.json') && problem.includes('manifest.module'))).toBe(true);
    const wrongLevel = copyOfLessons();
    const other = join(wrongLevel, 'scan-cycle-one-scan-memory', 'lesson.json');
    writeFileSync(other, readFileSync(other, 'utf8').replace('"level": "foundation"', '"level": "advanced"'));
    expect(generate(wrongLevel).problems.some((problem) => problem.startsWith('scan-cycle-one-scan-memory: level advanced'))).toBe(true);
  });

  it('refuses a lesson whose text quotes a time its scenario does not have', () => {
    const lessons = copyOfLessons();
    const textFile = join(lessons, 'motor-plant-feedback', 'text.en.json');
    writeFileSync(textFile, readFileSync(textFile, 'utf8').replace('{{t:10}}', '{{t:15}}'));
    expect(generate(lessons).problems.some((problem) => problem.includes('time 15 ms is not on the timeline'))).toBe(true);
  });

  it('refuses a lesson without its two hint levels or without the six stages', () => {
    const lessons = copyOfLessons();
    const textFile = join(lessons, 'edge-counter-pulses', 'text.es.json');
    const text = JSON.parse(readFileSync(textFile, 'utf8')) as { hints: unknown[]; stages: Array<{ key: string }> };
    text.hints.pop();
    text.stages = text.stages.filter((stage) => stage.key !== 'edit');
    writeFileSync(textFile, JSON.stringify(text));
    const { problems } = generate(lessons);
    expect(problems.some((problem) => problem.includes('level 1 and level 2'))).toBe(true);
    expect(problems.some((problem) => problem.includes('objective, predict, edit, run, observe, reflect'))).toBe(true);
  });

  it('LRN-029 refuses English and Spanish texts that do not have the same structure', () => {
    const lessons = copyOfLessons();
    const textFile = join(lessons, 'scan-cycle-one-scan-memory', 'text.es.json');
    const text = JSON.parse(readFileSync(textFile, 'utf8')) as { objectives: string[] };
    text.objectives.push('Un tercer objetivo que el inglés no tiene.');
    writeFileSync(textFile, JSON.stringify(text));
    expect(generate(lessons).problems.some((problem) => problem.includes('same structure'))).toBe(true);
  });
});

const SOURCE_ROOTS = ['packages/zplc-ide/src', 'packages/zplc-ide/electron', 'packages/zplc-ide/scripts', 'packages/zplc-compiler/src', 'packages/zplc-hil/src', 'scripts', 'tools'];
const SKIPPED = /(?:^|\/)(?:node_modules|dist|electron-dist|build|generated|fixtures)(?:\/|$)|\.test\.[cm]?[jt]sx?$|\.d\.ts$/;
const CODE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

function productFiles(directory: string): string[] {
  const result: string[] = [];
  const base = join(ROOT, directory);
  if (!existsSync(base)) return result;
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const relativePath = relative(ROOT, path).replaceAll('\\', '/');
      if (SKIPPED.test(relativePath)) continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (CODE.test(name)) result.push(path);
    }
  };
  walk(base);
  return result;
}

describe('lesson ids have one source (LRN-028)', () => {
  const ids = loadLessonPackages().packages.map((item) => item.id);

  it('knows the lesson ids from the manifests', () => {
    expect(ids.length).toBeGreaterThanOrEqual(10);
  });

  it('is not repeated as a hand-written list in any product source file', () => {
    const offenders: string[] = [];
    for (const directory of SOURCE_ROOTS) {
      for (const file of productFiles(directory)) {
        const text = readFileSync(file, 'utf8');
        const named = ids.filter((id) => text.includes(`'${id}'`) || text.includes(`"${id}"`) || text.includes(`\`${id}\``));
        // One literal is a typed constant that stops compiling when the lesson goes; two or more is a list.
        if (named.length >= 2) offenders.push(`${relative(ROOT, file)}: ${named.length} lesson ids`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
