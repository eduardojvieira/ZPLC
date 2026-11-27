import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildProjectContext } from '../src/ai/projectContext';
import { createLessonLoader, lessonIndexPath } from './lessonIndexLoader';

const ID = 'ld-no-nc-contacts';
const index = {
  schemaVersion: 1,
  lessons: [
    {
      id: ID,
      languages: ['LD'],
      solution: { project: 'SOLUTION-PROJECT-SENTINEL' },
      text: {
        en: {
          title: 'Stop button',
          summary: 'Stop the motor when the wire breaks.',
          objectives: ['Use an NC contact'],
          stages: [{ key: 'edit', title: 'Change the rung', body: 'STAGE-BODY-SENTINEL', checkpoint: 'c' }],
          hints: [
            { level: 1, text: 'Which contact opens?' },
            { level: 2, text: 'LAST-HINT-SENTINEL' },
          ],
        },
        es: { title: 'Paro', summary: 'Detener el motor.', objectives: [], stages: [], hints: [] },
      },
    },
  ],
};
const directories: string[] = [];
async function indexFile(content: string) {
  const directory = await mkdtemp(join(tmpdir(), 'zplc-lessons-'));
  directories.push(directory);
  const file = join(directory, 'lessonIndex.json');
  await writeFile(file, content);
  return file;
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
const contextOf = async (file: string, solutionsHidden: boolean, locale: 'en' | 'es' = 'en') => {
  const entry = await createLessonLoader(file)(ID, locale);
  return buildProjectContext({ lesson: entry && { ...entry, stage: 'edit' } }, { solutionsHidden });
};

describe('the lesson text of the assistant, read from the generated index (AIX-002)', () => {
  it('finds a lesson: goal, objectives and the stage title, in the locale, and never a solution or a stage body', async () => {
    const file = await indexFile(JSON.stringify(index));
    const context = await contextOf(file, false);
    expect(context.lesson).toMatchObject({
      lessonId: ID,
      title: 'Stop button',
      goal: 'Stop the motor when the wire breaks.',
      objectives: ['Use an NC contact'],
      stage: { key: 'edit', title: 'Change the rung' },
      solutionsHidden: false,
    });
    expect(JSON.stringify(context)).not.toMatch(/SOLUTION-PROJECT|STAGE-BODY/);
    expect((await contextOf(file, false, 'es')).lesson?.title).toBe('Paro');
  });

  it('with solutions hidden drops the last hint', async () => {
    const file = await indexFile(JSON.stringify(index));
    expect((await contextOf(file, false)).lesson?.hints).toHaveLength(2);
    expect((await contextOf(file, true)).lesson?.hints).toEqual([{ level: 1, text: 'Which contact opens?' }]);
    expect(JSON.stringify(await contextOf(file, true))).not.toContain('LAST-HINT-SENTINEL');
  });

  it('gives no lesson when the index is missing, malformed, linked or has no such lesson', async () => {
    const good = await indexFile(JSON.stringify(index));
    const link = join(good, '..', 'link.json');
    await symlink(good, link);
    for (const file of [join(good, '..', 'absent.json'), await indexFile('{'), await indexFile('[]'), link])
      expect((await contextOf(file, false)).lesson, file).toBeUndefined();
    const loader = createLessonLoader(good);
    expect(await loader('unknown-lesson', 'en')).toBeUndefined();
    expect(await loader('../etc', 'en')).toBeUndefined();
  });

  it('reads from the resources of a packaged build and from the source tree otherwise', () => {
    expect(
      lessonIndexPath({ isPackaged: true, resourcesPath: join('r', 'res'), mainDirectory: join('d', 'electron-dist', 'electron') }),
    ).toBe(join('r', 'res', 'lessons', 'lessonIndex.json'));
    expect(lessonIndexPath({ isPackaged: false, resourcesPath: 'x', mainDirectory: join('app', 'electron-dist', 'electron') })).toBe(
      join('app', 'src', 'generated', 'lessonIndex.json'),
    );
  });

  it('the real index loads from the source tree, and the packaged build ships the same file where the loader looks', async () => {
    const source = lessonIndexPath({
      isPackaged: false,
      resourcesPath: '',
      mainDirectory: join(import.meta.dir, '..', 'electron-dist', 'electron'),
    });
    expect(await Bun.file(source).exists()).toBe(true);
    const entry = await createLessonLoader(source)(ID, 'en');
    expect(JSON.stringify(entry)).not.toContain('"solution"');
    expect(buildProjectContext({ lesson: entry }, { solutionsHidden: true }).lesson?.title).toBeTruthy();
    const builder = Bun.YAML.parse(await Bun.file(join(import.meta.dir, '..', 'electron-builder.yml')).text()) as {
      extraResources: Array<{ from: string; to: string }>;
    };
    const shipped = builder.extraResources.find((resource) => resource.to === 'lessons/lessonIndex.json');
    expect(join(import.meta.dir, '..', shipped!.from)).toBe(source);
  });
});
