import { assert } from '../run-desktop-smoke';
import { button, css } from '../journeyApp';
import type { Journey } from '../journeys';

const inEditor = `Boolean(document.activeElement?.closest('.monaco-editor'))`;

/** The journeys of task G5 of plan-u3.md: the jump to the command bar. */
export const journeysU3G5: Journey[] = [
  {
    name: 'U3-G5 Ctrl+Alt+C jumps from the code editor to the command bar and Escape comes back',
    example: 'motor_start_stop_starter',
    proves: ['FND-002', 'UX-025'],
    partly: [],
    run: async (app, { project }) => {
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
      await app.press('Ctrl+Shift+E');
      await app.until(
        'the Motor.st row',
        async () =>
          (await app.eval<boolean>(
            `(() => { const row = [...document.querySelectorAll('button, [role="treeitem"], [role="row"]')]` +
              `.find((el) => (el.textContent ?? '').includes('src/Motor.st')); if (!row) return false; row.click(); return true; })()`,
          )) || undefined,
      );
      await app.until('the code editor', async () => (await app.visible(css('.monaco-editor textarea.inputarea'))) || undefined);
      await app.eval(`document.querySelector('.monaco-editor textarea.inputarea').focus()`);
      assert(await app.eval<boolean>(inEditor), 'The focus should be in the code editor before the shortcut');
      await app.press('Ctrl+Alt+C');
      await app.until(
        'the focus in the command bar',
        async () => (await app.eval<boolean>(`Boolean(document.activeElement?.closest('[data-command-bar]'))`)) || undefined,
      );
      await app.press('Escape');
      await app.until('the focus back in the code editor', async () => (await app.eval<boolean>(inEditor)) || undefined);
    },
  },
];
