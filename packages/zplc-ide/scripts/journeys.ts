/**
 * The journeys of VF-008, each a function of the app under test that throws when the product does not do what the user
 * expects (assert), or reports that the journey cannot be performed at all (notPossible). Observation reads the screen
 * and the editor; every action is a real click, key or text insertion.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert } from './run-desktop-smoke';
import { button, css, menuItem, notPossible, tab, type App, type Target } from './journeyApp';

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
/** Lines of the active editor that carry a decoration with this class (a breakpoint dot, the paused-line highlight). */
const decoratedLines = (app: App, option: 'glyphMarginClassName' | 'className', value: string) => monacoEval<number[]>(app, `return editor.getModel().getAllDecorations().filter((decoration) => decoration.options.${option} === ${JSON.stringify(value)}).map((decoration) => decoration.range.startLineNumber);`);

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
const editorTab = (id: string): Target => `document.getElementById(${JSON.stringify(`editor-tab-${id}`)})`;
/** The text of an open file's Monaco model, which an undo history belongs to, whether or not its tab is the one shown. */
const modelText = (app: App, name: string) => monacoEval<string | null>(app, `return monaco.editor.getModels().find((model) => model.uri.scheme === 'zplc-file' && model.uri.path.endsWith('/' + ${JSON.stringify(name)}))?.getValue() ?? null;`);
/** `text` with `addition` appended to its first line, as typing it at the end of that line does. */
const appendToFirstLine = (text: string, addition: string) => text.replace(/^[^\n]*/, (line) => `${line}${addition}`);

const BUILD_RESULT = /Built saved workspace locally: [^\n]*|Canonical workspace build failed|Save changes before building[^\n]*|Build requires a saved folder[^\n]*|Saved workspace (?:compiler is unavailable|could not be opened)[^\n]*/g;
type BuildKind = 'built' | 'failed' | 'save-required' | 'unavailable';
const buildKind = (message: string): BuildKind => message.startsWith('Built') ? 'built' : message.startsWith('Canonical') ? 'failed' : message.startsWith('Save changes') ? 'save-required' : 'unavailable';

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

/** Edit Motor.st to use a variable that is not declared, save it, and build: the build must fail. */
async function buildWithUndeclaredVariable(app: App, project: string): Promise<void> {
  await openFolder(app, project);
  await openFile(app, 'src/Motor.st');
  await cursorAtEndOfLine(app, 30);
  await app.press('Enter');
  await app.type('UndefinedVariable := 1;');
  await app.click(saveButton, 'the Save button');
  await app.until('the file with the error on disk', () => disk(join(project, 'src', 'Motor.st')).includes('UndefinedVariable') || undefined);
  const result = await compile(app);
  assert(result.kind === 'failed', `A build of a program with an undeclared variable should fail with diagnostics, not: ${result.kind} ${result.message}`);
}

async function connectAndRun(app: App): Promise<void> {
  await app.click(button('Connect'));
  await app.until('the simulation to connect', async () => await app.visible(button('Disconnect')) || undefined);
  await app.click(button('Run (F5)', 'prefix'));
  await app.until('the program to run', async () => await app.visible(button('Pause (F6)', 'prefix')) || undefined);
}

const cycles = async (app: App) => Number((/cycles\s+(\d[\d,]*)/.exec(await app.eval<string>(`document.querySelector('[aria-label="Operational status"]')?.innerText ?? ''`))?.[1] ?? 'NaN').replace(/,/g, ''));

async function watch(app: App, variable: string): Promise<void> {
  await app.click(tab('Watch', 'prefix'));
  if (!await app.visible(css('input[placeholder^="Variable path"]'))) await app.click(css('button[title="Add variable"]'));
  await app.click(css('input[placeholder^="Variable path"]'));
  await app.type(variable);
  await app.press('Enter');
  await app.until(`${variable} in the Watch table`, async () => await watchValue(app, variable) !== null || undefined);
}
const watchRow = (name: string) => `[...document.querySelectorAll('tbody tr')].find((row) => row.firstElementChild?.textContent === ${JSON.stringify(name)})`;
const watchValue = (app: App, name: string) => app.eval<string | null>(`${watchRow(name)}?.children[1]?.innerText.trim() ?? null`);

