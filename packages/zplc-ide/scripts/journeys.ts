/**
 * The journeys of VF-008, each a function of the app under test that throws when the product does not do what the user
 * expects (assert), or reports that the journey cannot be performed at all (notPossible). Observation reads the screen
 * and the editor; every action is a real click, key or text insertion.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { learnLessonCatalog } from '../src/components/learnLesson';
import { compilerCompile } from '../src/cli/toolApi';
import { NATIVE_PROGRAM_MAX_BYTES } from '../electron/security';
import { assert, packageRoot } from './run-desktop-smoke';
import { button, css, menuItem, tab, type App, type Target } from './journeyApp';

export interface JourneyContext {
  root: string;
  /** A fresh folder holding a copy of the journey's example. */
  project: string;
  /** Closes the app and starts it again on the same user-data directory, as a user restarting it would. */
  relaunch(): Promise<App>;
  /** Kills the app process with SIGKILL, as a crash or a power loss would (no close prompt, no shutdown), and starts it again on the same user-data directory. */
  crash(): Promise<App>;
}
/**
 * `example` names the folder of projects/ copied into a fresh temporary folder for the journey, or `none`.
 * `proves` lists the requirements whose stated behaviour the journey executes end to end, and `partly` those of which it
 * executes only a leg (tools/ci/requirement-coverage.ts counts the first as covered and the second as partial).
 */
export interface Journey { name: string; example: string; proves: string[]; partly: string[]; run(app: App, context: JourneyContext): Promise<void> }

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
/** True when the text declares `PROGRAM <name>`: an example may open with a comment block, so its first characters say nothing. */
const hasProgram = (text: string, name: string) => new RegExp(`^PROGRAM ${name}\\b`, 'm').test(text);
/** The 1-based line of the open file that contains `text` (0 when none does), so that a journey does not hard-code where an example keeps a statement. */
const lineWith = async (app: App, text: string) => (await editorText(app)).split('\n').findIndex((line) => line.includes(text)) + 1;
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

/** Click a project file in the Explorer tree, expanding its folders first. */
async function clickTreeFile(app: App, path: string): Promise<void> {
  await app.click(tab('Explorer', 'exact'));
  const folders = path.split('/').slice(0, -1);
  for (let depth = 1; depth <= folders.length; depth++) {
    const id = `dir:${folders.slice(0, depth).join('/')}`;
    await app.until(`folder ${id} in the tree`, async () => await app.visible(treeItem(id)) || undefined);
    if (await app.eval(`${treeItem(id)}.getAttribute('aria-expanded') === 'false'`)) await app.click(treeItem(id));
  }
  await app.click(treeItem(`file:${path}`));
}

/** Open a project file by clicking it in the Explorer tree, expanding its folders first. */
async function openFile(app: App, path: string): Promise<void> {
  await clickTreeFile(app, path);
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
  const last = await lineWith(app, 'Reverse := FALSE;'); // the last statement of the program: the new one goes after it, inside the body
  assert(last > 0, 'Motor.st no longer has the statement Reverse := FALSE; the journey adds a faulty statement after.');
  await cursorAtEndOfLine(app, last);
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

/** The sessions the app keeps under its user-data directory (the journey's private profile), read the way a maintainer would. */
function savedSessions(root: string): Array<{ tabs: Array<{ path: string; line: number; column: number; scrollTop: number }>; activePath: string | null; panels: { editor: number; console: number; consoleCollapsed: boolean } | null }> {
  const directory = join(root, 'profile', 'sessions');
  return existsSync(directory) ? readdirSync(directory).filter((name) => /^[0-9a-f]{64}\.json$/.test(name)).map((name) => JSON.parse(disk(join(directory, name)))) : [];
}

/** What the app keeps of modified files under its user-data directory (the journey's private profile): every entry of every project. */
function recoveryEntries(root: string): Array<{ path: string; content: string; savedAt: number }> {
  const base = join(root, 'profile', 'recovery');
  if (!existsSync(base)) return [];
  return readdirSync(base).flatMap((project) => existsSync(join(base, project)) && !project.includes('.')
    ? readdirSync(join(base, project)).filter((name) => /^[0-9a-f]{64}\.json$/.test(name)).map((name) => JSON.parse(disk(join(base, project, name))))
    : []);
}
const recoveryOffer = css('[data-recovery-offer]');

const recentSection = css('[data-recent-projects]');
const recentRow = css('[data-recent-project]');
const recentOpen = css('[data-recent-project] > button');
/** The editor's cursor and scroll, as the user sees them. */
const editorView = (app: App) => monacoEval<{ line: number; column: number; scrollTop: number }>(app, 'const position = editor.getPosition(); return { line: position.lineNumber, column: position.column, scrollTop: editor.getScrollTop() };');
const activeTabId = (app: App) => app.eval<string | null>(`document.querySelector('[role="tab"][aria-selected="true"][id^="editor-tab-"]')?.id ?? null`);
/** How tall the editor is: with the lower panel it makes the split that a project keeps. */
const editorHeight = (app: App) => app.eval<number>(`document.getElementById('editor')?.getBoundingClientRect().height ?? 0`);
const savePicture = async (app: App, variable: string) => {
  const file = process.env[variable];
  if (file) { const png = await app.cdp.command('Page.captureScreenshot', { format: 'png' }) as { data: string }; writeFileSync(file, Buffer.from(png.data, 'base64')); }
};

/** Every file called `name` under `folder`, as paths relative to it (the app decides which subfolder a new file lands in). */
function findOnDisk(folder: string, name: string): string[] {
  const found: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(join(directory, entry.name));
      else if (entry.name === name) found.push(join(directory, entry.name).slice(folder.length + 1));
    }
  };
  visit(folder);
  return found;
}

/** Explorer > New File: type a name, pick the language with the keyboard, and press Create (or stop at the dialog when `create` is false). */
async function newFile(app: App, name: string, language: 'ST' | 'IL' | 'LD' | 'FBD' | 'SFC', create = true): Promise<void> {
  await app.click(tab('Explorer', 'exact'));
  await app.click(button('New File'), 'the New File button of the Explorer');
  const nameField = css('#new-file-name');
  await app.until('the New File dialog', async () => await app.visible(nameField) || undefined);
  await app.click(nameField, 'the file name field');
  await app.type(name);
  // The language select starts on Structured Text; the arrow keys walk its options in order, as a keyboard user would.
  const order = ['ST', 'IL', 'LD', 'FBD', 'SFC'];
  await app.eval(`document.getElementById('new-file-language').focus()`);
  for (let step = 0; step < order.indexOf(language); step++) await app.press('ArrowDown');
  await app.until(`${language} in the language field`, async () => await app.eval<string>(`document.getElementById('new-file-language').value`) === language || undefined);
  if (create) await app.click(button('Create'), 'the Create button');
}
const newFileError = (app: App) => app.eval<string | null>(`document.getElementById('new-file-error')?.innerText ?? null`);
const ladderRungs = (app: App) => app.eval<number | null>(`(() => { const editor = document.querySelector('[aria-label="Ladder diagram editor"]'); const text = editor?.querySelector('.border-b span.text-xs')?.textContent ?? ''; const match = /(\\d+) rungs?/.exec(text); return editor ? (match ? Number(match[1]) : -1) : null; })()`);

