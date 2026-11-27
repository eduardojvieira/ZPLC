import { LESSON_INDEX } from '../../src/generated/lessonIndex';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';

const LESSON = 'boolean-logic-two-hand-guard-ladder';
const PATH = LESSON_INDEX.course.paths!.find((path) => path.lessons.includes(LESSON))!;

/** What is on screen and could be reached: not inert, not hidden. */
const reachable = (selector: string) =>
  `[...document.querySelectorAll('${selector}')].filter((el) => !el.closest('[inert]') && el.getClientRects().length > 0).length`;

/**
 * Journeys of task U3-G4 (plan-u3.md): a reading page covers the whole workbench, and the lab's controls are the only run
 * controls (GDE-006).
 */
export const journeysU3G4: Journey[] = [
  {
    name: "U3-G4 No run control of the command bar is visible on a reading page, and the lab's are",
    example: 'none',
    proves: ['GDE-006'],
    partly: [],
    run: async (app: App) => {
      await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await app.until('the Learn home', async () => (await app.visible(css('[data-learn-home]'))) || undefined);
      await app.click(css(`[data-learn-path="${PATH.id}"] summary`), 'the path of the lesson');
      await app.click(css(`[data-learn-path-start="${LESSON}"]`), 'Start of the lesson');
      await app.until('the reading page', async () => (await app.visible(css(`[data-learn-reading="${LESSON}"]`))) || undefined, 45_000);

      const barRunControls = await app.eval<number>(
        reachable(
          ['debug.', 'online.connect', 'online.deploy']
            .map((id) => `[data-command-bar] [data-command${id.endsWith('.') ? '^' : ''}="${id}"]`)
            .join(', '),
        ),
      );
      assert(barRunControls === 0, `${barRunControls} run controls of the command bar are reachable on a reading page.`);
      assert((await app.eval<number>(reachable('[data-status-line]'))) === 0, 'The status rail is on screen on a reading page.');
      assert((await app.eval<number>(reachable('[data-activity]'))) === 0, 'The activity rail is reachable on a reading page.');
      assert(
        await app.eval<boolean>(
          `[...document.querySelectorAll('[data-learn-reading] button')].some((el) => el.textContent?.trim() === 'Run')`,
        ),
        "The lab's own Run is not on the page.",
      );

      await app.press('Escape');
      await app.until(
        'the command bar to come back',
        async () => (await app.eval<number>(reachable('[data-status-line]'))) > 0 || undefined,
      );
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
];
