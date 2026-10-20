// The curriculum of the 2.0 spec as checks over the shipped course: the module table and its order (LRN-006). The table is
// copied here, because the spec folder is not part of the repository: a change to the course that leaves the table fails.
import { describe, expect, it } from 'bun:test';

import { LESSON_INDEX } from '../generated/lessonIndex';
import { getLanguageFromFilename } from '../types';
import { courseOrder } from './course';

/** The edited program of a lesson: the starter file the learner changes, in the language of its file. */
const editedLanguageOf = (lesson: { starter: { program: string } }): string => getLanguageFromFilename(lesson.starter.program);

const ALL = ['ST', 'LD', 'FBD', 'SFC', 'IL'];
/**
 * The curriculum table of the spec (section "Curriculum"). `title` holds the words the module title must keep (its intent),
 * `languages` the languages the module teaches: "none" for the tour of module 0, and every language for the capstone,
 * where the learner chooses.
 */
const TABLE = [
  { id: 0, title: [/tour of Studio/i, /simulation/i, /board/i], level: 'foundation', requires: null, languages: [], tracks: ['simulation', 'hardware'] },
  { id: 1, title: [/scan cycle/i, /first blink/i], level: 'foundation', requires: 0, languages: ['LD', 'ST'], tracks: ['simulation', 'hardware'] },
  { id: 2, title: [/Boolean logic/i, /contacts/i, /coils/i, /seal-in/i, /set and reset/i, /safe stop/i], level: 'foundation', requires: 1, languages: ['LD', 'ST'], tracks: ['simulation', 'hardware'] },
  { id: 3, title: [/timers/i, /edges/i, /counters/i], level: 'foundation', requires: 2, languages: ['LD', 'FBD', 'ST'], tracks: ['simulation', 'hardware'] },
  { id: 4, title: [/types/i, /arithmetic/i, /comparison/i, /analog scaling/i], level: 'intermediate', requires: 3, languages: ['ST', 'FBD'], tracks: ['simulation', 'hardware'] },
  { id: 5, title: [/state machines/i, /sequences/i], level: 'intermediate', requires: 3, languages: ['ST', 'SFC'], tracks: ['simulation', 'hardware'] },
  { id: 6, title: [/feedback/i, /faults/i, /interlocks/i], level: 'intermediate', requires: 5, languages: ['ST', 'LD'], tracks: ['simulation', 'hardware'] },
  { id: 7, title: [/functions/i, /function blocks/i, /structures/i, /arrays/i, /tasks/i], level: 'intermediate', requires: 4, languages: ['ST', 'FBD'], tracks: ['simulation', 'hardware'] },
  { id: 8, title: [/scenario tests/i, /temporal assertions/i, /trace/i, /breakpoints/i], level: 'advanced', requires: 6, languages: ['ST'], tracks: ['simulation'] },
  { id: 9, title: [/Instruction List/i, /five languages/i], level: 'advanced', requires: 7, languages: ALL, tracks: ['simulation', 'hardware'] },
  { id: 10, title: [/Modbus/i, /MQTT/i], level: 'advanced', requires: 7, languages: ['ST', 'FBD'], tracks: ['simulation', 'hardware'] },
  { id: 11, title: [/capstone/i, /description/i, /tested program/i], level: 'advanced', requires: 8, languages: ALL, tracks: ['simulation', 'hardware'] },
] as const;

const order = courseOrder(LESSON_INDEX);

