import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { translate } from '../../src/i18n/translate';
import { assert, MONACO_MODULE } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import type { Journey } from '../journeys';
import { runFromPalette } from './w3';

const projects = (path: string): string => fileURLToPath(new URL(`../../projects/${path}`, import.meta.url));
type Model = { variables: { inputs: Array<{ name: string }> } };

/** A bundled diagram whose `from` becomes the project's global `Permit`, left out of its own table so that it names the global. */
function writeDiagram(project: string, source: string, name: string, from: string): void {
  const model = JSON.parse(readFileSync(projects(source), 'utf8').replaceAll(from, 'Permit')) as Model;
  model.variables.inputs = model.variables.inputs.filter((row) => row.name !== 'Permit');
  writeFileSync(join(project, 'src', name), JSON.stringify(model, null, 2));
}

/** Conveyor 01 and its three tests, with a variable used in a rung, a block and a transition, and a function block to find. */
function setup(project: string): void {
  writeDiagram(project, 'seal_in_ladder/src/SealIn.ld.json', 'SealIn.ld.json', 'StartPB');
  writeDiagram(project, 'batch_count_fbd/src/BatchCount.fbd.json', 'BatchCount.fbd.json', 'PartSensor');
  writeDiagram(project, 'sfc_press_cell/src/PressCell.sfc.json', 'PressCell.sfc.json', 'Start');
  writeFileSync(join(project, 'src', 'globals.st'), 'VAR_GLOBAL\n  Permit : BOOL;\nEND_VAR\n');
  writeFileSync(
    join(project, 'src', 'Debounce.st'),
    ['FUNCTION_BLOCK Debounce', 'VAR_INPUT', '  Raw : BOOL;', 'END_VAR', 'VAR_OUTPUT', '  Stable : BOOL;', 'END_VAR', '  Stable := Raw;']
      .concat('END_FUNCTION_BLOCK', '')
      .join('\n'),
  );
}

const rowStatus = (app: App, path: string) =>
  app.eval<string>(`document.querySelector('[data-test-row=${JSON.stringify(path)}]')?.textContent ?? ''`);
const rowPaths = (app: App) =>
  app.eval<string[]>(`[...document.querySelectorAll('[data-test-row]')].map((row) => row.getAttribute('data-test-row'))`);
const activeTab = (app: App) =>
  app.eval<string>(`document.querySelector('[role="tab"][aria-selected="true"][id^="editor-tab-"]')?.textContent ?? ''`);
const primaryWidth = (app: App) => app.eval<number>(`document.getElementById('primary')?.getBoundingClientRect().width ?? -1`);
const selectedNode = (app: App, id: string) =>
  app.until(
    `${id} selected`,
    async () =>
      (await app.eval<boolean>(
        `document.querySelector('.react-flow__node.selected')?.getAttribute('data-id')?.includes('${id}') === true`,
      )) || undefined,
  );

/** Opens the palette with the keyboard, types the query and takes the first match, or the first match of one group. */
async function choose(app: App, query: string, group?: string): Promise<void> {
  await app.press('Ctrl+Shift+P');
  await app.until('the palette field', async () => (await app.visible(css('[role="combobox"]'))) || undefined);
  await app.type(query);
  const option = css(group ? `[role="group"][aria-labelledby$="-${group}"] [role="option"]` : '[role="option"]');
  await app.until(`a match for "${query}"`, async () => (await app.visible(option)) || undefined);
  if (group) await app.click(option, `the first ${group} match for "${query}"`);
  else await app.press('Enter');
}

