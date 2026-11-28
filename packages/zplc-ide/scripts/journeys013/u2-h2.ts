import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import { chooseOption } from '../journeyKeys';
import type { Journey } from '../journeys';

const theme = (app: App) => app.eval<string | null>(`document.documentElement.getAttribute('data-theme')`);

/** Journeys of task U2-H2 (plan-u2.md): Preferences (per user) and Project settings (per project) are two documents. */
export const journeysU2H2: Journey[] = [
  {
    name: 'SHL-011 open Preferences from the Welcome screen with no project, change the theme, open a project, open Project settings',
    example: 'motor_start_stop',
    proves: ['SHL-011', 'SHL-012'],
    partly: [],
    run: async (app, { project }) => {
      // With no project open: the start page has no theme control, its Preferences entry opens the document, which has the one.
      await app.until('the Welcome screen', async () => (await app.visible(button('Open project', 'contains'))) || undefined);
      assert(!(await app.visible(css('[data-theme-control]'))), 'The Welcome screen still has a theme control.');
      await app.click(button('Preferences'), 'the Preferences button of the Welcome screen');
      await app.until('Preferences with no project open', async () => (await app.visible(css('[data-app-preferences]'))) || undefined);
      assert(
        (await app.eval<number>(`document.querySelectorAll('[data-theme-control]').length`)) === 1,
        'Preferences must hold exactly one theme control.',
      );
      assert(!(await app.visible(css('[data-open-config-editor]'))), 'Preferences shows a project field with no project open.');
      await chooseOption(app, 'select[data-theme-control]', 'Dark');
      await app.until('the dark theme', async () => (await theme(app)) === 'dark' || undefined);

      // A project opens with that choice kept; Project settings is another document, without the preferences.
      await app.click(button('Back to the start'), 'Back to the start');
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
      assert((await theme(app)) === 'dark', 'The theme chosen in Preferences was lost when the project opened.');
      await app.click(button('Project settings'), 'the Project settings button');
      await app.until('Project settings', async () => (await app.visible(css('[data-open-config-editor]'))) || undefined);
      assert(!(await app.visible(css('[data-app-preferences]'))), 'Project settings still holds the preferences.');
      assert(!(await app.visible(css('[data-theme-control]'))), 'Project settings still holds a theme control.');

      // Preferences opens again from the palette, as a tab beside Project settings, and shows the same choice.
      await app.press('Ctrl+Shift+P');
      await app.until('the palette field', async () => (await app.visible(css('[role="combobox"]'))) || undefined);
      await app.type('Open preferences');
      await app.until('the command in the palette', async () => (await app.visible(css('[role="option"]'))) || undefined);
      await app.press('Enter');
      await app.until('Preferences in the editor area', async () => (await app.visible(css('[data-app-preferences]'))) || undefined);
      assert(
        (await app.eval<string>(`document.querySelector('select[data-theme-control]').value`)) === 'dark',
        'Preferences does not show the theme chosen before the project opened.',
      );
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
];
