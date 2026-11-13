import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkSceneLessons, plantLessonPinFaults } from '../../../../tools/ci/scene-lessons';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { canonicalJson, type LessonIndexEntry } from './lessonPackage';
import { scenarioHash } from './lessonPackageFiles';

/**
 * The scene-lesson guard of CI (CRS-003, CRS-005, CRS-006, CRS-010) on fixture lessons built over the shipped scene
 * `belt-to-sensor`: each fixture breaks one rule, and the guard must say which. The static rules and the pins are also in
 * tools/ci/scene-lessons.test.ts; these tests grade real programs on the native runtime.
 */
const SCENE_DIR = join(import.meta.dir, '..', '..', 'plant-scenes', 'belt-to-sensor');
const read = (file: string): string => readFileSync(join(SCENE_DIR, file), 'utf8');
const scenario = JSON.parse(read('scenario.json')) as { expectations: unknown[] };

const lesson = {
  id: 'fixture-belt-to-sensor',
  version: 1,
  scene: 'belt-to-sensor',
  plant: null,
  starter: { project: 'starter', program: 'BeltToSensor.st' },
  solution: { project: 'solution', program: 'BeltToSensor.st' },
  scenario: {
    id: 'belt-to-sensor',
    path: 'tests/belt-to-sensor.scenario.json',
    sha256: scenarioHash(scenario),
    tickMs: 10,
    durationMs: 8000,
    assertions: scenario.expectations.length,
    canonical: canonicalJson(scenario),
  },
} as unknown as LessonIndexEntry;

let projects = '';
let previousBinary: string | undefined;
let counter = 0;
beforeAll(() => {
  projects = mkdtempSync(join(tmpdir(), 'zplc-scene-guard-test-'));
  previousBinary = process.env.ZPLC_NATIVE_SIM_BIN;
  process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
});
afterAll(() => {
  if (previousBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
  else process.env.ZPLC_NATIVE_SIM_BIN = previousBinary;
  rmSync(projects, { recursive: true, force: true });
});

/** A project the learner opens: a program and, at the project root, the two files of the scene. */
function project(name: string, program: string, files: readonly string[] = ['scene.json', 'plant-map.json']): void {
  const dir = join(projects, name);
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(
    join(dir, 'zplc.json'),
    JSON.stringify({
      schemaVersion: 2,
      name: 'Belt to sensor',
      version: '1.0.0',
      target: { board: 'posix' },
      tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['BeltToSensor.st'] }],
    }),
  );
  writeFileSync(join(dir, 'src', 'BeltToSensor.st'), program);
  for (const file of files) writeFileSync(join(dir, file), read(file));
}
/** Fresh project names per case so the guard cannot see another case's files. */
function fixture(starter: string, solution: string, files?: readonly string[]): LessonIndexEntry {
  const id = counter++;
  project(`starter-${id}`, starter, files);
  project(`solution-${id}`, solution, files);
  return {
    ...lesson,
    starter: { ...lesson.starter, project: `starter-${id}` },
    solution: { ...lesson.solution, project: `solution-${id}` },
  };
}
const guard = (entry: LessonIndexEntry, now?: () => number) => checkSceneLessons({ lessons: [entry], projectsDir: projects, now });

describe('the scene-lesson guard on real programs (CRS-005, CRS-006, CRS-010)', () => {
  it('passes on the tree today: no lesson names a scene and the ten plant lessons are as pinned', async () => {
    expect(LESSON_INDEX.lessons.filter((candidate) => candidate.scene)).toEqual([]);
    expect(await checkSceneLessons()).toEqual({ problems: [], report: [] });
    expect(plantLessonPinFaults(LESSON_INDEX.lessons)).toEqual([]);
  });

  itNative(
    'CRS-005 a lesson whose reference passes and whose starter fails is accepted, with its grade times reported',
    async () => {
      const result = await guard(fixture(read('starter.st'), read('reference.st')));
      expect(result.problems).toEqual([]);
      expect(result.report).toEqual([expect.stringMatching(/^fixture-belt-to-sensor: starter \d+ ms, solution \d+ ms$/)]);
    },
    120_000,
  );

  itNative(
    'CRS-005 a program that does nothing cannot pass: a starter that passes, or a reference that fails, is refused',
    async () => {
      const passingStarter = await guard(fixture(read('reference.st'), read('reference.st')));
      expect(passingStarter.problems).toEqual([expect.stringContaining('the starter passes')]);
      const failingReference = await guard(fixture(read('starter.st'), read('starter.st')));
      expect(failingReference.problems).toEqual([expect.stringContaining('the reference solution does not pass')]);
    },
    120_000,
  );

  itNative(
    'CRS-006 a grade over 60 s is refused',
    async () => {
      let clock = 0;
      const slow = () => (clock += 61_000);
      const result = await guard(fixture(read('starter.st'), read('reference.st')), slow);
      expect(result.problems.join('\n')).toContain('CRS-006');
      expect(result.problems.filter((problem) => problem.includes('over 60000 ms'))).toHaveLength(2);
    },
    120_000,
  );

  itNative(
    'CRS-004 a project without the scene files of its lesson is refused before it is graded',
    async () => {
      const result = await guard(fixture(read('starter.st'), read('reference.st'), ['scene.json']));
      expect(result.problems.join('\n')).toContain('lacks plant-map.json');
    },
    60_000,
  );
});
