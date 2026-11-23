import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';

const rowText = (app: App, path: string) =>
  app.eval<string>(`document.querySelector('[data-test-row=${JSON.stringify(path)}]')?.textContent ?? ''`);

async function openTests(app: App, project: string): Promise<void> {
  app.answer(project);
  await app.click(button('Open project', 'contains'), 'the Open project button');
  await app.until('the workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
  await app.click(css('[data-activity="tests"]'), 'the Tests activity');
}

/** Journeys of task U2-T4 (plan-u2.md): Replay from a result, the test commands and New test. */
export const journeysU2T4: Journey[] = [
  {
    name: 'U2-T4 A result with a recorded plant offers Replay and it opens the plant document in replay',
    example: 'conveyor_01',
    proves: ['TST-007'],
    partly: [],
    run: async (app, { project }) => {
      await openTests(app, project);
      await app.until('the tests in the list', async () => (await app.visible(css('[data-test-row]'))) || undefined);
      await app.click(button('Run Conveyor01'), 'Run of the first test');
      await app.until(
        'the first test to pass',
        async () => ((await rowText(app, 'tests/conveyor-01.scenario.json')).includes('Passed') ? true : undefined),
        40_000,
      );
      await app.click(css('#console-tab-tests'), 'the Tests tab of the results panel');
      await app.click(button('Replay'), 'Replay of the result');
      await app.until('the plant document', async () => (await app.visible(css('[data-plant-document]'))) || undefined);
      await app.until('the replay heading', async () => (await app.visible(css('[data-plant-replay]'))) || undefined);
      assert(
        (await app.eval<string>(`document.querySelector('[data-plant-replay]')?.textContent ?? ''`)) === 'Replay',
        'The plant document should say Replay in its heading',
      );
      assert(
        await app.eval<boolean>(`Boolean(document.querySelector('[data-plant-document] input[type="range"]'))`),
        'The replay should have a timeline',
      );
      assert(
        !(await app.eval<boolean>(
          `[...document.querySelectorAll('[data-plant-document] button')].some((b) => /^(Run|Stop)$/.test(b.textContent ?? ''))`,
        )),
        'The replay should have no run controls',
      );
    },
  },
  {
    name: 'U2-T4 Run all tests runs from its shortcut',
    example: 'conveyor_01',
    proves: ['TST-010'],
    partly: [],
    run: async (app, { project }) => {
      await openTests(app, project);
      await app.until('the tests in the list', async () => (await app.visible(css('[data-test-row]'))) || undefined);
      // the focus is on the rail, not in an editor: the shortcut is the registry's
      await app.press('Ctrl+Alt+T');
      await app.until(
        'a test to have a result after the shortcut',
        async () => {
          const rows = await app.eval<string[]>(`[...document.querySelectorAll('[data-test-row]')].map((row) => row.textContent ?? '')`);
          return rows.some((row) => /Passed|Failed/.test(row)) || undefined;
        },
        60_000,
      );
    },
  },
  {
    name: 'U2-T4 New test writes a valid test in a new tests folder, opens it, and it passes',
    example: 'multitask_demo',
    proves: ['TST-009'],
    partly: [],
    run: async (app, { project }) => {
      await openTests(app, project);
      assert(!existsSync(join(project, 'tests')), 'The example should start with no tests folder');
      await app.click(button('New test'), 'New test');
      const file = join(project, 'tests', 'FastBlink.scenario.json');
      await app.until('the test file in the project', async () => (existsSync(file) ? true : undefined));
      type Scenario = { id: string; expectations: Array<{ condition: Record<string, boolean> }> };
      const scenario = JSON.parse(readFileSync(file, 'utf8')) as Scenario;
      assert(scenario.id === 'FastBlink', `The test should be named after the program, it is: ${scenario.id}`);
      const signal = Object.keys(scenario.expectations[0]?.condition ?? {})[0] ?? '';
      assert(signal.startsWith('FastBlink.'), `The expectation should name an output of the program, it names: ${signal}`);
      await app.until(
        'the new test open in the editor',
        async () =>
          (await app.eval<boolean>(
            `(document.querySelector('[role="tab"][aria-selected="true"][id^="editor-tab-"]')?.textContent ?? '')` +
              `.includes('FastBlink.scenario.json')`,
          )) || undefined,
      );
      await app.until('the test in the list', async () => (await app.visible(css('[data-test-row]'))) || undefined);
      await app.click(button('Run FastBlink'), 'Run of the new test');
      await app.until(
        'the new test to pass',
        async () => ((await rowText(app, 'tests/FastBlink.scenario.json')).includes('Passed') ? true : undefined),
        40_000,
      );
    },
  },
];
