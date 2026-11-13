/** The journeys of the learner scene editor and the industrial automation course (spec 012, plan-m7 Tasks Q6 and Q7). */
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import {
  holdPushButton,
  openPlantDocument,
  plantFacts,
  runInSimulation,
  SHIPPED,
  shippedSceneProject,
  writeSceneProject,
} from './plantSupport';

/** How a person reaches a control: the pointer clicks it, the keyboard focuses it and presses Enter. */
type How = 'pointer' | 'keyboard';

/** The input or select a label names (the label text starts with `label`). */
const control = (label: string) =>
  `[...document.querySelectorAll('label')].find((l) => (l.textContent ?? '').trim().startsWith(${JSON.stringify(label)}))?.control`;

async function reach(app: App, how: How, target: string, what: string): Promise<void> {
  if (how === 'pointer') await app.click(target, what);
  else {
    await app.eval(`(${target}).focus()`);
    assert(await app.eval<boolean>(`document.activeElement === (${target})`), `${what} cannot take the keyboard focus.`);
  }
}

/** Writes `text` in a field and commits it with Enter (the field applies on Enter or on blur). */
async function fill(app: App, how: How, label: string, text: string): Promise<void> {
  await reach(app, how, control(label), `the field "${label}"`);
  await app.press('Ctrl+A');
  await app.type(text);
  await app.press('Enter');
}

async function activate(app: App, how: How, target: string, what: string): Promise<void> {
  if (how === 'pointer') await app.click(target, what);
  else {
    await reach(app, 'keyboard', target, what);
    await app.press('Enter');
  }
}

const parts = (app: App) => app.eval<string[]>(`[...document.querySelectorAll('[data-part]')].map((li) => li.getAttribute('data-part'))`);

/** Filters the catalogue by name, picks the part with the arrow keys of the select and adds it. */
async function addPart(app: App, how: How, name: string): Promise<void> {
  const before = (await parts(app)).length;
  await fill(app, how, 'Filter parts', name);
  const selected = `${control('Part to add')}.selectedOptions[0]?.textContent`;
  await app.eval(`${control('Part to add')}.focus()`);
  for (let i = 0; i < 12 && (await app.eval<string>(selected)) !== name; i++) await app.press('ArrowDown');
  assert((await app.eval<string>(selected)) === name, `The catalogue select cannot be set to "${name}".`);
  await activate(app, how, button('Add part'), 'Add part');
  await app.until(`${name} in the parts of the scene`, async () => (await parts(app)).length === before + 1 || undefined);
}

/** The part just added is selected by its row; its name and position are set through the fields. */
async function placePart(app: App, how: How, id: string, set: { name: string; x: number; z: number; rotation?: number }): Promise<void> {
  await activate(app, how, `document.querySelector('[data-part="${id}"] button')`, `the row of ${id}`);
  await fill(app, how, 'Name', set.name);
  await fill(app, how, 'Position X', String(set.x));
  await fill(app, how, 'Position Z', String(set.z));
  if (set.rotation !== undefined) await fill(app, how, 'Rotation', String(set.rotation));
  await app.until(`${set.name} named in its row`, async () => (await app.text()).includes(set.name) || undefined);
}

/** Binds every signal of the scene to the point the reference program of belt-to-sensor declares (suffix of the signal). */
const POINT: Record<string, string> = { pressed: 'Start', detect: 'EyeFar', run: 'Run', emit: 'Emit' };
async function bindSignals(app: App, how: How, count = 3): Promise<void> {
  const signals = await app.eval<string[]>(`[...document.querySelectorAll('tr[data-signal]')].map((tr) => tr.getAttribute('data-signal'))`);
  assert(signals.length === count, `The scene exposes ${signals.length} signals instead of ${count}: ${signals.join(', ')}`);
  for (const signal of signals) {
    const point = POINT[signal.split('.')[1] ?? ''];
    assert(point, `No point is known for the signal ${signal}.`);
    await fill(app, how, `Program point for ${signal}`, `BeltToSensor.${point}`);
    await app.until(`${signal} bound`, async () => (await app.text()).includes(`Bound to BeltToSensor.${point}`) || undefined);
  }
}

