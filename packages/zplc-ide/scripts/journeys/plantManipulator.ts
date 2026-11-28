/**
 * The manipulator journeys of Task Q4 (spec 012: VIS-010, VIS-011, PLT-008, SCN-004). The first runs scene 14 (a pick and place
 * between belts), waits for the first box to be placed and then triggers the `dropLoad` fault on the pick and place with the keyboard
 * alone; the second opens scene 15 (a gantry) and checks that its readout is a text that follows the move while the live region stays
 * quiet. Like the other plant journeys they run on the development host and give no timing evidence.
 */
import { join } from 'node:path';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import { chooseByKeys } from '../journeyKeys';
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
/** A readable name for the focused element: its accessible label, else its `data-plant-*` marker, else its text. */
const DESCRIBE =
  `(el) => el.getAttribute('aria-label') ?? [...el.attributes].filter((a) => a.name.startsWith('data-plant-')).map((a) => a.name + '=' + ` +
  `a.value).join(' ') ` +
  `?? el.textContent.trim().slice(0, 30)`;

/** The enabled, focusable controls of the operate panel in document order. */
const controls = (app: App) =>
  app.eval<string[]>(
    `(() => { const d = ${DESCRIBE}; return [...document.querySelector('${OPERATE}').querySelectorAll('input, select, button, ` +
      `[tabindex]')]` +
      `.filter((el) => !el.disabled && el.tabIndex >= 0).map((el) => d(el) || el.tagName + ':' + el.textContent.trim().slice(0, 30)); })()`,
  );

/** Focus the first control of the panel, then Tab through it; returns what held focus at each step. */
async function walkTab(app: App, count: number): Promise<string[]> {
  await app.eval(`document.querySelector('${OPERATE}').querySelector('input, select, button:not([disabled]), [tabindex]').focus()`);
  const seen: string[] = [];
  for (let i = 0; i < count; i++) {
    seen.push(
      await app.eval<string>(
        `(() => { const d = ${DESCRIBE}; const el = document.activeElement; ` +
          `return document.querySelector('${OPERATE}').contains(el) ? (d(el) || el.tagName + ':' + el.textContent.trim().slice(0, 30)) : ` +
          `'OUTSIDE'; })()`,
      ),
    );
    await app.press('Tab');
  }
  return seen;
}

/** `app.until` that names the plant facts when it times out, so a failure carries its evidence. */
async function untilFacts<T>(app: App, what: string, check: () => Promise<T | undefined | false>, ms = 30_000): Promise<T> {
  try {
    return await app.until(what, async () => (await check()) || undefined, ms);
  } catch (error) {
    throw new Error(`${(error as Error).message}; facts: ${await plantFacts(app)}; readout: ${await readout(app)}`);
  }
}

const readout = (app: App) => app.eval<string>(`document.querySelector('[data-plant-manipulator]')?.textContent.trim() ?? ''`);
/** The count of a `<name> <fact>: <n>.` sentence of the facts text, or undefined until the text says it. */
const count = (facts: string, sentence: string): number | undefined => {
  const match = new RegExp(`${sentence}: (\\d+)\\.`).exec(facts);
  return match ? Number(match[1]) : undefined;
};

