import { LESSON_INDEX } from '../../src/generated/lessonIndex';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';

const [LADDER, PLANT] = LESSON_INDEX.course.paths!;
const LADDER_FIRST = LADDER!.lessons[0]!;
const marker = (app: App) =>
  app.eval<string>(
    `(() => { const el = document.activeElement; return el ? [...el.getAttributeNames()].filter((name) => name.startsWith('data-learn-')).join(' ') : ''; })()`,
  );
const pathOpen = (app: App, id: string) => app.eval<boolean | null>(`document.querySelector('[data-learn-path="${id}"]')?.open ?? null`);

/** Journeys of task U3-G5 (plan-u3.md): the Learn home puts Continue first, a skip link second, and closes the paths (GDE-011). */
export const journeysU3G5: Journey[] = [
  {
    name: 'U3-G5 The Learn home reaches the switches in a few keys, and opens the path of the lesson started',
    example: 'none',
    proves: ['GDE-011'],
    run: async (app) => {
      await app.cdp.command('Emulation.setFocusEmulationEnabled', { enabled: true });
      await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await app.until('the Learn home', async () => (await app.visible(css('[data-learn-home]'))) || undefined);
      await app.until(
        'the home to take the keyboard',
        async () => (await app.eval<boolean>(`document.activeElement?.id === 'learn-home-title'`)) || undefined,
      );

      // Tab, Tab, Enter: Continue, the skip link, the switches.
      let presses = 0;
      await app.press('Tab');
      presses += 1;
      assert((await marker(app)).includes('data-learn-continue'), `The first Tab does not reach Continue: ${await marker(app)}.`);
      await app.press('Tab');
      presses += 1;
      assert((await marker(app)).includes('data-learn-skip'), `The second Tab does not reach the skip link: ${await marker(app)}.`);
      await app.press('Enter');
      presses += 1;
      assert((await marker(app)).includes('data-learn-unlock-all'), `The skip link does not reach the switches: ${await marker(app)}.`);
      assert(presses <= 4, `The switches took ${presses} key presses.`);

      // No path is open for a learner whose next lesson is outside the paths: no Start of a path is on the page for the keyboard.
      assert(
        (await pathOpen(app, LADDER!.id)) === false && (await pathOpen(app, PLANT!.id)) === false,
        'A path is open though the lesson to continue is in none.',
      );

      // Start a lesson of the Ladder path, come back: the path that holds it is the open one.
      await app.click(css(`[data-learn-path="${LADDER!.id}"] summary`), 'the Ladder path');
      await app.click(css(`[data-learn-path-start="${LADDER_FIRST}"]`), 'the first lesson of the Ladder path');
      await app.until(
        'the lesson to open',
        async () => (await app.eval<boolean>(`document.querySelector('[data-learn-home]') === null`)) || undefined,
        45_000,
      );
      await app.click(css('[data-activity="learn"]'), 'the Learn item of the rail');
      await app.until('the Learn home again', async () => (await app.visible(css('[data-learn-home]'))) || undefined);
      assert((await pathOpen(app, LADDER!.id)) === true, 'The path of the lesson started is closed.');
      assert((await pathOpen(app, PLANT!.id)) === false, 'The other path is open.');
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
];
