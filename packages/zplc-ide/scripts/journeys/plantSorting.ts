/**
 * The sorting journeys of Task Q5 (spec 012: VIS-010, VIS-011, VIS-008, PLT-008, SCN-004). The first runs scene 20 (weight sorting),
 * waits for a sorted item and then triggers `readingOffset` on the scale with the keyboard alone (the arrow keys only choose, Tab
 * reaches the trigger button, Enter acts); the second opens scene 21 (vision sorting) and checks that the vision readout shows a code while
 * the live region stays
 * quiet. Like the
 * other plant journeys they run on the development host and give no timing evidence.
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
const DESCRIBE =
  `(el) => el.getAttribute('aria-label') ?? [...el.attributes].filter((a) => a.name.startsWith('data-plant-')).map((a) => a.name + '=' + ` +
  `a.value).join(' ') ?? el.textContent.trim().slice(0, 30)`;
const NAME = `(d, el) => d(el) || el.tagName + ':' + el.textContent.trim().slice(0, 30)`;

/** The enabled, focusable controls of the operate panel in document order. */
const controls = (app: App) =>
  app.eval<string[]>(
    `(() => { const d = ${DESCRIBE}; const n = ${NAME}; return [...document.querySelector('${OPERATE}').querySelectorAll('input, select, ` +
      `button, [tabindex]')].filter((el) => !el.disabled && el.tabIndex >= 0).map((el) => n(d, el)); })()`,
  );

/** Focus the first control of the panel, then Tab through it; returns what held focus at each step. */
async function walkTab(app: App, count: number): Promise<string[]> {
  await app.eval(`document.querySelector('${OPERATE}').querySelector('input, select, button:not([disabled]), [tabindex]').focus()`);
  const seen: string[] = [];
  for (let i = 0; i < count; i++) {
    seen.push(
      await app.eval<string>(
        `(() => { const d = ${DESCRIBE}; const n = ${NAME}; const el = document.activeElement; ` +
          `return document.querySelector('${OPERATE}').contains(el) ? n(d, el) : 'OUTSIDE'; })()`,
      ),
    );
    await app.press('Tab');
  }
  return seen;
}

const readout = (app: App) => app.eval<string>(`document.querySelector('[data-plant-reading="Vision1"]')?.textContent.trim() ?? ''`);
/** The total of every `<bin> <verb> <n> item(s)` sentence of the facts text; 0 until the text says one. */
const total = (facts: string, verb: string): number =>
  [...facts.matchAll(new RegExp(`${verb} (\\d+) items?`, 'g'))].reduce((sum, match) => sum + Number(match[1]), 0);

/** `app.until` that names the plant facts when it times out, so a failure carries its evidence. */
async function untilFacts<T>(app: App, what: string, check: () => Promise<T | undefined | false>, ms = 30_000): Promise<T> {
  try {
    return await app.until(what, async () => (await check()) || undefined, ms);
  } catch (error) {
    throw new Error(`${(error as Error).message}; facts: ${await plantFacts(app)}; readout: ${await readout(app)}`);
  }
}

