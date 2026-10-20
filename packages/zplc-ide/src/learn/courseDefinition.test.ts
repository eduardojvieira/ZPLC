// The course structure as data (LRN-005, LRN-007, LRN-011): modules in order with a level, prerequisites and tracks, and the
// rules that keep the ten lessons placed in it. A broken file is reported by every problem it has, never repaired.
import { describe, expect, it } from 'bun:test';
import course from '../../lessons/course.json';
import { validateCourseDefinition, validateCoursePlacement, type CourseDefinition } from './courseDefinition';

type Editable = { -readonly [K in keyof CourseDefinition]: CourseDefinition[K] } & Record<string, unknown>;
const clone = (): Editable => structuredClone(course) as unknown as Editable;
const problemsOf = (change: (value: Editable) => void): string[] => {
  const value = clone();
  change(value);
  return validateCourseDefinition(value);
};

describe('the course definition file', () => {
  it('is valid as shipped, with the twelve modules of the curriculum in order', () => {
    expect(validateCourseDefinition(course)).toEqual([]);
    expect(course.modules.map((module) => module.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(course.modules.map((module) => module.level)).toEqual(['foundation', 'foundation', 'foundation', 'foundation', 'intermediate', 'intermediate', 'intermediate', 'intermediate', 'advanced', 'advanced', 'advanced', 'advanced']);
  });

  it('refuses a value that is not an object, an unknown key and a wrong schema version', () => {
    expect(validateCourseDefinition(null).length).toBeGreaterThan(0);
    expect(problemsOf((value) => { value.extra = 1; }).some((problem) => problem.includes('extra'))).toBe(true);
    expect(problemsOf((value) => { (value as { schemaVersion: number }).schemaVersion = 2; }).some((problem) => problem.includes('schemaVersion'))).toBe(true);
  });

  it('refuses modules that are out of order, skip a number or require a later module', () => {
    expect(problemsOf((value) => { value.modules[3]!.id = 7; }).some((problem) => problem.includes('module ids'))).toBe(true);
    expect(problemsOf((value) => { value.modules[2]!.requires = 5; }).some((problem) => problem.includes('module 2') && problem.includes('requires'))).toBe(true);
    expect(problemsOf((value) => { value.modules[0]!.requires = 3; }).some((problem) => problem.includes('module 0'))).toBe(true);
  });

  it('refuses a level that goes back, a missing Spanish title and a track the course does not define', () => {
    expect(problemsOf((value) => { value.modules[6]!.level = 'foundation'; }).some((problem) => problem.includes('level'))).toBe(true);
    expect(problemsOf((value) => { (value.modules[1]!.title as { es: string }).es = ''; }).some((problem) => problem.includes('module 1') && problem.includes('title'))).toBe(true);
    expect(problemsOf((value) => { (value.modules[1]!.tracks as string[]).push('cloud'); }).some((problem) => problem.includes('cloud'))).toBe(true);
  });

  it('LRN-006 refuses a course with no rationale and a module that does not say why it sits where it does', () => {
    expect(problemsOf((value) => { delete (value as Record<string, unknown>).rationale; }).some((problem) => problem.includes('rationale'))).toBe(true);
    expect(problemsOf((value) => { (value.rationale as { es: string }).es = ' '; }).some((problem) => problem.includes('rationale') && problem.includes('es'))).toBe(true);
    expect(problemsOf((value) => { delete (value.modules[4] as { why?: unknown }).why; }).some((problem) => problem.includes('module 4') && problem.includes('why'))).toBe(true);
    expect(problemsOf((value) => { (value.modules[7]!.why as { en: string }).en = ''; }).some((problem) => problem.includes('module 7') && problem.includes('why'))).toBe(true);
  });

  it('refuses a track with no reason and no instead-action for the lesson that does not support it (LRN-011)', () => {
    expect(problemsOf((value) => { (value.tracks[1]!.unsupported.reason as { en: string }).en = ''; }).some((problem) => problem.includes('hardware') && problem.includes('reason'))).toBe(true);
    expect(problemsOf((value) => { (value.tracks[1]!.unsupported.instead as { es: string }).es = ''; }).some((problem) => problem.includes('hardware') && problem.includes('instead'))).toBe(true);
  });
});

describe('the placement of lessons in the course', () => {
  const lesson = (over: Partial<{ id: string; module: number; level: string; prerequisites: string[]; tracks: string[] }> = {}) => ({ id: 'a-lesson', module: 1, level: 'foundation', prerequisites: [] as string[], tracks: ['simulation'], ...over });
  const placed = (...lessons: ReturnType<typeof lesson>[]) => validateCoursePlacement(course as unknown as CourseDefinition, lessons);

  it('accepts a lesson in a module of its own level whose tracks the module has', () => {
    expect(placed(lesson())).toEqual([]);
  });

  it('refuses a lesson in a module that does not exist, of another level, or with a track its module lacks', () => {
    expect(placed(lesson({ module: 40 })).some((problem) => problem.includes('a-lesson') && problem.includes('module 40'))).toBe(true);
    expect(placed(lesson({ level: 'advanced' })).some((problem) => problem.includes('level'))).toBe(true);
    expect(placed(lesson({ module: 8, level: 'advanced', tracks: ['simulation', 'hardware'] })).some((problem) => problem.includes('hardware'))).toBe(true);
  });

  it('LRN-012 refuses a Foundation or Intermediate lesson that cannot be done in simulation, except the board check of module 0', () => {
    expect(placed(lesson({ tracks: ['hardware'] })).some((problem) => problem.includes('a-lesson') && problem.includes('simulation'))).toBe(true);
    expect(placed(lesson({ module: 4, level: 'intermediate', tracks: ['hardware'] })).some((problem) => problem.includes('simulation'))).toBe(true);
    expect(placed(lesson({ module: 1, tracks: ['simulation', 'hardware'] }))).toEqual([]);
    // Module 0 is "a tour of Studio, simulation, and (hardware) verify my board": checking a board has nothing to simulate.
    expect(placed(lesson({ module: 0, tracks: ['hardware'] }))).toEqual([]);
    // An Advanced lesson may be hardware only (none is today).
    expect(placed(lesson({ module: 9, level: 'advanced', tracks: ['hardware'] }))).toEqual([]);
  });

  it('refuses a prerequisite that sits in a later module than the lesson', () => {
    expect(placed(lesson({ id: 'early', module: 2, prerequisites: ['late'] }), lesson({ id: 'late', module: 3 })).some((problem) => problem.includes('early') && problem.includes('late'))).toBe(true);
  });
});
