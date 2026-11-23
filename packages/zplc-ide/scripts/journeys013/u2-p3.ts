import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { translate } from '../../src/i18n/translate';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import { runFromPalette } from './w3';

const NAMES = ['PlaceOne', 'PlaceTwo', 'PlaceThree'] as const;
const selected = (name: string) =>
  `document.querySelector('[id="editor-tab-file:src/${name}.st"]')?.getAttribute('aria-selected') === 'true'`;

/**
 * Journeys of task U2-P3 (plan-u2.md): Back and Forward through the places visited. The commands run from the palette with the keyboard:
 * Alt+Left and Alt+Right are menu accelerators, which a key sent through the debugger does not reach.
 */
export const journeysU2P3: Journey[] = [
  {
    name: 'FND-006 open three documents by the navigator, go back twice and forward once with the keyboard',
    example: 'motor_start_stop',
    proves: ['FND-006', 'FND-007'],
    partly: [],
    run: async (app: App, { project }) => {
      mkdirSync(join(project, 'src'), { recursive: true });
      for (const name of NAMES)
        writeFileSync(join(project, 'src', `${name}.st`), `PROGRAM ${name}\nVAR\n  x : BOOL;\nEND_VAR\nx := TRUE;\nEND_PROGRAM\n`);
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the workbench', async () => (await app.visible(css('[data-activity="project"]'))) || undefined);
      await app.click(css('[data-activity="project"]'), 'the Project activity of the rail');
      const objects = css(`[aria-label=${JSON.stringify(translate('en', 'navigator.mode.label'))}] button:nth-of-type(1)`);
      await app.click(objects, 'the Objects mode of the navigator');

      for (const name of NAMES) {
        await app.until(`${name} in the Programs group`, async () => {
          const found = await app.eval<boolean>(
            `[...document.querySelectorAll('[data-navigator-group="programs"] li > button')].some((b) => ` +
              `b.textContent?.startsWith(${JSON.stringify(name)}))`,
          );
          return found || undefined;
        });
        await app.eval(
          `[...document.querySelectorAll('[data-navigator-group="programs"] li > button')].find((b) => ` +
            `b.textContent?.startsWith(${JSON.stringify(name)}))?.click()`,
        );
        await app.until(`${name} to be the shown document`, async () => (await app.eval<boolean>(selected(name))) || undefined);
      }

      // the place bar names the document's project, group and object
      const bar = await app.eval<string>(`document.querySelector('[data-place-bar]')?.textContent ?? ''`);
      assert(bar.includes(translate('en', 'navigator.group.programs')) && bar.includes(NAMES[2]), `The place bar read "${bar}".`);

      const expectShown = async (name: string, why: string) =>
        app.until(why, async () => (await app.eval<boolean>(selected(name))) || undefined);
      await runFromPalette(app, 'edit.goBack', 'go back');
      await expectShown(NAMES[1], 'Back to the second document');
      await runFromPalette(app, 'edit.goBack', 'go back');
      await expectShown(NAMES[0], 'Back to the first document');
      await runFromPalette(app, 'edit.goForward', 'go forward');
      await expectShown(NAMES[1], 'Forward to the second document');
    },
  },
];
