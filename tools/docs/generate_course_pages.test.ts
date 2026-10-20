import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { LESSON_INDEX } from '../../packages/zplc-ide/src/generated/lessonIndex';
import { courseOrder } from '../../packages/zplc-ide/src/learn/course';
import { faceplateEn, faceplateEs } from '../../packages/zplc-ide/src/i18n/catalog/faceplate';
import { PAGES, outputs } from './generate_course_pages';
import { LANGS, ROOT } from './reference-lib';

describe('LRN-035 course pages: a page for every module and lesson, generated from the lesson packages', () => {
  it('has a page for every module and every lesson of the index, in both languages, and the plants page', () => {
    const paths = PAGES.map((page) => page.path);
    for (const module of LESSON_INDEX.course.modules) expect(paths).toContain(`learn/modules/module-${module.id}.md`);
    for (const lesson of LESSON_INDEX.lessons) expect(paths).toContain(`learn/lessons/${lesson.id}.md`);
    expect(paths).toContain('learn/plants.md');
    expect(outputs()).toHaveLength(PAGES.length * LANGS.length);
  });

  it('states the facts of the manifest on the lesson page and links the prerequisites and the module', () => {
    const lesson = LESSON_INDEX.lessons.find((entry) => entry.prerequisites.length > 0)!;
    const page = PAGES.find((entry) => entry.path === `learn/lessons/${lesson.id}.md`)!;
    const body = page.body('en');
    expect(body).toContain(`${lesson.estimatedMinutes} minutes`);
    expect(body).toContain(lesson.languages.join(', '));
    for (const id of lesson.prerequisites) expect(body).toContain(`(./${id}.md)`);
    expect(body).toContain(`(../modules/module-${lesson.module}.md)`);
  });

  it('writes the Spanish page from the Spanish text of the package, not the English one', () => {
    const lesson = LESSON_INDEX.lessons[0]!;
    const page = PAGES.find((entry) => entry.path === `learn/lessons/${lesson.id}.md`)!;
    const spanish = JSON.parse(readFileSync(`${ROOT}packages/zplc-ide/lessons/${lesson.id}/text.es.json`, 'utf8')) as { title: string };
    expect(page.title.es).toBe(spanish.title);
    expect(page.body('es')).toContain('minutos');
  });

  it('LRN-006 lists the lessons of a module in course order, the order Learn shows, and says why the module sits where it does', () => {
    for (const module of LESSON_INDEX.course.modules) {
      const page = PAGES.find((entry) => entry.path === `learn/modules/module-${module.id}.md`)!;
      for (const lang of LANGS) {
        const body = page.body(lang);
        expect(body).toContain(module.why[lang]);
        const listed = [...body.matchAll(/\(\.\.\/lessons\/([a-z0-9-]+)\.md\)/g)].map((match) => match[1]);
        expect([module.id, lang, listed]).toEqual([module.id, lang, courseOrder(LESSON_INDEX).filter((lesson) => lesson.module === module.id).map((lesson) => lesson.id)]);
      }
    }
  });

  it('lists each plant with the lessons that use it', () => {
    const body = PAGES.find((entry) => entry.path === 'learn/plants.md')!.body('en');
    for (const lesson of LESSON_INDEX.lessons) if (lesson.plant) expect(body).toContain(`\`${lesson.plant}\``);
  });

  it('keeps the committed pages in step with the packages (drift check) and unlisted from the sidebar', () => {
    for (const { file, content } of outputs()) {
      expect([file, readFileSync(`${ROOT}${file}`, 'utf8')]).toEqual([file, content]);
      expect(content).toContain('unlisted: true');
    }
  });
});

describe('LRN-035 stopgap, the faceplate leg: the faceplate page, in both languages, linked from Learn (the board kit pages are still to come)', () => {
  const page = (lang: 'en' | 'es') => readFileSync(`${ROOT}${lang === 'en' ? 'docs/docs' : 'docs/i18n/es/docusaurus-plugin-content-docs/current'}/learn/faceplate.md`, 'utf8');
  const learn = (lang: 'en' | 'es') => readFileSync(`${ROOT}${lang === 'en' ? 'docs/docs' : 'docs/i18n/es/docusaurus-plugin-content-docs/current'}/learn/index.md`, 'utf8');

  it('LRN-035 stopgap: says what the faceplate lists, how each input is operated and when a change reaches the program, in the words Studio shows', () => {
    for (const [lang, catalog] of [['en', faceplateEn], ['es', faceplateEs]] as const) {
      // Markdown wraps lines, so the page is read with its whitespace folded.
      const text = page(lang).replace(/\s+/g, ' ');
      // The page quotes the faceplate as Studio labels it, so a renamed label shows here as a stale page.
      for (const key of ['faceplate.title', 'faceplate.pending', 'faceplate.applied', 'faceplate.hold', 'faceplate.set', 'faceplate.noMap'] as const) expect([lang, key, text.includes(catalog[key])]).toEqual([lang, key, true]);
      expect(text).toMatch(lang === 'en' ? /## When a change reaches the program/ : /## Cuándo llega un cambio al programa/);
      expect(learn(lang)).toContain('](./faceplate.md)');
    }
  });
});
