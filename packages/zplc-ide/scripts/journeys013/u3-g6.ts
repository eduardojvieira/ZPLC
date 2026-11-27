import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';

const dialogs = `[...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].map((el) => el.textContent?.trim().slice(0, 120))`;

/**
 * Journey of task U3-G6 (plan-u3.md): GDE-010. From the Welcome screen of a fresh profile the first blink takes at most three
 * actions: open the example (1), Run (2) and at most one answer to a question the window asks (3). The journey counts the actions
 * it performs and fails above three; a confirmation, a second Run or a notice that must be dismissed would be a fourth.
 */
export const journeysU3G6: Journey[] = [
  {
    name: 'U3-G6 From the Welcome screen to a running simulated blink in at most three actions',
    example: 'none',
    proves: ['GDE-010'],
    partly: [],
    run: async (app: App, { root }) => {
      const folder = join(root, 'first-blink');
      mkdirSync(folder);
      const actions: string[] = [];
      const act = async (what: string, perform: () => Promise<void> | void) => {
        actions.push(what);
        await perform();
      };
      const example = css('button[data-welcome-example="blinky_st"]');

      await app.until('the Welcome screen with the example', async () => (await app.visible(example)) || undefined);
      // The one question the window asks: the folder the example is copied into.
      await act('answer the folder question', () => app.answer(folder));
      await act('open the example', () => app.click(example, 'the Blinky (Structured Text) example'));
      await app.until('the project to open', async () => (await app.visible(css('[role="toolbar"]'))) || undefined, 45_000);
      const waiting = await app.eval<string[]>(dialogs);
      assert(waiting.length === 0, `A dialog is waiting after the example opened: ${JSON.stringify(waiting)}.`);

      await act('Run', () => app.click(button('Run (F5)', 'prefix'), 'Run on the toolbar'));
      await app
        .until('the program to run', async () => (await app.visible(button('Pause (F6)', 'prefix'))) || undefined, 45_000)
        .catch(async (error: Error) => {
          throw new Error(`${error.message}: a fourth action is needed, the window shows ${JSON.stringify(await app.eval(dialogs))}.`);
        });

      assert(actions.length <= 3, `The first blink took ${actions.length} actions (${actions.join(', ')}), more than three.`);
      app.note(`Welcome to a running program in ${actions.length} actions (${actions.join(' > ')})`);
    },
  },
];
