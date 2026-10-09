/**
 * The journeys of VF-008, each a function of the app under test that throws when the product does not do what the user
 * expects (assert), or reports that the journey cannot be performed at all (notPossible). Observation reads the screen
 * and the editor; every action is a real click, key or text insertion.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert } from './run-desktop-smoke';
import { button, css, menuItem, tab, type App } from './journeyApp';

export interface JourneyContext {
  root: string;
  /** A fresh folder holding a copy of the journey's example. */
  project: string;
  /** Closes the app and starts it again on the same user-data directory, as a user restarting it would. */
  relaunch(): Promise<App>;
}
/** `example` names the folder of projects/ copied into a fresh temporary folder for the journey, or `none`. */
export interface Journey { name: string; example: string; run(app: App, context: JourneyContext): Promise<void> }

// ---------------------------------------------------------------------------------------------------------------------
// Steps a user performs
// ---------------------------------------------------------------------------------------------------------------------

const toolbar = css('[role="toolbar"][aria-label="Project operations"]');
const treeItem = (id: string) => css(`[role="treeitem"][data-tree-node-id="${id}"]`);
const disk = (path: string) => readFileSync(path, 'utf8');

/** Open a folder through the Welcome screen's "Open project" button and the native dialog. */
async function openFolder(app: App, folder: string): Promise<void> {
  app.answer(folder);
  await app.click(button('Open project', 'contains'), 'the Open project button');
  await app.until('the project workbench to appear', async () => await app.visible(toolbar) || undefined);
}

/** The page's own Monaco instance and its active editor, for reading what the editor shows and where things are. */
const monacoEval = <T>(app: App, body: string) => app.eval<T>(`(async () => { const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((name) => /\\/monaco-editor\\.js/.test(name)); const monaco = await import(url); const editor = monaco.editor.getEditors()[0]; ${body} })()`);
const editorText = (app: App) => monacoEval<string>(app, 'return editor?.getModel()?.getValue() ?? "";');
type Point = { x: number; y: number };
/** Where a user clicks line `line`: just after its text, or on the glyph margin where breakpoints are set; null while it is off screen. */
const editorPoint = (app: App, line: number, where: 'text' | 'gutter') => monacoEval<Point | null>(app, `
  const model = editor.getModel(); const box = editor.getDomNode().getBoundingClientRect(); const layout = editor.getLayoutInfo();
  const pos = editor.getScrolledVisiblePosition({ lineNumber: ${line}, column: model.getLineMaxColumn(${line}) });
  if (!pos || pos.top < 0 || pos.top + pos.height > layout.height) return null;
  const x = ${where === 'gutter' ? 'layout.glyphMarginLeft + layout.glyphMarginWidth / 2' : 'pos.left + 40'};
  const point = { x: box.left + x, y: box.top + pos.top + pos.height / 2 };
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;`); // the position is NaN until the editor has measured its font

/** Turns the mouse wheel over the editor until the line is on screen, then clicks it. */
async function clickEditorLine(app: App, line: number, where: 'text' | 'gutter' = 'text'): Promise<void> {
  const point = await app.until(`line ${line} on screen in the editor`, async () => {
    const found = await editorPoint(app, line, where);
    if (found) return found;
    const view = await monacoEval<{ x: number; y: number; below: boolean }>(app, `const box = editor.getDomNode().getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2, below: ${line} > editor.getVisibleRanges()[0].endLineNumber };`);
    await app.wheel(view.x, view.y, view.below ? 150 : -150);
    return undefined;
  });
  await app.clickAt(point.x, point.y);
}

/** Open a project file by clicking it in the Explorer tree, expanding its folders first. */
async function openFile(app: App, path: string): Promise<void> {
  await app.click(tab('Explorer', 'exact'));
  const folders = path.split('/').slice(0, -1);
  for (let depth = 1; depth <= folders.length; depth++) {
    const id = `dir:${folders.slice(0, depth).join('/')}`;
    await app.until(`folder ${id} in the tree`, async () => await app.visible(treeItem(id)) || undefined);
    if (await app.eval(`${treeItem(id)}.getAttribute('aria-expanded') === 'false'`)) await app.click(treeItem(id));
  }
  await app.click(treeItem(`file:${path}`));
  const name = path.split('/').at(-1)!;
  await app.until(`${name} in the editor`, async () => (await editorText(app)).length > 0 && await app.eval(`[...document.querySelectorAll('[role="tab"][aria-selected="true"]')].some((item) => item.textContent?.includes(${JSON.stringify(name)}))`) || undefined);
}

/** Put the cursor at the end of a line with a real click and the End key. */
async function cursorAtEndOfLine(app: App, line: number): Promise<void> {
  await clickEditorLine(app, line);
  await app.press('End');
}

