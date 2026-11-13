/**
 * The operator-panel journeys of Task Q3 (spec 012: VIS-010, VIS-011, SCN-004). The first drives scene 12 (a numeric level control)
 * with the keyboard alone; the second drives scene 3 (a timed tank) and stops its sequence with the emergency stop by keyboard.
 * Like the other plant journeys they run on the development host and give no timing evidence.
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
    throw new Error(
      `${(error as Error).message}; facts: ${await plantFacts(app)}; lamps: ${await lamp(app, 'red')} ${await lamp(app, 'amber')}`,
    );
  }
}

const level = (facts: string): number => {
  const match = /Tank1 level (\d+) percent/.exec(facts);
  assert(match, `The plant facts carry no level: ${facts}`);
  return Number(match[1]);
};
const pressedOf = (app: App, selector: string) =>
  app.eval<string | null>(`document.querySelector('${selector}')?.getAttribute('aria-pressed') ?? null`);
const lamp = (app: App, which: string) =>
  app.eval<string>(`document.querySelector('[data-plant-stack] [data-lamp="${which}"]')?.textContent.trim() ?? ''`);

export const journeysOperator: Journey[] = [
  {
    name: 'Q3 A numeric scene is run from the keyboard: the set point by arrow keys, and Tab reaches every operate control',
    example: 'none',
    proves: [],
    partly: ['VIS-010', 'VIS-011', 'SCN-004'],
    run: async (app, { root }) => {
      await openScene(app, root, 'tank-level-control');
      await runInSimulation(app);
      const initial = level(await plantFacts(app));
      // the SetPoint slider takes the keyboard focus and the arrow keys; the program fills the tank towards the new set point
      const slider = '[data-plant-pot="SetPoint"]';
      assert(
        await app.eval<boolean>(`document.querySelector('${slider}')?.tagName === 'INPUT'`),
        'The SetPoint slider is not a native input.',
      );
      await app.eval(`document.querySelector('${slider}').focus()`);
      for (let i = 0; i < 30; i++) await app.press('ArrowRight');
      const value = Number(await app.eval<string>(`document.querySelector('${slider}').value`));
      assert(value > 0.05, `Thirty arrow presses left the SetPoint at ${value}.`);
      const raised = await untilFacts(
        app,
        'the level fact to rise towards the new set point',
        async () => {
          const now = level(await plantFacts(app));
          return now > initial + 5 && now;
        },
        60_000,
      );
      assert(raised > initial, `The level did not rise: ${initial} then ${raised}.`);
      // Tab reaches every enabled operate control, in the order of the page, and the order is the same the second time
      const expected = await controls(app);
      assert(expected.length >= 4, `The operate panel offers only ${JSON.stringify(expected)}.`);
      for (const marker of ['data-plant-pot=SetPoint', 'data-plant-pot=DrainPot', 'data-plant-add-item'])
        assert(
          expected.some((name) => name.includes(marker)),
          `${marker} is not among the focusable controls: ${JSON.stringify(expected)}.`,
        );
      const first = await walkTab(app, expected.length);
      const second = await walkTab(app, expected.length);
      app.note(`Tab order of the operate panel: ${JSON.stringify(first)}`);
      assert(
        JSON.stringify(first) === JSON.stringify(expected),
        `Tab visits ${JSON.stringify(first)}, the page order is ${JSON.stringify(expected)}.`,
      );
      assert(
        JSON.stringify(second) === JSON.stringify(first),
        `The Tab order changed: ${JSON.stringify(first)} then ${JSON.stringify(second)}.`,
      );
    },
  },
  {
    name: 'Q3 The emergency stop is operated from the keyboard and the timed tank sequence stops',
    example: 'none',
    proves: [],
    partly: ['VIS-010', 'VIS-011', 'SCN-004'],
    run: async (app, { root }) => {
      await openScene(app, root, 'timed-tank');
      await runInSimulation(app);
      const stop = '[data-plant-estop="EStop1"]';
      assert((await pressedOf(app, stop)) === 'false', `The emergency stop starts as aria-pressed=${await pressedOf(app, stop)}.`);
      assert((await lamp(app, 'red')).startsWith('○'), `The red lamp is lit before anything happened: ${await lamp(app, 'red')}.`);
      await holdPushButton(app, 'StartButton', 'keyboard');
      await untilFacts(app, 'the cycle to start (amber lamp on)', () => amberOn(app));
      // Space on the focused toggle presses the emergency stop
      await app.eval(`document.querySelector('${stop}').focus()`);
      await app.press('Space');
      await app.until('the toggle to report pressed', async () => (await pressedOf(app, stop)) === 'true' || undefined);
      await app.until('the red lamp to light', async () => (await lamp(app, 'red')).startsWith('●') || undefined, 30_000);
      await app.until('the sequence to stop (amber off)', async () => !(await amberOn(app)) || undefined, 30_000);
      // Enter releases it again
      await app.press('Enter');
      await app.until('the toggle to report released', async () => (await pressedOf(app, stop)) === 'false' || undefined);
    },
  },
];

const amberOn = async (app: App) => (await lamp(app, 'amber')).startsWith('●');