export const journeysSorting: Journey[] = [
  {
    name: 'Q5 A reading offset is triggered by keyboard on the weight sorting scale and an item is misrouted',
    example: 'none',
    proves: [],
    partly: ['VIS-010', 'VIS-011', 'SCN-004'],
    run: async (app, { root }) => {
      await openScene(app, root, 'weight-sorting');
      await runInSimulation(app);
      // Tab reaches every enabled operate control, in the order of the page, and the order is the same the second time
      const expected = await controls(app);
      for (const marker of ['data-plant-press=StartButton', 'data-plant-fault=Scale1', 'data-plant-fault=Pusher1', 'data-plant-add-item'])
        assert(
          expected.some((name) => name.includes(marker)),
          `${marker} is not among the focusable controls: ${JSON.stringify(expected)}.`,
        );
      const first = await walkTab(app, expected.length);
      const second = await walkTab(app, expected.length);
      app.note(`Tab order of the operate panel of scene 20: ${JSON.stringify(first)}`);
      assert(
        JSON.stringify(first) === JSON.stringify(expected),
        `Tab visits ${JSON.stringify(first)}, the page order is ${JSON.stringify(expected)}.`,
      );
      assert(
        JSON.stringify(second) === JSON.stringify(first),
        `The Tab order changed: ${JSON.stringify(first)} then ${JSON.stringify(second)}.`,
      );
      await holdPushButton(app, 'StartButton', 'keyboard');
      await untilFacts(app, 'an item to be sorted', async () => total(await plantFacts(app), 'sorted') >= 1, 90_000);
      assert(total(await plantFacts(app), 'received') === 0, 'An item was misrouted before any fault.');
      // the arrow keys only choose: readingOffset is the second action of the scale, and nothing fires until the button
      await app.eval(`document.querySelector('[data-plant-fault="Scale1"]').focus()`);
      for (let step = 0; step < 2; step++) await app.press('ArrowDown');
      const chosen = await app.eval<string>(`document.querySelector('[data-plant-fault="Scale1"]').value`);
      assert(chosen === 'readingOffset', `The arrow keys chose "${chosen}", not readingOffset.`);
      assert(total(await plantFacts(app), 'received') === 0, 'A fault fired while the action was only being chosen.');
      await app.press('Tab');
      const focused = await app.eval<string>(`document.activeElement.getAttribute('data-plant-fault-trigger') ?? ''`);
      assert(focused === 'Scale1', `Tab from the select reached "${focused}", not the Scale1 trigger button.`);
      await app.press('Enter');
      // a 2 kg item reads 4 kg with the offset and goes to the heavy bin: the misrouted fact appears in the live text
      await untilFacts(app, 'an item to be misrouted', async () => total(await plantFacts(app), 'received') >= 1, 120_000);
    },
  },
  {
    name: 'Q5 The vision readout shows a code and the live region stays quiet while it changes',
    example: 'none',
    proves: [],
    partly: ['VIS-010', 'VIS-011', 'VIS-008'],
    run: async (app, { root }) => {
      await openScene(app, root, 'vision-sorting');
      await runInSimulation(app);
      const shape = /^Vision1: code \d$/;
      const first = await untilFacts(app, 'the vision readout', async () => shape.test(await readout(app)) && (await readout(app)));
      app.note(`Vision readout: ${first}`);
      await app.eval(
        `(() => { window.__live = []; const region = document.querySelector('[data-live-region="polite"]'); ` +
          `new MutationObserver(() => { const text = region.textContent.trim(); if (text) window.__live.push(text); })` +
          `.observe(region, { childList: true, characterData: true, subtree: true }); })()`,
      );
      await holdPushButton(app, 'StartButton', 'keyboard');
      // The readout moves with every item that crosses the camera, and no announcement may carry a code (VIS-008: a continuous
      // value never enters the announced key). The host's own pacing notice ("the plant cannot keep up") is not a fact and is skipped.
      const readings = new Set<string>();
      let heard: string[] = [];
      await untilFacts(
        app,
        'the readout to show a code and two different readings and the live region to announce a fact',
        async () => {
          readings.add(await readout(app));
          heard = (await app.eval<string[]>('window.__live')).filter((message) => !/keep up|keeps up/.test(message));
          for (const message of heard) assert(!/\bcode \d/.test(message), `An announcement carries a code: ${message}`);
          return readings.size >= 2 && [...readings].some((text) => !text.endsWith('code 0')) && heard.length >= 1;
        },
        150_000,
      );
      const stretch = [...readings];
      app.note(
        `the vision sensor read ${stretch.length} different values (${stretch.join(
          ' | ',
        )}) and no announcement of ${heard.length} carried a code`,
      );
    },
  },
];
