import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import kit from '../../packages/zplc-ide/lessons/kit.json';
import { LESSON_INDEX } from '../../packages/zplc-ide/src/generated/lessonIndex';
import { courseOrder } from '../../packages/zplc-ide/src/learn/course';
import { alternativePairs } from '../../packages/zplc-ide/src/learn/lessonSiblings';
import { getLanguageFromFilename } from '../../packages/zplc-ide/src/types';

/**
 * The course outline (LRN-007) is a document, so it can drift from the lesson packages. This check ties each page of
 * it to the generated index: every module has its heading, every lesson of the index has a row whose languages, plant
 * and minutes agree with the manifest, and no row names a lesson that does not exist. It also keeps the outline in step
 * with the Learn home of Studio (LRN-006): the rows are in course order, "Why this order" is the rationale of
 * `lessons/course.json`, and the paragraph under each module's facts is that module's `why`. Its hardware section links
 * the kit page of each learner board of `lessons/kit.json`, where the wiring page of every hardware lesson is (LRN-014).
 */
const ROOT = resolve(import.meta.dir, '../..');
const PAGES = {
  en: {
    file: 'docs/docs/learn/course-outline.md',
    module: 'Module',
    why: 'Why this order',
    languages: 'Languages',
    hardware: 'Hardware wiring pages',
    intro: (count: number) => `with its ${count} lessons`,
    today: (count: number) => `Available today: **${count}**. Planned: **0**. In all: **${count}**.`,
  },
  es: {
    file: 'docs/i18n/es/docusaurus-plugin-content-docs/current/learn/course-outline.md',
    module: 'Módulo',
    why: 'Por qué este orden',
    languages: 'Lenguajes',
    hardware: 'Páginas de cableado por placa',
    intro: (count: number) => `con sus ${count} lecciones`,
    today: (count: number) => `Disponibles hoy: **${count}**. Planeadas: **0**. En total: **${count}**.`,
  },
} as const;
type Locale = keyof typeof PAGES;

/**
 * The lessons that the public text counts: a Ladder sibling pair (alternatives, one scenario) is one lesson, so the text says
 * "97 lessons, 14 in two languages" and never the sum of the packages. Nothing here is a number of this file: it all comes from the index.
 */
const SECOND_OF_PAIR = new Set(alternativePairs(LESSON_INDEX).map(([, ladder]) => ladder));
const PUBLIC = LESSON_INDEX.lessons.filter((lesson) => !SECOND_OF_PAIR.has(lesson.id));
const MODULES = LESSON_INDEX.course.modules.length;