/** The prompt that asks what to do with unsaved changes, by its title; null when none is open. */
const dialogTitle = (app: App) => app.eval<string | null>(`document.querySelector('[data-unsaved-changes-dialog]')?.closest('[role="dialog"]')?.querySelector('h2')?.textContent ?? null`);
const dialogChoice = (label: string) => `(() => { const dialog = document.querySelector('[data-unsaved-changes-dialog]'); return [...(dialog?.querySelectorAll('button') ?? [])].find((item) => item.textContent === ${JSON.stringify(label)}); })()`;

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
      assert(problems.includes("Unknown identifier 'UndefinedVariable'"), `The Problems list does not say what is wrong with the program ("Unknown identifier 'UndefinedVariable'" is what the compiler reports): ${JSON.stringify(problems)}`);
      assert(!/(^|[\s'"(])\/[\w.~@+-]|[A-Za-z]:[\\/]/.test(problems), `The Problems list shows an absolute path of the machine: ${JSON.stringify(problems)}`);
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
  {
    name: '5b Tests need no zplc.json to be chosen', example: 'motor_start_stop',
    run: async (app, { project }) => {
      await openFolder(app, project);
      await app.click(tab('Tests'));
      await app.until('the Tests tab to report the linked workspace', async () => (await app.text()).includes('Linked saved workspace ready') || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the Tests tab asks for a file instead (${(await app.text()).includes('Select the saved workspace zplc.json') ? 'it says to select the zplc.json' : 'no link is shown'})`); });
    },
  },
  {
    name: '6 Simulate: connect, run, watch a value change', example: 'blinky',
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/main.st');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky example does not build: ${result.message}`);
      await connectAndRun(app);
      const before = await cycles(app);
      await app.until('the cycle counter to advance', async () => await cycles(app) > before + 20 || undefined);
      await watch(app, 'LED_Output');
      const seen = new Set<string | null>();
      await app.until('LED_Output to change between TRUE and FALSE', async () => { seen.add(await watchValue(app, 'LED_Output')); return seen.has('TRUE') && seen.has('FALSE') || undefined; });
    },
  },
  {
    name: '7 Breakpoint stops execution', example: 'motor_start_stop',
    run: async (app, { project }) => {
      const line = 29;
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      assert((await editorText(app)).split('\n')[line - 1]?.includes('Forward := SealIn'), `Line ${line} of the example is no longer the statement the journey aims at.`);
      const result = await compile(app);
      assert(result.kind === 'built', `The Motor example does not build: ${result.message}`);
      await clickEditorLine(app, line, 'gutter');
      await app.until(`a breakpoint dot on line ${line}`, async () => (await decoratedLines(app, 'glyphMarginClassName', 'breakpoint-glyph')).includes(line) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: clicking the gutter next to the executable statement set no breakpoint (dots on lines: ${JSON.stringify(await decoratedLines(app, 'glyphMarginClassName', 'breakpoint-glyph'))})`); });
      await app.click(button('Connect'));
      await app.until('the simulation to connect', async () => await app.visible(button('Disconnect')) || undefined);
      await app.click(button('Run (F5)', 'prefix'));
      await app.until(`execution to stop at line ${line}`, async () => await app.visible(button('Resume (F5)', 'prefix')) || undefined)
        .catch(async (error: Error) => {
          const loaded = (await outputText(app)).match(/Loaded \d+ bytes, \d+ breakpoints set/)?.[0];
          throw new Error(`${error.message}: the program keeps running past the breakpoint. Output says "${loaded}"; breakpoint dots now on lines ${JSON.stringify(await decoratedLines(app, 'glyphMarginClassName', 'breakpoint-glyph'))} (the dot was on line ${line} before Run).`);
        });
      assert((await decoratedLines(app, 'className', 'current-line-highlight')).includes(line), `Execution paused but the editor does not mark line ${line}.`);
    },
  },
  {
    name: '8 Force an input and release it', example: 'motor_start_stop',
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const result = await compile(app);
      assert(result.kind === 'built', `The Motor example does not build: ${result.message}`);
      await connectAndRun(app);
      await watch(app, 'Start'); await watch(app, 'Forward');
      await app.until('Forward to read FALSE', async () => await watchValue(app, 'Forward') === 'FALSE' || undefined);
      await app.click(css('input[aria-label="Force Start"]'), 'the Force checkbox of Start');
      await app.until('Start to be forced', async () => await app.eval(`${watchRow('Start')}?.querySelector('[data-forced="true"]') !== null`) === true || undefined);
      const startValue = `${watchRow('Start')}?.children[1]`;
      if (!await app.clickable(startValue)) {
        app.note('With a force active the Watch table has no visible row at the default panel size');
        await app.click(css('[role="separator"]'), 'the separator above the lower panel');
        for (let step = 0; step < 6; step++) await app.press('ArrowUp');
      }
      await app.click(startValue, 'the value of Start', 2);
      await app.until('the value editor of Start to take focus', async () => await app.eval(`document.activeElement === ${watchRow('Start')}?.querySelector('input[type="text"]')`) || undefined);
      await app.type('1'); await app.press('Enter');
      await app.until('Forward to turn TRUE once Start is forced to 1', async () => await watchValue(app, 'Forward') === 'TRUE' || undefined);
      assert((await app.text()).includes('1 active force'), 'The force banner does not show one active force.');
      if (await app.eval(`[...document.querySelectorAll('button')].find((item) => item.textContent === 'Release all forces')?.disabled === true`)) app.note('Release all forces is disabled in simulation; the Force checkbox of the row releases');
      await app.click(css('input[aria-label="Force Start"]'), 'the Force checkbox of Start');
      await app.until('the force to be released', async () => !(await app.text()).includes('active force') && await app.eval(`${watchRow('Start')}?.querySelector('input[type="checkbox"]')?.checked === false`) === true || undefined);
      if (await watchValue(app, 'Start') === 'TRUE') app.note('After the release the input keeps the forced value in simulation (Start still reads TRUE)');
    },
  },
  {
    name: '9 Undo after switching tabs', example: 'motor_start_stop',
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const original = await editorText(app);
      await cursorAtEndOfLine(app, 1);
      await app.type(' AB');
      await app.click(tab('Explorer', 'exact'));
      await app.click(button('New File'));
      await app.click(css('#new-file-name'));
      await app.type('Second');
      await app.click(button('Create'));
      await app.until('the second file in the editor', async () => await app.visible(editorTab('file:src/Second.st')) && (await editorText(app)).length > 0 || undefined);
      const second = await editorText(app);
      await cursorAtEndOfLine(app, 1);
      await app.type(' XY');
      await app.until('the typed text in the second file', async () => await modelText(app, 'Second.st') === appendToFirstLine(second, ' XY') || undefined);
      await app.click(editorTab('file:src/Motor.st'));
      await app.until('Motor.st in the editor', async () => (await editorText(app)).startsWith('PROGRAM Motor') || undefined);
      await clickEditorLine(app, 5);
      await app.press('Ctrl+Z');
      await app.until('undo in Motor.st', async () => await modelText(app, 'Motor.st') === original || undefined);
      assert(await modelText(app, 'Second.st') === appendToFirstLine(second, ' XY'), 'Undo in Motor.st changed the second file.');
      await app.click(editorTab('file:src/Second.st'));
      await app.until('Second.st in the editor', async () => (await editorText(app)) === appendToFirstLine(second, ' XY') || undefined);
      await clickEditorLine(app, 1);
      await app.press('Ctrl+Z');
      await app.until('undo in Second.st', async () => await modelText(app, 'Second.st') === second || undefined);
      assert(await modelText(app, 'Motor.st') === original, 'Undo in Second.st changed Motor.st.');
    },
  },
  {
    name: '10 Close with unsaved changes', example: 'motor_start_stop',
    run: async (app, { project }) => {
      const file = join(project, 'src', 'Motor.st'); const original = disk(file);
      const edit = async () => { await openFile(app, 'src/Motor.st'); await cursorAtEndOfLine(app, 1); await app.type(EDIT); await app.until('the typed text', async () => (await editorText(app)).includes(EDIT) || undefined); };
      const askToClose = async (title: string) => { await app.click(button('Close Motor.st')); await app.until(`the prompt "${title}"`, async () => await dialogTitle(app) === title || undefined); };
      await openFolder(app, project);
      await edit();
      await askToClose('Unsaved changes in this tab');
      await app.click(dialogChoice('Cancel'));
      await app.until('the prompt to close', async () => await dialogTitle(app) === null || undefined);
      assert(await app.visible(editorTab('file:src/Motor.st')) && (await editorText(app)).includes(EDIT), 'Cancel must keep the tab and its changes.');
      await askToClose('Unsaved changes in this tab');
      await app.click(dialogChoice('Discard and close'));
      await app.until('the tab to close', async () => !await app.visible(editorTab('file:src/Motor.st')) || undefined);
      assert(disk(file) === original, 'Discard must leave the file as it was on disk.');
      await edit();
      await askToClose('Unsaved changes in this tab');
      await app.click(dialogChoice('Save and close'));
      await app.until('the saved file on disk', () => disk(file) !== original || undefined);
      await app.until('the tab to close', async () => !await app.visible(editorTab('file:src/Motor.st')) || undefined);
      await edit();
      void app.cdp.command('Browser.close').catch(() => undefined); // the window manager's close button cannot be pressed on the private display
      await app.until('the prompt before the window closes', async () => await dialogTitle(app) === 'Unsaved changes before you close' || undefined);
      await app.click(dialogChoice('Cancel'));
      await app.until('the prompt to close', async () => await dialogTitle(app) === null || undefined);
      assert((await editorText(app)).includes(EDIT), 'Cancel must keep the window and its changes.');
    },
  },
  {
    name: '11 Learn with no project open', example: 'none',
    run: async (app) => {
      const entry = `[...document.querySelectorAll('button, a, [role="button"], [role="link"], [role="tab"]')].find((item) => /learn/i.test(item.getAttribute('aria-label') ?? item.textContent ?? ''))`;
      if (!await app.visible(entry)) notPossible('The Welcome screen has no Learn entry (LRN-001, UX-022); Learn exists only as a tab of an open project.');
      await app.click(entry, 'the Learn entry');
      await app.until('the first lesson', async () => await app.visible(css('#learn-title')) || undefined);
    },
  },
  {
    name: '12 Restore the session', example: 'motor_start_stop',
    run: async (app, { project, relaunch }) => {
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const again = await relaunch();
      const offered = await again.until('the project to come back or be offered', async () => await again.visible(toolbar) || (await again.text()).includes('Recent') || undefined, 3_000)
        .catch(() => false);
      assert(offered, 'After a restart the app shows the plain Welcome screen: no recent project is offered and no tab is restored.');
      if (!await again.visible(toolbar)) {
        await again.click(button('Recent', 'contains'), 'a recent project');
        await again.until('the project workbench to appear', async () => await again.visible(toolbar) || undefined);
      }
      await again.until('the Motor.st tab restored', async () => await again.visible(editorTab('file:src/Motor.st')) || undefined);
    },
  },
];
