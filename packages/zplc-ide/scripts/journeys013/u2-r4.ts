import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { assert } from '../run-desktop-smoke';
import { button, css, type App } from '../journeyApp';
import { pressMod } from '../journeyKeys';
import type { Journey } from '../journeys';
import { runFromPalette } from './w3';

const projects = (path: string): string => fileURLToPath(new URL(`../../projects/${path}`, import.meta.url));
type Model = { variables: { inputs: Array<{ name: string }> }; blocks?: Array<{ id: string; variableName?: string }> };

/** A bundled diagram whose `from` is renamed `Start` and left undeclared in its tables, so that it names the project's global. */
function writeDiagram(project: string, source: string, name: string, from: string, edit: (model: Model) => void = () => {}): void {
  const model = JSON.parse(readFileSync(projects(source), 'utf8').replaceAll(from, 'Start')) as Model;
  model.variables.inputs = model.variables.inputs.filter((row) => row.name !== 'Start');
  edit(model);
  writeFileSync(join(project, 'src', name), JSON.stringify(model, null, 2));
}

function setup(project: string): void {
  writeDiagram(project, 'seal_in_ladder/src/SealIn.ld.json', 'SealIn.ld.json', 'StartPB');
  writeDiagram(project, 'batch_count_fbd/src/BatchCount.fbd.json', 'BatchCount.fbd.json', 'PartSensor', (model) => {
    // one block that carries two names, so that the command has to ask which one is meant
    model.blocks!.find((block) => block.id === 'ctu')!.variableName = 'Start';
  });
  writeDiagram(project, 'sfc_press_cell/src/PressCell.sfc.json', 'PressCell.sfc.json', 'Start');
  writeFileSync(join(project, 'src', 'globals.st'), 'VAR_GLOBAL\n  Start AT %IX0.0 : BOOL;\nEND_VAR\n');
  writeFileSync(join(project, 'src', 'main.st'), 'PROGRAM Main\nVAR\n  Lamp : BOOL;\nEND_VAR\n  Lamp := Start;\nEND_PROGRAM\n');
}

