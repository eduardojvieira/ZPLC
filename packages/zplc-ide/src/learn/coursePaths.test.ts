// Learning paths (LRN-043): an ordered list of lessons of one language, with its own locking and its own Continue.
import { describe, expect, it } from 'bun:test';

import { emptyProgress, withNote, withPassedIds } from '../../shared/learnProgressModel';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { buildCourseView, continueTarget, lessonStateOf, pathContinueTarget } from './course';
import { validateCourseDefinition, validateCoursePlacement, type CoursePath } from './courseDefinition';
import course from '../../lessons/course.json';

const A = 'blinky-ladder-timer-feedback';
const B = 'seal-in-ladder';
const C = 'boolean-logic-two-hand-guard-ladder';
const OUTSIDE = 'first-blink-simulation';
const at = '2026-10-19T10:00:00.000Z';
const path: CoursePath = {
  id: 'ladder',
  title: { en: 'Ladder from zero', es: 'Escalera desde cero' },
  summary: { en: 'Learn Ladder.', es: 'Aprenda Escalera.' },
  rationale: { en: 'Contacts first.', es: 'Primero los contactos.' },
  language: 'LD',
  lessons: [A, B, C],
};
const passed = (...ids: string[]) => withPassedIds(emptyProgress(), ids);
const withPath = { ...LESSON_INDEX, course: { ...LESSON_INDEX.course, paths: [path] } };

describe('the paths of the course file (LRN-043)', () => {
  const check = (change: (copy: Record<string, unknown>) => void): string[] => {
    const copy = JSON.parse(JSON.stringify({ ...course, paths: [path] })) as Record<string, unknown>;
    change(copy);
    return validateCourseDefinition(copy);
  };
  const pathOf = (copy: Record<string, unknown>): Record<string, unknown> => (copy.paths as Array<Record<string, unknown>>)[0]!;

  it('accepts a course without paths, as before, and a course with a well-formed path', () => {
    expect(validateCourseDefinition(course)).toEqual([]);
    expect(check(() => {})).toEqual([]);
  });

  it('refuses a path with a bad id, a missing text, an unknown language, an unknown key or no lessons', () => {
    expect(check((copy) => (pathOf(copy).id = 'Not A Slug'))).toEqual([
      'path Not A Slug: id must be a slug (lowercase letters, digits and hyphens)',
    ]);
    expect(check((copy) => delete (pathOf(copy).title as Record<string, unknown>).es)).toEqual([
      'path ladder title: the es text is missing',
    ]);
    expect(check((copy) => (pathOf(copy).summary = { en: '', es: 'x' }))).toEqual(['path ladder summary: the en text is missing']);
    expect(check((copy) => delete pathOf(copy).rationale)).toEqual([
      'path ladder rationale: must be an object with a text for each of en and es',
    ]);
    expect(check((copy) => (pathOf(copy).language = 'C'))).toEqual(['path ladder: language must be one of ST, LD, FBD, SFC, IL']);
    expect(check((copy) => (pathOf(copy).extra = 1))).toEqual(['path ladder: unknown key "extra"']);
    expect(check((copy) => (pathOf(copy).lessons = []))).toEqual(['path ladder: lessons must be a non-empty list of lesson ids']);
  });

  it('refuses a path defined twice and a lesson that appears twice in a path', () => {
    expect(check((copy) => (copy.paths = [path, path]))).toEqual(['path ladder: defined twice']);
    expect(check((copy) => (pathOf(copy).lessons = [A, B, A]))).toEqual([`path ladder: lesson "${A}" appears twice`]);
  });

  it('refuses a path that names a lesson the course does not have, and accepts the real lessons', () => {
    const lessons = LESSON_INDEX.lessons;
    expect(validateCoursePlacement({ ...LESSON_INDEX.course, paths: [path] }, lessons)).toEqual([]);
    expect(validateCoursePlacement({ ...LESSON_INDEX.course, paths: [{ ...path, lessons: [A, 'ld-nope'] }] }, lessons)).toEqual([
      'path ladder: lesson "ld-nope" is not a lesson',
    ]);
    expect(validateCoursePlacement(LESSON_INDEX.course, lessons)).toEqual([]);
  });
});

