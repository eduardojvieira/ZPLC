import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { learnLessonCatalog } from '../../src/components/learnLesson';
import { translate } from '../../src/i18n/translate';
import { assert, MONACO_MODULE, packageRoot } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';

const en = (key: Parameters<typeof translate>[1]) => translate('en', key);
const GUIDE = '[data-sidebar-kind="secondary"]';
const LESSON = 'motor-start-stop-safe';

const inGuide = (app: App, expression: string) =>
  app.eval<boolean>(`(() => { const guide = document.querySelector('${GUIDE}'); return ${expression}; })()`);

/** Journeys of task U3-G1 (plan-u3.md): the Guide, one stage at a time, checks and offers the next lesson (GDE-003, GDE-008). */
export const journeysU3G1: Journey[] = [
  {
    name: 'U3-G1 Check from the Guide, pass, and go on to the next lesson',
    example: 'none',
    proves: ['GDE-003', 'GDE-008'],
    partly: ['GDE-005', 'GDE-009'],
    run: async (app, { root }) => {
      const lesson = learnLessonCatalog.en.find(({ id }) => id === LESSON)!;
      const solution = readFileSync(join(packageRoot, 'projects', lesson.referenceExampleId, lesson.solutionProgram), 'utf8');
      const folder = join(root, 'guide-lesson-g1');
      mkdirSync(folder);
      await app.eval(
        `(() => { const key = 'zplc-ide-settings'; const stored = JSON.parse(localStorage.getItem(key) || '{}'); const target = ` +
          `stored.settings ?? stored; target.unlockAllLessons = true; localStorage.setItem(key, JSON.stringify(stored)); })()`,
      );
      await app.cdp.command('Page.reload');
      await app.until('the Welcome screen', async () => (await app.visible(button('Open project', 'contains'))) || undefined);
      await app.cdp.command('Emulation.setFocusEmulationEnabled', { enabled: true });
      await app.cdp.command('Page.bringToFront');
      await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await app.until('the Learn home', async () => (await app.visible(css(`[data-learn-start="${LESSON}"]`))) || undefined);
      app.answer(folder);
      await app.click(css(`[data-learn-start="${LESSON}"]`), 'the start of the lesson');
      await app.until(
        'the Guide of the lesson',
        async () => (await app.visible(css(`${GUIDE} [data-guide-actions]`))) || undefined,
        30_000,
      );

      // reads the stage: one stage at a time, with the files and the board closed
      assert(await inGuide(app, `guide.querySelectorAll('[data-guide-stage]').length === 1`), 'The Guide does not show one stage.');
      assert(
        await inGuide(app, `guide.querySelector('[data-guide-files]')?.open === false`),
        'The files and record of the lesson are not a closed disclosure.',
      );
      assert(await inGuide(app, `guide.querySelector('[data-learn-lesson-button]') === null`), 'The Guide holds a list of lessons.');
      assert(await inGuide(app, `guide.querySelector('[data-guide-next-lesson]') === null`), 'Next lesson is offered before a pass.');

      // changes the program: the reference solution, in the editor, saved
      await app.until(
        'the editor with the program',
        async () =>
          (await app.eval<boolean>(
            `(async () => { const monaco = await ${MONACO_MODULE}; return monaco.editor.getEditors().length > 0; })()`,
          )) || undefined,
        30_000,
      );
      await app.eval(
        `(async () => { const monaco = await ${MONACO_MODULE}; monaco.editor.getEditors()[0].getModel().setValue(${JSON.stringify(solution)}); })()`,
      );
      await app.press('Ctrl+S');

      // Check from the Guide, the results panel left closed
      await app.until(
        'Check to be enabled',
        async () => (await app.eval<boolean>(`document.querySelector('${GUIDE} [data-learn-check]')?.disabled === false`)) || undefined,
      );
      await app.click(css(`${GUIDE} [data-learn-check]`), 'Check in the Guide');
      await app.until(
        'the Guide to grade the program as passed',
        async () => (await app.eval<boolean>(`document.querySelector('${GUIDE} [data-learn-grade="passed"]') !== null`)) || undefined,
      );

      // Next lesson: the lesson after this one in the module opens in the Guide
      const next = learnLessonCatalog.en.find(({ id }) => id === 'boolean-logic-two-hand-guard-ladder')!;
      await app.until('Next lesson', async () => (await app.visible(css(`${GUIDE} [data-guide-next-lesson]`))) || undefined);
      assert(
        await inGuide(app, `guide.querySelector('[data-guide-next-lesson]').textContent.includes(${JSON.stringify(next.title)})`),
        'Next lesson does not name the next lesson of the path.',
      );
      app.answer(join(root, 'guide-lesson-g1-next'));
      mkdirSync(join(root, 'guide-lesson-g1-next'));
      await app.click(css(`${GUIDE} [data-guide-next-lesson]`), 'Next lesson');
      await app
        .until(
          'the next lesson in the Guide',
          async () => (await inGuide(app, `guide.querySelector('#learn-title')?.textContent.trim() === ${JSON.stringify(next.title)}`)) || undefined,
          30_000,
        )
        .catch(async (error: Error) => {
          throw new Error(
            `${error.message}: ${await app.eval<string>(`document.querySelector('${GUIDE}')?.innerText.slice(0, 300) ?? 'no guide'`)}`,
          );
        });
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
      void en;
    },
  },
];