async function openProject(app: App, project: string): Promise<void> {
  app.answer(project);
  await app.click(button('Open project', 'contains'), 'the Open project button');
  await app.until('the workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
}

async function search(app: App, text: string): Promise<void> {
  await app.click(css('[data-activity="search"]'), 'the Search activity');
  await app.until('the search field', async () => (await app.visible(css('#project-search'))) || undefined);
  await app.click(css('#project-search'), 'the search field');
  await pressMod(app, 'Ctrl+A');
  await app.type(text);
}

const row = (prefix: string) => css(`[data-references-panel] button[aria-label^="${prefix}"]`);
const selectedNode = (app: App, id: string) =>
  app.until(
    `${id} selected`,
    async () =>
      (await app.eval<boolean>(
        `document.querySelector('.react-flow__node.selected')?.getAttribute('data-id')?.includes('${id}') === true`,
      )) || undefined,
  );
const activeTab = (app: App) =>
  app.eval<string>(`document.querySelector('[role="tab"][aria-selected="true"][id^="editor-tab-"]')?.textContent ?? ''`);

async function openFbdBlock(app: App, query: string, block: string): Promise<void> {
  await search(app, query);
  const match = css(`button[aria-label*="BatchCount.fbd.json, FBD block '${block}'"]`);
  await app.until(`the match in block ${block}`, async () => (await app.visible(match)) || undefined);
  await app.click(match, 'the match');
  await selectedNode(app, block);
}

async function pressF12(app: App, shift: boolean): Promise<void> {
  const params = { key: 'F12', code: 'F12', windowsVirtualKeyCode: 123, modifiers: shift ? 8 : 0 };
  await app.cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await app.cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}

/** Journeys of task U2-R4 (plan-u2.md): go to definition and find all references across the five languages (FND-004). */
export const journeysU2R4: Journey[] = [
  {
    name: 'FND-004 list the references of a variable used in a rung, a block and a transition, open each, and go to its definition',
    example: 'seal_in_ladder',
    proves: ['FND-004'],
    partly: [],
    run: async (app, { project }) => {
      setup(project);
      await openProject(app, project);
      await openFbdBlock(app, 'Start', 'var_sensor');
      await runFromPalette(app, 'edit.findAllReferences', 'Find all references');
      const header = css('[data-references-header]');
      await app.until('the header of the references', async () => (await app.visible(header)) || undefined);
      const text = await app.eval<string>(`document.querySelector('[data-references-header]').textContent`);
      assert(text.startsWith('References to Start:'), `Unexpected header: ${text}`);

      await app.click(row('Open src/SealIn.ld.json, LD, LD rung'), 'the reference in a rung');
      await app.until(
        'the rung opened with the element selected',
        async () => (await app.visible(css('[data-ld-rung-id="rung_1"] [data-ld-cursor]'))) || undefined,
      );
      await app.click(css('[data-activity="search"]'), 'the Search activity');
      await app.click(row('Open src/PressCell.sfc.json, SFC, SFC transition'), 'the reference in a transition');
      await app.until(
        'the transition selected',
        async () =>
          (await app.eval<boolean>(
            `document.querySelector('.react-flow__node.selected')?.getAttribute('data-id')?.includes('t_start') === true`,
          )) || undefined,
      );
      await app.click(css('[data-activity="search"]'), 'the Search activity');
      await app.click(row('Open src/BatchCount.fbd.json, FBD, FBD block'), 'the reference in a block');
      await selectedNode(app, 'var_sensor');

      await runFromPalette(app, 'edit.goToDefinition', 'Go to definition');
      await app.until('the definition opened', async () => ((await activeTab(app)).includes('globals.st') ? true : undefined));
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
  {
    name: 'FND-004 with an FBD block selected, Find all references offers its names',
    example: 'seal_in_ladder',
    proves: ['FND-004'],
    partly: [],
    run: async (app, { project }) => {
      setup(project);
      await openProject(app, project);
      await openFbdBlock(app, 'Count', 'ctu');
      await runFromPalette(app, 'edit.findAllReferences', 'Find all references');
      await app.until('the choice of names', async () => (await app.visible(css('[data-references-panel] section h3'))) || undefined);
      const names = await app.eval<string[]>(
        `[...document.querySelectorAll('[data-references-panel] section ul button')].map((b) => b.textContent)`,
      );
      assert(names.includes('Start') && names.includes('Count'), `The choice offers ${JSON.stringify(names)}`);
      await app.click(css('[data-references-panel] section ul button'), 'the first name');
      await app.until('the header of the references', async () => (await app.visible(css('[data-references-header]'))) || undefined);
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
  {
    name: 'FND-004 in a Structured Text editor Shift+F12 lists the references of the project, and F12 opens the definition',
    example: 'seal_in_ladder',
    proves: ['FND-004'],
    partly: [],
    run: async (app, { project }) => {
      setup(project);
      await openProject(app, project);
      await search(app, 'Start;');
      const match = css('button[aria-label^="Open src/main.st at line"]');
      await app.until('the match in main.st', async () => (await app.visible(match)) || undefined);
      await app.click(match, 'the match');
      await app.until('main.st open', async () => ((await activeTab(app)).includes('main.st') ? true : undefined));
      await app.until('the editor', async () => (await app.visible(css('.monaco-editor .view-lines'))) || undefined);
      await app.eval(`document.querySelector('.monaco-editor .native-edit-context, .monaco-editor textarea')?.focus()`);
      await pressF12(app, true);
      await app.until('the references of the project', async () => (await app.visible(css('[data-references-header]'))) || undefined);
      const text = await app.eval<string>(`document.querySelector('[data-references-header]').textContent`);
      assert(text.startsWith('References to Start:'), `Unexpected header: ${text}`);
      assert(await app.visible(row('Open src/SealIn.ld.json, LD, LD rung')), 'The rung of the ladder is not listed');
      await app.eval(`document.querySelector('.monaco-editor .native-edit-context, .monaco-editor textarea')?.focus()`);
      await pressF12(app, false);
      await app.until('globals.st open', async () => ((await activeTab(app)).includes('globals.st') ? true : undefined));
      assert(app.errors.length === 0, `Renderer errors: ${app.errors.join('; ')}`);
    },
  },
];