describe('LRN-006 the course follows the curriculum table of the spec, in its order', () => {
  it('LRN-006 has the modules of the table in order, each with its title intent, level, required module and tracks', () => {
    const modules = LESSON_INDEX.course.modules;
    expect(modules.map((module) => module.id)).toEqual(TABLE.map((row) => row.id));
    for (const row of TABLE) {
      const module = modules[row.id]!;
      for (const word of row.title) expect([row.id, module.title.en]).toEqual([row.id, expect.stringMatching(word)]);
      expect([row.id, module.level, module.requires, [...module.tracks].sort()]).toEqual([row.id, row.level, row.requires, [...row.tracks].sort()]);
    }
  });

  it('LRN-006 places in each module only lessons whose edited program is in a language the table gives it (module 0 is a tour and teaches none)', () => {
    for (const lesson of LESSON_INDEX.lessons) {
      const row = TABLE[lesson.module]!;
      if (row.languages.length === 0) continue;
      expect([lesson.id, (row.languages as readonly string[]).includes(editedLanguageOf(lesson))]).toEqual([lesson.id, true]);
    }
  });

  it('LRN-006 begins with the tour of module 0, then the scan cycle, then the first blink in Ladder and in Structured Text', () => {
    const ids = order.map((lesson) => lesson.id);
    const tour = order.filter((lesson) => lesson.module === 0).map((lesson) => lesson.id);
    expect(tour[0]).toBe('first-blink-simulation');
    expect(ids.slice(0, tour.length)).toEqual(tour);
    expect(ids.slice(tour.length, tour.length + 3)).toEqual(['scan-cycle-one-scan-memory', 'blinky-ladder-timer-feedback', 'blink-structured-text']);
    // Kahn's order never takes a later module first: the module numbers only grow along the course.
    expect(order.map((lesson) => lesson.module)).toEqual([...order.map((lesson) => lesson.module)].sort((a, b) => a - b));
  });

  it('LRN-006 states why the course is in this order, and why each module sits where it does, in both languages', () => {
    const { course } = LESSON_INDEX;
    expect(course.rationale.en).toContain('scan cycle');
    expect(course.rationale.es).toContain('ciclo de escaneo');
    for (const module of course.modules) for (const locale of ['en', 'es'] as const) expect([module.id, locale, module.why[locale].trim().length > 20]).toEqual([module.id, locale, true]);
    expect(course.modules[1]!.why.en).toMatch(/seal-in, edges and timers cannot be understood without/i);
    expect(course.modules[2]!.why.en).toMatch(/Ladder beside Structured Text/);
    expect(course.modules[3]!.why.en).toMatch(/Function Block Diagram/);
    expect(course.modules[5]!.why.en).toMatch(/Sequential Function Chart/);
    expect(course.modules[8]!.why.en).toMatch(/programs worth testing/);
    expect(course.modules[9]!.why.en).toMatch(/low-level and legacy code/);
    expect(course.modules[10]!.why.en).toMatch(/need everything before them/);
  });
});

/**
 * How a lesson objective names each language, in English and in Spanish. A Spanish text may name a language by its
 * Spanish name (the glossary of the course) or by its English name, which industrial manuals in Spanish also use.
 */
const NAMES: Record<string, { en: RegExp; es: RegExp }> = {
  ST: { en: /Structured Text/, es: /texto estructurado|Structured Text/i },
  LD: { en: /Ladder/, es: /Ladder|diagrama de escalera/i },
  FBD: { en: /Function Block Diagram/, es: /diagrama de bloques de funci[oó]n|Function Block Diagram/i },
  SFC: { en: /Sequential Function Chart/, es: /diagrama de funciones secuenciales|diagrama funcional de secuencias|Sequential Function Chart/i },
  IL: { en: /Instruction List/, es: /lista de instrucciones|Instruction List/i },
};

describe('LRN-008 the course introduces each of ST, LD, FBD, SFC and IL and grades an edit in it, and offers the first blink in LD and in ST', () => {
  for (const language of ALL) {
    it(`LRN-008 ${language}: a graded lesson has the learner edit a program in ${language}, and the first one in course order names ${language} in an objective`, () => {
      // The edited program is the starter file the reference scenario grades: the reference solution replaces exactly that file.
      const editing = order.filter((lesson) => editedLanguageOf(lesson) === language);
      expect([language, editing.length > 0]).toEqual([language, true]);
      const introducing = editing[0]!;
      for (const locale of ['en', 'es'] as const) {
        const named = introducing.text[locale].objectives.some((objective) => NAMES[language]![locale].test(objective));
        expect([introducing.id, locale, named]).toEqual([introducing.id, locale, true]);
      }
    });
  }

  it('LRN-008 offers the first blink in module 1 in Ladder and in Structured Text, each as the program the learner edits', () => {
    const blinks = order.filter((lesson) => lesson.module === 1 && lesson.id !== 'scan-cycle-one-scan-memory');
    expect(blinks.map((lesson) => [lesson.id, editedLanguageOf(lesson)])).toEqual([['blinky-ladder-timer-feedback', 'LD'], ['blink-structured-text', 'ST']]);
  });
});
