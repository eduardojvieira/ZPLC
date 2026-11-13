// The scene-lesson guard (K2): the static rules, proven on fixture lessons built over the shipped scene `belt-to-sensor`
// (no real scene lesson exists yet, so the guard passes today with zero of them). The rules that grade a program on the
// native runtime are proven in packages/zplc-ide/src/learn/sceneLessons.test.ts.
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'bun:test';

import { LESSON_INDEX } from '../../packages/zplc-ide/src/generated/lessonIndex';
import { canonicalJson, type LessonIndexEntry } from '../../packages/zplc-ide/src/learn/lessonPackage';
import { scenarioHash } from '../../packages/zplc-ide/src/learn/lessonPackageFiles';
import {
  PLANT_LESSON_PINS,
  SCENES_DIRECTORY,
  checkSceneLessons,
  missingSceneLessons,
  plantLessonPinFaults,
  sceneLessonStaticFaults,
} from './scene-lessons';

const SCENE = join(SCENES_DIRECTORY, 'belt-to-sensor');
const baseScenario = JSON.parse(readFileSync(join(SCENE, 'scenario.json'), 'utf8')) as { expectations: unknown[] };

function fixtureLesson(id: string, scenario: unknown = baseScenario, over: Partial<LessonIndexEntry> = {}): LessonIndexEntry {
  return {
    id,
    version: 1,
    scene: 'belt-to-sensor',
    plant: null,
    starter: { project: 'fixture_starter', program: 'BeltToSensor.st' },
    solution: { project: 'fixture_solution', program: 'BeltToSensor.st' },
    scenario: {
      id: 'belt-to-sensor',
      path: 'tests/belt-to-sensor.scenario.json',
      sha256: scenarioHash(scenario),
      tickMs: 10,
      durationMs: 8000,
      assertions: (scenario as { expectations: unknown[] }).expectations.length,
      canonical: canonicalJson(scenario),
    },
    ...over,
  } as unknown as LessonIndexEntry;
}

const roots: string[] = [];
afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('the scene-lesson guard (CRS-003, CRS-005, CRS-006, CRS-010)', () => {
  it('passes on the tree today: no lesson names a scene, and the ten plant lessons are as pinned', async () => {
    expect(LESSON_INDEX.lessons.filter((lesson) => lesson.scene)).toEqual([]);
    expect(await checkSceneLessons()).toEqual({ problems: [], report: [] });
    expect(plantLessonPinFaults(LESSON_INDEX.lessons)).toEqual([]);
  });

  it('CRS-005 a scene lesson with no fact expectation is refused', () => {
    const outputsOnly = { ...baseScenario, expectations: [{ at: 7000, 'Belt1.run': true }] };
    expect(sceneLessonStaticFaults(fixtureLesson('no-fact', outputsOnly))).toEqual([
      expect.stringContaining('no expectation on a plant fact'),
    ]);
    expect(sceneLessonStaticFaults(fixtureLesson('with-fact'))).toEqual([]);
  });

  it('CRS-005 a fact the scene does not have, a scenario without a scene block and a stale hash are refused', () => {
    const wrongFact = JSON.parse(JSON.stringify(baseScenario).replace(/fact:count:EyeFar/g, 'fact:count:Nope')) as typeof baseScenario;
    expect(sceneLessonStaticFaults(fixtureLesson('wrong-fact', wrongFact)).join('\n')).toContain('Nope');
    const { scene: _scene, ...noScene } = baseScenario as typeof baseScenario & { scene: unknown };
    expect(sceneLessonStaticFaults(fixtureLesson('no-scene', noScene)).join('\n')).toContain('scene block');
    const stale = fixtureLesson('stale');
    expect(sceneLessonStaticFaults({ ...stale, scenario: { ...stale.scenario, sha256: '0'.repeat(64) } }).join('\n')).toContain('sha256');
  });

  it('CRS-003 a lesson whose scene directory does not exist is refused', () => {
    expect(sceneLessonStaticFaults(fixtureLesson('gone', baseScenario, { scene: 'no-such-scene' })).join('\n')).toContain('no-such-scene');
  });

  it('CRS-003 missingSceneLessons lists the scenes no lesson names', () => {
    const scenes = mkdtempSync(join(tmpdir(), 'zplc-scenes-'));
    roots.push(scenes);
    for (const id of ['a', 'b', 'c']) cpSync(SCENE, join(scenes, id), { recursive: true });
    expect(missingSceneLessons([fixtureLesson('x', baseScenario, { scene: 'b' })], scenes)).toEqual(['a', 'c']);
    expect(missingSceneLessons([], scenes)).toEqual(['a', 'b', 'c']);
    expect(missingSceneLessons(LESSON_INDEX.lessons)).toEqual(expect.arrayContaining(['belt-to-sensor']));
  });

  it('R7-L3 a Ladder sibling has the hash of its ST lesson', async () => {
    const st = fixtureLesson('plant-x');
    const other = { ...baseScenario, durationMs: 9000 };
    const ladder = fixtureLesson('plant-x-ladder', other);
    const result = await checkSceneLessons({ lessons: [st, ladder], grade: false });
    expect(result.problems.join('\n')).toContain('plant-x-ladder');
    expect(result.problems.join('\n')).toContain('plant-x');
    const same = await checkSceneLessons({ lessons: [st, fixtureLesson('plant-x-ladder')], grade: false });
    expect(same.problems).toEqual([]);
  });

  it('CRS-010 the ten 2.0 plant lessons keep their scenario hashes and projects', () => {
    expect(Object.keys(PLANT_LESSON_PINS)).toHaveLength(10);
    const lessons = LESSON_INDEX.lessons;
    const changed = (id: string, over: Partial<LessonIndexEntry>) =>
      plantLessonPinFaults(lessons.map((lesson) => (lesson.id === id ? { ...lesson, ...over } : lesson))).join('\n');
    const lesson = lessons.find((entry) => entry.id === 'motor-plant-feedback')!;
    expect(changed('motor-plant-feedback', { scenario: { ...lesson.scenario, sha256: 'f'.repeat(64) } })).toContain('motor-plant-feedback');
    expect(changed('motor-plant-feedback', { starter: { ...lesson.starter, project: 'other' } })).toContain('starter');
    expect(changed('motor-plant-feedback', { solution: { ...lesson.solution, project: 'other' } })).toContain('solution');
    // only the manifest tracks and unsupported may change
    expect(changed('motor-plant-feedback', { tracks: [...lesson.tracks, 'hardware'], unsupported: {} })).toBe('');
    expect(plantLessonPinFaults(lessons.filter((entry) => entry.id !== 'motor-plant-feedback')).join('\n')).toContain(
      'motor-plant-feedback',
    );
  });
});
