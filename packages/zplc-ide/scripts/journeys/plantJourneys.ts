/**
 * The plant journeys of Task Q2 (spec 012: VIS-006, VIS-009, VIS-010, SCN-014). They run on the development host like every journey
 * of `journeys.ts`, which has no GPU: what needs a graphics context (a forced context loss, the camera by keyboard, the palette of
 * each display mode in 3D) is measured by `scripts/plant/bench.ts` on software GL and on a real window, never here.
 * These journeys give no timing evidence.
 */
import { join } from 'node:path';
import { assert } from '../run-desktop-smoke';
import { button, css, notPossible, type App } from '../journeyApp';
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

/** The project of a shipped scene, open in the workbench with the plant document showing. */
async function openScene(app: App, root: string, id: string) {
  const scene = shippedSceneProject(id);
  app.answer(writeSceneProject(join(root, `plant-${id}`), scene));
  await app.click(button('Open project', 'contains'), 'the Open project button');
  await app.until('the project workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
  await openPlantDocument(app, scene);
}

const theme = (app: App, value: 'light' | 'dark' | 'high-contrast') =>
  app.eval(`import('/src/store/useIDEStore.ts').then(({ useIDEStore }) => useIDEStore.getState().setTheme(${JSON.stringify(value)}))`);
const panelColours = (app: App) =>
  app.eval<string>(
    `(() => { const el = document.querySelector('[data-plant-schematic]') ?? document.querySelector('[data-plant-panel]'); const style = ` +
      `getComputedStyle(el); ` +
      `return style.backgroundColor + '|' + style.color + '|' + document.documentElement.dataset.theme; })()`,
  );

export const journeysPlant: Journey[] = [
  {
    name: 'Q2 With no WebGL 2 the plant offers the schematic and the program and plant keep running',
    example: 'none',
    proves: [],
    partly: ['VIS-006'],
    run: async (app, { root }) => {
      await openScene(app, root, SHIPPED.smallest);
      const failure = await app.until(
        'the plant to say the 3D view is unavailable',
        async () =>
          (await app.eval<string | null>(`document.querySelector('[data-plant-failure]')?.getAttribute('data-plant-failure') ?? null`)) ||
          undefined,
        30_000,
      );
      assert(failure === 'unavailable', `The plant reports "${failure}" instead of "unavailable".`);
      assert((await app.text()).includes('WebGL 2 is not available'), 'The message does not say that WebGL 2 is not available.');
      assert((await app.text()).includes('keep running'), 'The message does not say that the program, plant and grading keep running.');
      await app.click(css('[data-plant-show-schematic]'), 'Show the schematic');
      await app.until('the schematic', async () => (await app.visible(css('[data-plant-schematic]'))) || undefined);
      // the program and the plant run: a press of the push button puts an item on the belt
      await runInSimulation(app);
      await holdPushButton(app, 'StartButton', 'pointer');
      await app.until(
        'an item emitted by the running plant',
        async () => (await plantFacts(app)).includes('Emitted: 1') || undefined,
        30_000,
      );
    },
  },
  {
    name: 'Q2 The push button is operated from the keyboard alone',
    example: 'none',
    proves: [],
    partly: ['VIS-010'],
    run: async (app, { root }) => {
      await openScene(app, root, SHIPPED.smallest);
      await runInSimulation(app);
      const before = await plantFacts(app);
      assert(before.includes('Emitted: 0'), `The plant emitted before anyone pressed: ${before}`);
      await holdPushButton(app, 'StartButton', 'keyboard');
      await app.until('an item emitted by the key press', async () => (await plantFacts(app)).includes('Emitted: 1') || undefined, 30_000);
      // the item travels to the sensor and the belt stops there (the reference program of the scene)
      await app.until('the sensor to see the item', async () => /EyeFar: 1 pulses/.test(await plantFacts(app)) || undefined, 30_000);
    },
  },
  {
    name: 'Q2 Each display mode and reduced motion reach the plant panel',
    example: 'none',
    proves: [],
    partly: ['VIS-009'],
    run: async (app, { root }) => {
      await openScene(app, root, SHIPPED.smallest);
      await app.click(css('[data-plant-show-schematic]'), 'Show the schematic');
      await app.until('the schematic', async () => (await app.visible(css('[data-plant-schematic]'))) || undefined);
      const seen = new Map<string, string>();
      for (const mode of ['light', 'dark', 'high-contrast'] as const) {
        await theme(app, mode);
        const colours = await app.until(`the panel to take the ${mode} colours`, async () =>
          (await panelColours(app)).endsWith(`|${mode}`) ? await panelColours(app) : undefined,
        );
        seen.set(mode, colours);
      }
      assert(new Set(seen.values()).size === 3, `The panel looks the same in two display modes: ${JSON.stringify([...seen])}`);
      // reduced motion: the preference is the operating system's; the panel must still work when it is on
      await app.cdp.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      assert(
        await app.eval<boolean>(`matchMedia('(prefers-reduced-motion: reduce)').matches`),
        'The emulated reduced-motion preference did not apply.',
      );
      await runInSimulation(app);
      await holdPushButton(app, 'StartButton', 'keyboard');
      await app.until(
        'the plant to run with reduced motion',
        async () => (await plantFacts(app)).includes('Emitted: 1') || undefined,
        30_000,
      );
    },
  },
  {
    // SCN-014 asks for a path with no pointer from an empty floor to a running scene. The editor panel exists (E3) but "Edit scene" is
    // not wired to it yet (it is disabled while the panel has no handler), so there is nothing to walk. This journey is a known gap
    // in run-journeys.ts until E3b wires the panel; then it asserts the first step of the path and the entry may go.
    name: 'Q2 A scene is built, bound and run from the keyboard alone',
    example: 'none',
    proves: [],
    partly: ['SCN-014'],
    run: async (app, { root }) => {
      await openScene(app, root, SHIPPED.smallest);
      if (!(await app.clickable(css('[data-plant-edit-scene]'))))
        notPossible('"Edit scene" has no editor panel to open yet (E3b wires it).');
      await app.eval(`document.querySelector('[data-plant-edit-scene]').focus()`);
      await app.press('Enter');
      await app.until(
        'the plant editor',
        async () => (await app.visible(css('[role="group"][aria-label]:has([data-part], table)'))) || undefined,
      );
    },
  },
];