/** The size in bytes of the .zplc file the compiler makes of a project with this body in its only program. */
async function compiledSize(body: string[]): Promise<number> {
  const folder = mkdtempSync(join(tmpdir(), 'zplc-journey-size-'));
  try {
    writeBigProject(folder, body);
    const compiled = await compilerCompile(folder) as unknown as { ok: boolean; zplcFile?: Uint8Array };
    assert(compiled.ok && compiled.zplcFile, 'The generated program does not compile.');
    return compiled.zplcFile.length;
  } finally { rmSync(folder, { recursive: true, force: true }); }
}
function writeBigProject(folder: string, body: string[]): void {
  mkdirSync(join(folder, 'src'), { recursive: true });
  writeFileSync(join(folder, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'Big', version: '1.0.0', target: { board: 'posix' }, tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Big.st'] }] }));
  writeFileSync(join(folder, 'src', 'Big.st'), ['PROGRAM Big', 'VAR', '  X : DINT;', '  Y : DINT;', 'END_VAR', ...body, 'END_PROGRAM', ''].join('\n'));
}
/**
 * A project whose compiled file is exactly `bytes` long. X grows by `n` on every scan. The body is `X := X + 1;` lines plus a few
 * one-line fillers whose sizes differ by one byte (`Y := 0;` and `Y := X;`), neither of which touches X, which is what lets the size be hit to the byte. The
 * statement sizes are measured with the compiler, not assumed, and the size of the result is checked.
 */
async function writeProjectOfSize(folder: string, bytes: number): Promise<void> {
  const base = await compiledSize([]);
  const step = await compiledSize(['  X := X + 1;']) - base;
  const small = await compiledSize(['  Y := 0;']) - base;
  const bigger = await compiledSize(['  Y := X;']) - base;
  assert(bigger === small + 1 && step > small, `The generator needs fillers one byte apart and shorter than a step (${small}, ${bigger} and ${step} bytes).`);
  // The fillers take at least small * (small - 1) bytes, which any count of both can add up to, and what is left is whole steps.
  const least = small * (small - 1);
  const fillers = least + ((bytes - base - least) % step);
  const b = fillers % small; const a = (fillers - bigger * b) / small;
  assert(Number.isInteger(a) && a >= 0, `The generator could not split ${fillers} bytes into fillers of ${small} and ${bigger} bytes.`);
  const steps = (bytes - base - fillers) / step;
  writeBigProject(folder, [...Array<string>(steps).fill('  X := X + 1;'), ...Array<string>(a).fill('  Y := 0;'), ...Array<string>(b).fill('  Y := X;')]);
  const made = await compiledSize([...Array<string>(steps).fill('  X := X + 1;'), ...Array<string>(a).fill('  Y := 0;'), ...Array<string>(b).fill('  Y := X;')]);
  assert(made === bytes, `The generated program is ${made} bytes, not the ${bytes} the journey needs.`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Journeys
// ---------------------------------------------------------------------------------------------------------------------

const EDIT = ' (* journey edit: ñ 温度 *)';

export const JOURNEYS: Journey[] = [
  {
    name: '1 Open an existing folder', example: 'motor_start_stop', proves: [], partly: ['IDE-001', 'IDE-003', 'VF-008'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await app.click(tab('Explorer', 'exact'));
      await app.until('the src folder of the project in the tree', async () => await app.visible(treeItem('dir:src')) || undefined);
      assert(!(await app.text()).includes('The project could not be opened'), 'The workbench shows an open error.');
      assert((await outputText(app)).includes('Opened project: Motor Start Stop'), 'Output does not report the opened project.');
    },
  },
  {
    name: '2 Create a project from an example', example: 'motor_start_stop', proves: [], partly: ['IDE-009'],
    run: async (app, { root }) => {
      const folder = join(root, 'new-project'); mkdirSync(folder);
      app.answer(folder);
      await app.click(css('button[data-welcome-example="motor_start_stop"]'), 'the Motor Start Stop example card');
      await app.until('the project workbench to appear', async () => await app.visible(toolbar) || undefined);
      assert(existsSync(join(folder, 'zplc.json')) && existsSync(join(folder, 'src', 'Motor.st')), 'The chosen folder does not hold the example (zplc.json, src/Motor.st).');
      await openFile(app, 'src/Motor.st');
      assert(hasProgram(await editorText(app), 'Motor'), 'The created project does not open its program.');
    },
  },
  {
    name: '2b Create a new project', example: 'none', proves: [], partly: ['IDE-009'],
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
    name: '3 Edit Structured Text, save, reopen', example: 'motor_start_stop', proves: [], partly: ['IDE-003', 'LNG-001'],
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
    name: '3b Save with Ctrl+S in the editor', example: 'motor_start_stop', proves: [], partly: ['IDE-003'],
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
    name: '4 Build with an error, reach it from Problems', example: 'motor_start_stop', proves: [], partly: ['IDE-020', 'CMP-001'],
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
    name: '4b Problems say what is wrong', example: 'motor_start_stop', proves: [], partly: ['CMP-001', 'CMP-010'],
    run: async (app, { project }) => {
      await buildWithUndeclaredVariable(app, project);
      await app.click(tab('Problems'));
      const problems = await app.eval<string>(`document.querySelector('[aria-label="Latest build diagnostics"]')?.innerText ?? ''`);
      assert(problems.includes("Unknown identifier 'UndefinedVariable'"), `The Problems list does not say what is wrong with the program ("Unknown identifier 'UndefinedVariable'" is what the compiler reports): ${JSON.stringify(problems)}`);
      assert(!/(^|[\s'"(])\/[\w.~@+-]|[A-Za-z]:[\\/]/.test(problems), `The Problems list shows an absolute path of the machine: ${JSON.stringify(problems)}`);
    },
  },
  {
    name: '5 Build successfully', example: 'motor_start_stop', proves: [], partly: ['LNG-001'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const result = await compile(app);
      assert(result.kind === 'built', `Build right after opening the folder: ${result.message}`);
    },
  },
  {
    name: '5b Tests need no zplc.json to be chosen', example: 'motor_start_stop', proves: [], partly: ['IDE-001'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await app.click(tab('Tests'));
      await app.until('the Tests tab to report the linked workspace', async () => (await app.text()).includes('Linked saved workspace ready') || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the Tests tab asks for a file instead (${(await app.text()).includes('Select the saved workspace zplc.json') ? 'it says to select the zplc.json' : 'no link is shown'})`); });
    },
  },
  {
    name: '6 Simulate: connect, run, watch a value change', example: 'blinky_st', proves: [], partly: ['LNG-001'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/main.st');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky (Structured Text) example does not build: ${result.message}`);
      await connectAndRun(app);
      const before = await cycles(app);
      await app.until('the cycle counter to advance', async () => await cycles(app) > before + 20 || undefined);
      await watch(app, 'LED_Output');
      const seen = new Set<string | null>();
      await app.until('LED_Output to change between TRUE and FALSE', async () => { seen.add(await watchValue(app, 'LED_Output')); return seen.has('TRUE') && seen.has('FALSE') || undefined; });
    },
  },
  {
    name: '7 Breakpoint stops execution', example: 'motor_start_stop', proves: [], partly: ['LNG-005', 'LNG-027'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const line = await lineWith(app, 'Forward := SealIn;');
      assert(line > 0, 'Motor.st no longer has the statement Forward := SealIn; the journey aims at.');
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
    name: '8 Force an input and release it', example: 'motor_start_stop', proves: [], partly: ['IDE-019', 'IDE-029'],
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
    name: '9 Undo after switching tabs', example: 'motor_start_stop', proves: ['LNG-009'], partly: [],
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
      await app.until('Motor.st in the editor', async () => hasProgram(await editorText(app), 'Motor') || undefined);
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
    name: '10 Close with unsaved changes', example: 'motor_start_stop', proves: [], partly: ['IDE-005'],
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
    name: '11 Learn with no project open', example: 'none', proves: [], partly: ['LRN-001', 'LRN-003'],
    run: async (app, { root }) => {
      const first = learnLessonCatalog.en[0]!;
      const folder = join(root, 'learn-project'); mkdirSync(folder);
      app.answer(folder);
      await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await app.until('the project workbench to appear', async () => await app.visible(toolbar) || undefined);
      const starter = JSON.parse(disk(join(packageRoot, 'projects', first.starterExampleId, 'zplc.json'))) as { name: string };
      assert(existsSync(join(folder, 'zplc.json')) && (JSON.parse(disk(join(folder, 'zplc.json'))) as { name: string }).name === starter.name, `The chosen folder does not hold the first lesson's starter project (${first.starterExampleId}).`);
      await app.until('the Learn tab to show the first lesson', async () => await app.eval<boolean>(`document.getElementById('console-tab-learn')?.getAttribute('aria-selected') === 'true' && ${JSON.stringify([learnLessonCatalog.es[0]!.title, first.title])}.includes(document.getElementById('learn-title')?.textContent?.trim() ?? '')`) || undefined);
      assert(await app.eval<boolean>(`[...document.querySelectorAll('[aria-label="Lesson"] button, [aria-label="Lección"] button')][0]?.getAttribute('aria-pressed') === 'true'`), 'The first lesson is not the one selected in the Learn tab.');
      assert(!(await app.text()).includes('The project could not be opened'), 'The workbench shows an open error.');
    },
  },
  {
    name: '12 Restore the session', example: 'motor_start_stop', proves: ['IDE-008'], partly: [],
    run: async (app, { project, root, relaunch }) => {
      const before = readdirSync(project).sort();
      writeFileSync(join(project, 'src', 'Long.st'), ['PROGRAM Long', 'VAR', '  Flag : BOOL;', 'END_VAR', ...Array.from({ length: 250 }, (_, index) => `(* filler line ${index + 5} *)`), 'Flag := TRUE;', 'END_PROGRAM', ''].join('\n'));
      const withLong = readdirSync(join(project, 'src')).sort();

      // Work: Motor.st with the cursor on a distinctive line, Long.st scrolled far down with the cursor there, Motor.st active again,
      // and the lower panel resized with the keyboard.
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      await cursorAtEndOfLine(app, 30);
      const motor = await editorView(app);
      assert(motor.line === 30, `The journey could not put the cursor on line 30 of Motor.st: ${JSON.stringify(motor)}`);
      await openFile(app, 'src/Long.st');
      await clickEditorLine(app, 120);
      await app.until('the cursor on line 120 of Long.st', async () => (await editorView(app)).line === 120 || undefined);
      const long = await editorView(app);
      assert(long.scrollTop > 500, `Long.st did not scroll: ${JSON.stringify(long)}`);
      await app.click(editorTab('file:src/Motor.st'));
      await app.until('Motor.st in the editor', async () => hasProgram(await editorText(app), 'Motor') || undefined);
      await app.click(css('[role="separator"]'), 'the separator above the lower panel');
      for (let step = 0; step < 3; step++) await app.press('ArrowUp');
      const heightBefore = await editorHeight(app);
      await app.until('a session with both tabs, the active tab and the panel split on disk', () => {
        const [session] = savedSessions(root);
        return session?.tabs.map((item) => item.path).join() === 'src/Motor.st,src/Long.st' && session.activePath === 'src/Motor.st' && session.tabs[1]!.line === 120 && session.panels !== null || undefined;
      });
      // The user moves the cursor once more and closes the app at once, before any delay could have saved it.
      await clickEditorLine(app, 12);
      await app.until('the cursor on line 12 of Motor.st', async () => (await editorView(app)).line === 12 || undefined);
      assert(JSON.stringify(readdirSync(project).sort()) === JSON.stringify(before), 'The app wrote into the project folder: it must keep recent projects and sessions in its own profile.');
      assert(JSON.stringify(readdirSync(join(project, 'src')).sort()) === JSON.stringify(withLong), 'The app wrote into the src folder of the project.');

      const again = await relaunch();
      // Welcome offers the project under Recent, and nothing else has opened.
      await again.until('the Recent section on the Welcome screen', async () => await again.visible(recentSection) || undefined);
      assert(!await again.visible(toolbar), 'The project opened by itself: the user chose to reopen it, so it must wait on the Welcome screen.');
      const entry = await again.eval<string>(`document.querySelector('[data-recent-project]')?.innerText ?? ''`);
      assert(/^project\b/.test(entry) && /Opened (just now|\d+ minutes? ago)/.test(entry) && !entry.includes(root), `The Recent entry should show the folder name and when it was opened, and no path: ${JSON.stringify(entry)}`);
      await savePicture(again, 'ZPLC_JOURNEY_RECENT_SHOT');

      // A click reopens it without a dialog: the dialog hook now points at a folder that does not exist, so a dialog would fail.
      again.answer(join(root, 'not-the-project'));
      await again.click(recentOpen, 'the recent project');
      await again.until('the project workbench to appear', async () => await again.visible(toolbar) || undefined);
      assert(!(await again.text()).includes('The project could not be opened'), 'Reopening the recent project shows an open error.');
      await again.until('the Motor.st and Long.st tabs back', async () => await again.visible(editorTab('file:src/Motor.st')) && await again.visible(editorTab('file:src/Long.st')) || undefined);
      await again.until('Motor.st, the tab that was active, in the editor', async () => await activeTabId(again) === 'editor-tab-file:src/Motor.st' && hasProgram(await editorText(again), 'Motor') || undefined);
      const restoredMotor = await again.until('the cursor of Motor.st back', async () => { const view = await editorView(again); return view.line === 12 ? view : undefined; })
        .catch(async (error: Error) => { throw new Error(`${error.message}: the cursor of Motor.st is at ${JSON.stringify(await editorView(again))}; it was moved to line 12 just before the app closed (line 30 before that)`); });
      assert(restoredMotor.line === 12, 'The cursor of Motor.st is not where it was left.');
      await again.click(editorTab('file:src/Long.st'));
      await again.until('Long.st in the editor', async () => (await editorText(again)).startsWith('PROGRAM Long') || undefined);
      const restoredLong = await again.until('the cursor and scroll of Long.st back', async () => { const view = await editorView(again); return view.line === 120 ? view : undefined; })
        .catch(async (error: Error) => { throw new Error(`${error.message}: Long.st shows ${JSON.stringify(await editorView(again))}, it was left at ${JSON.stringify(long)}`); });
      assert(Math.abs(restoredLong.scrollTop - long.scrollTop) <= 30, `Long.st is scrolled to ${restoredLong.scrollTop}, it was left at ${long.scrollTop}.`);
      const heightAfter = await editorHeight(again);
      assert(Math.abs(heightAfter - heightBefore) <= 4, `The editor is ${heightAfter}px tall, it was ${heightBefore}px when the app closed: the panel split is not restored.`);
      assert(!(await again.text()).includes('The project could not be opened'), 'The workbench shows an open error.');
    },
  },
  {
    name: '13 Welcome helps a newcomer choose', example: 'none', proves: [], partly: ['UX-022', 'UX-023', 'UX-027', 'LRN-036'],
    run: async (app) => {
      assert(await app.visible(button('Learn', 'prefix')), 'The Welcome screen has no Learn button.');
      const groups = await app.eval<Array<{ heading: string; examples: number; withSummary: number }>>(`[...document.querySelectorAll('[data-example-group]')].map((section) => ({ heading: section.querySelector('h3')?.textContent?.trim() ?? '', examples: section.querySelectorAll('[data-welcome-example]').length, withSummary: section.querySelectorAll('[data-welcome-example] [data-example-summary]').length }))`);
      assert(groups.length >= 3, `The examples are not grouped under at least three headings: ${JSON.stringify(groups)}`);
      assert(groups.every((group) => group.heading && group.examples > 0 && group.withSummary === group.examples), `Every group needs a heading and a summary on each of its examples: ${JSON.stringify(groups)}`);
      const listed = await app.eval<string[]>(`[...document.querySelectorAll('[data-welcome-example]')].map((card) => card.getAttribute('data-welcome-example'))`);
      assert(!listed.some((id) => id!.endsWith('_starter') || id === 'kitchen_sink' || id === 'pico_persist_test'), `A starter or a test fixture is listed as an example: ${JSON.stringify(listed)}`);
      const card = (id: string) => app.eval<string>(`document.querySelector('[data-welcome-example="${id}"]')?.textContent ?? ''`);
      assert((await card('pico_blinky')).includes('Raspberry Pi Pico') && !(await card('pico_blinky')).includes('ESP32'), 'The card of pico_blinky should name the Raspberry Pi Pico it targets.');
      assert((await card('esp32s3_blinky')).includes('ESP32-S3 DevKitC') && (await card('esp32s3_blinky')).includes('per the current overlay'), 'The card of esp32s3_blinky should name its board and say the pin is per the current overlay.');

      // The page scrolls inside its own area: neither a horizontal nor a vertical scrollbar may appear on the window, at the size
      // the app asks for (1440 wide) and in the smaller windows a laptop gives.
      for (const width of [1440, 1280, 1024]) {
        await app.cdp.command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        const measure = await app.until(`the Welcome page laid out at ${width} px`, async () => { const found = await app.eval<{ innerWidth: number; scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number }>(`(() => { const page = document.documentElement; return { innerWidth, scrollWidth: page.scrollWidth, clientWidth: page.clientWidth, scrollHeight: page.scrollHeight, clientHeight: page.clientHeight }; })()`); return found.innerWidth === width ? found : undefined; });
        assert(measure.scrollWidth <= measure.clientWidth, `At ${width} px the Welcome page is wider than the window (${JSON.stringify(measure)}): a horizontal scrollbar shows at the bottom.`);
        assert(measure.scrollHeight <= measure.clientHeight, `At ${width} px the window itself scrolls (${JSON.stringify(measure)}): only the Welcome content area should.`);
      }
      await app.cdp.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

      // Exactly one control changes the theme, and it is the labelled "Theme" select.
      const controls = await app.eval<string[]>(`[...document.querySelectorAll('button, select, input, [role="switch"], [role="combobox"]')].filter((control) => /theme|contrast/i.test([control.getAttribute('aria-label'), control.getAttribute('title'), ...[...(control.labels ?? [])].map((label) => label.textContent)].join(' '))).map((control) => control.tagName.toLowerCase())`);
      assert(controls.length === 1 && controls[0] === 'select', `Expected exactly one theme control, a select: ${JSON.stringify(controls)}`);
      assert((await app.eval<string[]>(`[...document.querySelector('select[data-theme-control]').options].map((option) => option.textContent)`)).join('|') === 'Light|Dark|High contrast', 'The theme control does not offer Light, Dark and High contrast.');
      // A keyboard user reaches the select with Tab (the key table of the journeys has none), then picks with End, ArrowUp and Home.
      await app.eval(`document.querySelector('select[data-theme-control]').focus()`);
      assert(await app.eval<boolean>(`(() => { const select = document.querySelector('select[data-theme-control]'); return select.matches(':focus-visible') && getComputedStyle(select).outlineStyle !== 'none'; })()`), 'The theme control shows no focus ring.');
      const theme = () => app.eval<string>(`document.documentElement.getAttribute('data-theme')`);
      await app.press('End');
      await app.until('High contrast to apply', async () => await theme() === 'high-contrast' || undefined);
      await app.press('ArrowUp');
      await app.until('Dark to apply', async () => await theme() === 'dark' || undefined);
      await app.press('Home');
      await app.until('Light to apply', async () => await theme() === 'light' || undefined);
      assert(await app.eval<string>(`document.querySelector('select[data-theme-control]').value`) === 'light', 'The theme control does not show the theme that applies.');

      const shot = process.env.ZPLC_JOURNEY_WELCOME_SHOT;
      if (shot) { const png = await app.cdp.command('Page.captureScreenshot', { format: 'png' }) as { data: string }; writeFileSync(shot, Buffer.from(png.data, 'base64')); }
    },
  },
  {
    name: '14 A recent project that is gone', example: 'motor_start_stop', proves: [], partly: ['UX-022', 'IDE-003', 'IDE-008'],
    run: async (app, { project, root, relaunch }) => {
      await openFolder(app, project);
      await app.click(tab('Explorer', 'exact'));
      await app.click(button('Close Project'));
      await app.until('the Welcome screen with the project under Recent', async () => await app.visible(recentRow) || undefined);

      // The folder disappears while the Welcome screen still lists it as available.
      rmSync(project, { recursive: true, force: true });
      app.answer(join(root, 'not-the-project'));
      await app.click(recentOpen, 'the recent project');
      const error = await app.until('the reason on the entry itself', async () => await app.eval<string | null>(`document.querySelector('[data-recent-project] [data-recent-error]')?.innerText ?? null`) ?? undefined);
      assert(/not found/i.test(error) && !error.includes(root), `The entry should say, without a path, that the folder was not found: ${JSON.stringify(error)}`);
      assert(!await app.visible(css('[data-open-error]')), 'The failure is also shown in the general alert: it belongs on the entry.');
      await app.until('the entry disabled with the reason and a Forget button', async () => await app.eval<boolean>(`(() => { const row = document.querySelector('[data-recent-project]'); return Boolean(row?.querySelector('button')?.disabled) && (row?.innerText ?? '').includes('moved or deleted') && Boolean(row?.querySelector('button[aria-label^="Forget "]')); })()`) || undefined);
      assert(!await app.visible(toolbar), 'A project that is gone must not open a workbench.');

      // After a restart it is listed the same way, and Forget removes it for good.
      const again = await relaunch();
      await again.until('the Recent section on the Welcome screen', async () => await again.visible(recentSection) || undefined);
      assert(await again.eval<boolean>(`document.querySelector('[data-recent-project] > button').disabled === true`), 'After a restart the missing project can be clicked.');
      assert((await again.eval<string>(`document.querySelector('[data-recent-project]').innerText`)).includes('moved or deleted'), 'After a restart the missing project does not say why it cannot be opened.');
      await savePicture(again, 'ZPLC_JOURNEY_RECENT_MISSING_SHOT');
      await again.click(button('Forget project', 'prefix'), 'the Forget button');
      await again.until('the entry to disappear', async () => !await again.visible(recentRow) && !await again.visible(recentSection) || undefined);
      assert(await again.visible(button('Open project', 'contains')), 'The Welcome screen should be unchanged apart from the forgotten entry.');
      const third = await relaunch();
      await third.until('the Welcome screen', async () => await third.visible(button('Open project', 'contains')) || undefined);
      await Bun.sleep(500); // the list is read when the screen opens; give it time to appear if it were still stored
      assert(!await third.visible(recentRow), 'A forgotten project came back after a restart.');
    },
  },
  {
    name: '15 New file: create, edit, save, reopen', example: 'motor_start_stop', proves: [], partly: ['IDE-004', 'LNG-001'],
    run: async (app, { project }) => {
      // A file an older version created with New File: the build reads boiler.ld as the same file as boiler.ld.json.
      writeFileSync(join(project, 'src', 'boiler.ld'), JSON.stringify({ name: 'boiler', rungs: [] }));
      await openFolder(app, project);

      // A Ladder file called pump: created from the dialog, edited with a click, saved with the keyboard.
      await newFile(app, 'pump', 'LD');
      await app.until('the Ladder editor on the new file', async () => await ladderRungs(app) !== null || undefined);
      const rungs = await ladderRungs(app) as number;
      await app.click(button('Add Rung', 'contains'), 'the Add Rung button');
      await app.until('one more rung in the editor', async () => await ladderRungs(app) === rungs + 1 || undefined);
      await app.press('Ctrl+S');
      const saved = await app.until('pump.ld.json on disk', () => { const found = findOnDisk(project, 'pump.ld.json'); return found.length === 1 ? found[0] : undefined; });
      await app.until('the saved file to hold the new rung', () => (JSON.parse(disk(join(project, saved))) as { rungs: unknown[] }).rungs.length === rungs + 1 || undefined);
      assert(findOnDisk(project, 'pump.ld').length === 0 && findOnDisk(project, 'pump.ld.ld.json').length === 0, 'New File left a file under the old short name next to pump.ld.json.');

      // Typing the extension does not double it.
      await newFile(app, 'valve.ld', 'LD');
      await app.until('valve.ld.json on disk', () => findOnDisk(project, 'valve.ld.json').length === 1 || undefined);
      assert(findOnDisk(project, 'valve.ld.ld.json').length === 0, 'A typed .ld was added to again: valve.ld.ld.json exists.');

      // Close the project and open it again: the Explorer lists the file and a click opens it in the Ladder editor, with its rung.
      await app.click(tab('Explorer', 'exact'));
      await app.click(button('Close Project'));
      await app.until('the Welcome screen', async () => await app.visible(button('Open project', 'contains')) || undefined);
      await openFolder(app, project);
      await app.click(tab('Explorer', 'exact'));
      const listed = await app.until('pump in the Explorer after reopening', async () => {
        const folders = saved.split('/').slice(0, -1);
        for (let depth = 1; depth <= folders.length; depth++) { const id = `dir:${folders.slice(0, depth).join('/')}`; if (await app.eval(`${treeItem(id)}?.getAttribute('aria-expanded') === 'false'`)) await app.click(treeItem(id)); }
        return await app.eval<string | null>(`${treeItem(`file:${saved}`)}?.innerText ?? null`) ?? undefined;
      });
      assert(listed.includes('pump.ld'), `The Explorer lists the new file as ${JSON.stringify(listed)} after reopening, not as pump.ld.`);
      await clickTreeFile(app, saved);
      await app.until('the Ladder editor with the saved rung', async () => await ladderRungs(app) === rungs + 1 || undefined);
      assert(await app.eval<boolean>(`[...document.querySelectorAll('[role="tab"][aria-selected="true"]')].some((item) => item.textContent?.includes('pump.ld'))`), 'The tab of pump.ld is not the selected one.');

      // A name that the build would read as an existing file is refused in the dialog, with the file named.
      await newFile(app, 'boiler', 'LD');
      const refusal = await app.until('the refusal in the New File dialog', async () => await newFileError(app) ?? undefined);
      assert(refusal.includes('boiler.ld') && /already exists/.test(refusal), `The refusal should name boiler.ld and say it already exists: ${JSON.stringify(refusal)}`);
      assert(await app.visible(css('#new-file-name')), 'The New File dialog closed on a refused name.');
      assert(findOnDisk(project, 'boiler.ld.json').length === 0, 'A twin of the old boiler.ld was created anyway.');
      await app.click(button('Cancel'), 'the Cancel button');
    },
  },
  {
    name: '16 Debug details: stop, trace, resume mid-scan', example: 'motor_start_stop', proves: [], partly: ['RT-017', 'LNG-027'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const line = await lineWith(app, 'Forward := SealIn;'); // the statement after it is Reverse := FALSE
      assert(line > 0, 'Motor.st no longer has the statement Forward := SealIn; the journey aims at.');
      const result = await compile(app);
      assert(result.kind === 'built', `The Motor example does not build: ${result.message}`);
      await clickEditorLine(app, line, 'gutter');
      await app.until(`a breakpoint dot on line ${line}`, async () => (await decoratedLines(app, 'glyphMarginClassName', 'breakpoint-glyph')).includes(line) || undefined);
      const hits = async () => (await outputText(app)).match(new RegExp(`Breakpoint hit at PC=0x68, line ${line}\\b`, 'g'))?.length ?? 0;
      const stoppedAgain = async (count: number) => await hits() >= count && await app.visible(button('Resume (F5)', 'prefix')) || undefined;
      await app.click(button('Connect'));
      await app.until('the simulation to connect', async () => await app.visible(button('Disconnect')) || undefined);
      await app.click(button('Run (F5)', 'prefix'));
      await app.until(`execution to stop at line ${line}`, async () => await app.visible(button('Resume (F5)', 'prefix')) || undefined);

      // The stop is explained three ways: a Console entry with the line, the toolbar offering Resume, and a Trace row that says paused.
      await app.until('the Console entry for the stop', async () => await hits() === 1 || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: Output says ${JSON.stringify((await outputText(app)).match(/Breakpoint hit[^\n]*/g))}`); });
      assert((await decoratedLines(app, 'className', 'current-line-highlight')).includes(line), `Execution paused but the editor does not mark line ${line}.`);
      await savePicture(app, 'ZPLC_JOURNEY_STOP_SHOT');
      await app.click(tab('Trace'));
      const errorCell = await app.until('a Trace row with the VM error of the stop', async () => await app.eval<string | null>(`document.querySelector('[id^="console-panel-"] table tbody tr td:nth-child(5)')?.innerText.trim() ?? null`) ?? undefined);
      assert(errorCell === '10 paused', `The Error column of the newest Trace row should read "10 paused", not ${JSON.stringify(errorCell)}.`);
      const cells = await app.eval<string[]>(`[...document.querySelectorAll('[id^="console-panel-"] table tbody tr:first-child td')].map((cell) => cell.innerText.trim())`);
      assert(cells[2] === 'paused' && cells[3] === '0x68', `The newest Trace row should read state "paused" at PC 0x68: ${JSON.stringify(cells)}`);

      // Pressing Start while stopped, then Resume: the scan that was interrupted finishes (its Forward and Reverse lines run) and the
      // next scan stops at the same line again. Before the runtime continued an interrupted scan, Resume began that scan again, so it
      // never finished and Forward never changed.
      await watch(app, 'Start'); await watch(app, 'Forward');
      const startValue = `${watchRow('Start')}?.children[1]`;
      await app.click(startValue, 'the value of Start', 2);
      await app.until('the value editor of Start to take focus', async () => await app.eval(`document.activeElement === ${watchRow('Start')}?.querySelector('input[type="text"]')`) || undefined);
      await app.type('1'); await app.press('Enter');
      await app.until('Start to read TRUE', async () => await watchValue(app, 'Start') === 'TRUE' || undefined);
      // Reading the Console switches its tab, so each Watch value is read after going back to the Watch tab.
      const watched = (name: string) => app.until(`${name} in the Watch table`, async () => { await app.click(tab('Watch', 'prefix')); return await watchValue(app, name) ?? undefined; });
      assert(await watched('Forward') === 'FALSE', 'Forward should still read FALSE: the stopped scan has not reached the statement.');

      const before = await cycles(app);
      await app.click(button('Resume (F5)', 'prefix'), 'the Resume button');
      await app.until('a second stop at the same line (the next scan)', async () => await stoppedAgain(2));
      await app.until('the interrupted scan to be counted', async () => await cycles(app) >= before + 1 || undefined);
      // The scan that just stopped is the second one: Start was seen with the motor armed, SealIn is set, but the statement has not written Forward yet.
      assert(await watched('Forward') === 'FALSE', 'Forward changed before the statement ran in the second scan.');
      await app.click(button('Resume (F5)', 'prefix'), 'the Resume button');
      await app.until('a third stop at the same line', async () => await stoppedAgain(3));
      await app.until('Forward to read TRUE: the rest of the second scan wrote it', async () => await watched('Forward') === 'TRUE' || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: Resume did not finish the interrupted scan (cycles ${await cycles(app)}, Forward ${await watched('Forward')}).`); });
      assert(await cycles(app) >= before + 2, `Two Resumes should complete two scans (cycles ${before} before, ${await cycles(app)} now).`);
    },
  },
  {
    name: '17 Large program, and one over the limit', example: 'none', proves: [], partly: ['CMP-043'],
    run: async (app, { root, relaunch }) => {
      const limit = NATIVE_PROGRAM_MAX_BYTES; // the code size of the VM: 0xB000
      const builtBytes = async (a: App) => Number(/Built saved workspace locally: (\d+) bytes/.exec((await outputText(a)).match(BUILD_RESULT)?.at(-1) ?? '')?.[1] ?? 'NaN');
      const simulateAndWatch = async (a: App, folder: string, bytes: number) => {
        await openFolder(a, folder);
        const result = await compile(a);
        assert(result.kind === 'built', `The ${bytes}-byte program does not build: ${result.message}`);
        assert(await builtBytes(a) === bytes, `The build reports ${await builtBytes(a)} bytes for a program that is ${bytes} bytes long.`);
        await connectAndRun(a);
        await watch(a, 'X');
        const first = await watchValue(a, 'X');
        await a.until(`X to change in the ${bytes}-byte program`, async () => await watchValue(a, 'X') !== first || undefined);
      };

      // About 12 KB, three times what the request buffer once carried: it loads, runs and X counts.
      const big = join(root, 'big');
      await writeProjectOfSize(big, 12_000);
      await simulateAndWatch(app, big, 12_000);

      // Exactly the VM's code size still loads and runs; one byte more is refused, in words, in the Console.
      const largest = join(root, 'largest');
      await writeProjectOfSize(largest, limit);
      const second = await relaunch();
      await simulateAndWatch(second, largest, limit);

      const over = join(root, 'over');
      await writeProjectOfSize(over, limit + 1);
      const third = await relaunch();
      await openFolder(third, over);
      const built = await compile(third);
      assert(built.kind === 'built', `The ${limit + 1}-byte program does not build: ${built.message}`);
      await third.click(button('Connect'));
      await third.until('the simulation to connect', async () => await third.visible(button('Disconnect')) || undefined);
      await third.click(button('Run (F5)', 'prefix'));
      const refusal = `the program is ${limit + 1} bytes, but the native simulation loads at most ${limit} bytes`;
      await third.until('the refusal in the Console', async () => (await outputText(third)).includes(refusal) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: Output says ${JSON.stringify((await outputText(third)).slice(-700))}`); });
      assert(!await third.visible(button('Pause (F6)', 'prefix')), 'The program that is over the limit seems to be running.');
      assert(!(await outputText(third)).includes('unable to parse request envelope'), 'The Console shows the runtime\'s raw parse failure, not the size message.');
    },
  },
  {
    name: '18 Force an input while stopped at a breakpoint', example: 'motor_start_stop', proves: [], partly: ['IDE-019', 'IDE-029', 'RT-017'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const line = await lineWith(app, 'Forward := SealIn;'); // the statement after it is Reverse := FALSE
      assert(line > 0, 'Motor.st no longer has the statement Forward := SealIn; the journey aims at.');
      const result = await compile(app);
      assert(result.kind === 'built', `The Motor example does not build: ${result.message}`);
      await clickEditorLine(app, line, 'gutter');
      await app.until(`a breakpoint dot on line ${line}`, async () => (await decoratedLines(app, 'glyphMarginClassName', 'breakpoint-glyph')).includes(line) || undefined);
      await app.click(button('Connect'));
      await app.until('the simulation to connect', async () => await app.visible(button('Disconnect')) || undefined);
      await app.click(button('Run (F5)', 'prefix'));
      await app.until(`execution to stop at line ${line}`, async () => await app.visible(button('Resume (F5)', 'prefix')) || undefined);
      const stopped = () => app.visible(button('Resume (F5)', 'prefix'));

      // Add Start to the Watch table and aim at its Force checkbox the moment the row appears, before its value has been read (the
      // table polls every 100 ms). A click then did nothing and said nothing: the handler dropped it for want of a value. The box must
      // not offer itself until it can work, and the click that waits for it must then force the input.
      await app.click(tab('Watch', 'prefix'));
      if (!await app.visible(css('input[placeholder^="Variable path"]'))) await app.click(css('button[title="Add variable"]'));
      await app.click(css('input[placeholder^="Variable path"]'));
      await app.type('Start');
      const forceBox = css('input[aria-label="Force Start"]');
      const appeared = app.eval<{ disabled: boolean; value: string }>(`new Promise((resolve) => { const look = () => { const box = ${forceBox}; if (!box) return false; resolve({ disabled: box.disabled, value: box.closest('tr').children[1].innerText.trim() }); return true; }; if (!look()) { const observer = new MutationObserver(() => { if (look()) observer.disconnect(); }); observer.observe(document.body, { childList: true, subtree: true }); } })`);
      await app.press('Enter');
      const first = await appeared;
      await app.click(forceBox, 'the Force checkbox of Start');
      await app.until('Start to be forced', async () => await app.eval(`${watchRow('Start')}?.querySelector('[data-forced="true"]') !== null`) === true || undefined, 5_000)
        .catch((error: Error) => { throw new Error(`${error.message}: the click on the Force checkbox of Start did nothing while the execution was stopped (when the row appeared its value read ${JSON.stringify(first.value)} and the checkbox was ${first.disabled ? 'disabled' : 'enabled'}).`); });
      assert((await app.text()).includes('1 active force'), 'The force banner does not show one active force.');

      // The forced value is the one the program sees once it resumes: edit it to 1, as a user holding the input does.
      const startValue = `${watchRow('Start')}?.children[1]`;
      if (!await app.clickable(startValue)) {
        app.note('With a force active the Watch table has no visible row at the default panel size');
        await app.click(css('[role="separator"]'), 'the separator above the lower panel');
        for (let step = 0; step < 6; step++) await app.press('ArrowUp');
      }
      await app.click(startValue, 'the value of Start', 2);
      await app.until('the value editor of Start to take focus', async () => await app.eval(`document.activeElement === ${watchRow('Start')}?.querySelector('input[type="text"]')`) || undefined);
      await app.type('1'); await app.press('Enter');
      const watched = (name: string) => app.until(`${name} in the Watch table`, async () => { await app.click(tab('Watch', 'prefix')); return await watchValue(app, name) ?? undefined; });
      await app.until('Start to read TRUE', async () => await watchValue(app, 'Start') === 'TRUE' || undefined);
      await watch(app, 'Forward');
      const read = (name: string) => app.until(`${name} to be read`, async () => { const value = await watched(name); return value !== '...' ? value : undefined; });
      assert(await read('Forward') === 'FALSE', 'Forward should still read FALSE: the stopped scan has not reached the statement.');

      // Two Resumes complete two scans (the first finishes the interrupted one), and Start is seen forced to 1 by the second.
      const before = await cycles(app);
      await app.click(button('Resume (F5)', 'prefix'), 'the Resume button');
      await app.until('a second stop at the same line (the next scan)', async () => await cycles(app) >= before + 1 && await stopped() || undefined);
      assert(await watched('Forward') === 'FALSE', 'Forward changed before the statement ran in the second scan.');
      await app.click(button('Resume (F5)', 'prefix'), 'the Resume button');
      await app.until('a third stop at the same line', async () => await cycles(app) >= before + 2 && await stopped() || undefined);
      await app.until('Forward to read TRUE: the forced Start reached the motor logic', async () => await watched('Forward') === 'TRUE' || undefined);

      // The force stays until the user releases it, here with the same checkbox, while stopped.
      await app.click(forceBox, 'the Force checkbox of Start');
      await app.until('the force to be released', async () => !(await app.text()).includes('active force') && await app.eval(`${watchRow('Start')}?.querySelector('input[type="checkbox"]')?.checked === false`) === true || undefined);
    },
  },

  {
    name: '19 Recover modified files after a crash', example: 'motor_start_stop', proves: ['IDE-006'], partly: [],
    run: async (app, { project, root, crash, relaunch }) => {
      const file = join(project, 'src', 'Motor.st'); const original = disk(file);
      const typeInto = async (target: App, text: string) => { await openFile(target, 'src/Motor.st'); await cursorAtEndOfLine(target, 1); await target.type(text); await target.until('the typed text', async () => (await editorText(target)).includes(text) || undefined); };
      const kept = (text: string) => recoveryEntries(root).find((entry) => entry.path === 'src/Motor.st' && entry.content.includes(text));
      const offered = async (target: App) => { await target.until('the offer to recover Motor.st', async () => await target.visible(recoveryOffer) || undefined); return target.eval<string>(`document.querySelector('[data-recovery-offer]')?.innerText ?? ''`); };

      // Modified text reaches the recovery store without a save, and the project folder is not touched.
      await openFolder(app, project);
      assert(recoveryEntries(root).length === 0, 'A fresh profile already holds recovery entries.');
      await typeInto(app, EDIT);
      await app.until('the typed text kept in the recovery store', () => kept(EDIT), 6_000);
      assert(disk(file) === original, 'The recovery store must not write into the project: the file on disk changed before any save.');

      // The process is killed: no prompt, no shutdown. The next start offers the file back, and Restore puts the text in the editor unsaved.
      let current = await crash();
      assert(!await current.visible(toolbar), 'The project opened by itself after the crash.');
      await openFolder(current, project);
      const offer = await offered(current);
      assert(offer.includes('Motor.st') && /kept at \d/.test(offer), `The offer should name the file and the time it was kept: ${JSON.stringify(offer)}`);
      assert(!offer.includes(root), 'The offer shows a path of the machine.');
      assert(!(await editorText(current)).includes(EDIT), 'The text came back before the user chose.');
      await current.click(button('Restore Motor.st'));
      await current.until('the recovered text in the editor', async () => (await editorText(current)).includes(EDIT) || undefined);
      assert(disk(file) === original, 'Restore must leave the file on disk alone until the user saves.');
      await current.click(saveButton);
      await current.until('the saved file on disk', () => disk(file).includes(EDIT) || undefined);
      await current.until('the recovery store to be empty after the save', () => recoveryEntries(root).length === 0 || undefined, 6_000);
      const saved = disk(file);

      // A second crash, and this time the user discards the kept text.
      const SECOND = ' (* second edit *)';
      await typeInto(current, SECOND);
      await current.until('the second text kept', () => kept(SECOND), 6_000);
      current = await crash();
      await openFolder(current, project);
      await offered(current);
      await current.click(button('Discard Motor.st'));
      await current.until('the offer to close', async () => !await current.visible(recoveryOffer) || undefined);
      await current.until('the recovery store to be empty after the discard', () => recoveryEntries(root).length === 0 || undefined, 6_000);
      assert(!(await editorText(current)).includes(SECOND) && disk(file) === saved, 'Discard must change neither the editor nor the file.');

      // A clean exit leaves nothing: the user answers the close prompt with Discard, and the next start offers nothing.
      await typeInto(current, ' (* third edit *)');
      await current.until('the third text kept', () => kept(' (* third edit *)'), 6_000);
      void current.cdp.command('Browser.close').catch(() => undefined);
      await current.until('the prompt before the window closes', async () => await dialogTitle(current) === 'Unsaved changes before you close' || undefined);
      await current.click(dialogChoice('Discard and close'));
      await current.until('the recovery store to be empty after a clean exit', () => recoveryEntries(root).length === 0 || undefined, 6_000);
      const last = await relaunch();
      await openFolder(last, project);
      await last.until('the editor', async () => (await editorText(last)).length > 0 || undefined).catch(() => undefined);
      await Bun.sleep(1_500);
      assert(!await last.visible(recoveryOffer), 'A clean exit left something to recover.');
    },
  },

  {
    name: '20 A failing region does not blank the window', example: 'motor_start_stop', proves: ['IDE-011'], partly: [],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const fail = (region: string) => app.eval(`window.dispatchEvent(new CustomEvent('zplc:inject-render-fault', { detail: ${JSON.stringify(region)} }))`);
      const regionError = (region: string) => css(`[data-region-error="${region}"]`);
      const retry = (region: string) => css(`[data-region-error="${region}"] button`);
      const regions = {
        Editor: async () => hasProgram(await editorText(app), 'Motor'),
        Panel: async () => await app.visible(tab('Explorer', 'exact')) && await app.visible(treeItem('dir:src')),
        Toolbar: async () => await app.visible(toolbar),
      } as const;
      // The other two regions keep working while one shows its error, and Retry brings that one back without reopening anything.
      for (const failing of ['Editor', 'Panel', 'Toolbar'] as const) {
        await fail(failing);
        await app.until(`the error of the ${failing} region`, async () => await app.visible(regionError(failing)) || undefined);
        const message = await app.eval<string>(`document.querySelector('[data-region-error="${failing}"]')?.innerText ?? ''`);
        assert(message.includes(`${failing} stopped working`) && message.includes('Retry'), `The ${failing} error should say what stopped and offer Retry: ${JSON.stringify(message)}`);
        assert((await app.text()).trim().length > 40, `The window is blank while the ${failing} region shows its error.`);
        for (const [other, works] of Object.entries(regions)) {
          if (other === failing) continue;
          assert(!await app.visible(regionError(other)), `The ${other} region shows an error although only ${failing} failed.`);
          assert(await works(), `The ${other} region stopped working when the ${failing} region failed.`);
        }
        await app.click(retry(failing), `Retry in the ${failing} region`);
        await app.until(`the ${failing} region to come back`, async () => !await app.visible(regionError(failing)) && await regions[failing]() || undefined);
      }
      assert(app.errors.filter((error) => !error.includes('Injected render fault')).length === 0, `Unexpected renderer errors: ${app.errors.join(' | ')}`);
    },
  },

  {
    name: '21 Preferences apply and persist per user', example: 'motor_start_stop', proves: ['IDE-007', 'IDE-010'], partly: [],
    run: async (app, { project, relaunch }) => {
      const file = join(project, 'src', 'Motor.st');
      /** Walks a native select to the option with this text with the arrow keys, as a keyboard user would. */
      const choose = async (target: App, selector: string, label: string) => {
        const state = () => target.eval<{ labels: string[]; index: number }>(`(() => { const select = document.querySelector(${JSON.stringify(selector)}); return { labels: [...select.options].map((option) => option.textContent), index: select.selectedIndex }; })()`);
        const { labels, index } = await state();
        const wanted = labels.indexOf(label);
        assert(wanted >= 0, `${selector} offers ${JSON.stringify(labels)}, not ${label}`);
        await target.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
        for (let step = 0; step < Math.abs(wanted - index); step++) await target.press(wanted > index ? 'ArrowDown' : 'ArrowUp');
        await target.until(`${selector} to show ${label}`, async () => (await state()).index === wanted || undefined);
      };
      const chosen = (target: App, selector: string) => target.eval<string>(`(() => { const select = document.querySelector(${JSON.stringify(selector)}); return select.options[select.selectedIndex].textContent; })()`);
      const root = (target: App) => target.eval<{ density: string | undefined; lang: string; theme: string | null; spacing: string; padding: number }>(`({ density: document.documentElement.dataset.density, lang: document.documentElement.lang, theme: document.documentElement.getAttribute('data-theme'), spacing: getComputedStyle(document.documentElement).getPropertyValue('--spacing').trim(), padding: parseFloat(getComputedStyle(document.querySelector('main') ?? document.body).paddingTop) })`);
      const editorOptions = (target: App) => monacoEval<{ fontSize: number; tabSize: number }>(target, 'return { fontSize: editor.getOption(monaco.editor.EditorOption.fontSize), tabSize: editor.getModel().getOptions().tabSize };');

      // Before anything is chosen: the defaults, and the update check is off.
      const before = await root(app);
      assert(before.density === 'comfortable', `The density starts as ${before.density}.`);
      await app.click(css('[data-welcome-preferences] summary'), 'the Preferences disclosure of the Welcome screen');
      await app.until('the preferences on the Welcome screen', async () => await app.visible(css('[data-app-preferences]')) || undefined);
      assert(await app.eval(`document.querySelector('[data-setting="checkForUpdates"]').checked === false`), 'The update check must be off until the user turns it on.');
      assert(await chosen(app, '[data-setting="autosaveSeconds"]') === 'Off', 'Autosave must be off until the user turns it on.');

      // Choices made on the Welcome screen apply at once.
      await choose(app, '[data-setting="density"]', 'Compact');
      await choose(app, '[data-setting="language"]', 'Español');
      await choose(app, 'select[data-theme-control]', 'Dark');
      const after = await root(app);
      assert(after.density === 'compact' && after.spacing === '0.1875rem' && after.padding < before.padding, `Compact density did not apply: ${JSON.stringify({ before, after })}`);
      assert(after.lang === 'es' && after.theme === 'dark', `Language or theme did not apply: ${JSON.stringify(after)}`);

      // Editor choices made inside the project, where the settings tab is.
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      assert(JSON.stringify(await editorOptions(app)) === JSON.stringify({ fontSize: 14, tabSize: 4 }), `The editor should start at 14 px and 4 spaces: ${JSON.stringify(await editorOptions(app))}`);
      await app.click(button('Project Settings'), 'the Project Settings button');
      await app.until('the preferences in the settings tab', async () => await app.visible(css('[data-app-preferences]')) || undefined);
      await choose(app, '[data-setting="editorFontSize"]', '20 px');
      await choose(app, '[data-setting="editorTabSize"]', '2 spaces');
      await choose(app, '[data-setting="autosaveSeconds"]', 'After 5 seconds without typing');
      await app.click(editorTab('file:src/Motor.st'));
      await app.until('Motor.st in the editor with the chosen font and tabs', async () => { const options = await editorOptions(app); return options.fontSize === 20 && options.tabSize === 2 || undefined; })
        .catch(async (error: Error) => { throw new Error(`${error.message}: the editor shows ${JSON.stringify(await editorOptions(app))}`); });

      // Autosave writes the file by itself, without a "Saved" line in Output.
      const original = disk(file);
      await cursorAtEndOfLine(app, 1);
      await app.type(EDIT);
      assert(disk(file) === original, 'The file was written at once: it should wait for the typing to stop.');
      await app.until('autosave to write the file', () => disk(file).includes(EDIT) || undefined, 20_000);
      assert(!(await outputText(app)).includes('Saved: Motor.st'), 'Autosave reported a "Saved" line in Output.');

      // A restart, as the same user: every choice is back.
      const again = await relaunch();
      const restored = await root(again);
      assert(restored.density === 'compact' && restored.lang === 'es' && restored.theme === 'dark', `The display preferences were not restored: ${JSON.stringify(restored)}`);
      await again.click(css('[data-welcome-preferences] summary'), 'the Preferences disclosure of the Welcome screen');
      await again.until('the preferences on the Welcome screen', async () => await again.visible(css('[data-app-preferences]')) || undefined);
      for (const [selector, label] of [['[data-setting="density"]', 'Compact'], ['[data-setting="language"]', 'Español'], ['[data-setting="editorFontSize"]', '20 px'], ['[data-setting="editorTabSize"]', '2 spaces'], ['[data-setting="autosaveSeconds"]', 'After 5 seconds without typing']] as const) {
        assert(await chosen(again, selector) === label, `${selector} should show ${label} after a restart, shows ${await chosen(again, selector)}`);
      }
      await openFolder(again, project);
      await openFile(again, 'src/Motor.st');
      assert(JSON.stringify(await editorOptions(again)) === JSON.stringify({ fontSize: 20, tabSize: 2 }), `The editor options were not restored: ${JSON.stringify(await editorOptions(again))}`);
    },
  },

  {
    name: '22 Close Project asks before it closes', example: 'motor_start_stop', proves: [], partly: ['IDE-005'],
    run: async (app, { project }) => {
      const file = join(project, 'src', 'Motor.st'); const original = disk(file);
      const edit = async () => { await openFile(app, 'src/Motor.st'); await cursorAtEndOfLine(app, 1); await app.type(EDIT); await app.until('the typed text', async () => (await editorText(app)).includes(EDIT) || undefined); };
      const welcome = async () => await app.until('the Welcome screen', async () => (await app.text()).includes('ZPLC Studio 2.0') && !await app.visible(toolbar) || undefined);
      const questionTitle = () => app.eval<string | null>(`document.querySelector('[role="dialog"] h2')?.textContent ?? null`);
      const choice = (label: string) => `[...document.querySelectorAll('[role="dialog"] button')].find((item) => item.textContent?.trim() === ${JSON.stringify(label)})`;
      const askToClose = async () => { await app.click(tab('Explorer', 'exact')); await app.click(button('Close Project')); await app.until('the question before the project closes', async () => await questionTitle() === 'Discard unsaved changes?' || undefined); };

      // Cancel keeps the project and its changes.
      await openFolder(app, project);
      await edit();
      await askToClose();
      await app.click(choice('Continue editing'), 'Continue editing');
      await app.until('the question to close', async () => await questionTitle() === null || undefined);
      assert(await app.visible(toolbar) && (await editorText(app)).includes(EDIT), 'Continue editing must keep the project and its changes.');
      assert(disk(file) === original, 'Cancelling must not write the file.');

      // Save all and close writes the file, then closes: the user is offered save, discard or cancel.
      await askToClose();
      await app.click(choice('Save all and close'), 'Save all and close');
      await app.until('the saved file on disk', () => disk(file).includes(EDIT) || undefined);
      await welcome();

      // Discard closes without writing.
      await openFolder(app, project);
      const saved = disk(file);
      await openFile(app, 'src/Motor.st');
      await cursorAtEndOfLine(app, 1);
      await app.type(' (* discard me *)');
      await askToClose();
      await app.click(choice('Discard changes and close'), 'Discard changes and close');
      await welcome();
      assert(disk(file) === saved, 'Discard must leave the file as it was on disk.');
    },
  },

  {
    name: '23 Project tree operations', example: 'motor_start_stop', proves: [], partly: ['IDE-004'],
    run: async (app, { project }) => {
      const motor = join(project, 'src', 'Motor.st'); const original = disk(motor);
      const menuChoice = (label: string) => `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.trim() === ${JSON.stringify(label)})`;
      const entryDialog = css('[data-entry-dialog]');
      const entryError = () => app.eval<string | null>(`document.querySelector('[data-entry-dialog] [role="alert"]')?.textContent ?? null`);
      const node = (path: string, kind: 'file' | 'dir') => treeItem(`${kind}:${path}`);
      const inTree = async (path: string, kind: 'file' | 'dir' = 'file') => await app.visible(node(path, kind));
      const contextMenu = async (path: string, kind: 'file' | 'dir', label: string) => {
        await app.rightClick(`${node(path, kind)}.firstElementChild`, `the ${path} row`);
        await app.until('the actions menu', async () => await app.visible(menuChoice(label)) || undefined);
        await app.click(menuChoice(label), label);
      };
      const typeName = async (name: string) => {
        await app.until('the name dialog', async () => await app.visible(entryDialog) || undefined);
        await app.eval(`document.getElementById('entry-name').focus()`);
        await app.press('Ctrl+A');
        await app.type(name);
      };

      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      await cursorAtEndOfLine(app, 1);
      await app.type(EDIT);
      await app.until('the typed text', async () => (await editorText(app)).includes(EDIT) || undefined);

      // New folder, in the folder the dialog starts on (src).
      await app.click(tab('Explorer', 'exact'));
      await app.click(button('New Folder'));
      await typeName('drivers');
      await app.click(button('Create'));
      await app.until('the new empty folder in the tree', async () => await inTree('src/drivers', 'dir') || undefined);
      assert(existsSync(join(project, 'src', 'drivers')), 'The folder was not created on disk.');

      // Rename the open, modified file from its context menu: the buffer, the tab and the task follow it.
      await contextMenu('src/Motor.st', 'file', 'Rename…');
      await typeName('Drive.st');
      await app.click(button('Rename'));
      await app.until('Drive.st in the tree', async () => await inTree('src/Drive.st') && !await inTree('src/Motor.st') || undefined);
      assert(!existsSync(motor) && disk(join(project, 'src', 'Drive.st')) === original, 'The file was not renamed on disk, or its content changed.');
      assert((await editorText(app)).includes(EDIT), 'The unsaved text did not follow the renamed file.');
      assert(await app.visible(editorTab('file:src/Drive.st')), 'The tab did not follow the renamed file.');
      assert(JSON.parse(disk(join(project, 'zplc.json'))).tasks.every((task: { programs: string[] }) => !task.programs.includes('Motor.st')), 'A task still runs Motor.st after the rename.');
      await app.click(saveButton);
      await app.until('the buffer saved under the new name', () => disk(join(project, 'src', 'Drive.st')).includes(EDIT) || undefined);
      assert(!existsSync(motor), 'Saving brought the old name back.');

      // A refused name stays in the dialog, in words, and changes nothing.
      await contextMenu('src/Drive.st', 'file', 'Rename…');
      await typeName('Fault.st');
      await app.click(button('Cancel'));
      await app.until('the dialog to close', async () => !await app.visible(entryDialog) || undefined);

      // Duplicate, then move the copy into the new folder, then delete the folder with it.
      await contextMenu('src/Drive.st', 'file', 'Duplicate');
      await app.until('the copy in the tree', async () => await inTree('src/Drive_copy.st') || undefined);
      assert(disk(join(project, 'src', 'Drive_copy.st')).includes(EDIT), 'The copy does not hold the content of the file.');
      await contextMenu('src/Drive.st', 'file', 'Rename…');
      await typeName('drive_COPY.st');
      await app.click(button('Rename'));
      await app.until('the refusal', async () => (await entryError())?.includes('already exists') || undefined);
      assert(existsSync(join(project, 'src', 'Drive.st')), 'A refused rename changed the disk.');
      await app.click(button('Cancel'));
      await contextMenu('src/Drive_copy.st', 'file', 'Move to…');
      await app.until('the move dialog', async () => await app.visible(entryDialog) || undefined);
      await app.eval(`document.getElementById('entry-folder').focus()`);
      const folders = await app.eval<string[]>(`[...document.getElementById('entry-folder').options].map((option) => option.value)`);
      assert(folders.includes('src/drivers'), `The move dialog does not offer the new folder: ${JSON.stringify(folders)}`);
      const current = await app.eval<number>(`document.getElementById('entry-folder').selectedIndex`);
      for (let step = 0; step < folders.indexOf('src/drivers') - current; step++) await app.press('ArrowDown');
      await app.click(button('Move'));
      await app.until('the copy in the folder', async () => await app.visible(node('src/drivers/Drive_copy.st', 'file')) || undefined);
      assert(!existsSync(join(project, 'src', 'Drive_copy.st')) && existsSync(join(project, 'src', 'drivers', 'Drive_copy.st')), 'The copy was not moved on disk.');
      await contextMenu('src/drivers', 'dir', 'Delete folder');
      await app.until('the confirmation', async () => (await app.text()).includes('Delete folder') && await app.visible(entryDialog) || undefined);
      await app.click(button('Delete folder', 'prefix'), 'the Delete folder button');
      await app.until('the folder gone from the tree', async () => !await inTree('src/drivers', 'dir') || undefined);
      assert(!existsSync(join(project, 'src', 'drivers')), 'The folder is still on disk.');
    },
  },
];
