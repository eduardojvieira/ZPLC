/** The journeys of the learner scene editor and the industrial automation course (spec 012, plan-m7 Tasks Q6 and Q7). */
import { join } from 'node:path';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { assert, packageRoot } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import { LESSON_INDEX } from '../../src/generated/lessonIndex';
import { courseOrder } from '../../src/learn/course';
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

// ---------------------------------------------------------------------------------------------------------------------
// Q7: a scene lesson end to end (CRS-004 to CRS-006, CRS-012)
// ---------------------------------------------------------------------------------------------------------------------

const lessonEntry = (id: string) => LESSON_INDEX.lessons.find((lesson) => lesson.id === id)!;
const workspaceOf = (root: string, id: string) => join(root, 'profile', 'learn-workspaces', id);

/** Opens a lesson from the Learn home with every lesson unlocked (the course order is the learner's, not this journey's). */
async function startLesson(app: App, id: string): Promise<void> {
  await app.eval(
    `(() => { const key = 'zplc-ide-settings'; const stored = JSON.parse(localStorage.getItem(key) || '{}'); const target = ` +
      `stored.settings ?? stored; target.unlockAllLessons = true; localStorage.setItem(key, JSON.stringify(stored)); })()`,
  );
  await app.cdp.command('Page.reload');
  await app.until('the Welcome screen', async () => (await app.visible(button('Open project', 'contains'))) || undefined);
  await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
  const start = css(`[data-learn-start="${id}"]`);
  await app.until(`${id} to be startable`, async () => (await app.clickable(start)) || undefined);
  await app.click(start, `Start for ${id}`);
  await app.until(
    `the lesson ${id} beside its workspace`,
    async () => ((await app.visible(css('[role="toolbar"]'))) && (await app.visible(css('[data-learn-check]')))) || undefined,
    45_000,
  );
}

const checkStatus = (app: App) => app.eval<string>(`document.querySelector('[data-learn-check-status]')?.textContent ?? ''`);
const grade = (app: App) =>
  app.eval<string | null>(`document.querySelector('[data-learn-grade]')?.getAttribute('data-learn-grade') ?? null`);

/** Presses Check and waits for the grade it ends on (`passed` or `failed`), or a refusal in the status line. */
async function check(app: App): Promise<{ grade: string | null; status: string }> {
  await app.until(
    'the Check button to be enabled',
    async () => (await app.eval<boolean>(`document.querySelector('[data-learn-check]')?.disabled === false`)) || undefined,
  );
  const before = await app.eval<number>(`Date.now()`);
  await app.click(css('[data-learn-check]'), 'the Check button');
  await app.until(
    'the Check to end',
    async () => {
      const running = await app.eval<boolean>(`document.querySelector('[data-learn-check]')?.getAttribute('aria-disabled') === 'true'`);
      if (running) return undefined;
      return (
        ((await grade(app)) !== 'none' && (await app.eval<number>(`Date.now()`)) - before > 1500) ||
        (await checkStatus(app)).length > 0 ||
        undefined
      );
    },
    120_000,
  );
  return { grade: await grade(app), status: await checkStatus(app) };
}

