import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { LESSON_INDEX } from '../../packages/zplc-ide/src/generated/lessonIndex';

/**
 * The course outline (LRN-007) is a document, so it can drift from the lesson packages. This check ties each page of
 * it to the generated index: every module has its heading, every lesson of the index has a row whose languages, plant
 * and minutes agree with the manifest, and no row names a lesson that does not exist.
 */
const ROOT = resolve(import.meta.dir, '../..');
const PAGES = {
  en: { file: 'docs/docs/learn/course-outline.md', module: 'Module' },
  es: { file: 'docs/i18n/es/docusaurus-plugin-content-docs/current/learn/course-outline.md', module: 'Módulo' },
} as const;

export function outlineProblems(markdown: string, moduleWord: string): string[] {
  const problems: string[] = [];
  for (const module of LESSON_INDEX.course.modules) {
    if (!new RegExp(`^## ${moduleWord} ${module.id}: `, 'm').test(markdown)) problems.push(`module ${module.id} has no heading`);
  }
  const rows = new Map<string, string[]>();
  for (const line of markdown.split('\n')) {
    const id = /^\| `([a-z0-9-]+)` /.exec(line)?.[1];
    if (id) rows.set(id, line.split('|').map((cell) => cell.trim()).slice(1, -1));
  }
  for (const lesson of LESSON_INDEX.lessons) {
    const cells = rows.get(lesson.id);
    if (!cells) { problems.push(`${lesson.id} has no row`); continue; }
    if (cells[2] !== lesson.languages.join(', ')) problems.push(`${lesson.id}: languages "${cells[2]}" differ from ${lesson.languages.join(', ')}`);
    if (cells[4] !== (lesson.plant ?? '-')) problems.push(`${lesson.id}: plant "${cells[4]}" differs from ${lesson.plant ?? '-'}`);
    if (cells[5] !== String(lesson.estimatedMinutes)) problems.push(`${lesson.id}: minutes "${cells[5]}" differ from ${lesson.estimatedMinutes}`);
  }
  for (const id of rows.keys()) if (!LESSON_INDEX.lessons.some((lesson) => lesson.id === id)) problems.push(`${id} is not a lesson`);
  return problems;
}

describe('course outline pages (LRN-007)', () => {
  for (const [locale, page] of Object.entries(PAGES)) {
    const markdown = readFileSync(join(ROOT, page.file), 'utf8');
    it(`${locale}: agrees with the lesson packages`, () => {
      expect(outlineProblems(markdown, page.module)).toEqual([]);
    });
    it(`${locale}: the check fails on a missing lesson, a wrong time and an invented lesson`, () => {
      const first = LESSON_INDEX.lessons[0]!;
      const dropped = markdown.split('\n').filter((line) => !line.startsWith(`| \`${first.id}\``)).join('\n');
      expect(outlineProblems(dropped, page.module)).toContain(`${first.id} has no row`);
      const retimed = markdown.replace(new RegExp(`(\\| \`${first.id}\`[^\\n]*\\| )${first.estimatedMinutes}( \\|)`), '$1999$2');
      expect(outlineProblems(retimed, page.module).some((problem) => problem.startsWith(`${first.id}: minutes`))).toBe(true);
      expect(outlineProblems(`${markdown}\n| \`invented-lesson\` x | Available | ST | Simulation | - | 1 | - |\n`, page.module)).toContain('invented-lesson is not a lesson');
    });
  }
});
