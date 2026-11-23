import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert, MONACO_MODULE } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';

const toolbar = css('[role="toolbar"]');
const rowStatus = (app: App, path: string) =>
  app.eval<string>(`document.querySelector('[data-test-row=${JSON.stringify(path)}]')?.textContent ?? ''`);

/** The journeys of task T3 of the U2 plan (spec 013): the Test results tab and the way from a failed expectation to its place. */
export const journeysU2T3: Journey[] = [
  {
    name: 'U2-T3 Break the program, run all, follow the failed expectation to its scenario step and to its time in the recorded trace',
    example: 'conveyor_01',
    proves: ['TST-003'],
    partly: ['TST-004', 'MSG-003'],
    run: async (app, { project }) => {
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the project workbench to appear', async () => (await app.visible(toolbar)) || undefined);
      await app.click(css('[data-activity="tests"]'), 'the Tests activity');
      await app.until('the tests in the list', async () => (await app.visible(css('[data-test-row]'))) || undefined);

      await app.until(
        'the program in the editor',
        async () =>
          (await app.eval<boolean>(
            `(async () => { const monaco = await ${MONACO_MODULE}; ` +
              `return Boolean(monaco.editor.getEditors()[0]?.getModel()?.getValue().includes('BeltCommand')); })()`,
          )) || undefined,
      );
      // one test passes first, so that breaking the program makes that result older than the sources
      await app.click(button('Run Conveyor01'), 'Run of the first test');
      await app.until(
        'the first test to pass',
        async () => ((await rowStatus(app, 'tests/conveyor-01.scenario.json')).includes('Passed') ? true : undefined),
        30_000,
      );
      // break the program in the editor: the run saves it first
      const broken = await app.eval<boolean>(
        `(async () => { const monaco = await ${MONACO_MODULE}; const model = monaco.editor.getEditors()[0]?.getModel(); ` +
          `if (!model) return false; const text = model.getValue(); const next = text.replace('BeltCommand := Requested AND NOT ` +
          `Faulted;', 'BeltCommand := FALSE;'); model.setValue(next); return next !== text; })()`,
      );
      assert(broken, 'The journey could not edit the program in the editor');
      await app.until('the earlier result to be older than the sources', async () =>
        (await rowStatus(app, 'tests/conveyor-01.scenario.json')).includes('Older than the sources') ? true : undefined,
      );
      await app.click(button('Run all'), 'Run all');
      await app.until(
        'a test to fail on the broken program',
        async () => {
          const rows = await app.eval<string[]>(`[...document.querySelectorAll('[data-test-row]')].map((row) => row.textContent ?? '')`);
          return rows.some((row) => row.includes('Failed')) || undefined;
        },
        40_000,
      );
      assert(
        readFileSync(join(project, 'src', 'Conveyor.st'), 'utf8').includes('BeltCommand := FALSE;'),
        'Running the tests must save the modified program first',
      );

      // the results panel: the verdict, the failed test with what was expected and observed, the boundary once, Details closed
      await app.click(css('#console-tab-tests'), 'the Tests tab of the results panel');
      await app.until('the failed test in the results', async () => (await app.visible(css('[data-test-failure]'))) || undefined, 20_000);
      const verdict = await app.eval<string>(`document.querySelector('[data-test-verdict-sentence]')?.textContent ?? ''`);
      assert(
        /^\d+ of 3 tests passed$/.test(verdict) && !verdict.startsWith('3 of'),
        `The verdict should count the tests, it says: ${verdict}`,
      );
      const failure = await app.eval<string>(`document.querySelector('[data-test-failure]')?.textContent ?? ''`);
      assert(/expected (true|false), observed (true|false|not recorded)/.test(failure), `The failure lacks the values: ${failure}`);
      const at = /at (\d+) ms/.exec(failure)?.[1];
      assert(at !== undefined, `The failure lacks its time: ${failure}`);
      assert((await app.eval<number>(`document.querySelectorAll('[data-boundary-badge]').length`)) === 1, 'The boundary is stated once');
      assert(await app.eval<boolean>(`document.querySelector('details[data-test-details]')?.open === false`), 'Details starts closed');

      // the scenario step: the scenario file is a document of the project, so the editor opens at the step
      await app.click(button('Scenario step'), 'the Scenario step link of the first failure');
      await app.until(
        'the scenario file open in the editor at the step',
        async () =>
          (await app.eval<boolean>(
            `(async () => { const monaco = await ${MONACO_MODULE}; ` +
              `const editor = monaco.editor.getEditors().find((e) => e.getModel()?.getValue().includes('"expectations"')); ` +
              `const selected = document.querySelector('[role="tab"][aria-selected="true"][id^="editor-tab-"]')?.textContent ?? ''; ` +
              `return Boolean(editor) && selected.includes('conveyor-01.scenario.json') ` +
              `&& (editor.getPosition()?.lineNumber ?? 1) > 1; })()`,
          )) || undefined,
      );

      // the time in the recorded trace: Details opens and that sample is marked
      await app.click(css('#console-tab-tests'), 'the Tests tab of the results panel');
      await app.click(button('That time in the trace'), 'the trace link of the first failure');
      await app.until(
        'Details open with the sample marked',
        async () =>
          (await app.eval<boolean>(
            `document.querySelector('details[data-test-details]')?.open === true && ` +
              `document.querySelectorAll('[data-trace-highlight]').length === 1`,
          )) || undefined,
      );
      const marked = await app.eval<string>(`document.querySelector('[data-trace-highlight]')?.textContent ?? ''`);
      assert(marked.includes(`${at}`), `The marked sample should be the one at ${at} ms, it is: ${marked}`);
      assert(!(await rowStatus(app, 'tests/conveyor-01.scenario.json')).includes('Passed'), 'The failed test must not read as passed');
    },
  },
];