/** The paragraphs of the section that starts at a heading, up to the next second-level heading. */
function paragraphsUnder(markdown: string, heading: RegExp): string[] {
  const at = markdown.search(heading);
  if (at < 0) return [];
  const rest = markdown.slice(at).split('\n').slice(1).join('\n');
  const end = rest.search(/^## /m);
  return (end < 0 ? rest : rest.slice(0, end))
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function outlineProblems(markdown: string, locale: Locale): string[] {
  const { module: moduleWord, why, languages, hardware, intro, today } = PAGES[locale];
  const problems: string[] = [];
  if (!markdown.includes(intro(PUBLIC.length))) problems.push(`the page does not say "${intro(PUBLIC.length)}"`);
  if (!markdown.includes(today(PUBLIC.length))) problems.push(`the page does not say "${today(PUBLIC.length)}"`);
  if (paragraphsUnder(markdown, new RegExp(`^## ${why}$`, 'm'))[0] !== LESSON_INDEX.course.rationale[locale])
    problems.push(`"${why}" is not the rationale of the course file`);
  // LRN-008: the lesson that introduces each language is the first one, in course order, whose edited program is in it.
  // a formatter pads the cells of a table: compare the cells, not the spaces
  const table = paragraphsUnder(markdown, new RegExp(`^## ${languages}$`, 'm'))
    .join('\n')
    .replace(/ {2,}/g, ' ');
  for (const language of ['ST', 'LD', 'FBD', 'SFC', 'IL']) {
    const introducing = courseOrder(LESSON_INDEX).find((lesson) => getLanguageFromFilename(lesson.starter.program) === language);
    if (!introducing || !table.includes(`| ${language} | \`${introducing.id}\` |`))
      problems.push(`"${languages}" does not name ${introducing?.id ?? 'a lesson'} as the lesson that introduces ${language}`);
  }
  const wiring = paragraphsUnder(markdown, new RegExp(`^## ${hardware}$`, 'm')).join('\n');
  for (const { boardId } of kit.boards)
    if (!wiring.includes(`(../reference/learner-kits/${boardId}.md)`))
      problems.push(`"${hardware}" does not link the kit page of ${boardId}`);
  for (const module of LESSON_INDEX.course.modules) {
    const heading = new RegExp(`^## ${moduleWord} ${module.id}: `, 'm');
    if (!heading.test(markdown)) {
      problems.push(`module ${module.id} has no heading`);
      continue;
    }
    // The first paragraph is the facts line (level, required module, tracks); the second says why the module is there.
    if (paragraphsUnder(markdown, heading)[1] !== module.why[locale])
      problems.push(`module ${module.id}: the paragraph under its facts is not its why of the course file`);
  }
  const rows = new Map<string, string[]>();
  for (const line of markdown.split('\n')) {
    const id = /^\| `([a-z0-9-]+)` /.exec(line)?.[1];
    if (id)
      rows.set(
        id,
        line
          .split('|')
          .map((cell) => cell.trim())
          .slice(1, -1),
      );
  }
  for (const lesson of LESSON_INDEX.lessons) {
    const cells = rows.get(lesson.id);
    if (!cells) {
      problems.push(`${lesson.id} has no row`);
      continue;
    }
    if (cells[2] !== lesson.languages.join(', '))
      problems.push(`${lesson.id}: languages "${cells[2]}" differ from ${lesson.languages.join(', ')}`);
    if (cells[4] !== (lesson.plant ?? '-')) problems.push(`${lesson.id}: plant "${cells[4]}" differs from ${lesson.plant ?? '-'}`);
    if (cells[5] !== String(lesson.estimatedMinutes))
      problems.push(`${lesson.id}: minutes "${cells[5]}" differ from ${lesson.estimatedMinutes}`);
  }
  for (const id of rows.keys()) if (!LESSON_INDEX.lessons.some((lesson) => lesson.id === id)) problems.push(`${id} is not a lesson`);
  const listed = [...rows.keys()];
  const expected = courseOrder(LESSON_INDEX)
    .map((lesson) => lesson.id)
    .filter((id) => rows.has(id));
  if (listed.filter((id) => expected.includes(id)).join() !== expected.join())
    problems.push(`the rows are not in course order: ${expected.join(', ')}`);
  return problems;
}

const HOME = {
  en: {
    file: 'docs/docs/learn/index.md',
    lessons: (n: number, m: number, hours: number) => `| ${n}, in ${m} modules (0 to ${m - 1}), about ${hours} hours in all`,
    levels: (f: number, i: number, a: number) => `Foundation ${f}, intermediate ${i} and advanced ${a}`,
    tracks: (s: number, h: number) => `Simulation, which ${s} of them offer, and Hardware, which ${h} of them offer`,
    description: (n: number, m: number) => `The ZPLC course: ${n} lessons in ${m} modules`,
  },
  es: {
    file: 'docs/i18n/es/docusaurus-plugin-content-docs/current/learn/index.md',
    lessons: (n: number, m: number, hours: number) => `| ${n}, en ${m} módulos (del 0 al ${m - 1}), unas ${hours} horas en total`,
    levels: (f: number, i: number, a: number) => `Base ${f}, intermedias ${i} y avanzadas ${a}`,
    tracks: (s: number, h: number) => `Simulación, que ofrecen ${s} de ellas, y Hardware, que ofrecen ${h} de ellas`,
    description: (n: number, m: number) => `El curso de ZPLC: ${n} lecciones en ${m} módulos`,
  },
} as const;

describe('the Learn home states the counts of the index (LRN-007, CRS-013)', () => {
  const by = (level: string) => PUBLIC.filter((lesson) => lesson.level === level).length;
  const on = (track: string) => PUBLIC.filter((lesson) => (lesson.tracks as readonly string[]).includes(track)).length;
  const hours = Math.round(PUBLIC.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0) / 60);
  for (const [locale, home] of Object.entries(HOME)) {
    it(`${locale}: lessons, modules, hours, levels, tracks and the description`, () => {
      const text = readFileSync(join(ROOT, home.file), 'utf8').replace(/ {2,}/g, ' ');
      for (const sentence of [
        home.lessons(PUBLIC.length, MODULES, hours),
        home.levels(by('foundation'), by('intermediate'), by('advanced')),
        home.tracks(on('simulation'), on('hardware')),
        home.description(PUBLIC.length, MODULES),
      ])
        expect(text).toContain(sentence);
    });
  }
});

describe('course outline pages (LRN-007)', () => {
  for (const [locale, page] of Object.entries(PAGES)) {
    const markdown = readFileSync(join(ROOT, page.file), 'utf8');
    it(`${locale}: agrees with the lesson packages`, () => {
      expect(outlineProblems(markdown, locale as Locale)).toEqual([]);
    });
    it(
      `LRN-006 ${locale}: states the rationale and the why of each module of the course file, and lists the lessons in course ` + `order`,
      () => {
        const rationale = LESSON_INDEX.course.rationale[locale as Locale];
        expect(
          outlineProblems(markdown.replace(rationale, 'Another order.'), locale as Locale).some((problem) => problem.includes(page.why)),
        ).toBe(true);
        const why = LESSON_INDEX.course.modules[5]!.why[locale as Locale];
        expect(outlineProblems(markdown.replace(why, 'Another reason.'), locale as Locale)).toContain(
          'module 5: the paragraph under its facts is not its why of the course file',
        );
        const [first, second] = courseOrder(LESSON_INDEX).filter((lesson) => lesson.module === 1);
        const lines = markdown.split('\n');
        const a = lines.findIndex((line) => line.startsWith(`| \`${first!.id}\``));
        const b = lines.findIndex((line) => line.startsWith(`| \`${second!.id}\``));
        [lines[a], lines[b]] = [lines[b]!, lines[a]!];
        expect(
          outlineProblems(lines.join('\n'), locale as Locale).some((problem) => problem.startsWith('the rows are not in course order')),
        ).toBe(true);
      },
    );
    it(`${locale}: the check fails on a missing lesson, a wrong time and an invented lesson`, () => {
      const first = LESSON_INDEX.lessons[0]!;
      const dropped = markdown
        .split('\n')
        .filter((line) => !line.startsWith(`| \`${first.id}\``))
        .join('\n');
      expect(outlineProblems(dropped, locale as Locale)).toContain(`${first.id} has no row`);
      const retimed = markdown.replace(new RegExp(`(\\| \`${first.id}\`[^\\n]*\\| )${first.estimatedMinutes}( *\\|)`), '$1999$2');
      expect(outlineProblems(retimed, locale as Locale).some((problem) => problem.startsWith(`${first.id}: minutes`))).toBe(true);
      expect(
        outlineProblems(`${markdown}\n| \`invented-lesson\` x | Available | ST | Simulation | - | 1 | - |\n`, locale as Locale),
      ).toContain('invented-lesson is not a lesson');
    });
    it(`LRN-014 ${locale}: the hardware section links the kit page of each learner board, and the check fails without it`, () => {
      const unlinked = markdown.replaceAll('(../reference/learner-kits/esp32-s3-devkitc.md)', '(../reference/boards.md)');
      expect(outlineProblems(unlinked, locale as Locale)).toContain(`"${page.hardware}" does not link the kit page of esp32-s3-devkitc`);
    });
  }
});