/** The plant document of a lesson workspace: its "Open a scene" button, then the empty floor of the scene chooser. */
async function openEmptyFloorInLesson(app: App): Promise<void> {
  await app.press('Ctrl+Shift+P');
  await app.type('show the plant');
  await app.until(
    'the palette to list Show the plant',
    async () => (await app.eval<boolean>(`Boolean(document.querySelector('[role="option"][data-command="view.plant"]'))`)) || undefined,
  );
  await app.press('Enter');
  await app.click(css('[data-plant-open-scene]'), 'Open a scene');
  await app.until('the scene panel', async () => (await app.visible(css('[data-plant-edit-scene]'))) || undefined, 30_000);
  await app.eval(
    `(() => { const select = [...document.querySelectorAll('[data-plant-panel] select')].find((s) => [...s.options].some((o) => o.value ` +
      `=== 'empty')); ` +
      `Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'empty'); ` +
      `select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  await app.until('the empty floor to load', async () => (await app.text()).includes('Empty floor') || undefined, 30_000);
}

journeysCourse.push(
  {
    name: 'Q7 Lesson 12.1 is read beside its plant, its program is edited, Check passes',
    example: 'none',
    proves: [],
    partly: ['CRS-004', 'CRS-005', 'CRS-012'],
    run: async (app, { root }) => {
      const first = courseOrder(LESSON_INDEX).find((lesson) => lesson.module === 12)!;
      const entry = lessonEntry(first.id);
      await startLesson(app, first.id);
      // the plant is shown beside the program (the document of the plant, with its scene panel)
      await app.press('Ctrl+Shift+P');
      await app.type('show the plant');
      await app.until(
        'the palette to list Show the plant',
        async () => (await app.eval<boolean>(`Boolean(document.querySelector('[role="option"][data-command="view.plant"]'))`)) || undefined,
      );
      await app.press('Enter');
      await app.until('the plant document', async () => (await app.visible(css('[data-plant-document]'))) || undefined, 30_000);
      // the starter does not pass: the program does nothing yet
      const before = await check(app);
      assert(before.grade !== 'passed', `The starter of ${first.id} already passes.`);
      // the learner edits the program (the reference solution goes where the program is), Check grades the saved workspace
      writeFileSync(
        join(workspaceOf(root, first.id), entry.starter.program),
        readFileSync(join(packageRoot, 'projects', entry.solution.project, entry.solution.program), 'utf8'),
      );
      const after = await check(app);
      assert(after.grade === 'passed', `Check of ${first.id} grades "${after.grade}": ${after.status}`);
    },
  },
  {
    name: 'Q7 Lesson 19.1: the scene is built in the editor, Check names the missing part, then passes',
    example: 'none',
    proves: [],
    partly: ['CRS-004', 'CRS-005', 'CRS-006', 'CRS-012'],
    run: async (app, { root }) => {
      const id = 'plant-build-belt-scene';
      const entry = lessonEntry(id);
      const folder = workspaceOf(root, id);
      await startLesson(app, id);
      // the starter scene is an empty floor: Check says a part is missing, with the code of the diagnostic
      const missing = await check(app);
      assert(
        missing.grade !== 'passed' && missing.status.includes('SCENE_FACT_UNKNOWN'),
        `Check of the starter says: ${JSON.stringify(missing)}`,
      );
      // the scene is built in the editor, with the names of the lesson, and saved to the project
      await openEmptyFloorInLesson(app);
      await app.click(css('[data-plant-edit-scene]'), 'Edit scene');
      await app.until('the plant editor', async () => (await app.visible(css('[data-plant-editor]'))) || undefined);
      await addPart(app, 'keyboard', 'Belt conveyor');
      await addPart(app, 'keyboard', 'Item emitter');
      await addPart(app, 'keyboard', 'Diffuse optical sensor');
      await addPart(app, 'keyboard', 'Push button');
      const ids = await parts(app);
      await placePart(app, 'keyboard', ids[0]!, { name: 'Belt1', x: 0, z: 0 });
      await placePart(app, 'keyboard', ids[1]!, { name: 'Emitter1', x: -0.9, z: 0 });
      await placePart(app, 'keyboard', ids[2]!, { name: 'EyeFar', x: 0.7, z: -0.5, rotation: 270 });
      await placePart(app, 'keyboard', ids[3]!, { name: 'StartButton', x: -0.9, z: -0.7 });
      await bindSignals(app, 'keyboard', 4);
      await app.click(css('[data-plant-edit-done]'), 'Done editing');
      await app.click(css('[data-plant-save-scene]'), 'Save to project');
      await fill(app, 'keyboard', 'Scene name', 'built');
      await app.click(css('[data-plant-save-confirm]'), 'Save');
      const saved = join(folder, 'scenes', 'built.scene.json');
      const savedMap = join(folder, 'scenes', 'built.plant-map.json');
      await app.until('the scene and its map saved in the project', () => (existsSync(saved) && existsSync(savedMap)) || undefined);
      const built = JSON.parse(readFileSync(saved, 'utf8')) as { parts: { name: string }[] };
      assert(
        ['Belt1', 'Emitter1', 'EyeFar', 'StartButton'].every((name) => built.parts.some((part) => part.name === name)),
        'The saved scene lacks a part of the lesson.',
      );
      // Gap 1 (reported): the editor saves to scenes/<name>.scene.json, and the Files tree does not list the project root, so a learner
      // cannot put the scene where the Check reads it (scene.json and plant-map.json). The journey moves the files itself.
      app.note(
        'The saved scene is copied to scene.json and plant-map.json by the journey: the editor cannot write the files the Check reads.',
      );
      writeFileSync(join(folder, 'scene.json'), readFileSync(saved, 'utf8'));
      writeFileSync(join(folder, 'plant-map.json'), readFileSync(savedMap, 'utf8'));
      writeFileSync(
        join(folder, entry.starter.program),
        readFileSync(join(packageRoot, 'projects', entry.solution.project, entry.solution.program), 'utf8'),
      );
      // Gap 2 (reported): creating scenes/ changes the ctime of the workspace root, which the workspace gateway compares with the one it
      // registered, so the Check refuses ("did not finish") until the workspace is opened again. The journey opens it again.
      const first = await check(app);
      if (first.grade !== 'passed') {
        assert(first.status.includes('did not finish'), `Check of the built scene says: ${JSON.stringify(first)}`);
        app.note('Check refuses once scenes/ exists (the workspace root changed); the journey opens the lesson again.');
        await startLesson(app, id);
      }
      const after = first.grade === 'passed' ? first : await check(app);
      assert(after.grade === 'passed', `Check of the built scene grades "${after.grade}": ${after.status}`);
    },
  },
);
