import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert } from '../run-desktop-smoke';
import { button, css, tab, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import { copyExample, openPlantDocument, runInSimulation, SHIPPED, shippedSceneProject, writeSceneProject } from '../journeys/plantSupport';

/** The Plant activity of the rail, as the one region that holds the signal list (the plant document has its own region). */
const ACTIVITY = `[...document.querySelectorAll('[role="region"]')].find((r) => r.querySelector('[data-plant-signal-list]'))`;

const MOTOR = 'motor_start_stop';
const toolbar = css('[role="toolbar"]');

/** The Motor project of the examples, opened and running in the simulation; with `plantMap` it also holds a plant-map.json. */
async function runMotor(app: App, folder: string, plantMap?: object): Promise<void> {
  mkdirSync(folder, { recursive: true });
  copyExample(folder, MOTOR);
  if (plantMap) writeFileSync(join(folder, 'plant-map.json'), JSON.stringify(plantMap));
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
const editor = (app: App, name: string) =>
  app.eval<boolean>(`Boolean(document.querySelector('input[aria-label="New value of ${name}"]'))`);

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
    // PLS-007, LNK-006: the plant owns an input it feeds. The row says so and takes no value until the person forces it.
    name: 'U3-P7 a Watch row the plant feeds says "From the plant", takes no value, and takes one once it is forced',
    example: 'none',
    proves: [],
    partly: ['PLS-007', 'LNK-006', 'UX-009'],
    run: async (app, { root }) => {
      await runMotor(app, join(root, 'plant-fed-row'), {
        schemaVersion: 2,
        target: { scene: 'scene.json' },
        signals: { go: { direction: 'sensor', type: 'BOOL', point: 'Motor.Start' } },
      });
      await app.click(button('Add variable'), 'Add variable');
      await app.click(css('input[placeholder^="Variable path"]'), 'the variable path');
      await app.type('Start');
      await app.press('Enter');
      await app.until(
        'Start to say From the plant',
        async () => ((await rowText(app, 'Start')).includes('From the plant') ? true : undefined),
        30_000,
      );
      const centre = async () => (await app.eval<{ x: number; y: number } | null>(rowRect('Start')))!;
      let { x, y } = await centre();
      await app.clickAt(x, y, 2);
      assert(!(await editor(app, 'Start')), 'A row the plant feeds opened its value editor.');
      await app.click(css('input[aria-label="Force Start"]'), 'the force checkbox of Start');
      await app.until(
        'the force of Start to be shown',
        async () => ((await app.eval<boolean>(`Boolean(document.querySelector('tr [data-forced="true"]'))`)) ? true : undefined),
        30_000,
      );
      ({ x, y } = await centre());
      await app.clickAt(x, y, 2);
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
];