/** A project whose scene is the empty floor, with the program of the reference scene belt-to-sensor and no map. */
async function openEmptyFloor(app: App, root: string, folder: string): Promise<void> {
  const reference = shippedSceneProject(SHIPPED.smallest);
  const scene = JSON.stringify({ schemaVersion: 1, name: 'Empty floor', parts: [], cameras: [] });
  const project = { ...reference, scene, name: 'floor' };
  const dir = writeSceneProject(join(root, folder), project);
  rmSync(join(dir, 'scenes', 'floor.plant-map.json'));
  app.answer(dir);
  await app.click(button('Open project', 'contains'), 'the Open project button');
  await app.until('the project workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
  await openPlantDocument(app, project);
}

/** From the empty floor: a belt, an emitter and a push button added, named, positioned and bound, with the editor still open. */
async function build(app: App, how: How): Promise<void> {
  await app.click(css('[data-plant-edit-scene]'), 'Edit scene');
  await app.until('the plant editor', async () => (await app.visible(css('[data-plant-editor]'))) || undefined);
  assert((await app.text()).includes('The scene has no parts yet'), 'The empty floor does not say that it has no parts.');
  await addPart(app, how, 'Belt conveyor');
  await addPart(app, how, 'Item emitter');
  await addPart(app, how, 'Push button');
  const ids = await parts(app);
  await placePart(app, how, ids[0]!, { name: 'Belt1', x: 0, z: 0 });
  await placePart(app, how, ids[1]!, { name: 'Emitter1', x: -0.9, z: 0 });
  await placePart(app, how, ids[2]!, { name: 'StartButton', x: -0.9, z: -0.7 });
  await bindSignals(app, how);
}

async function finishAndRun(app: App, how: How): Promise<void> {
  await activate(app, how, css('[data-plant-edit-done]'), 'Done editing');
  await app.until('the editor to close', async () => !(await app.visible(css('[data-plant-editor]'))) || undefined);
  await runInSimulation(app);
  assert((await plantFacts(app)).includes('Emitted: 0'), `The plant emitted before anyone pressed: ${await plantFacts(app)}`);
  await holdPushButton(app, 'StartButton', how);
  await app.until(
    'an item emitted by the scene that was built',
    async () => (await plantFacts(app)).includes('Emitted: 1') || undefined,
    30_000,
  );
}

export const journeysCourse: Journey[] = [
  {
    name: 'Q6 A scene is built from the empty floor, bound and run by the keyboard',
    example: 'none',
    proves: [],
    partly: ['SCN-008', 'SCN-009', 'SCN-011', 'SCN-012', 'SCN-014', 'SCN-016'],
    run: async (app, { root }) => {
      await openEmptyFloor(app, root, 'plant-floor-keyboard');
      await build(app, 'keyboard');
      await finishAndRun(app, 'keyboard');
    },
  },
  {
    name: 'Q6 A scene is built by pointer, one undo step, bound and run',
    example: 'none',
    proves: [],
    partly: ['SCN-008', 'SCN-009', 'SCN-010', 'SCN-011', 'SCN-012', 'SCN-016'],
    run: async (app, { root }) => {
      await openEmptyFloor(app, root, 'plant-floor-pointer');
      await build(app, 'pointer');
      // one more part, then one undo step takes exactly that part back (SCN-010)
      await addPart(app, 'pointer', 'Stop blade');
      assert((await parts(app)).length === 4, 'The fourth part was not added.');
      await app.click(css('[data-plant-undo]'), 'Undo');
      await app.until('the last part taken back by one Undo', async () => (await parts(app)).length === 3 || undefined);
      // the canvas drag needs WebGL 2, which the development host has not: say so rather than pretend it was driven
      if (!(await app.visible(css('[data-plant-drag-hint]'))))
        app.note('The drag of a part on the canvas cannot be driven here: no WebGL 2 on the development host.');
      await finishAndRun(app, 'pointer');
    },
  },
];
