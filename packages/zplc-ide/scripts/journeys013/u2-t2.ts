import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert, MONACO_MODULE } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';

const toolbar = css('[role="toolbar"]');
const rowStatus = (app: App, path: string) =>
  app.eval<string>(`document.querySelector('[data-test-row=${JSON.stringify(path)}]')?.textContent ?? ''`);
const rowPaths = (app: App) =>
  app.eval<string[]>(`[...document.querySelectorAll('[data-test-row]')].map((row) => row.getAttribute('data-test-row'))`);

async function openFolder(app: App, folder: string): Promise<void> {
  app.answer(folder);
  await app.click(button('Open project', 'contains'), 'the Open project button');
  await app.until('the project workbench to appear', async () => (await app.visible(toolbar)) || undefined);
}

/** The journeys of task T2 of the U2 plan (spec 013): the Tests activity lists the tests and runs them. */
export const journeysU2T2: Journey[] = [
  {
    name: 'U2-T2 The Tests activity lists the tests, runs one, and runs all after the program is broken',
    example: 'conveyor_01',
    proves: ['TST-001'],
    partly: ['TST-002', 'TST-005', 'FLW-006'],
    run: async (app, { project }) => {
      const ids = ['conveyor-01', 'conveyor-jam-reset', 'conveyor-two-parts'].map(
        (name) => JSON.parse(readFileSync(join(project, 'tests', `${name}.scenario.json`), 'utf8')).id as string,
      );
      await openFolder(app, project);
      await app.click(css('[data-activity="tests"]'), 'the Tests activity');
      await app.until('three tests in the list', async () => ((await rowPaths(app)).length === 3 ? true : undefined));
      const paths = await rowPaths(app);
      for (const path of paths) assert((await rowStatus(app, path)).includes('Not run'), `${path} should start as not run`);
      assert(
        !(await app.text()).includes('Choose zplc.json') &&
          !(await app.eval<boolean>(`Boolean(document.querySelector('[data-tests-view] input'))`)),
        'The Tests activity must not offer a manifest to choose',
      );

      // run one from the list
      await app.click(button(`Run ${ids[1]}`), 'Run of the second test');
      await app.until(
        'the second test to pass',
        async () => ((await rowStatus(app, paths[1]!)).includes('Passed') ? true : undefined),
        30_000,
      );
      assert((await rowStatus(app, paths[0]!)).includes('Not run'), 'Running one test must leave the others as they were');

      // break the program in the editor: the run saves it first (FLW-006), and the earlier result is older than the sources
      const broken = await app.eval<boolean>(
        `(async () => { const monaco = await ${MONACO_MODULE}; const model = monaco.editor.getEditors()[0]?.getModel(); ` +
          `if (!model) return false; const text = model.getValue(); const next = text.replace('BeltCommand := Requested AND NOT ` +
          `Faulted;', ` +
          `'BeltCommand := FALSE;'); model.setValue(next); return next !== text; })()`,
      );
      assert(broken, 'The journey could not edit the program in the editor');
      await app.until('the earlier result to be older than the sources', async () =>
        (await rowStatus(app, paths[1]!)).includes('Older than the sources') ? true : undefined,
      );
      await app.click(button('Run all'), 'Run all');
      await app.until(
        'a test to fail on the broken program',
        async () =>
          (await rowStatus(app, paths[0]!)).includes('Failed') || (await rowStatus(app, paths[1]!)).includes('Failed') ? true : undefined,
        40_000,
      );
      assert(
        readFileSync(join(project, 'src', 'Conveyor.st'), 'utf8').includes('BeltCommand := FALSE;'),
        'Running the tests must save the modified program first',
      );
    },
  },
];