describe('the state of a lesson inside a path (LRN-043)', () => {
  it('keeps the global rules when no path is given: prerequisites decide', () => {
    expect(lessonStateOf(LESSON_INDEX, B, emptyProgress(), false)).toEqual({ state: 'locked', missing: ['boolean-logic-two-hand-guard'] });
    expect(lessonStateOf(LESSON_INDEX, B, emptyProgress(), false, undefined)).toEqual({
      state: 'locked',
      missing: ['boolean-logic-two-hand-guard'],
    });
  });

  it('opens the first lesson always, and each next one when the lesson before it in the path is passed', () => {
    expect(lessonStateOf(LESSON_INDEX, A, null, false, path)).toEqual({ state: 'available', missing: [] });
    expect(lessonStateOf(LESSON_INDEX, B, emptyProgress(), false, path)).toEqual({ state: 'locked', missing: [A] });
    expect(lessonStateOf(LESSON_INDEX, C, passed(A), false, path)).toEqual({ state: 'locked', missing: [B] });
    expect(lessonStateOf(LESSON_INDEX, B, passed(A), false, path)).toEqual({ state: 'available', missing: [] });
    expect(lessonStateOf(LESSON_INDEX, C, passed(A, B), false, path)).toEqual({ state: 'available', missing: [] });
    expect(lessonStateOf(LESSON_INDEX, C, passed(A, B, C), false, path)).toEqual({ state: 'passed', missing: [] });
  });

  it('replaces the prerequisites of the lesson with the path order, so a lesson the global course locks is open', () => {
    // seal-in-ladder waits for boolean-logic-two-hand-guard in the full course; in the path it waits only for the first lesson.
    expect(lessonStateOf(LESSON_INDEX, B, passed(A), false)).toEqual({ state: 'locked', missing: ['boolean-logic-two-hand-guard'] });
    expect(lessonStateOf(LESSON_INDEX, B, passed(A), false, path)).toEqual({ state: 'available', missing: [] });
    // and the other way: a global prerequisite that is passed does not open a lesson whose path predecessor is not.
    expect(lessonStateOf(LESSON_INDEX, C, passed('boolean-logic-two-hand-guard', A), false, path)).toEqual({
      state: 'locked',
      missing: [B],
    });
  });

  it('never locks a lesson that is started, and unlocks everything when everything is unlocked', () => {
    const started = withNote(emptyProgress(), { lessonId: C, started: true }, at);
    expect(lessonStateOf(LESSON_INDEX, C, started, false, path)).toEqual({ state: 'in-progress', missing: [] });
    expect(lessonStateOf(LESSON_INDEX, C, emptyProgress(), true, path)).toEqual({ state: 'available', missing: [] });
  });

  it('uses the global rules for a lesson that is not in the path', () => {
    expect(lessonStateOf(LESSON_INDEX, OUTSIDE, emptyProgress(), false, path)).toEqual({ state: 'available', missing: [] });
    expect(lessonStateOf(LESSON_INDEX, 'scan-cycle-one-scan-memory', emptyProgress(), false, path)).toEqual({
      state: 'locked',
      missing: [OUTSIDE],
    });
  });
});

