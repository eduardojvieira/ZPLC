import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assert } from '../run-desktop-smoke';
import { button, css, tab, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import {
  copyExample,
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

const MOTOR = 'motor_start_stop';
const toolbar = css('[role="toolbar"]');

/** The Motor project of the examples, opened and running in the simulation, with the Watch tab shown. */
async function runMotor(app: App, folder: string): Promise<void> {
  mkdirSync(folder, { recursive: true });
  copyExample(folder, MOTOR);
  app.answer(folder);
  await app.click(button('Open project', 'contains'), 'the Open project button');
  await app.until('the project workbench', async () => (await app.visible(toolbar)) || undefined);
  await runInSimulation(app);
  await app.click(tab('Watch', 'prefix'), 'the Watch tab');
  await app.until('the faceplate', async () => (await app.visible(css('[data-faceplate]'))) || undefined, 45_000);
}

const watchRow = (name: string) =>
  `[...document.querySelectorAll('tbody tr')].find((r) => r.firstElementChild?.textContent === ${JSON.stringify(name)})`;
const rowRect = (name: string) =>
  `(() => { const box = ${watchRow(name)}?.children[1].getBoundingClientRect(); ` +
  `return box ? { x: box.x + 12, y: box.y + box.height / 2 } : null; })()`;
const rowText = (app: App, name: string) => app.eval<string>(`${watchRow(name)}?.textContent ?? ''`);
const editor = (app: App, name: string) => app.eval<boolean>(`Boolean(document.querySelector('input[aria-label="New value of ${name}"]'))`);

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
        const found = await app.eval<boolean>(`Boolean((${INSPECTOR}).querySelector('#inspector-plant-editor-form'))`);
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
  {
    // PLS-007, LNK-006: the plant owns an input it feeds. The row says so and takes no value until the person forces it.
    name: 'U3-P7 a Watch row the plant feeds says "From the plant", takes no value, and takes one once it is forced',
    example: 'none',
    proves: [],
    partly: ['PLS-007', 'LNK-006', 'UX-009'],
    run: async (app, { root }) => {
      // a saved scene with its own plant map: the map feeds BeltToSensor.Start; the plant runs, so its session is bound
      const project = shippedSceneProject(SHIPPED.smallest);
      app.answer(writeSceneProject(join(root, 'plant-fed-row'), project));
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the project workbench', async () => (await app.visible(toolbar)) || undefined);
      await openPlantDocument(app, project);
      await runInSimulation(app);
      await app.click(tab('Watch', 'prefix'), 'the Watch tab');
      await app.until('the faceplate', async () => (await app.visible(css('[data-faceplate]'))) || undefined, 45_000);
      // on the faceplate: marked in words, and the switch and Hold are disabled before the force
      const faceRow = `document.querySelector('[data-faceplate] [data-input="BeltToSensor.Start"]')`;
      await app.until(
        'the faceplate row to say From the plant',
        async () => ((await app.eval<boolean>(`(${faceRow})?.textContent.includes('From the plant') ?? false`)) ? true : undefined),
        30_000,
      );
      assert(
        await app.eval<boolean>(`[...(${faceRow}).querySelectorAll('button')].every((b) => b.disabled)`),
        'The faceplate lets a person press the input the plant feeds.',
      );
      await app.click(button('Add variable'), 'Add variable');
      await app.click(css('input[placeholder^="Variable path"]'), 'the variable path');
      await app.type('Start');
      await app.press('Enter');
      await app.until(
        'Start to say From the plant',
        async () => ((await rowText(app, 'Start')).includes('From the plant') ? true : undefined),
        30_000,
      );
      // no editor: the row takes no keyboard focus, and a double-click on the value, scrolled into view, opens nothing
      assert(
        await app.eval<boolean>(`!${watchRow('Start')}.querySelector('[data-forced]').hasAttribute('tabindex')`),
        'The value of a row the plant feeds can be reached to edit.',
      );
      await app.eval(`${watchRow('Start')}.scrollIntoView({ block: 'center' })`);
      const { x, y } = (await app.eval<{ x: number; y: number } | null>(rowRect('Start')))!;
      assert(
        await app.eval<boolean>(`document.elementFromPoint(${x}, ${y})?.closest('tr') === ${watchRow('Start')}`),
        'The value of the Start row is not on screen to be clicked.',
      );
      await app.clickAt(x, y, 2);
      assert(!(await editor(app, 'Start')), 'A row the plant feeds opened its value editor.');
      await app.click(css('input[aria-label="Force Start"]'), 'the force checkbox of Start');
      await app.until(
        'the force of Start to be shown',
        async () => ((await app.eval<boolean>(`Boolean(document.querySelector('tr [data-forced="true"]'))`)) ? true : undefined),
        30_000,
      );
      // the forced value takes an edit: the keyboard opens the editor the double-click opens
      await app.eval(`${watchRow('Start')}.querySelector('[data-forced]').focus()`);
      await app.press('Enter');
      await app.until('the value editor of the forced row', async () => ((await editor(app, 'Start')) ? true : undefined));
    },
  },
  {
    // The faceplate of the Watch tab sets the same three inputs of the Motor program that the Trace buttons set: Start, Stop, EStop.
    name: 'U3-P7 the faceplate sets Start, Stop and EStop of the Motor program and reads each back as applied',
    example: 'none',
    proves: [],
    partly: ['PLS-007', 'UX-009'],
    run: async (app, { root }) => {
      await runMotor(app, join(root, 'faceplate-equivalence'));
      for (const name of ['Start', 'Stop', 'EStop']) {
        const input = `[data-input="Motor.${name}"]`;
        await app.click(css(`${input} button[role="switch"]`), `the ${name} switch`);
        await app.until(
          `${name} to read TRUE as applied`,
          async () => {
            // the phase "Applied" lasts a moment; the value the runtime holds, read back, is what stays
            const text = await app.eval<string>(`document.querySelector('${input} [data-input-value]')?.textContent ?? ''`);
            return text.includes('TRUE') ? true : undefined;
          },
          30_000,
        );
      }
    },
  },
  // U3-P4: the plant map is a configuration editor.
  {
    name: 'U3-P4 the plant map opens as a configuration editor, a problem opens its row, and Create the declarations reports',
    example: 'none',
    proves: [],
    partly: ['PLS-006', 'SCN-012', 'SCN-013'],
    run: async (app, { root }) => {
      const project = shippedSceneProject(SHIPPED.smallest);
      app.answer(writeSceneProject(join(root, 'plant-map-editor'), project));
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the project workbench', async () => (await app.visible(toolbar)) || undefined);
      await openPlantDocument(app, project);
      await runFromPalette(app, 'project.plantMap', 'open the plant map');
      await app.until('the plant map editor', async () => (await app.visible(css('[data-plant-map-editor]'))) || undefined, 30_000);
      const problem = css('[data-plant-map-problems] button[data-problem-kind="unbound"]');
      await app.until('an unbound signal as a problem', async () => (await app.visible(problem)) || undefined);
      await app.click(problem, 'the first unbound signal problem');
      const focused = await app.eval<boolean>(`document.activeElement?.closest('tr[data-signal]') !== null`);
      assert(focused, 'The problem did not put the focus in the row of its signal.');
      await app.click(button('Create declarations', 'contains'), 'Create declarations');
      await app.until('what the action did', async () => (await app.visible(css('[data-plant-map-editor] [role="status"]'))) || undefined);
    },
  },
];