const saveButton = button('Save active file', 'prefix');
const BUILD_RESULT = /Built saved workspace locally: [^\n]*|Canonical workspace build failed|Open Tests and choose the saved zplc\.json[^\n]*|Save changes before building[^\n]*|Build requires a saved folder[^\n]*|Saved workspace compiler is unavailable[^\n]*/g;
type BuildKind = 'built' | 'failed' | 'link-required' | 'save-required' | 'unavailable';
const buildKind = (message: string): BuildKind => message.startsWith('Built') ? 'built' : message.startsWith('Canonical') ? 'failed' : message.startsWith('Open Tests') ? 'link-required' : message.startsWith('Save changes') ? 'save-required' : 'unavailable';

/** What the Output panel says; it selects the Output tab first. */
async function outputText(app: App): Promise<string> {
  if (!await app.eval(`document.getElementById('console-tab-output')?.getAttribute('aria-selected') === 'true'`)) await app.click(tab('Output'));
  return await app.eval<string>(`document.querySelector('[role="tabpanel"][id^="console-panel-"]')?.innerText ?? ''`);
}

/** Build > Compile through the toolbar menu, then read what the Output panel reports. */
async function compile(app: App): Promise<{ kind: BuildKind; message: string }> {
  const before = (await outputText(app)).match(BUILD_RESULT)?.length ?? 0;
  await app.click(button('Build options'));
  await app.click(menuItem('Compile'));
  const messages = await app.until('a build result in Output', async () => { const found = (await outputText(app)).match(BUILD_RESULT) ?? []; return found.length > before ? found : undefined; });
  const message = messages.at(-1)!;
  return { kind: buildKind(message), message };
}

/**
 * The step IDE-001 wants removed: choose the project's zplc.json in Tests so that the build can see the folder. The file
 * chooser of the operating system cannot be driven here, so the file is handed to the input as the smoke does.
 */
async function linkWorkspace(app: App, project: string): Promise<void> {
  await app.click(tab('Tests'));
  await app.until('the manifest input in Tests', async () => await app.visible(css('input[data-workspace-manifest-input]')) !== undefined || undefined);
  const document = await app.cdp.command('DOM.getDocument') as { root: { nodeId: number } };
  const input = await app.cdp.command('DOM.querySelector', { nodeId: document.root.nodeId, selector: 'input[data-workspace-manifest-input]' }) as { nodeId: number };
  await app.cdp.command('DOM.setFileInputFiles', { files: [join(project, 'zplc.json')], nodeId: input.nodeId });
  await app.eval(`document.querySelector('input[data-workspace-manifest-input]')?.dispatchEvent(new Event('change', { bubbles: true }))`);
  await app.until('the workspace to be linked', async () => (await app.text()).includes('Linked saved workspace ready') || undefined);
}

/** Build as a user would; where the product demands the zplc.json link, do it and say so in the table. */
async function buildProject(app: App, project: string): Promise<{ kind: BuildKind; message: string }> {
  let result = await compile(app);
  if (result.kind === 'link-required') {
    app.note('Build asked to choose zplc.json in Tests first (IDE-001)');
    await linkWorkspace(app, project);
    result = await compile(app);
  }
  return result;
}

