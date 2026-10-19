import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { LESSON_INDEX } from '../../packages/zplc-ide/src/generated/lessonIndex';
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
