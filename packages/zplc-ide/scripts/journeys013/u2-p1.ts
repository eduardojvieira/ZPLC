import { translate } from '../../src/i18n/translate';
import { COMMANDS } from '../../src/commands/registry';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';

const isOpen = (app: App) => app.eval<boolean>(`Boolean(document.querySelector('[role="dialog"] [role="combobox"]'))`);

/**
 * The palette lists only a command that a task has bound. `view.testResults` is bound by task T3 (wave 3, merged after this
 * one); the parent removes it from this list at the seam, and the journey then covers it.
 */
const NOT_BOUND_YET: readonly string[] = [];

/** Runs a command the way a keyboard user does: the palette, its title, the arrow keys to its row, Enter. */
async function runFromPalette(app: App, command: string, title: string): Promise<void> {
  await app.press('Ctrl+Shift+P');
  await app.until('the command palette to open', async () => (await isOpen(app)) || undefined);
  await app.until(
    'the palette field to hold the focus',
    async () => (await app.eval<boolean>(`document.activeElement?.getAttribute('role') === 'combobox'`)) || undefined,
  );
  await app.type(title);
  const row = `[role="option"][data-command="${command}"]`;
  const listed = () => app.eval<boolean>(`Boolean(document.querySelector('${row}'))`);
  if (NOT_BOUND_YET.includes(command)) {
    await Bun.sleep(1000);
    assert(!(await listed()), `${command} is listed now: remove it from NOT_BOUND_YET so that the journey runs it.`);
    await app.press('Escape');
    await app.until('the palette to close', async () => !(await isOpen(app)) || undefined);
    return;
  }
  await app.until(`the palette to list ${command}`, async () => (await listed()) || undefined);
  for (let step = 0; step < 12; step++) {
    if (await app.eval<boolean>(`document.querySelector('${row}')?.getAttribute('aria-selected') === 'true'`)) break;
    await app.press('ArrowDown');
  }
  await app.press('Enter');
  await app.until(`the palette to close after ${command}`, async () => !(await isOpen(app)) || undefined);
  // A command moves the focus after the palette has closed; the next palette must open after that, not before.
  // Preferences (view.agent without a provider) is a lazily loaded document that takes the focus when it is ready.
  await Bun.sleep(command === 'view.agent' ? 2000 : 300);
}

/** Journeys of task U2-P1 (plan-u2.md): every command of the View menu is reachable from the palette (FND-002). */
export const journeysU2P1: Journey[] = [
  {
    name: 'FND-002 every command of the View menu runs from the palette',
    example: 'seal_in_ladder',
    proves: [],
    partly: ['FND-002'],
    run: async (app, { project }) => {
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
      const views = COMMANDS.filter(
        (command) => command.category === 'view' && command.id !== 'view.commandPalette' && !('pending' in command),
      );
      assert(views.length > 20, `Expected the View commands of the registry, found ${views.length}.`);
      for (const command of views) await runFromPalette(app, command.id, translate('en', command.titleKey));
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
];
