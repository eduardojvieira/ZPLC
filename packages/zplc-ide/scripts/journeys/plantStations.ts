/**
 * The station journeys of Task Q6 (spec 012: VIS-010, VIS-011, VIS-008, SCN-004). The first runs scene 11 (three level lifts), waits for
 * a delivered box, triggers `levelStuckOff` on lift A with the keyboard alone (Tab to the fault select, the arrow keys choose, Tab to
 * the trigger button, Enter acts) and stops the plant program with the emergency stop, also by keyboard; the second opens scene 7
 * (stacker crane) and checks that the crane readout shows a bay and a level while the live region stays quiet. Like the other plant
 * journeys they run on the development host and give no timing evidence.
 */
import { join } from 'node:path';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import { holdPushButton, openPlantDocument, plantFacts, runInSimulation, shippedSceneProject, writeSceneProject } from './plantSupport';

async function openScene(app: App, root: string, id: string) {
  const scene = shippedSceneProject(id);
  app.answer(writeSceneProject(join(root, `plant-${id}`), scene));
  await app.click(button('Open project', 'contains'), 'the Open project button');
  await app.until('the project workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
  await openPlantDocument(app, scene);
}

const OPERATE = '[data-plant-operate]';
const active = (app: App, marker: string) => app.eval<boolean>(`document.activeElement?.hasAttribute(${JSON.stringify(marker)}) ?? false`);
const activeIs = (app: App, attribute: string, value: string) =>
  app.eval<boolean>(`document.activeElement?.getAttribute(${JSON.stringify(attribute)}) === ${JSON.stringify(value)}`);

/** The code editor keeps Tab as a character; Ctrl+M (Tab focus mode) is the way out when the walk starts there. */
async function leaveEditor(app: App): Promise<void> {
  if (await app.eval<boolean>(`Boolean(document.activeElement?.closest('.monaco-editor'))`)) await app.press('Ctrl+M');
}

/** Presses Tab (or Shift+Tab) until the focused element carries `attribute=value`; names the path walked when it never does. */
async function tabTo(app: App, attribute: string, value: string, key = 'Tab'): Promise<void> {
  const seen: string[] = [];
  for (let step = 0; step < 30; step++) {
    if (await activeIs(app, attribute, value)) return;
    seen.push(
      await app.eval<string>(
        `(() => { const el = document.activeElement; return el ? el.tagName + ':' + ([...el.attributes].filter((a) => ` +
          `a.name.startsWith('data-plant-')).map((a) => a.name + '=' + a.value).join(' ') || ` +
          `el.textContent.trim().slice(0, 20)) : 'none'; })()`,
      ),
    );
    await app.press(key);
  }
  throw new Error(`${key} never reached ${attribute}=${value}: ${JSON.stringify(seen)}`);
}

/** `app.until` that names the plant facts when it times out, so a failure carries its evidence. */
async function untilFacts<T>(app: App, what: string, check: () => Promise<T | undefined | false>, ms = 30_000): Promise<T> {
  try {
    return await app.until(what, async () => (await check()) || undefined, ms);
  } catch (error) {
    throw new Error(`${(error as Error).message}; facts: ${await plantFacts(app)}`);
  }
}

const delivered = (facts: string): number => Number(/Delivered at \w+: (\d+)/.exec(facts)?.[1] ?? 0);
const lamp = (app: App, which: string) =>
  app.eval<string>(`document.querySelector('[data-plant-stack] [data-lamp="${which}"]')?.textContent.trim() ?? ''`);
const crane = (app: App) => app.eval<string>(`document.querySelector('[data-plant-station="Crane1"]')?.textContent.trim() ?? ''`);

export const journeysStations: Journey[] = [
  {
    name: 'Q6 A level sensor fault is triggered by keyboard on lift A and the emergency stop by keyboard stops the plant program',
    example: 'none',
    proves: [],
    partly: ['VIS-010', 'VIS-011', 'SCN-004'],
    run: async (app, { root }) => {
      await openScene(app, root, 'three-level-lifts');
      await runInSimulation(app);
      await holdPushButton(app, 'StartButton', 'keyboard');
      await untilFacts(app, 'a box to be delivered', async () => delivered(await plantFacts(app)) >= 1, 120_000);
      // Tab from the first control of the panel to the fault select of lift A; the arrow keys only choose
      await app.eval(`document.querySelector('${OPERATE}').querySelector('[data-plant-press]').focus()`);
      await leaveEditor(app);
      await tabTo(app, 'data-plant-fault', 'LiftA');
      const options = await app.eval<string[]>(`[...document.activeElement.options].map((o) => o.value)`);
      const target = options.indexOf('levelStuckOff');
      assert(target > 0, `The fault select of lift A offers ${JSON.stringify(options)}, no levelStuckOff.`);
      for (let step = 0; step < target; step++) await app.press('ArrowDown');
      const chosen = await app.eval<string>(`document.activeElement.value`);
      assert(chosen === 'levelStuckOff', `The arrow keys chose "${chosen}", not levelStuckOff.`);
      await app.press('Tab');
      assert(await activeIs(app, 'data-plant-fault-trigger', 'LiftA'), 'Tab from the select did not reach the LiftA trigger button.');
      await app.press('Enter');
      // the trigger acted: the choice is cleared and the button is disabled again
      await untilFacts(
        app,
        'the fault choice to be consumed',
        async () => (await app.eval<string>(`document.querySelector('[data-plant-fault="LiftA"]').value`)) === '',
      );
      // back to the emergency stop with Shift+Tab, and Enter presses it
      await tabTo(app, 'data-plant-estop', 'EStop1', 'Shift+Tab');
      assert(await active(app, 'data-plant-estop'), 'Focus is not on the emergency stop.');
      await app.press('Enter');
      await untilFacts(app, 'the red lamp to light', async () => (await lamp(app, 'red')).startsWith('●'), 30_000);
      const held = delivered(await plantFacts(app));
      await Bun.sleep(3_000);
      assert(delivered(await plantFacts(app)) === held, 'A box was delivered after the emergency stop.');
      assert(
        (await app.eval<string>(`document.querySelector('[data-plant-estop="EStop1"]').getAttribute('aria-pressed')`)) === 'true',
        'The emergency stop does not report pressed.',
      );
    },
  },
  {
    name: 'Q6 The crane readout shows a bay and a level and the live region stays quiet while it changes',
    example: 'none',
    proves: [],
    partly: ['VIS-010', 'VIS-011', 'VIS-008'],
    run: async (app, { root }) => {
      await openScene(app, root, 'stacker-crane-warehouse');
      await runInSimulation(app);
      const shape = /^Stacker crane Crane1: bay \d+, level \d+, fork \w+$/;
      const first = await untilFacts(app, 'the crane readout', async () => shape.test(await crane(app)) && (await crane(app)));
      app.note(`Crane readout: ${first}`);
      await app.eval(
        `(() => { window.__live = []; const region = document.querySelector('[data-live-region="polite"]'); ` +
          `new MutationObserver(() => { const text = region.textContent.trim(); if (text) window.__live.push(text); })` +
          `.observe(region, { childList: true, characterData: true, subtree: true }); })()`,
      );
      await holdPushButton(app, 'StartButton', 'keyboard');
      await holdPushButton(app, 'Req2', 'keyboard');
      const readings = new Set<string>();
      await untilFacts(
        app,
        'the crane readout to change',
        async () => {
          readings.add(await crane(app));
          const heard = (await app.eval<string[]>('window.__live')).filter((message) => !/keep up|keeps up/.test(message));
          for (const message of heard) assert(!/\b(bay|level) \d/.test(message), `An announcement carries the crane readout: ${message}`);
          return readings.size >= 2;
        },
        90_000,
      );
      for (const text of readings) assert(shape.test(text), `The crane readout lost its shape: ${text}`);
      app.note(`the crane read ${readings.size} different values (${[...readings].join(' | ')}) and no announcement carried one`);
    },
  },
];
