import { join } from 'node:path';
import { assert } from '../run-desktop-smoke';
import { button, css } from '../journeyApp';
import type { Journey } from '../journeys';
import { openPlantDocument, SHIPPED, shippedSceneProject, writeSceneProject } from '../journeys/plantSupport';

/** The Plant activity of the rail, as the one region that holds the signal list (the plant document has its own region). */
const ACTIVITY = `[...document.querySelectorAll('[role="region"]')].find((r) => r.querySelector('[data-plant-signal-list]'))`;

/** The journeys of task P of plan-u3.md. */
export const journeysU3P: Journey[] = [
  {
    name: 'U3-P2 the Plant activity lists the catalogue and the signals, and a part is added with the keyboard',
    example: 'none',
    proves: [],
    partly: ['PLS-005', 'PLS-006', 'SCN-014', 'SCN-016'],
    run: async (app, { root }) => {
      const project = shippedSceneProject(SHIPPED.smallest);
      app.answer(writeSceneProject(join(root, 'plant-activity'), project));
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the project workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
      await openPlantDocument(app, project);
      await app.click(css('[data-activity="plant"]'), 'the Plant activity of the rail');
      await app.until('the signal list', async () => (await app.visible(css('[data-plant-signal-list]'))) || undefined);
      const rows = await app.eval<number>(`(${ACTIVITY}).querySelectorAll('[data-plant-signal-list] tbody tr').length`);
      assert(rows > 0, 'The Plant activity lists no signal.');
      const text = await app.eval<string>(`(${ACTIVITY}).textContent`);
      assert(/Not bound|Bound to/.test(text), `The signal list does not say whether a signal is bound: ${text.slice(0, 200)}`);
      // the catalogue is offered while the scene is edited
      await app.click(css('[data-plant-edit-scene]'), 'Edit scene');
      await app.until('the parts catalogue in the Plant activity', async () => {
        const found = await app.eval<boolean>(
          `Boolean((${ACTIVITY}).querySelector('select[aria-describedby="plant-activity-plant-editor-part-doc"]'))`,
        );
        return found || undefined;
      });
      const parts = () => app.eval<number>(`(${ACTIVITY}).querySelectorAll('li[data-part]').length`);
      const before = await parts();
      await app.eval(`[...(${ACTIVITY}).querySelectorAll('button')].find((b) => b.textContent === 'Add part').focus()`);
      await app.press('Enter');
      await app.until('one more part in the list', async () => ((await parts()) === before + 1 ? true : undefined));
    },
  },
];