describe('the paths in the course view and the Continue of a path (LRN-043)', () => {
  it('lists no path for a course that has none, and the full-course view is unchanged', () => {
    const noPaths = { ...LESSON_INDEX, course: { ...LESSON_INDEX.course, paths: [] } };
    const plain = buildCourseView(noPaths, emptyProgress(), { locale: 'en', unlockAll: false });
    expect(plain.paths).toEqual([]);
    const view = buildCourseView(withPath, emptyProgress(), { locale: 'en', unlockAll: false });
    expect(view.modules).toEqual(plain.modules);
    expect(view.titles).toEqual(plain.titles);
    expect(continueTarget(view, emptyProgress())).toBe(continueTarget(plain, emptyProgress()));
  });

  it('exposes each path in its language with its lessons in path order, locked by the path', () => {
    const view = buildCourseView(withPath, passed(A), { locale: 'es', unlockAll: false });
    expect(view.paths).toHaveLength(1);
    const [shown] = view.paths;
    expect(shown).toMatchObject({
      id: 'ladder',
      title: 'Escalera desde cero',
      summary: 'Aprenda Escalera.',
      rationale: 'Primero los contactos.',
      language: 'LD',
      passed: 1,
      total: 3,
    });
    expect(shown!.lessons.map((lesson) => [lesson.id, lesson.state, lesson.module])).toEqual([
      [A, 'passed', 1],
      [B, 'available', 2],
      [C, 'locked', 2],
    ]);
    expect(shown!.lessons[2]!.missing).toEqual([B]);
  });

  it('continues with the first lesson of the path that is not passed, and with none when all are', () => {
    const state = (progress = emptyProgress(), unlockAll = false) =>
      buildCourseView(withPath, progress, { locale: 'en', unlockAll }).paths[0]!;
    expect(pathContinueTarget(state())).toBe(A);
    expect(pathContinueTarget(state(passed(A)))).toBe(B);
    expect(pathContinueTarget(state(passed(A, B)))).toBe(C);
    expect(pathContinueTarget(state(passed(A, C)))).toBe(B);
    expect(pathContinueTarget(state(passed(A, B, C)))).toBeNull();
    expect(pathContinueTarget(state(emptyProgress(), true))).toBe(A);
  });
});

// The topics LRN-044 names, each mapped to the lesson of the Ladder path that teaches it, in the order of the path (D6).
const LADDER_TOPICS: Array<[topic: string, lesson: string]> = [
  ['what a PLC is, inputs and outputs', 'ld-what-is-a-plc'],
  ['the scan cycle', 'ld-scan-cycle'],
  ['a first blink', 'blinky-ladder-timer-feedback'],
  ['NO and NC contacts', 'ld-no-nc-contacts'],
  ['series and parallel logic', 'ld-series-parallel'],
  ['a two-hand guard', 'boolean-logic-two-hand-guard-ladder'],
  ['seal-in', 'seal-in-ladder'],
  ['set and reset', 'set-reset-alarm-latch-ladder'],
  ['edges', 'ld-edges'],
  ['timers', 'timers-on-delay-off-delay-ladder'],
  ['counters', 'edge-counter-pulses-ladder'],
  ['variables and I/O addresses', 'ld-variables-and-types'],
  ['comparison and arithmetic', 'ld-compare-math'],
  ['analog scaling', 'ld-analog-scaling'],
  ['sequences', 'ld-sequence-step-bits'],
  ['interlocks', 'interlock-reversing-ladder'],
  ['faults and reset', 'tank-level-fault-reset-ladder'],
  ['function blocks', 'ld-function-blocks'],
  ['diagnosis with the debugger', 'ld-diagnosis-debugger'],
  ['a final project', 'ld-final-project'],
  ['the same logic in the other languages', 'one-logic-five-languages'],
];

describe('the Ladder path teaches from zero (LRN-044)', () => {
  const ladder = LESSON_INDEX.course.paths?.find((entry) => entry.id === 'ladder');
  const lessonOf = (id: string) => LESSON_INDEX.lessons.find((lesson) => lesson.id === id);

  it('LRN-044 holds the 21 lessons of the outline, in order, and names a lesson for each topic', () => {
    expect(ladder?.lessons).toEqual(LADDER_TOPICS.map(([, lesson]) => lesson));
    for (const [topic, lesson] of LADDER_TOPICS) expect(ladder?.lessons, `no lesson on ${topic}`).toContain(lesson);
  });

  it('LRN-044 gives every lesson a reading page in English and Spanish, a Simulation track and the language LD', () => {
    for (const id of ladder?.lessons ?? []) {
      const lesson = lessonOf(id);
      expect(lesson, `${id} exists`).toBeDefined();
      expect(lesson?.reading?.en.trim().length, `${id} reading.en.md`).toBeGreaterThan(0);
      expect(lesson?.reading?.es.trim().length, `${id} reading.es.md`).toBeGreaterThan(0);
      expect(lesson?.tracks, `${id} tracks`).toContain('simulation');
      expect(lesson?.languages, `${id} languages`).toContain('LD');
    }
    expect(ladder?.language).toBe('LD');
  });
});
