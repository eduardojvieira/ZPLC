// What the Learn home and the lesson list read (LRN-002, LRN-005, LRN-011): the course as a view over the generated index and
// the progress document, with each lesson locked, available, in progress or passed, and where to continue.
import { describe, expect, it } from 'bun:test';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { emptyProgress, withNote, withPassedIds, type LearnProgress } from '../../electron/learnProgressModel';
import { buildCourseView, continueTarget, lessonStateOf, trackSupport } from './course';

const FIRST = 'first-blink-simulation';
const SECOND = 'scan-cycle-one-scan-memory';
const THIRD = 'blinky-ladder-timer-feedback';
const MOTOR = 'motor-start-stop-safe';
const at = '2026-10-19T10:00:00.000Z';
const passed = (...ids: string[]): LearnProgress => withPassedIds(emptyProgress(), ids);

describe('the state of a lesson', () => {
  it('is available when it has no prerequisite and locked while a prerequisite is not passed', () => {
    expect(lessonStateOf(LESSON_INDEX, FIRST, emptyProgress(), false)).toEqual({ state: 'available', missing: [] });
    expect(lessonStateOf(LESSON_INDEX, SECOND, emptyProgress(), false)).toEqual({ state: 'locked', missing: [FIRST] });
  });

  it('opens when every prerequisite is passed, and is passed once passed', () => {
    expect(lessonStateOf(LESSON_INDEX, SECOND, passed(FIRST), false).state).toBe('available');
    expect(lessonStateOf(LESSON_INDEX, SECOND, passed(FIRST, SECOND), false).state).toBe('passed');
  });

  it('is in progress after it was opened, and a started lesson is never locked again', () => {
    const started = withNote(emptyProgress(), { lessonId: SECOND, started: true }, at);
    expect(lessonStateOf(LESSON_INDEX, SECOND, started, false)).toEqual({ state: 'in-progress', missing: [] });
  });

  it('is never locked when everything is unlocked (the setting), and the missing list is empty', () => {
    expect(lessonStateOf(LESSON_INDEX, MOTOR, emptyProgress(), true)).toEqual({ state: 'available', missing: [] });
  });

  it('is locked, not an error, while progress has not loaded', () => {
    expect(lessonStateOf(LESSON_INDEX, SECOND, null, false).state).toBe('locked');
  });
});

describe('the course view', () => {
  const view = buildCourseView(LESSON_INDEX, emptyProgress(), { locale: 'en', unlockAll: false });

  it('lists the modules in order with level, required module, estimated minutes and the lessons placed in them', () => {
    expect(view.modules.map((module) => module.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const one = view.modules[1]!;
    expect(one).toMatchObject({ level: 'foundation', requires: 0 });
    expect(one.lessons.map((lesson) => lesson.id)).toEqual([SECOND, THIRD, 'blink-structured-text']);
    expect(one.estimatedMinutes).toBe(45);
    expect(one.title).toContain('scan cycle');
  });

  it('keeps the modules that have no lesson yet, empty and with no minutes, and invents no lesson for them', () => {
    const empty = view.modules.filter((module) => module.lessons.length === 0).map((module) => module.id);
    expect(empty).toEqual(LESSON_INDEX.course.modules.map((module) => module.id).filter((id) => !LESSON_INDEX.lessons.some((lesson) => lesson.module === id)));
    expect(empty.length).toBeGreaterThan(0);
    expect(view.modules.find((module) => module.id === empty[0])!.estimatedMinutes).toBe(0);
  });

  it('carries every lesson of the index exactly once, with its state, title and tracks', () => {
    const lessons = view.modules.flatMap((module) => module.lessons);
    expect(lessons.map((lesson) => lesson.id).sort()).toEqual(LESSON_INDEX.lessons.map((lesson) => lesson.id).sort());
    const second = lessons.find((lesson) => lesson.id === SECOND)!;
    expect(second).toMatchObject({ state: 'locked', missing: [FIRST], tracks: ['simulation'] });
    expect(second.title.length).toBeGreaterThan(0);
  });

  it('states the objectives of a module from the lessons placed in it', () => {
    expect(view.modules[1]!.objectives.length).toBeGreaterThan(0);
    expect(view.modules.find((module) => module.lessons.length === 0)!.objectives).toEqual([]);
  });

  it('reads Spanish titles in the Spanish locale', () => {
    const spanish = buildCourseView(LESSON_INDEX, emptyProgress(), { locale: 'es', unlockAll: false });
    expect(spanish.modules[3]!.title).toBe('Temporizadores, flancos y contadores');
  });

  it('counts the passed lessons', () => {
    expect(buildCourseView(LESSON_INDEX, passed(FIRST), { locale: 'en', unlockAll: false })).toMatchObject({ passed: 1, total: LESSON_INDEX.lessons.length });
  });
});

describe('where to continue', () => {
  const view = (progress: LearnProgress, unlockAll = false) => buildCourseView(LESSON_INDEX, progress, { locale: 'en', unlockAll });

  it('is the first lesson of the course for a learner who has not started', () => {
    expect(continueTarget(view(emptyProgress()), emptyProgress())).toBe(FIRST);
  });

  it('is the last lesson the learner worked on, while it is not passed', () => {
    const progress = withNote(passed(FIRST), { lessonId: SECOND, started: true, last: true }, at);
    expect(continueTarget(view(progress), progress)).toBe(SECOND);
  });

  it('is the next open lesson in course order after the last one was passed', () => {
    const progress = withNote(passed(FIRST, SECOND), { lessonId: SECOND, last: true }, at);
    expect(continueTarget(view(progress), progress)).toBe(THIRD);
  });

  it('is nothing when every lesson is passed', () => {
    const all = passed(...LESSON_INDEX.lessons.map((lesson) => lesson.id));
    expect(continueTarget(view(all), all)).toBeNull();
  });
});

describe('the tracks a lesson supports (LRN-011)', () => {
  it('says supported for a track the lesson lists', () => {
    expect(trackSupport(LESSON_INDEX, FIRST, 'simulation', 'en')).toEqual({ supported: true });
  });

  it('LRN-011 gives every lesson its own reason for a track it does not support, in both languages', () => {
    const reasons: string[] = [];
    for (const lesson of LESSON_INDEX.lessons) {
      for (const track of LESSON_INDEX.course.tracks.filter((candidate) => !lesson.tracks.includes(candidate.id))) {
        for (const locale of ['en', 'es'] as const) {
          const support = trackSupport(LESSON_INDEX, lesson.id, track.id, locale);
          if (support.supported) throw new Error(`${lesson.id} lists ${track.id}`);
          expect(support.reason.length, `${lesson.id} ${locale} reason`).toBeGreaterThan(20);
          expect(support.instead.length, `${lesson.id} ${locale} instead`).toBeGreaterThan(20);
          expect(support.reason, `${lesson.id} repeats the generic reason of the track`).not.toBe(track.unsupported.reason[locale]);
          if (locale === 'en') reasons.push(support.reason);
        }
      }
    }
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it('says why a track is not supported and what to do instead, in the language asked', () => {
    const en = trackSupport(LESSON_INDEX, FIRST, 'hardware', 'en');
    expect(en).toMatchObject({ supported: false });
    if (en.supported) throw new Error('hardware is not supported by this lesson');
    expect(en.reason).toContain('board');
    expect(en.instead).toContain('Simulation');
    const es = trackSupport(LESSON_INDEX, FIRST, 'hardware', 'es');
    if (es.supported) throw new Error('hardware is not supported by this lesson');
    expect(es.instead).toContain('Simulación');
  });
});