/** The editor holds the program: the run that follows must save it first (FLW-006). */
async function breakProgram(app: App): Promise<void> {
  await choose(app, 'Conveyor.st', 'files');
  const program = `monaco.editor.getEditors().map((e) => e.getModel()).find((m) => m?.getValue().includes('BeltCommand := Requested'))`;
  await app.until(
    'the program in the editor',
    async () =>
      (await app.eval<boolean>(`(async () => { const monaco = await ${MONACO_MODULE}; return Boolean(${program}); })()`)) || undefined,
  );
  const broken = await app.eval<boolean>(
    `(async () => { const monaco = await ${MONACO_MODULE}; const model = ${program}; const text = model.getValue(); ` +
      `const next = text.replace('BeltCommand := Requested AND NOT Faulted;', 'BeltCommand := FALSE;'); model.setValue(next); ` +
      `return next !== text; })()`,
  );
  assert(broken, 'The journey could not edit the program in the editor');
}

/** Journeys of task U2-Q1 (plan-u2.md): the closing path of milestone U2, once, in the real application. */
export const journeysU2Q1: Journey[] = [
  {
    name: 'U2-Q1 The closing path of U2: tests, a failure to its step, references in three languages, the palette, New and Reset layout',
    example: 'conveyor_01',
    proves: [],
    partly: ['TST-001', 'TST-003', 'FND-001', 'FND-004', 'SHL-013', 'SHL-015'],
    run: async (app, { project }) => {
      setup(project);
      app.answer(project);
      await app.click(button('Open project', 'contains'), 'the Open project button');
      await app.until('the workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
      const defaultWidth = await primaryWidth(app);

      // the Tests activity lists the three tests; one runs from the list
      await app.click(css('[data-activity="tests"]'), 'the Tests activity');
      await app.until('three tests in the list', async () => ((await rowPaths(app)).length === 3 ? true : undefined));
      const paths = await rowPaths(app);
      const second = JSON.parse(readFileSync(join(project, paths[1]!), 'utf8')).id as string;
      await app.click(button(`Run ${second}`), 'Run of the second test');
      await app.until(
        'the second test to pass',
        async () => ((await rowStatus(app, paths[1]!)).includes('Passed') ? true : undefined),
        30_000,
      );

      // break the program, run all: the run saves it and a test fails
      await breakProgram(app);
      await app.until('the earlier result to be older than the sources', async () =>
        (await rowStatus(app, paths[1]!)).includes('Older than the sources') ? true : undefined,
      );
      await app.click(button('Run all'), 'Run all');
      await app.until(
        'a test to fail on the broken program',
        async () => {
          const statuses = await Promise.all(paths.map((path) => rowStatus(app, path)));
          return statuses.some((status) => status.includes('Failed')) || undefined;
        },
        40_000,
      );
      assert(
        readFileSync(join(project, 'src', 'Conveyor.st'), 'utf8').includes('BeltCommand := FALSE;'),
        'Running the tests must save the modified program first',
      );

      // the failure, followed to its step
      await app.click(css('#console-tab-tests'), 'the Test results tab');
      await app.until('the failed test in the results', async () => (await app.visible(css('[data-test-failure]'))) || undefined, 20_000);
      const verdict = await app.eval<string>(`document.querySelector('[data-test-verdict-sentence]')?.textContent ?? ''`);
      assert(/^\d+ of 3 tests passed$/.test(verdict) && !verdict.startsWith('3 of'), `The verdict should count the tests: ${verdict}`);
      await app.click(button('Scenario step'), 'the Scenario step link of the first failure');
      await app.until(
        'the scenario file open at the step',
        async () =>
          (await app.eval<boolean>(
            `(async () => { const monaco = await ${MONACO_MODULE}; ` +
              `const editor = monaco.editor.getEditors().find((e) => e.getModel()?.getValue().includes('"expectations"')); ` +
              `const tab = document.querySelector('[role="tab"][aria-selected="true"][id^="editor-tab-"]')?.textContent ?? ''; ` +
              `return Boolean(editor) && tab.includes('.scenario.json') && (editor.getPosition()?.lineNumber ?? 1) > 1; })()`,
          )) || undefined,
      );

      // the references of a variable used in a rung, a block and a transition
      await app.click(css('[data-activity="search"]'), 'the Search activity');
      await app.until('the search field', async () => (await app.visible(css('#project-search'))) || undefined);
      await app.click(css('#project-search'), 'the search field');
      await app.press('Ctrl+A');
      await app.type('Permit');
      const blockMatch = css(`button[aria-label*="BatchCount.fbd.json, FBD block 'var_sensor'"]`);
      await app.until('the match in the block', async () => (await app.visible(blockMatch)) || undefined);
      await app.click(blockMatch, 'the match in the block');
      await selectedNode(app, 'var_sensor');
      await runFromPalette(app, 'edit.findAllReferences', 'Find all references');
      const header = css('[data-references-header]');
      await app.until('the header of the references', async () => (await app.visible(header)) || undefined);
      const heading = await app.eval<string>(`document.querySelector('[data-references-header]').textContent`);
      assert(heading.startsWith('References to Permit:'), `Unexpected header: ${heading}`);
      const reference = (prefix: string) => css(`[data-references-panel] button[aria-label^="${prefix}"]`);
      for (const prefix of [
        'Open src/SealIn.ld.json, LD, LD rung',
        'Open src/BatchCount.fbd.json, FBD, FBD block',
        'Open src/PressCell.sfc.json, SFC, SFC transition',
      ])
        assert(await app.visible(reference(prefix)), `The references do not list "${prefix}"`);
      await app.click(reference('Open src/PressCell.sfc.json, SFC, SFC transition'), 'the reference in a transition');
      await selectedNode(app, 't_start');

      // the palette opens the I/O mapping, a function block and a preference
      await choose(app, 'I/O mapping');
      await app.until('the I/O mapping editor', async () => (await app.visible(css('[data-config-editor="io"]'))) || undefined);
      await choose(app, 'Debounce', 'objects');
      await app.until('the function block open', async () => ((await activeTab(app)).includes('Debounce.st') ? true : undefined));
      await choose(app, 'Editor font size');
      await app.until(
        'Preferences at the Editor font size',
        async () => (await app.eval<boolean>(`document.activeElement?.getAttribute('data-setting') === 'editorFontSize'`)) || undefined,
      );

      // a function from the empty Functions group of the navigator
      await app.click(css('[data-activity="project"]'), 'the Project activity');
      const objects = css(`[aria-label=${JSON.stringify(translate('en', 'navigator.mode.label'))}] button:nth-of-type(1)`);
      await app.click(objects, 'the Objects mode of the navigator');
      const empty = css('[data-navigator-group="functions"] [data-new-object="function"]');
      await app.until('the New function action of the empty group', async () => (await app.visible(empty)) || undefined);
      await app.click(empty, 'New function in the empty Functions group');
      await app.until('the name dialog', async () => (await app.visible(css('[data-new-object-dialog]'))) || undefined);
      await app.type('Scale');
      await app.press('Enter');
      await app.until('the new function open', async () => (await app.visible(css('[id="editor-tab-file:src/Scale.st"]'))) || undefined);
      assert(existsSync(join(project, 'src', 'Scale.st')), 'New function made no src/Scale.st');

      // the user moves a region and opens another tab; Reset layout puts both back
      await app.eval(`document.getElementById('primary-separator')?.focus()`);
      for (let step = 0; step < 6; step++) await app.press('ArrowRight');
      await app.until('the sidebar wider', async () => (await primaryWidth(app)) > defaultWidth + 20 || undefined);
      await app.click(css('#console-tab-problems'), 'the Problems tab');
      await runFromPalette(app, 'view.resetLayout', 'reset the layout');
      await app.until('the sidebar at its default width', async () => Math.abs((await primaryWidth(app)) - defaultWidth) < 4 || undefined);
      await app.until(
        'Output shown',
        async () =>
          (await app.eval<boolean>(`document.getElementById('console-tab-output')?.getAttribute('aria-selected') === 'true'`)) || undefined,
      );

      // last, a lesson from the palette: it opens beside its own project
      await choose(app, 'Safe motor start-stop', 'lessons');
      await app.until('the lesson and its Check', async () => (await app.visible(css('[data-learn-check]'))) || undefined, 45_000);
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
];