export const journeysManipulator: Journey[] = [
  {
    name: 'Q4 A fault is triggered by keyboard on a pick and place and the drops fact changes',
    example: 'none',
    proves: [],
    partly: ['VIS-010', 'VIS-011', 'PLT-008', 'SCN-004'],
    run: async (app, { root }) => {
      await openScene(app, root, 'belt-to-belt-transfer');
      await runInSimulation(app);
      // Tab reaches every enabled operate control, in the order of the page, and the order is the same the second time
      const expected = await controls(app);
      for (const marker of ['data-plant-press=StartButton', 'data-plant-fault=Pick1', 'data-plant-add-item'])
        assert(
          expected.some((name) => name.includes(marker)),
          `${marker} is not among the focusable controls: ${JSON.stringify(expected)}.`,
        );
      const first = await walkTab(app, expected.length);
      const second = await walkTab(app, expected.length);
      app.note(`Tab order of the operate panel of scene 14: ${JSON.stringify(first)}`);
      assert(
        JSON.stringify(first) === JSON.stringify(expected),
        `Tab visits ${JSON.stringify(first)}, the page order is ${JSON.stringify(expected)}.`,
      );
      assert(
        JSON.stringify(second) === JSON.stringify(first),
        `The Tab order changed: ${JSON.stringify(first)} then ${JSON.stringify(second)}.`,
      );
      // the first box is placed by the program
      await holdPushButton(app, 'StartButton', 'keyboard');
      await untilFacts(app, 'the first box to be placed', async () => (count(await plantFacts(app), 'Pick1 placed') ?? 0) >= 1, 90_000);
      const before = count(await plantFacts(app), 'Pick1 drops');
      assert(before === 0, `The pick and place had dropped ${before} boxes before any fault.`);
      // a second cycle: when the pick and place holds a box, choose dropLoad in its fault select and trigger it with the keyboard
      await holdPushButton(app, 'StartButton', 'keyboard');
      await untilFacts(app, 'the pick and place to hold a box', async () => (await readout(app)).endsWith('holding'), 90_000);
      // the arrow keys only choose: dropLoad is the fourth action after stuckX, stuckY and gripFail, and nothing fires until the button
      await app.eval(`document.querySelector('[data-plant-fault="Pick1"]').focus()`);
      await chooseByKeys(app, `document.querySelector('[data-plant-fault="Pick1"]')`, 4, async () => {
        for (let step = 0; step < 4; step++) await app.press('ArrowDown');
      });
      const chosen = await app.eval<string>(`document.querySelector('[data-plant-fault="Pick1"]').value`);
      assert(chosen === 'dropLoad', `The arrow keys chose "${chosen}", not dropLoad.`);
      assert(count(await plantFacts(app), 'Pick1 drops') === 0, 'A fault fired while the action was only being chosen.');
      await app.press('Tab');
      await app.press('Enter');
      const after = await untilFacts(app, 'the drops fact to change', async () => {
        const drops = count(await plantFacts(app), 'Pick1 drops') ?? 0;
        return drops >= 1 ? drops : undefined;
      });
      assert(after >= 1, `The drops fact is ${after} after the fault.`);
    },
  },
  {
    name: 'Q4 The gantry readout follows a move and the live region stays quiet while it moves',
    example: 'none',
    proves: [],
    partly: ['VIS-010', 'VIS-011', 'PLT-008', 'SCN-004'],
    run: async (app, { root }) => {
      await openScene(app, root, 'three-axis-palletizing');
      await runInSimulation(app);
      const shape = /^Gantry1: X \d+\.\d\d m, Y \d+\.\d\d m, Z \d+\.\d\d m, (empty|holding)$/;
      const first = await untilFacts(app, 'the gantry readout', async () => shape.test(await readout(app)) && (await readout(app)));
      app.note(`Gantry readout: ${first}`);
      // record every message of the polite live region from here on
      await app.eval(
        `(() => { window.__live = []; const region = document.querySelector('[data-live-region="polite"]'); ` +
          `new MutationObserver(() => { const text = region.textContent.trim(); if (text) window.__live.push(text); })` +
          `.observe(region, { childList: true, characterData: true, subtree: true }); })()`,
      );
      await holdPushButton(app, 'StartButton', 'keyboard');
      // A stretch is a run of samples whose facts do not change (item positions apart: they are text, never part of the announced key)
      // while the gantry moves. The live region must stay silent for the whole stretch.
      let facts = '';
      let positions = new Set<string>();
      let spoken = 0;
      let sample = 0;
      const stretch = await untilFacts(
        app,
        'the gantry to move through six positions with the situation unchanged',
        async () => {
          const now = await readout(app);
          assert(shape.test(now), `The readout is not a position text: ${now}`);
          const said = await app.eval<string[]>('window.__live');
          for (const message of said) assert(!/\bX \d+\.\d\d m\b/.test(message), `An announcement carries an axis position: ${message}`);
          const situation = (await plantFacts(app)).replace(/ Item [^.]*\./g, '');
          if (situation !== facts) {
            facts = situation;
            positions = new Set();
            sample = 0;
          }
          sample += 1;
          if (sample === 2) spoken = said.length; // the announcement of the change itself has been heard by now
          if (sample > 2) positions.add(now.replace(/, (empty|holding)$/, ''));
          assert(
            sample <= 2 || said.length === spoken,
            `The live region spoke ${said.length - spoken} times while only the gantry moved: ${now}`,
          );
          return positions.size >= 6 && [...positions];
        },
        90_000,
      );
      app.note(`quiet while the gantry showed ${stretch.length} positions, for example ${stretch.slice(0, 2).join(' | ')}`);
    },
  },
];