/** Edit Motor.st to use a variable that is not declared, save it, and build: the build must fail. */
async function buildWithUndeclaredVariable(app: App, project: string): Promise<void> {
  await openFolder(app, project);
  await openFile(app, 'src/Motor.st');
  await cursorAtEndOfLine(app, 30);
  await app.press('Enter');
  await app.type('UndefinedVariable := 1;');
  await app.click(saveButton, 'the Save button');
  await app.until('the file with the error on disk', () => disk(join(project, 'src', 'Motor.st')).includes('UndefinedVariable') || undefined);
  const result = await buildProject(app, project);
  assert(result.kind === 'failed', `A build of a program with an undeclared variable should fail with diagnostics, not: ${result.kind} ${result.message}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Journeys
// ---------------------------------------------------------------------------------------------------------------------

const EDIT = ' (* journey edit: ñ 温度 *)';

export const JOURNEYS: Journey[] = [
  {
    name: '1 Open an existing folder', example: 'motor_start_stop',
    run: async (app, { project }) => {
      await openFolder(app, project);
      await app.click(tab('Explorer', 'exact'));
      await app.until('the src folder of the project in the tree', async () => await app.visible(treeItem('dir:src')) || undefined);
      assert(!(await app.text()).includes('The project could not be opened'), 'The workbench shows an open error.');
      assert((await outputText(app)).includes('Opened project: Motor Start Stop'), 'Output does not report the opened project.');
    },
  },
  {
    name: '2 Create a project from an example', example: 'motor_start_stop',
    run: async (app, { root }) => {
      const folder = join(root, 'new-project'); mkdirSync(folder);
      app.answer(folder);
      await app.click(button('Motor Start Stop', 'contains'), 'the Motor Start Stop example button');
      await app.until('the project workbench to appear', async () => await app.visible(toolbar) || undefined);
      assert(existsSync(join(folder, 'zplc.json')) && existsSync(join(folder, 'src', 'Motor.st')), 'The chosen folder does not hold the example (zplc.json, src/Motor.st).');
      await openFile(app, 'src/Motor.st');
      assert((await editorText(app)).startsWith('PROGRAM Motor'), 'The created project does not open its program.');
    },
  },
  {
    name: '2b Create a new project', example: 'none',
    run: async (app, { root }) => {
      const folder = join(root, 'empty-project'); mkdirSync(folder);
      app.answer(folder);
      await app.click(button('New project', 'contains'), 'the New project button');
      await app.until('the project workbench to appear', async () => await app.visible(toolbar) || undefined);
      assert(existsSync(join(folder, 'zplc.json')), 'The chosen folder holds no zplc.json.');
      await app.click(tab('Explorer', 'exact'));
      await app.until('a source file in the tree of the new project', async () => await app.visible(treeItem('dir:src')) || undefined);
    },
  },
  {
    name: '3 Edit Structured Text, save, reopen', example: 'motor_start_stop',
    run: async (app, { project }) => {
      const file = join(project, 'src', 'Motor.st'); const original = disk(file);
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      await cursorAtEndOfLine(app, 1);
      await app.type(EDIT);
      const edited = original.replace(/^[^\n]*/, (first) => `${first}${EDIT}`);
      await app.until('the editor to hold the typed text', async () => await editorText(app) === edited.replace(/\r\n/g, '\n') || undefined);
      assert(disk(file) === original, 'Typing alone must not write the file.');
      await app.click(saveButton, 'the Save button');
      await app.until('the edited file on disk', () => disk(file) === edited || undefined);
      await app.click(button('Close Project'));
      await app.until('the Welcome screen', async () => await app.visible(button('Open project', 'contains')) || undefined);
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      assert(await editorText(app) === edited, 'The reopened project does not show the saved text.');
      assert(disk(file) === edited, 'The file on disk changed on reopen.');
    },
  },
  {
    name: '3b Save with Ctrl+S in the editor', example: 'motor_start_stop',
    run: async (app, { project }) => {
      const file = join(project, 'src', 'Motor.st'); const original = disk(file);
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      await cursorAtEndOfLine(app, 1);
      await app.type(EDIT);
      await app.until('the editor to hold the typed text', async () => (await editorText(app)).includes(EDIT) || undefined);
      await app.press('Ctrl+S');
      await app.until('Ctrl+S to write the typed text to the file (the cursor is in the editor)', () => disk(file).includes(EDIT) || undefined);
      assert(disk(file).length > original.length, 'The saved file lost content.');
    },
  },
  {
    name: '4 Build with an error, reach it from Problems', example: 'motor_start_stop',
    run: async (app, { project }) => {
      await buildWithUndeclaredVariable(app, project);
      await app.click(tab('Problems'));
      const entry = await app.until('a problem that can be activated', async () => await app.eval<string | null>(`[...document.querySelectorAll('[aria-label="Latest build diagnostics"] button')].map((item) => item.innerText).find((text) => /:\\d+/.test(text)) ?? null`) ?? undefined);
      const line = Number(/:(\d+)/.exec(entry)![1]);
      await clickEditorLine(app, 1);
      await app.until('the cursor on line 1 before the problem is activated', async () => await monacoEval<number>(app, 'return editor.getPosition().lineNumber;') === 1 || undefined);
      await app.click(css('[aria-label="Latest build diagnostics"] button'), 'the problem entry');
      await app.until(`the cursor on line ${line} of the editor`, async () => await monacoEval<number>(app, 'return editor.getPosition().lineNumber;') === line || undefined);
      assert((await editorText(app)).split('\n')[line - 1]?.includes('UndefinedVariable'), `The problem opens line ${line}, which is not the faulty statement.`);
    },
  },
  {
    name: '4b Problems say what is wrong', example: 'motor_start_stop',
    run: async (app, { project }) => {
      await buildWithUndeclaredVariable(app, project);
      await app.click(tab('Problems'));
      const problems = await app.eval<string>(`document.querySelector('[aria-label="Latest build diagnostics"]')?.innerText ?? ''`);
      assert(/UndefinedVariable|unknown identifier/i.test(problems), `The Problems list does not say what is wrong with the program ("Unknown identifier 'UndefinedVariable'" is what the compiler reports): ${JSON.stringify(problems)}`);
    },
  },
  {
    name: '5 Build successfully', example: 'motor_start_stop',
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const result = await compile(app);
      assert(result.kind === 'built', `Build right after opening the folder: ${result.message}`);
    },
  },
];
