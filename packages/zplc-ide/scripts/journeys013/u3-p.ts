import { join } from 'node:path';
import { assert } from '../run-desktop-smoke';
import { button, css } from '../journeyApp';
import type { Journey } from '../journeys';
import {
  openPlantDocument,
  runFromPalette,
  runInSimulation,
  SHIPPED,
  shippedSceneProject,
  writeSceneProject,
} from '../journeys/plantSupport';

/** The Plant activity of the rail, as the one region that holds the signal list (the plant document has its own region). */
const ACTIVITY = `[...document.querySelectorAll('[role="region"]')].find((r) => r.querySelector('[data-plant-signal-list]'))`;

/** The Inspector region, which holds the form of the selected part (P3). */
const INSPECTOR = `document.querySelector('aside.ledger-inspector')`;

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
  {
    name: 'U3-P3 the Inspector edits the selected part, refuses a value out of range at its field, and is disabled while the plant runs',
    example: 'none',
    proves: [],
    partly: ['PLS-005', 'SCN-008', 'SCN-009'],
    run: async (app, { root }) => {
      const project = shippedSceneProject(SHIPPED.smallest);
      app.answer(writeSceneProject(join(root, 'plant-inspector'), project));
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the project workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
      await openPlantDocument(app, project);
      await app.click(css('[data-activity="plant"]'), 'the Plant activity of the rail');
      await app.click(css('[data-plant-edit-scene]'), 'Edit scene');
      await app.until('the part list', async () => {
        const found = await app.eval<boolean>(`Boolean((${ACTIVITY}).querySelector('li[data-part] button'))`);
        return found || undefined;
      });
      // the Inspector starts closed: open it from its command
      await runFromPalette(app, 'view.showInspector', 'show the inspector');
      await app.until('the Inspector', async () => (await app.eval<boolean>(`Boolean(${INSPECTOR})`)) || undefined);
      // select the first part: its form is in the Inspector
      await app.eval(`(${ACTIVITY}).querySelector('li[data-part] button').click()`);
      const speed = `[...(${INSPECTOR}).querySelectorAll('label')].find((l) => l.textContent.startsWith('speedMps'))`;
      await app.until('the part form in the Inspector', async () => {
        const found = await app.eval<boolean>(`Boolean((${INSPECTOR}).querySelector('#plant-editor-form'))`);
        return found || undefined;
      });
      // a speed far above its limit is refused at its field
      const input = `document.getElementById(${speed}.htmlFor)`;
      await app.eval(`${input}.focus()`);
      await app.eval(
        `(() => { const i = ${input}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '99'); ` +
          `i.dispatchEvent(new Event('input', { bubbles: true })); })()`,
      );
      await app.press('Enter');
      await app.until('the refusal at the field', async () => {
        const alert = await app.eval<string>(`(${INSPECTOR}).querySelector('[role="alert"]')?.textContent ?? ''`);
        return /limit/.test(alert) || undefined;
      });
      // while the plant runs the form is disabled and says why, as text
      await runInSimulation(app);
      await app.until('the form disabled with its reason', async () => {
        const state = await app.eval<{ disabled: boolean; why: string }>(
          `({ disabled: ${input}.disabled, why: (${INSPECTOR}).querySelector('[role="status"]')?.textContent ?? '' })`,
        );
        return (state.disabled && /stopped/.test(state.why)) || undefined;
      });
    },
  },
];
