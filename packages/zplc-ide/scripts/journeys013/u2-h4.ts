import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { translate } from '../../src/i18n/translate';
import { assert } from '../run-desktop-smoke';
import { button, css } from '../journeyApp';
import type { Journey } from '../journeys';

/** The journeys of task H4 of the U2 plan (spec 013): creation from the navigator. */
export const journeysU2H4: Journey[] = [
  {
    name: 'SHL-013 create a function from an empty group and it opens',
    example: 'motor_start_stop',
    proves: ['SHL-013'],
    partly: [],
    run: async (app, { project }) => {
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the workbench', async () => (await app.visible(css('[data-activity="project"]'))) || undefined);
      await app.click(css('[data-activity="project"]'), 'the Project activity of the rail');
      const objects = css(`[aria-label=${JSON.stringify(translate('en', 'navigator.mode.label'))}] button:nth-of-type(1)`);
      await app.click(objects, 'the Objects mode of the navigator');

      // the Functions group of this example is empty: it offers the action in place of "Nothing here yet"
      const empty = css('[data-navigator-group="functions"] [data-new-object="function"]');
      await app.until('the New function action of the empty group', async () => (await app.visible(empty)) || undefined);
      await app.click(empty, 'New function in the empty Functions group');
      await app.until('the name dialog', async () => (await app.visible(css('[data-new-object-dialog]'))) || undefined);
      await app.type('Scale');
      await app.press('Enter');
      const tab = css('[id="editor-tab-file:src/Scale.st"]');
      await app.until('the new function to open', async () => (await app.visible(tab)) || undefined);
      const path = join(project, 'src', 'Scale.st');
      assert(existsSync(path), 'The New function dialog made no src/Scale.st.');
      assert(readFileSync(path, 'utf8').includes('FUNCTION Scale'), 'The new file does not declare the function Scale.');
      await app.until(
        'the group to list Scale',
        async () =>
          (await app.eval<boolean>(
            `document.querySelector('[data-navigator-group="functions"]')?.textContent?.includes('Scale') === true`,
          )) || undefined,
      );

      // Close project is a File command: the palette runs it, and the Explorer header has no cross beside Refresh
      assert(
        !(await app.visible(css('button[aria-label="Close project"]'))),
        'The navigator still has a Close project control beside Refresh.',
      );
      await app.press('Ctrl+Shift+P');
      await app.type('close the project');
      await app.until(
        'the palette to list Close the project',
        async () =>
          (await app.eval<boolean>(`Boolean(document.querySelector('[role="option"][data-command="file.closeProject"]'))`)) || undefined,
      );
      await app.press('Enter');
      await app.until('the Welcome screen', async () => (await app.visible(button('Open project', 'contains'))) || undefined);
    },
  },
];
