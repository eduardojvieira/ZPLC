/**
 * The journeys of VF-008, each a function of the app under test that throws when the product does not do what the user
 * expects (assert), or reports that the journey cannot be performed at all (notPossible). Observation reads the screen
 * and the editor; every action is a real click, key or text insertion.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readZip } from '../electron/projectArchiveZip';
import { learnLessonCatalog } from '../src/components/learnLesson';
import { LESSON_INDEX } from '../src/generated/lessonIndex';
import { buildCourseView, courseOrder } from '../src/learn/course';
import { contrastRatio, parseColor } from '../src/theme/color';
import { resolveTokens, type ThemeId } from '../src/theme/tokens';
import { auditMarkup } from '../src/ui/audit';
import { compilerCompile } from '../src/cli/toolApi';
import { NATIVE_PROGRAM_MAX_BYTES } from '../electron/security';
import { assert, MONACO_MODULE_URL, packageRoot } from './run-desktop-smoke';
import { button, css, launchPackagedApp, menuItem, notPossible, tab, type App, type Target } from './journeyApp';
import { domAuditExpression, type DomAuditResult } from './domAudit';
import { attachEmulatedDevice } from './emulatedDevice';

export interface JourneyContext {
  root: string;
  /** A fresh folder holding a copy of the journey's example. */
  project: string;
  /** The native runtime binary of the run, for a journey that starts a device of its own. */
  runtime: string;
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
export interface Journey {
  name: string; example: string; proves: string[]; partly: string[];
  /** Added to the environment of the app: a journey that needs it started in a particular way (ZPLC_RUNTIME=wasm, for one). */
  environment?: Record<string, string>;
  run(app: App, context: JourneyContext): Promise<void>;
}

// ---------------------------------------------------------------------------------------------------------------------
// Steps a user performs
// ---------------------------------------------------------------------------------------------------------------------

const toolbar = css('[role="toolbar"][aria-label="Project operations"]');
/** The title of the Welcome screen: the product name of decision D-03, with no version (UX-016). */
const WELCOME_TITLE = `document.querySelector('h1')?.textContent ?? null`;
const treeItem = (id: string) => css(`[role="treeitem"][data-tree-node-id="${id}"]`);
const disk = (path: string) => readFileSync(path, 'utf8');

/** Open a folder through the Welcome screen's "Open project" button and the native dialog. */
async function openFolder(app: App, folder: string): Promise<void> {
  app.answer(folder);
  await app.click(button('Open project', 'contains'), 'the Open project button');
  await app.until('the project workbench to appear', async () => await app.visible(toolbar) || undefined);
}

/** A learner who turned on "Unlock all lessons" (the setting of the Learn home): stored, and the window started again from it. */
async function unlockAllLessons(app: App): Promise<void> {
  await app.eval(`(() => { const key = 'zplc-ide-settings'; const stored = JSON.parse(localStorage.getItem(key) || '{}'); const target = stored.settings ?? stored; target.unlockAllLessons = true; localStorage.setItem(key, JSON.stringify(stored)); })()`);
  await app.cdp.command('Page.reload');
  await app.until('the Welcome screen', async () => await app.visible(button('Open project', 'contains')) || undefined);
  // A page that was just reloaded has no focused element until the window has the focus again; a keyboard journey starts from there.
  await app.cdp.command('Emulation.setFocusEmulationEnabled', { enabled: true });
  await app.cdp.command('Page.bringToFront');
}

/** Chooses a lesson in the Learn view of the sidebar by the start of its title, as a learner clicks it. */
const lessonButton = (title: string) => `[...document.querySelectorAll('[aria-label="Lesson"] button, [aria-label="Lección"] button')].find((item) => item.textContent.trim().startsWith(${JSON.stringify(title)}))`;

/** The page's own Monaco instance (the editor core Studio bundles, as the dev server pre-bundles it) and its active editor, for reading what the editor shows and where things are. */
const monacoEval = <T>(app: App, body: string) => app.eval<T>(`(async () => { const monaco = await import(${MONACO_MODULE_URL}); const editor = monaco.editor.getEditors()[0]; ${body} })()`);
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
  // a line longer than the editor is wide is clicked at the right edge of what shows, before the minimap and the scrollbar
  const x = ${where === 'gutter' ? 'layout.glyphMarginLeft + layout.glyphMarginWidth / 2' : 'Math.min(pos.left + 40, layout.width - layout.minimap.minimapWidth - layout.verticalScrollbarWidth - 12)'};
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

/** The project navigator in its Files mode (the file tree), which is where the journeys click files: the Project activity of the rail, then the Files toggle. */
async function showExplorer(app: App): Promise<void> {
  await app.click(css('[data-activity="project"]'), 'the Project activity of the rail');
  await app.click(css('[aria-label="Navigator view"] button:nth-of-type(2)'), 'the Files mode of the navigator');
}

/** Click a project file in the Explorer tree, expanding its folders first. */
async function clickTreeFile(app: App, path: string): Promise<void> {
  await showExplorer(app);
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

/** Open a diagram file from the Explorer, and wait for its canvas (`ready` is a selector that exists once the editor has drawn it). */
async function openDiagram(app: App, path: string, ready: string): Promise<void> {
  await clickTreeFile(app, path);
  await app.until(`${path.split('/').at(-1)} on its canvas`, async () => await app.visible(css(ready)) || undefined);
}

const searchList = css('[data-keyboard-picker]');
/**
 * Answers the search list that a key of a visual editor opened: the text is typed into its search box, a choice that is
 * named is waited for, and the best match is taken with Enter, as a user does.
 */
async function answerSearchList(app: App, text: string, choice?: string): Promise<void> {
  await app.until('the search list to open', async () => await app.visible(searchList) || undefined)
    .catch(async (error: Error) => {
      const state = await app.eval<string>(`JSON.stringify({ status: document.querySelector('[data-visual-status]')?.textContent, focus: document.activeElement?.outerHTML.slice(0, 160), cursor: document.querySelector('[data-ld-cursor-at]')?.getAttribute('data-ld-cursor-at'), ask: document.querySelector('[data-ld-ask]')?.getAttribute('data-ld-ask'), pickers: document.querySelectorAll('[data-keyboard-picker]').length })`);
      throw new Error(`${error.message}: ${state}`);
    });
  await app.until('the search box to have the focus', async () => await app.eval<boolean>(`document.activeElement?.getAttribute('role') === 'combobox'`) || undefined);
  await app.type(text);
  if (choice) await app.until(`${choice} among the choices`, async () => await app.visible(css(`[data-picker-item="${choice}"]`)) || undefined);
  await app.press('Enter');
  await app.until('the search list to close', async () => !(await app.visible(searchList)) || undefined);
}

/** What the Problems panel lists after a failed build. */
async function problemsText(app: App): Promise<string> {
  await app.click(tab('Problems'));
  return await app.eval<string>(`(document.querySelector('[aria-label="Latest build diagnostics"]')?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 700)`);
}

/** Open the Problems panel and activate its first entry with a real click. */
async function activateFirstProblem(app: App): Promise<void> {
  await app.click(tab('Problems'));
  await app.until('a problem that can be activated', async () => await app.visible(css('[aria-label="Latest build diagnostics"] button')) || undefined);
  await app.click(css('[aria-label="Latest build diagnostics"] button'), 'the first problem');
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
  await app.until('the program to run', async () => await app.visible(button('Pause (F6)', 'prefix')) || undefined)
    .catch(async (error: Error) => { throw new Error(`${error.message}: the window says ${JSON.stringify((await app.text()).replace(/\s+/g, ' ').slice(-900))}`); });
}

const cycles = async (app: App) => Number((/cycles\s+(\d[\d,]*)/.exec(await app.eval<string>(`document.querySelector('[aria-label="Operational status"]')?.innerText ?? ''`))?.[1] ?? 'NaN').replace(/,/g, ''));

async function watch(app: App, variable: string): Promise<void> {
  await app.click(tab('Watch', 'prefix'));
  if (!await app.visible(css('input[placeholder^="Variable path"]'))) await app.click(button('Add variable'));
  await app.click(css('input[placeholder^="Variable path"]'));
  await app.type(variable);
  await app.press('Enter');
  await app.until(`${variable} in the Watch table`, async () => await watchValue(app, variable) !== null || undefined);
}
const watchRow = (name: string) => `[...document.querySelectorAll('tbody tr')].find((row) => row.firstElementChild?.textContent === ${JSON.stringify(name)})`;
const watchValue = (app: App, name: string) => app.eval<string | null>(`${watchRow(name)}?.children[1]?.innerText.trim() ?? null`);

/** The first output of `program` on the Live I/O faceplate of the Watch tab, seen both TRUE and FALSE while the program runs. */
async function outputTurnsOnAndOff(app: App, program: string): Promise<void> {
  await app.until('the faceplate', async () => await app.visible(css('[data-faceplate]')) || undefined, 45_000);
  const output = `[data-output^="${program}."] [data-output-value]`;
  const value = () => app.eval<string>(`document.querySelector(${JSON.stringify(output)})?.textContent?.trim() ?? ''`);
  await app.until(`an output of ${program} on the faceplate`, async () => (await value()) !== '' || undefined, 45_000);
  const seen = new Set<string>();
  await app.until(`an output of ${program} to turn on and off`, async () => { const now = await value(); if (/TRUE|FALSE/.test(now)) seen.add(now.includes('TRUE') ? 'TRUE' : 'FALSE'); return seen.size === 2 || undefined; }, 60_000);
}

/** LNG-027: Pause stops the scans, Step one cycle runs exactly one, Resume lets them run again. The cycle counter of the status bar is the witness. */
async function pauseStepResume(app: App): Promise<void> {
  await connectAndRun(app);
  await app.until('the scans to be counted', async () => await cycles(app) >= 1 || undefined, 60_000);
  await app.click(button('Pause (F6)', 'prefix'), 'the Pause button');
  await app.until('the toolbar to offer Resume', async () => await app.visible(button('Resume', 'prefix')) || undefined, 60_000);
  // a scan in flight when Pause was pressed may still be counted, and a loaded machine counts it late: wait for a steady counter
  let held = await cycles(app);
  for (let settled = 0; settled < 2;) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const now = await cycles(app);
    settled = now === held ? settled + 1 : 0;
    held = now;
  }
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert(await cycles(app) === held, `The cycle counter moved while the program was paused (${held} then ${await cycles(app)}).`);
  await app.click(button('Step one cycle', 'prefix'), 'the Step button');
  await app.until('one more cycle to be counted', async () => await cycles(app) > held || undefined, 60_000);
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert(await cycles(app) === held + 1, `Step one cycle should run exactly one scan (${held} before, ${await cycles(app)} after).`);
  await app.click(button('Resume', 'prefix'), 'the Resume button');
  await app.until('the program to run again', async () => await app.visible(button('Pause (F6)', 'prefix')) || undefined, 60_000);
  await app.until('the scans to be counted again', async () => await cycles(app) > held + 5 || undefined, 60_000);
}

/** A Force checkbox of the Watch table forces the variable and releases it. */
async function forceAndRelease(app: App, variable: string): Promise<void> {
  await watch(app, variable);
  await app.until(`${variable} to have a value in the Watch table`, async () => { const shown = await watchValue(app, variable); return shown !== null && shown !== '...' || undefined; }, 60_000);
  await app.click(css(`input[aria-label="Force ${variable}"]`), `the Force checkbox of ${variable}`);
  await app.until(`${variable} to be forced`, async () => await app.eval(`${watchRow(variable)}?.querySelector('[data-forced="true"]') !== null`) === true || undefined);
}
async function releaseForce(app: App, variable: string): Promise<void> {
  if (!await app.clickable(css(`input[aria-label="Force ${variable}"]`))) {
    app.note('With a force active the Watch table has no visible row at the default panel size');
    await app.click(css('#workspace-separator'), 'the separator above the lower panel');
    for (let step = 0; step < 6; step++) await app.press('ArrowUp');
  }
  await app.click(css(`input[aria-label="Force ${variable}"]`), `the Force checkbox of ${variable}`);
  await app.until('the force to be released', async () => await app.eval(`${watchRow(variable)}?.querySelector('input[type="checkbox"]')?.checked === false`) === true || undefined);
}

/** The prompt that asks what to do with unsaved changes, by its title; null when none is open. */
const dialogTitle = (app: App) => app.eval<string | null>(`document.querySelector('[data-unsaved-changes-dialog]')?.closest('[role="alertdialog"]')?.querySelector('h2')?.textContent ?? null`);
const dialogChoice = (label: string) => `(() => { const dialog = document.querySelector('[data-unsaved-changes-dialog]')?.closest('[role="alertdialog"]'); return [...(dialog?.querySelectorAll('button') ?? [])].find((item) => item.textContent === ${JSON.stringify(label)}); })()`;

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
/** DOC-013: when ZPLC_DOC_SHOTS names a folder, the picture of the window at this step is saved there as `<name>.png`. */
const docShot = async (app: App, name: string): Promise<void> => {
  const directory = process.env.ZPLC_DOC_SHOTS;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  const png = await app.cdp.command('Page.captureScreenshot', { format: 'png' }) as { data: string };
  writeFileSync(join(directory, `${name}.png`), Buffer.from(png.data, 'base64'));
};
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
  await showExplorer(app);
  await app.click(button('New file'), 'the New file button of the Explorer');
  const nameField = css('#new-file-name');
  await app.until('the New File dialog', async () => await app.visible(nameField) || undefined);
  await app.click(nameField, 'the file name field');
  await app.type(name);
  // The language select starts on Structured Text; the arrow keys walk its options in order, as a keyboard user would.
  const order = ['ST', 'IL', 'LD', 'FBD', 'SFC'];
  // Each step is judged by what the field shows: on a loaded machine the dialog can take the focus back or lose a key, and then a fixed count of presses ends on the wrong option.
  await app.until(`${language} in the language field`, async () => {
    const shown = order.indexOf(await app.eval<string>(`document.getElementById('new-file-language').value`));
    if (shown === order.indexOf(language)) return true;
    assert(shown < order.indexOf(language), `The language field went past ${language}.`);
    await app.eval(`document.activeElement?.id === 'new-file-language' || document.getElementById('new-file-language').focus()`);
    await app.press('ArrowDown');
    return undefined;
  });
  if (create) await app.click(button('Create'), 'the Create button');
}
const newFileError = (app: App) => app.eval<string | null>(`document.getElementById('new-file-name-error')?.innerText ?? null`);
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
// Security probes (IDE-016): what a hostile page, or a person with DevTools, can and cannot make the application do
// ---------------------------------------------------------------------------------------------------------------------

/** The project of the path probes: a folder with a file, a file outside it, and two links that leave it. */
export function writeSecurityFixture(base: string): { project: string; outside: string; secret: string } {
  const outside = realpathSync(mkdtempSync(join(base, 'security-')));
  // A real example, so that the project that the probes work in can also be built and tested afterwards.
  const project = join(outside, 'project');
  cpSync(join(packageRoot, 'projects', 'motor_start_stop'), project, { recursive: true });
  const secret = join(outside, 'secret.txt');
  writeFileSync(secret, 'outside the project');
  symlinkSync(secret, join(project, 'leak.txt'));
  symlinkSync(outside, join(project, 'linkdir'), 'dir');
  return { project, outside, secret };
}

/**
 * The five properties of IDE-016, each shown by what the running application does. The page injects a script, asks for
 * permissions, navigates, opens windows and sends project operations with hostile paths, as a person with DevTools could.
 * `packaged` says that the page runs the production policy (`script-src 'self' 'wasm-unsafe-eval'`): the development host serves its own
 * scripts inline for hot reload, so the inline-script probe is made only on the packaged application.
 */
export async function probeSecurity(app: App, options: { packaged: boolean; fixture: { project: string; outside: string; secret: string }; open(): Promise<string> }): Promise<string[]> {
  const evidence: string[] = [];
  const probe = <T,>(body: string) => app.eval<T>(`(async () => { ${body} })()`);

  // 1. An injected inline script is blocked.
  if (options.packaged) {
    const inline = await probe<{ ran: boolean; handlerRan: boolean; violations: string[] }>(`
      const violations = [];
      document.addEventListener('securitypolicyviolation', (event) => violations.push(event.violatedDirective));
      window.__zplcInline = false; window.__zplcHandler = false;
      const script = document.createElement('script'); script.textContent = 'window.__zplcInline = true;'; document.head.appendChild(script);
      const image = document.createElement('img'); image.setAttribute('onerror', 'window.__zplcHandler = true'); image.src = 'zplc-probe-missing.png'; document.body.appendChild(image);
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { ran: window.__zplcInline === true, handlerRan: window.__zplcHandler === true, violations };`);
    assert(!inline.ran, 'An inline script that the page injected ran.');
    assert(!inline.handlerRan, 'An inline event handler that the page injected ran.');
    assert(inline.violations.some((directive) => directive.startsWith('script-src')), `The policy reported no script violation: ${JSON.stringify(inline.violations)}`);
    evidence.push(`inline script and inline event handler blocked (${[...new Set(inline.violations)].join(', ')})`);
  }
  // The policy is applied to the page in both builds: a request to another origin is refused by connect-src.
  const connect = await probe<{ blocked: boolean; violated: string[] }>(`
    const violated = [];
    document.addEventListener('securitypolicyviolation', (event) => violated.push(event.violatedDirective));
    const blocked = await fetch('https://example.invalid/zplc-probe').then(() => false, () => true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { blocked, violated };`);
  assert(connect.blocked && connect.violated.includes('connect-src'), `A request to another origin was not stopped by the policy: ${JSON.stringify(connect)}`);
  evidence.push('a request to another origin is refused by connect-src');

  // 2. A permission other than serial is refused; serial is the one that the trusted document has.
  const permissions = await probe<Record<string, string>>(`
    const outcome = (promise) => promise.then(() => 'granted', (error) => error && error.name ? error.name : 'refused');
    return {
      notifications: await Notification.requestPermission(),
      geolocation: await new Promise((resolve) => navigator.geolocation.getCurrentPosition(() => resolve('granted'), (error) => resolve(error.code === 1 ? 'denied' : 'error:' + error.code))),
      // What the permission check handler answers for a device permission: a machine with no camera or microphone cannot tell
      // a refused request from a missing device, so the state that the page is given is read as well.
      camera: await navigator.permissions.query({ name: 'camera' }).then((status) => status.state, (error) => error.name),
      microphone: await navigator.permissions.query({ name: 'microphone' }).then((status) => status.state, (error) => error.name),
      clipboardRead: await outcome(navigator.clipboard.readText()),
      midi: await outcome(navigator.requestMIDIAccess()),
      serialPorts: await navigator.serial.getPorts().then((ports) => Array.isArray(ports) ? 'available' : 'unexpected', (error) => error.name),
    };`);
  for (const name of ['notifications', 'geolocation', 'camera', 'microphone', 'clipboardRead', 'midi']) {
    assert(permissions[name] !== 'granted' && ['denied', 'NotAllowedError', 'SecurityError', 'NotSupportedError', 'refused'].includes(permissions[name]!), `${name} was not refused: ${JSON.stringify(permissions)}`);
  }
  assert(permissions.serialPorts === 'available', `The trusted document cannot use serial: ${JSON.stringify(permissions)}`);
  evidence.push(`permissions refused: ${['notifications', 'geolocation', 'camera', 'microphone', 'clipboardRead', 'midi'].map((name) => `${name}=${permissions[name]}`).join(', ')}; serial available`);

  // 3. Navigation and new windows are refused.
  const pagesBefore = await app.pages();
  const navigation = await probe<{ sameDocument: boolean; opened: boolean; openedSame: boolean }>(`
    const href = location.href;
    const opened = window.open('https://example.invalid/zplc-probe');
    const openedSame = window.open(location.href);
    const link = document.createElement('a'); link.href = 'https://example.invalid/zplc-link'; link.target = '_blank'; document.body.appendChild(link); link.click(); link.remove();
    location.assign('https://example.invalid/zplc-navigation');
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { sameDocument: location.href === href, opened: opened !== null, openedSame: openedSame !== null };`);
  assert(navigation.sameDocument, 'The page navigated away from the application document.');
  assert(!navigation.opened && !navigation.openedSame, 'window.open produced a window.');
  assert(await app.pages() === pagesBefore, 'A window was opened.');
  evidence.push('window.open, a _blank link and navigation to another origin refused; the document and the window count did not change');

  // 4. A project operation with `..`, an absolute path or a link that leaves the project is refused.
  const rootId = await options.open();
  const operation = (name: string, request: string) => probe<{ ok: boolean; code?: string }>(`return await window.electronAPI.projectFiles.${name}(${request});`);
  /** The request as page script: `bytes` is a Uint8Array of the text after `utf8:` (a typed array does not survive JSON). */
  const literal = (request: Record<string, unknown>) => `{ ${Object.entries({ rootId, ...request }).map(([key, value]) => `${JSON.stringify(key)}: ${key === 'bytes' && typeof value === 'string' ? `new TextEncoder().encode(${JSON.stringify(value)})` : JSON.stringify(value)}`).join(', ')} }`;
  const refused = async (name: string, request: Record<string, unknown>, code: string) => {
    const answer = await operation(name, literal(request));
    assert(!answer.ok && answer.code === code, `${name} ${JSON.stringify(request)} should be refused as ${code}: ${JSON.stringify(answer)}`);
  };
  const control = await operation('read', literal({ path: 'src/Motor.st' }));
  assert(control.ok, `A read inside the project should work: ${JSON.stringify(control)}`);
  await refused('read', { path: '../secret.txt' }, 'invalid-path');
  await refused('read', { path: 'src/../../secret.txt' }, 'invalid-path');
  await refused('read', { path: options.fixture.secret }, 'invalid-path');
  await refused('read', { path: 'C:\\Windows\\win.ini' }, 'invalid-path');
  await refused('list', { path: '..' }, 'invalid-path');
  await refused('remove', { path: '../secret.txt', recursive: false }, 'invalid-path');
  await refused('rename', { from: 'src/Motor.st', to: '../moved.st' }, 'invalid-path');
  await refused('read', { path: 'leak.txt' }, 'outside-root');
  await refused('write', { path: 'leak.txt', bytes: 'overwritten' }, 'outside-root');
  await refused('list', { path: 'linkdir' }, 'outside-root');
  await refused('write', { path: 'linkdir/pwned.txt', bytes: 'pwned' }, 'outside-root');
  const huge = await operation('write', `{ rootId: ${JSON.stringify(rootId)}, path: 'src/Huge.st', bytes: new Uint8Array(16 * 1024 * 1024 + 1) }`);
  assert(!huge.ok && huge.code === 'too-large', `An over-size write should be refused: ${JSON.stringify(huge)}`);
  const foreign = await operation('read', JSON.stringify({ rootId: 'not-the-folder-of-this-window', path: 'src/Motor.st' }));
  assert(!foreign.ok && foreign.code === 'no-folder', `A folder id that is not the window's should be refused: ${JSON.stringify(foreign)}`);
  assert(readFileSync(options.fixture.secret, 'utf8') === 'outside the project', 'A refused write changed the file outside the project.');
  assert(!existsSync(join(options.fixture.outside, 'pwned.txt')) && !existsSync(join(options.fixture.project, 'src', 'Huge.st')), 'A refused write left a file behind.');
  assert(existsSync(join(options.fixture.project, 'src', 'Motor.st')), 'A refused operation removed a project file.');
  evidence.push('project operations refused: "..", absolute and drive paths, a file link and a directory link that leave the project, an over-size write, and another window\'s folder id; nothing outside the project changed');

  // 5. After all of that the window still works: its folder builds and its scenarios run, in the worker process (IDE-012).
  const registered = await probe<{ workspaceId: string } | null>(`return await window.electronAPI.workspaceTests.registerProjectRoot({ rootId: ${JSON.stringify(rootId)} });`);
  assert(registered?.workspaceId, `The folder of the window could not be registered after the probes: ${JSON.stringify(registered)}`);
  const request = `{ workspaceId: ${JSON.stringify(registered.workspaceId)}, rootId: ${JSON.stringify(rootId)} }`;
  const built = await probe<{ ok: boolean; name?: string }>(`const result = await window.electronAPI.workspaceTests.compile(${request}); return { ok: result.ok === true, name: result.summary && result.summary.name };`);
  assert(built.ok && built.name === 'Motor Start Stop', `The window cannot build its project after the probes: ${JSON.stringify(built)}`);
  const tested = await probe<{ ok: boolean }>(`const result = await window.electronAPI.workspaceTests.run(${request}); return { ok: result.ok === true };`);
  assert(tested.ok, `The window cannot run its scenarios after the probes: ${JSON.stringify(tested)}`);
  evidence.push('after the probes the window still builds its project and runs its scenarios on the native runtime');
  return evidence;
}

/**
 * The same probes against a packaged application (`ZPLC_PACKAGED_DIST=<electron-builder output> bun run smoke:journeys`):
 * the production policy and the file:// renderer, with the project reached through the recent projects of a seeded
 * user-data directory because the packaged archive has no folder dialog hook (VF-008).
 */
export async function runPackagedSecurityProbes(executable: string, scratch: string): Promise<string[]> {
  const fixture = writeSecurityFixture(scratch);
  const profileRoot = mkdtempSync(join(scratch, 'packaged-'));
  const launched = await launchPackagedApp(executable, profileRoot, [fixture.project]);
  try {
    const { app } = launched;
    return await probeSecurity(app, {
      packaged: true,
      fixture,
      open: async () => {
        const listed = await app.eval<{ ok: boolean; value?: Array<{ recentId: string; displayName: string }> }>(`window.electronAPI.projectFiles.listRecent()`);
        const entry = listed.value?.find((item) => item.displayName === 'project');
        assert(listed.ok && entry, `The packaged application does not list the seeded project: ${JSON.stringify(listed)}`);
        const opened = await app.eval<{ ok: boolean; value?: { rootId: string } }>(`window.electronAPI.projectFiles.openRecent({ recentId: ${JSON.stringify(entry.recentId)} })`);
        assert(opened.ok && opened.value?.rootId, `The packaged application did not open the seeded project: ${JSON.stringify(opened)}`);
        return opened.value.rootId;
      },
    });
  } finally {
    await launched.stop();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Journeys
// ---------------------------------------------------------------------------------------------------------------------

const EDIT = ' (* journey edit: ñ 温度 *)';
/** Line 1 of an Instruction List example opens a block comment, so the typed text stays inside it (no comment delimiters of its own). */
const IL_EDIT = ' journey edit: ñ 温度';

// ---------------------------------------------------------------------------------------------------------------------
// LNG-001: one chain per language, from a new project to a deployed program that is watched
// ---------------------------------------------------------------------------------------------------------------------

/** What differs between the five chains: the file, the edit a person makes to it, and the sign that the saved edit came back. */
interface ChainSpec {
  /** The label of the language in the New project dialog. */
  language: string;
  /** The first program the New project dialog makes in that language. */
  created: string;
  /** The program of the example that is edited, built, simulated and deployed. */
  file: string;
  /** Opens `file`, makes the edit with the keyboard and saves it; returns what `persisted` compares after the project is opened again. */
  edit(app: App, project: string): Promise<() => Promise<boolean>>;
}
const CHAIN_BOARD = 'rpi_pico';
const CHAIN_WATCHED = 'LED_Output';

/** The text editors: a typed sentence at the end of line 1, which opens a block comment in both examples (so it carries no delimiters). */
const textEdit = (file: string, typed: string): ChainSpec['edit'] => async (app, project) => {
  const path = join(project, file); const original = disk(path);
  await openFile(app, file);
  await cursorAtEndOfLine(app, 1);
  await app.type(typed);
  const edited = original.replace(/^[^\n]*/, (first) => `${first}${typed}`);
  await app.until('the editor to hold the typed text', async () => await editorText(app) === edited.replace(/\r\n/g, '\n') || undefined);
  assert(disk(path) === original, 'Typing alone must not write the file.');
  await app.click(saveButton, 'the Save button');
  await app.until('the edited file on disk', () => disk(path) === edited || undefined);
  return async () => await editorText(app) === edited.replace(/\r\n/g, '\n');
};

/** Ladder: a rung of three elements typed with the keyboard (journey 28f), on a variable the example is given to write. */
const ladderEdit: ChainSpec['edit'] = async (app, project) => {
  const path = join(project, 'src', 'main.ld.json');
  const document = JSON.parse(disk(path)) as { variables: { local: Array<{ name: string; type: string }> } };
  document.variables.local.push({ name: 'Hold', type: 'BOOL' });
  writeFileSync(path, JSON.stringify(document, null, 2));
  await openDiagram(app, 'src/main.ld.json', '[data-ld-rung-id]');
  const rungs = () => app.eval<number>(`document.querySelectorAll('[data-ld-rung-id]').length`);
  const before = await rungs();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await app.click(`[...document.querySelectorAll('[data-ld-rung-id="rung_1"] span')].find((node) => node.textContent === 'Rung 1')`, 'the label of rung 1');
    await app.press('Ctrl+End');
    await app.press('Ctrl+Enter');
    if (await app.until('a rung after the last one', async () => await rungs() === before + 1 || undefined, 4_000).then(() => true, () => false)) break;
  }
  await app.until('a rung after the last one', async () => await rungs() === before + 1 || undefined);
  const last = await app.eval<string>(`[...document.querySelectorAll('[data-ld-rung-id]')].at(-1).getAttribute('data-ld-rung-id')`);
  await app.until('the cursor in the first cell of the new rung', async () => await app.eval<boolean>(`document.querySelector('[data-ld-rung-id="${last}"] [data-ld-cursor="0,0"]') !== null`) || undefined);
  await app.press('C'); await answerSearchList(app, 'OnTimer.Q', 'OnTimer.Q'); await app.press('ArrowRight');
  await app.press('N'); await answerSearchList(app, 'OffTimer.Q', 'OffTimer.Q'); await app.press('ArrowRight');
  await app.press('O'); await answerSearchList(app, 'Hold', 'Hold');
  await app.until('the three elements on the new rung', async () => await app.eval<number>(`document.querySelectorAll('[data-ld-rung-id="${last}"] [data-ld-element-id]').length`) === 3 || undefined);
  await app.click(saveButton, 'the Save button');
  await app.until('the rung to be written to the file', () => (JSON.parse(disk(path)) as { rungs: unknown[] }).rungs.length === before + 1 || undefined);
  return async () => await rungs() === before + 1;
};

/** Function block diagram: a NOT block inserted after the AND and wired to it (journey 28g). */
const diagramEdit: ChainSpec['edit'] = async (app, project) => {
  await openDiagram(app, 'src/main.fbd.json', '.react-flow__node');
  const nodes = () => app.eval<number>(`document.querySelectorAll('.react-flow__node').length`);
  const before = await nodes();
  await app.click(css('.react-flow__node[data-id="and_run"]'), 'the AND block');
  await app.press('I'); await answerSearchList(app, 'NOT', 'NOT');
  await app.until('a block beside the AND, selected', async () => await nodes() === before + 1 && await app.eval<boolean>(`document.querySelectorAll('.react-flow__node.selected').length === 1 && document.querySelector('.react-flow__node.selected').getAttribute('data-id') !== 'and_run'`) || undefined);
  const inserted = await app.eval<string>(`document.querySelector('.react-flow__node.selected').getAttribute('data-id')`);
  await app.until('the focus on the new block', async () => await app.eval<boolean>(`document.activeElement?.getAttribute('data-id') === ${JSON.stringify(inserted)}`) || undefined);
  await app.press('C'); await answerSearchList(app, 'AND.OUT');
  await app.click(saveButton, 'the Save button');
  const saved = () => JSON.parse(disk(join(project, 'src', 'main.fbd.json'))) as { blocks: unknown[]; connections: Array<{ from: { block: string; port: string }; to: { block: string } }> };
  await app.until('the block and its wire to be written', () => saved().blocks.length === before + 1 && saved().connections.some((wire) => wire.from.block === 'and_run' && wire.from.port === 'OUT' && wire.to.block === inserted) || undefined);
  return async () => await nodes() === before + 1;
};

/** Sequential function chart: a transition and a step below LED_OFF (journey 28h). */
const chartEdit: ChainSpec['edit'] = async (app, project) => {
  await openDiagram(app, 'src/main.sfc.json', '.react-flow__node');
  const nodes = () => app.eval<number>(`document.querySelectorAll('.react-flow__node').length`);
  const before = await nodes();
  await app.click(css('.react-flow__node[data-id="step_led_off"]'), 'the step LED_OFF');
  await app.press('T');
  await app.until('a transition below the step', async () => await nodes() === before + 1 || undefined);
  await app.press('F2'); await answerSearchList(app, 'LED_Output', 'LED_Output');
  await app.press('S');
  await app.until('a step after the transition', async () => await nodes() === before + 2 || undefined);
  await app.press('F2'); await answerSearchList(app, 'Hold');
  await app.click(saveButton, 'the Save button');
  await app.until('the chart to be written', () => (JSON.parse(disk(join(project, 'src', 'main.sfc.json'))) as { steps: Array<{ name: string }> }).steps.some((step) => step.name === 'Hold') || undefined);
  return async () => await nodes() === before + 2;
};

/**
 * LNG-001 for one language: a person creates a program in a new project, edits an example, saves it, reopens it, builds it,
 * simulates it, pauses and steps it, watches a value change, then deploys the build by clicking Deploy and confirming, to a
 * device that is the native runtime behind the text shell of a board (emulatedDevice.ts), runs it and watches it there. No
 * serial port, adapter or board is involved.
 */
async function languageChain(app: App, { root, project, runtime }: JourneyContext, spec: ChainSpec): Promise<void> {
  // 1. create: the New project dialog makes a program in the chosen language, and it builds
  const created = join(root, 'created'); mkdirSync(created);
  app.answer(created);
  await app.click(button('New project', 'contains'), 'the New project button');
  await app.until('the New project dialog', async () => await app.visible(css('[data-new-project="name"]')) || undefined);
  await app.click(button('Choose folder', 'contains'), 'the Choose folder button');
  await app.until('the chosen folder in the dialog', async () => await app.eval<boolean>(`document.querySelector('[data-testid="new-project-folder"]')?.textContent === 'created'`) || undefined);
  await selectOption(app, '[data-new-project="language"]', spec.language);
  await app.click(button('Create project'), 'the Create project button');
  await app.until('the project workbench to appear', async () => await app.visible(toolbar) || undefined);
  assert(existsSync(join(created, 'src', spec.created)), `The New project dialog made no ${spec.created} for ${spec.language}.`);
  const first = await compile(app);
  assert(first.kind === 'built', `The program just created in ${spec.language} does not build: ${first.message}`);
  await showExplorer(app);
  await app.click(button('Close project'));
  await app.until('the Welcome screen', async () => await app.visible(button('Open project', 'contains')) || undefined);

  // 2. edit, save, reopen, build: the example is aimed at a board the emulated device can be, so that the deploy preflight can match
  const config = JSON.parse(disk(join(project, 'zplc.json'))) as { target: { board: string } };
  config.target.board = CHAIN_BOARD;
  writeFileSync(join(project, 'zplc.json'), JSON.stringify(config, null, 2));
  await openFolder(app, project);
  const persisted = await spec.edit(app, project);
  await app.click(button('Close project'));
  await app.until('the Welcome screen', async () => await app.visible(button('Open project', 'contains')) || undefined);
  await openFolder(app, project);
  if (spec.file.endsWith('.json')) await openDiagram(app, spec.file, spec.file.includes('.ld.') ? '[data-ld-rung-id]' : '.react-flow__node'); else await openFile(app, spec.file);
  await app.until('the saved edit to come back', async () => await persisted() || undefined);
  const built = await compile(app);
  assert(built.kind === 'built', `The edited ${spec.language} program does not build: ${built.message}: ${await problemsText(app)}`);

  // 3. simulate, pause, step one cycle, resume, and watch a value change
  await pauseStepResume(app);
  await watch(app, CHAIN_WATCHED);
  const seen = new Set<string | null>();
  await app.until(`${CHAIN_WATCHED} to change between TRUE and FALSE in the simulation`, async () => { seen.add(await watchValue(app, CHAIN_WATCHED)); return seen.has('TRUE') && seen.has('FALSE') || undefined; }, 60_000);
  await app.click(button('Disconnect'));
  await app.until('the simulation to disconnect', async () => await app.visible(button('Connect')) || undefined);

  // 4. deploy by a human action to the emulated device, run it there, and watch the same value change
  const device = await attachEmulatedDevice(app, runtime, CHAIN_BOARD);
  try {
    await app.click(button('Hardware'), 'the Hardware mode');
    await app.click(button('Connect'), 'Connect');
    await app.until('the device to connect', async () => await app.visible(button('Disconnect')) || undefined)
      .catch(async (error: Error) => { throw new Error(`${error.message}: the shell saw ${JSON.stringify(device.transcript.slice(-6))}; the window says ${JSON.stringify((await app.text()).replace(/\s+/g, ' ').slice(-500))}`); });
    await app.click(button('Deploy current', 'prefix'), 'the Deploy button');
    await app.until('the deploy dialog', async () => await app.visible(css('[role="alertdialog"]')) || undefined)
      .catch(async (error: Error) => { throw new Error(`${error.message}: the window says ${JSON.stringify((await app.text()).replace(/\s+/g, ' ').slice(-500))}`); });
    const facts = await app.eval<string>(`document.querySelector('[role="alertdialog"]').innerText`);
    assert(facts.includes('Deploy to the device?'), `The deploy dialog does not ask to deploy: ${facts.replace(/\s+/g, ' ')}`);
    const actions = await app.eval<string[]>(`[...document.querySelectorAll('[role="alertdialog"] button')].map((item) => item.textContent.trim())`);
    assert(actions.length === 2 && actions[0] === 'Cancel' && /^(Deploy|Stop PLC and deploy)$/.test(actions[1]!), `The deploy dialog offers ${JSON.stringify(actions)}, not Cancel and the action.`);
    await app.click(`[...document.querySelectorAll('[role="alertdialog"] button')].find((item) => item.textContent.trim() === ${JSON.stringify(actions[1])})`, 'the action button of the dialog');
    await app.until('the deploy to be reported', async () => (await outputText(app)).includes('Program deployed and stopped.') || undefined, 60_000)
      .catch(async (error: Error) => { throw new Error(`${error.message}: Output says ${JSON.stringify((await outputText(app)).slice(-600))}`); });
    await app.click(button('Run (F5)', 'prefix'), 'Run');
    await app.until('the program to run on the device', async () => await app.visible(button('Pause (F6)', 'prefix')) || undefined)
      .catch(async (error: Error) => { throw new Error(`${error.message}: Output ends ${JSON.stringify((await outputText(app)).replace(/\s+/g, ' ').slice(-500))}; the shell saw ${JSON.stringify(device.transcript.slice(-40).map((line) => line.slice(0, 40)))}`); });
    if (await watchValue(app, CHAIN_WATCHED) === null) await watch(app, CHAIN_WATCHED);
    const onDevice = new Set<string | null>();
    await app.until(`${CHAIN_WATCHED} to change between TRUE and FALSE on the device`, async () => { onDevice.add(await watchValue(app, CHAIN_WATCHED)); return onDevice.has('TRUE') && onDevice.has('FALSE') || undefined; }, 60_000);
    assert(device.transcript.some((line) => line.startsWith('zplc link ')), 'The deploy never reached the device.');
  } finally { device.stop(); }
}
const CHAINS: Record<'ST' | 'IL' | 'LD' | 'FBD' | 'SFC', ChainSpec> = {
  ST: { language: 'Structured Text', created: 'main.st', file: 'src/main.st', edit: textEdit('src/main.st', IL_EDIT) },
  IL: { language: 'Instruction List', created: 'main.il', file: 'src/main.il', edit: textEdit('src/main.il', IL_EDIT) },
  LD: { language: 'Ladder Diagram', created: 'main.ld.json', file: 'src/main.ld.json', edit: ladderEdit },
  FBD: { language: 'Function Block Diagram', created: 'main.fbd.json', file: 'src/main.fbd.json', edit: diagramEdit },
  SFC: { language: 'Sequential Function Chart', created: 'main.sfc.json', file: 'src/main.sfc.json', edit: chartEdit },
};

export const JOURNEYS: Journey[] = [
  {
    name: '1 Open an existing folder', example: 'motor_start_stop', proves: [], partly: ['IDE-001', 'IDE-003', 'VF-008'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await showExplorer(app);
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
      const field = css('[data-new-project="name"]');
      await app.until('the New project dialog', async () => await app.visible(field) || undefined);
      assert(await app.eval<boolean>(`document.querySelector('[data-new-project="target"]')?.options[0]?.value === 'simulation'`), 'The dialog does not offer the simulation as the first target.');
      await app.click(button('Choose folder', 'contains'), 'the Choose folder button');
      await app.until('the chosen folder in the dialog', async () => await app.eval<boolean>(`document.querySelector('[data-testid="new-project-folder"]')?.textContent === 'empty-project'`) || undefined);
      await app.until('the project named after the folder', async () => await app.eval<boolean>(`document.querySelector('[data-new-project="name"]')?.value === 'empty-project'`) || undefined);
      await app.click(field, 'the name field');
      await app.press('Ctrl+A');
      await app.type('Packing line');
      await selectOption(app, '[data-new-project="language"]', 'Ladder Diagram');
      await app.click(button('Create project'), 'the Create project button');
      await app.until('the project workbench to appear', async () => await app.visible(toolbar) || undefined);
      const config = JSON.parse(disk(join(folder, 'zplc.json')));
      assert(config.name === 'Packing line', `The project is named ${JSON.stringify(config.name)}, not the name that was typed.`);
      assert(existsSync(join(folder, 'src', 'main.ld.json')), 'The first program was not made in the chosen language.');
      assert(JSON.stringify(config.tasks?.[0]?.programs) === '["main.ld"]', `The main task does not run the first program: ${JSON.stringify(config.tasks?.[0]?.programs)}`);
      await showExplorer(app);
      await app.until('a source file in the tree of the new project', async () => await app.visible(treeItem('dir:src')) || undefined);
      assert((await compile(app)).kind === 'built', 'The project that was just created does not build.');
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
      await app.click(button('Close project'));
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
    name: '3c The command palette runs commands from the keyboard', example: 'motor_start_stop', proves: [], partly: ['UX-015'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const paletteOpen = () => app.eval<boolean>(`Boolean(document.querySelector('[role="dialog"] [role="combobox"]'))`);
      await app.press('Ctrl+Shift+P');
      await app.until('the command palette to open with the keyboard', async () => await paletteOpen() || undefined);
      await app.type('problems');
      await app.until('the palette to list Show problems', async () => await app.eval<boolean>(`Boolean(document.querySelector('[role="option"][data-command="view.problems"]'))`) || undefined);
      await app.press('Enter');
      await app.until('the palette to close and the Problems list to show', async () => !(await paletteOpen()) && await app.visible(css('[aria-label="Latest build diagnostics"]')) || undefined);
      await app.press('Ctrl+Shift+P');
      await app.until('the command palette to open again', async () => await paletteOpen() || undefined);
      await app.type('keyboard shortcuts');
      await app.press('Enter');
      await app.until('the shortcut reference to list the commands with their shortcuts', async () => await app.eval<boolean>(`Boolean(document.querySelector('[data-command="debug.run"] kbd')?.textContent === 'F5' && document.querySelector('[data-command="file.save"] kbd')?.textContent === 'Ctrl+S')`) || undefined);
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
      // and says which kind of problem it is, with the stable code that the CLI and the reference page use (CMP-006)
      const codes = await app.eval<string[]>(`[...document.querySelectorAll('[aria-label="Latest build diagnostics"] [data-diagnostic-code]')].map((item) => item.textContent)`);
      assert(codes.includes('UNKNOWN_IDENTIFIER'), `The Problems list does not show the code of the problem: ${JSON.stringify(codes)}`);
    },
  },
  {
    // The editor checks the whole project with the compiler's front end while the author types, and does not need a build:
    // the error appears with its range, and goes away when it is undone.
    name: '4c Errors of the project are shown while typing', example: 'motor_start_stop', proves: [], partly: ['LNG-015'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const last = await lineWith(app, 'Reverse := FALSE;');
      assert(last > 0, 'Motor.st no longer has the statement Reverse := FALSE; the journey adds a faulty statement after.');
      await cursorAtEndOfLine(app, last);
      await app.press('Enter');
      await app.type('UndefinedVariable := 1;');
      await app.click(tab('Problems'));
      const live = css('[aria-label="Live structured text diagnostics"]');
      await app.until('the live diagnostics to name the undeclared variable, with no build', async () => (await app.eval<string>(`${live}?.innerText ?? ''`)).includes('UndefinedVariable') || undefined);
      const markers = await monacoEval<Array<{ startLineNumber: number; startColumn: number; endColumn: number; message: string; code?: string }>>(app, `return monaco.editor.getModelMarkers({ owner: 'zplc.st-live' });`);
      assert(markers.length > 0 && markers[0]!.startLineNumber === last + 1 && markers[0]!.endColumn > markers[0]!.startColumn + 1, `The editor has no squiggle with a range on the faulty line: ${JSON.stringify(markers)}`);
      // the squiggle carries the code that a build of the same source reports (CMP-006)
      assert(markers[0]!.code === 'UNKNOWN_IDENTIFIER', `The squiggle does not carry the stable code of the problem: ${JSON.stringify(markers[0])}`);
      // undoing the typing clears it the next time the project is checked
      await clickEditorLine(app, last + 1);
      for (let key = 0; key < 3; key++) await app.press('Ctrl+Z');
      await app.until('the live diagnostics to be gone', async () => !(await app.eval<string>(`${live}?.innerText ?? ''`)).includes('UndefinedVariable') || undefined);
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
        await app.click(css('#workspace-separator'), 'the separator above the lower panel');
        for (let step = 0; step < 6; step++) await app.press('ArrowUp');
      }
      await app.click(startValue, 'the value of Start', 2);
      await app.until('the value editor of Start to take focus', async () => await app.eval(`document.activeElement === ${watchRow('Start')}?.querySelector('input[type="text"]')`) || undefined);
      await app.type('1'); await app.press('Enter');
      await app.until('Forward to turn TRUE once Start is forced to 1', async () => await watchValue(app, 'Forward') === 'TRUE' || undefined);
      assert((await app.text()).includes('1 active force'), 'The force banner does not show one active force.');
      if (await app.eval(`[...document.querySelectorAll('button')].find((item) => item.textContent === 'Release all forces')?.disabled === true`)) app.note('Release all forces is disabled in simulation; the Force checkbox of the row releases');
      await app.click(css('input[aria-label="Force Start"]'), 'the Force checkbox of Start');
      await app.until('the force to be released', async () => !/\d+ active forces?/.test(await app.text()) && await app.eval(`${watchRow('Start')}?.querySelector('input[type="checkbox"]')?.checked === false`) === true || undefined);
      if (await watchValue(app, 'Start') === 'TRUE') app.note('After the release the input keeps the forced value in simulation (Start still reads TRUE)');
    },
  },
  {
    // IDE-019: the Watch table completes a symbol, sorts, is edited from the keyboard and writes a prepared value on an explicit action.
    name: '8c The Watch table completes, sorts, and writes a prepared value', example: 'motor_start_stop', proves: [], partly: ['IDE-019'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const result = await compile(app);
      assert(result.kind === 'built', `The Motor example does not build: ${result.message}`);
      await connectAndRun(app);
      await app.click(tab('Watch', 'prefix'));
      if (!await app.visible(css('input[placeholder^="Variable path"]'))) await app.click(button('Add variable'));
      await app.click(css('input[placeholder^="Variable path"]'));
      await app.type('Sta');
      assert((await app.eval<string[]>(`[...document.querySelectorAll('#watch-symbols option')].map((option) => option.value)`)).includes('Start'), 'The add field does not offer Start for "Sta".');
      await app.press('Ctrl+A'); await app.type('Start'); await app.press('Enter');
      await watch(app, 'Forward');
      const names = () => app.eval<string[]>(`[...document.querySelector('button[aria-label="Sort by Name"]').closest('table').querySelectorAll('tbody tr')].map((row) => row.firstElementChild?.textContent)`);
      assert(JSON.stringify(await names()) === '["Start","Forward"]', `The rows are not in the order they were added: ${JSON.stringify(await names())}`);
      await app.click(button('Sort by Name'), 'the Name header');
      await app.until('the rows sorted by name', async () => JSON.stringify(await names()) === '["Forward","Start"]' || undefined);
      await app.click(button('Sort by Name'), 'the Name header');
      await app.until('the rows sorted by name, descending', async () => JSON.stringify(await names()) === '["Start","Forward"]' || undefined);
      await app.click(button('Sort by Name'), 'the Name header');
      // from the keyboard: focus the value of Start, Enter opens the editor, Shift+Enter prepares the value without writing it
      await app.eval(`${watchRow('Start')}?.children[1]?.querySelector('[tabindex="0"]')?.focus()`);
      await app.press('Enter');
      await app.until('the value editor of Start to take focus', async () => await app.eval(`document.activeElement === ${watchRow('Start')}?.querySelector('input[type="text"]')`) || undefined);
      await app.press('Ctrl+A'); await app.type('1'); await app.press('Shift+Enter');
      await app.until('Start to show a prepared value', async () => await app.eval(`${watchRow('Start')}?.querySelector('[data-prepared]') !== null`) === true || undefined);
      await new Promise((resolve) => setTimeout(resolve, 600));
      assert(await watchValue(app, 'Forward') === 'FALSE', 'A prepared value was written without the explicit action.');
      await app.click(button('Write prepared values'), 'Write prepared values');
      await app.until('Forward to turn TRUE once the prepared Start is written', async () => await watchValue(app, 'Forward') === 'TRUE' || undefined);
      assert(await app.eval(`${watchRow('Start')}?.querySelector('[data-prepared]') === null`) === true, 'The prepared mark stays after the write.');
    },
  },
  {
    // IDE-025: the native runtime cannot start, so the simulation runs on the WebAssembly runtime of the build, says that it
    // is degraded and why, and still runs a bundled project and holds a force. ZPLC_RUNTIME=wasm is the switch of an
    // unpackaged app that stands in for "the native runtime is not there" (shared/nativeSimulationEnvironment.ts).
    name: '8b Simulate on the WebAssembly runtime when the native one is off', example: 'motor_start_stop', proves: [], partly: ['IDE-025', 'RT-008', 'IDE-019'],
    environment: { ZPLC_RUNTIME: 'wasm' },
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const result = await compile(app);
      assert(result.kind === 'built', `The Motor example does not build: ${result.message}`);
      await connectAndRun(app);
      const status = await app.eval<string>(`document.querySelector('[aria-label="Operational status"]')?.innerText ?? ''`);
      assert(status.includes('WASM fallback') && status.includes('degraded'), `The status bar does not show the degraded WebAssembly runtime: ${JSON.stringify(status)}`);
      assert(status.includes('Not available: modbus, mqtt, cloud, serial, physical-io'), `The status bar does not say what the runtime does not have: ${JSON.stringify(status)}`);
      const before = await cycles(app);
      await app.until('the cycle counter of the WebAssembly runtime to advance', async () => await cycles(app) > before + 5 || undefined);
      const output = await outputText(app);
      assert(output.includes('Native simulation could not start') && output.includes('Running the WebAssembly runtime instead'), `The console does not say that the native simulation did not start and what runs instead: ${JSON.stringify(output.slice(-600))}`);
      await watch(app, 'Start'); await watch(app, 'Forward');
      await app.until('Forward to read FALSE', async () => await watchValue(app, 'Forward') === 'FALSE' || undefined);
      await app.click(css('input[aria-label="Force Start"]'), 'the Force checkbox of Start');
      await app.until('Start to be forced', async () => await app.eval(`${watchRow('Start')}?.querySelector('[data-forced="true"]') !== null`) === true || undefined);
      const startValue = `${watchRow('Start')}?.children[1]`;
      if (!await app.clickable(startValue)) {
        await app.click(css('#workspace-separator'), 'the separator above the lower panel');
        for (let step = 0; step < 6; step++) await app.press('ArrowUp');
      }
      await app.click(startValue, 'the value of Start', 2);
      await app.until('the value editor of Start to take focus', async () => await app.eval(`document.activeElement === ${watchRow('Start')}?.querySelector('input[type="text"]')`) || undefined);
      await app.type('1'); await app.press('Enter');
      await app.until('Forward to turn TRUE once Start is forced to 1 on the WebAssembly runtime', async () => await watchValue(app, 'Forward') === 'TRUE' || undefined);
      assert((await app.text()).includes('1 active force'), 'The force banner does not show one active force.');
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
      await showExplorer(app);
      await app.click(button('New file'));
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
    // The Learn journey of WP-60: a fresh profile with no project open, Learn on the Welcome screen, the course, the first lesson
    // started (its workspace made from the starter, no copy step), a hint, the lesson passed, the window started again with the
    // progress kept, and the progress file moved out and back. The Help menu leg of LRN-001 is a native menu, which a journey cannot
    // click: it is proven in electron/appMenu.test.ts.
    name: '11 Learn with no project open', example: 'none', proves: ['LRN-001'], partly: ['LRN-002', 'LRN-003', 'LRN-004', 'LRN-005', 'LRN-010', 'LRN-031', 'LRN-032', 'LRN-033', 'LRN-037'],
    run: async (app, { root }) => {
      // The first two lessons of the course, whatever their ids: the index orders them (LRN-028 allows no list of ids here).
      const [FIRST, SECOND] = courseOrder(LESSON_INDEX).map(({ id }) => id) as [string, string];
      const entry = LESSON_INDEX.lessons.find(({ id }) => id === FIRST)!;
      const lesson = learnLessonCatalog.en.find(({ id }) => id === FIRST)!;
      // The workspace of a lesson is app-owned (LRN-003): the main process makes it under the user-data folder, and no folder dialog is shown.
      const folder = join(root, 'profile', 'learn-workspaces', FIRST);
      const home = css('[data-learn-home]');
      const stateOf = (id: string) => app.eval<string | null>(`document.querySelector('[data-learn-lesson="${id}"]')?.getAttribute('data-state') ?? null`);
      const homeText = () => app.eval<string>(`document.querySelector('[data-learn-home]')?.innerText ?? ''`);

      // 1. Learn on the Welcome screen opens the home with no project open: the course, the first lesson open, the second locked.
      await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await app.until('the Learn home', async () => await app.visible(home) || undefined);
      assert(!(await app.visible(toolbar)), 'A project is open behind the Learn home.');
      assert((await app.eval<number>(`document.querySelectorAll('[data-learn-module]').length`)) === 12, 'The Learn home does not list the twelve modules.');
      assert((await stateOf(FIRST)) === 'available' && (await stateOf(SECOND)) === 'locked', `The first lesson is ${await stateOf(FIRST)} and the second ${await stateOf(SECOND)}.`);
      assert(await app.eval<boolean>(`document.querySelector('[data-learn-start="${SECOND}"]')?.disabled === true`), 'A locked lesson can be started.');
      assert((await homeText()).includes('Pass first:'), 'A locked lesson does not say what to pass first.');

      // 2. Unlock all lessons is a switch the learner can see and that the page announces; turn it on, see the lock lifted, turn it off.
      await app.click(css('[data-learn-unlock-all]'), 'the Unlock all lessons switch');
      await app.until('the lock to lift', async () => (await stateOf(SECOND)) === 'available' || undefined);
      await app.until('the announcement', async () => (await app.eval<string>(`document.body.innerText`)).includes('All lessons are unlocked.') || undefined);
      await app.click(css('[data-learn-unlock-all]'), 'the Unlock all lessons switch');
      await app.until('the lock to return', async () => (await stateOf(SECOND)) === 'locked' || undefined);

      // 3. Start the course: the workspace is made from the starter and opened, with no folder dialog (none is answered here).
      await app.click(css('[data-learn-continue]'), 'the Start the course button');
      await app.until('the project workbench to appear', async () => await app.visible(toolbar) || undefined);
      const starter = JSON.parse(disk(join(packageRoot, 'projects', entry.starter.project, 'zplc.json'))) as { name: string };
      assert(existsSync(join(folder, 'zplc.json')) && (JSON.parse(disk(join(folder, 'zplc.json'))) as { name: string }).name === starter.name, `The app-owned workspace does not hold the starter of the first lesson (${entry.starter.project}).`);
      await app.until('the lesson to be shown beside the editor', async () => await app.eval<boolean>(`document.querySelector('[data-activity="learn"]')?.getAttribute('aria-current') === 'true' && document.querySelector('[data-learn-home]') === null && ${JSON.stringify([lesson.title, learnLessonCatalog.es.find(({ id }) => id === FIRST)!.title])}.includes(document.getElementById('learn-title')?.textContent?.trim() ?? '')`) || undefined);
      assert(await app.eval<boolean>(`!!document.querySelector('[aria-label="Primary sidebar"] [data-learn-reset]')`), 'The lesson surface does not offer to restore the starter once its workspace is open.');
      assert(!(await app.text()).includes('The project could not be opened'), 'The workbench shows an open error.');

      // 3b. LRN-004: the lesson stays beside the editor when the rail leaves Learn (it moves to the secondary sidebar), and comes back with it.
      await app.click(css('[data-activity="project"]'), 'the Project item of the rail');
      await app.until('the lesson in the secondary sidebar', async () => await app.eval<boolean>(`!!document.querySelector('[aria-label="Secondary sidebar"] [data-learn-reset]') && !document.querySelector('[aria-label="Primary sidebar"] [data-learn-reset]')`) || undefined);
      await app.click(css('[data-activity="learn"]'), 'the Learn item of the rail');
      await app.press('Escape');
      await app.until('the lesson in the primary sidebar again', async () => await app.eval<boolean>(`!!document.querySelector('[aria-label="Primary sidebar"] [data-learn-reset]') && !document.querySelector('[aria-label="Secondary sidebar"] [data-learn-reset]')`) || undefined);

      // 4. The rail's Learn item opens the home over the editor, and Escape returns to it.
      await app.click(css('[data-activity="learn"]'), 'the Learn item of the rail');
      await app.until('the Learn home over the editor', async () => await app.visible(home) || undefined);
      await app.press('Escape');
      await app.until('the editor again', async () => !(await app.visible(home)) || undefined);

      // 5. A hint is revealed, and recorded; the solution is behind a confirmation that Cancel leaves unrecorded.
      await app.click(css('[aria-label="Hints"] details summary'), 'the first hint');
      await app.click(css('[data-learn-show-solution]'), 'Show the reference solution');
      await app.until('the confirmation', async () => await app.visible(css('[role="alertdialog"]')) || undefined);
      await app.click(button('Keep trying'), 'Keep trying');
      await app.until('the confirmation to close', async () => !(await app.visible(css('[role="alertdialog"]'))) || undefined);

      // 6. The learner edits (the reference solution goes where the program is), Check grades the program of the workspace, the lesson passes.
      writeFileSync(join(folder, entry.starter.program), disk(join(packageRoot, 'projects', entry.solution.project, entry.solution.program)));
      await app.until('the Check button to be enabled', async () => await app.eval<boolean>(`document.querySelector('[data-learn-check]')?.disabled === false`) || undefined);
      await app.click(css('[data-learn-check]'), 'the Check button');
      await app.until('Learn to grade the first lesson as passed', async () => await app.eval<boolean>(`document.querySelector('[data-learn-grade="passed"]') !== null`) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the grade shown is ${await app.eval<string>(`document.querySelector('[data-learn-grade]')?.getAttribute('data-learn-grade') ?? 'none'`)}; ${await app.eval<string>(`document.querySelector('[data-learn-check-status]')?.textContent ?? ''`)}`); });
      const file = join(root, 'profile', 'zplc-learn-progress.v2.json');
      type Saved = { last: { lessonId: string } | null; lessons: Record<string, { state: string; hintsShown: number[]; solutionShown: boolean; grade: unknown }> };
      await app.until('the passed lesson in the progress file', () => existsSync(file) && disk(file).includes('"state":"passed"') || undefined);
      const saved = JSON.parse(disk(file)) as Saved;
      assert(saved.lessons[FIRST]?.state === 'passed' && saved.lessons[FIRST].hintsShown.includes(1) && saved.lessons[FIRST].solutionShown === false && saved.lessons[FIRST].grade !== null, `The progress file does not record the passed lesson with its hint and no solution: ${JSON.stringify(saved.lessons[FIRST])}`);

      // 7. The window starts again: the progress is read back, the next lesson is open, Continue offers it.
      await app.cdp.command('Page.reload');
      await app.until('the Welcome screen', async () => await app.visible(button('Learn', 'prefix')) || undefined);
      await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await app.until('the Learn home with the progress read', async () => (await homeText()).includes(`1 of ${LESSON_INDEX.lessons.length} lessons passed`) || undefined);
      assert((await stateOf(FIRST)) === 'passed' && (await stateOf(SECOND)) === 'available', `After the restart the first lesson is ${await stateOf(FIRST)} and the second ${await stateOf(SECOND)}.`);
      assert((await app.eval<string>(`document.querySelector('[data-learn-continue]')?.textContent ?? ''`)).startsWith('Continue: '), 'Continue does not resume the course after a restart.');

      // 8. Export the progress (the file the browser would save, taken from the download link), then import a file that adds a lesson and merges.
      await app.eval(`(() => { window.__learnExport = null; const create = URL.createObjectURL.bind(URL); URL.createObjectURL = (blob) => { void blob.text().then((text) => { window.__learnExport = text; }); return create(blob); }; HTMLAnchorElement.prototype.click = function () { window.__learnExportName = this.download; }; })()`);
      await app.click(css('[data-learn-export]'), 'Export progress');
      const exported = await app.until('the exported file', async () => await app.eval<string | null>('window.__learnExport') || undefined);
      const document_ = JSON.parse(exported) as { kind: string; lessons: Record<string, unknown> };
      assert(document_.kind === 'zplc-learn-progress' && FIRST in document_.lessons && (await app.eval<string>('window.__learnExportName')) === 'zplc-learn-progress.v2.json', 'The exported file is not the progress document.');
      document_.lessons[SECOND] = { state: 'passed', grade: null, passedAt: null, startedAt: null, hintsShown: [], solutionShown: false, hardware: null };
      const incoming = join(root, 'incoming-progress.json');
      writeFileSync(incoming, JSON.stringify(document_));
      const choose = async (path: string) => {
        const { root: tree } = await app.cdp.command('DOM.getDocument', { depth: 0 }) as { root: { nodeId: number } };
        const { nodeId } = await app.cdp.command('DOM.querySelector', { nodeId: tree.nodeId, selector: '[data-learn-import-file]' }) as { nodeId: number };
        await app.cdp.command('DOM.setFileInputFiles', { nodeId, files: [path] });
      };
      await choose(incoming);
      await app.until('the import to be merged', async () => (await homeText()).includes(`2 of ${LESSON_INDEX.lessons.length} lessons passed`) && (await homeText()).includes('Progress imported and merged.') || undefined);
      assert(disk(file).includes(SECOND), 'The merged progress was not saved.');
      // A file of a version this Studio does not know is refused with its reason, and the progress stays as it was.
      const future = join(root, 'future-progress.json');
      writeFileSync(future, JSON.stringify({ kind: 'zplc-learn-progress', schemaVersion: 5, last: null, lessons: {} }));
      await choose(future);
      await app.until('the refusal', async () => (await homeText()).includes('The file is version 5, which this version of ZPLC cannot read. Your progress is unchanged.') || undefined);
      assert((await homeText()).includes(`2 of ${LESSON_INDEX.lessons.length} lessons passed`), 'A refused file changed the progress.');

      // 9. LRN-037, LRN-033: the whole home is reachable and operable from the keyboard. Tab walks the controls in reading order (Continue, the
      // two switches, Export, Import, then the lessons); Space flips the classroom switch, and Enter on Continue opens the lesson, which then offers no solution.
      const focused = () => app.eval<string>(`(() => { const el = document.activeElement; return el ? (el.getAttribute('data-learn-continue') !== null ? 'continue' : el.getAttribute('data-learn-unlock-all') !== null ? 'unlock' : el.getAttribute('data-learn-hide-solutions') !== null ? 'hide' : el.getAttribute('data-learn-export') !== null ? 'export' : el.getAttribute('data-learn-import') !== null ? 'import' : el.hasAttribute('data-learn-start') ? 'start' : '') : ''; })()`);
      // The browser continues sequential navigation from the last focus point, so the walk starts at Continue, the first control of the page.
      await app.eval(`document.querySelector('[data-learn-continue]').focus()`);
      const order: string[] = ['continue'];
      for (let step = 0; step < 60 && !order.includes('import'); step += 1) {
        await app.press('Tab');
        const here = await focused();
        if (here && here !== order.at(-1) && here !== 'start') order.push(here);
      }
      assert(['continue', 'unlock', 'hide', 'export', 'import'].every((name, index) => order[index] === name), `Tab does not walk the Learn home in reading order: ${order.join(', ')}.`);
      await app.eval(`document.querySelector('[data-learn-hide-solutions]').focus()`);
      await app.press('Space');
      await app.until('the classroom switch to be on, announced', async () => await app.eval<boolean>(`document.querySelector('input[data-learn-hide-solutions]')?.checked === true || document.querySelector('[data-learn-hide-solutions]')?.getAttribute('aria-checked') === 'true'`) && (await app.text()).includes('Reference solutions are hidden.') || undefined);
      await app.eval(`document.querySelector('[data-learn-continue]').focus()`);
      await app.press('Enter');
      await app.until('the lesson, with no reference solution on offer', async () => await app.eval<boolean>(`document.querySelector('[data-learn-home]') === null && document.querySelector('[data-learn-solutions-hidden]') !== null && document.querySelector('[data-learn-show-solution]') === null`) || undefined);
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
      await app.click(css('#workspace-separator'), 'the separator above the lower panel');
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
      assert((await card('esp32s3_blinky')).includes('ESP32-S3 DevKitC') && (await card('esp32s3_blinky')).includes('GPIO15, header J1 pin 8'), 'The card of esp32s3_blinky should name its board and the header pin of its LED (DO0, GPIO15, J1 pin 8).');

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
      await showExplorer(app);
      await app.click(button('Close project'));
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
      await app.click(button('Add rung', 'contains'), 'the Add rung button');
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
      await showExplorer(app);
      await app.click(button('Close project'));
      await app.until('the Welcome screen', async () => await app.visible(button('Open project', 'contains')) || undefined);
      await openFolder(app, project);
      await showExplorer(app);
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
      if (!await app.visible(css('input[placeholder^="Variable path"]'))) await app.click(button('Add variable'));
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
        await app.click(css('#workspace-separator'), 'the separator above the lower panel');
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
      await app.until('the force to be released', async () => !/\d+ active forces?/.test(await app.text()) && await app.eval(`${watchRow('Start')}?.querySelector('input[type="checkbox"]')?.checked === false`) === true || undefined);
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
        Panel: async () => await app.visible(tab('Output', 'exact')),
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
    name: '21 Preferences apply and persist per user', example: 'motor_start_stop', proves: ['IDE-007'], partly: ['IDE-010'],
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
      await choose(app, '[data-setting="language"]', 'English');
      await choose(app, 'select[data-theme-control]', 'Dark');
      const after = await root(app);
      assert(after.density === 'compact' && after.spacing === '0.1875rem' && after.padding < before.padding, `Compact density did not apply: ${JSON.stringify({ before, after })}`);
      assert(after.lang === 'en' && after.theme === 'dark', `Language or theme did not apply: ${JSON.stringify(after)}`);

      // Editor choices made inside the project, where the settings tab is.
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      assert(JSON.stringify(await editorOptions(app)) === JSON.stringify({ fontSize: 14, tabSize: 4 }), `The editor should start at 14 px and 4 spaces: ${JSON.stringify(await editorOptions(app))}`);
      await app.click(button('Project settings'), 'the Project settings button');
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
      assert(restored.density === 'compact' && restored.lang === 'en' && restored.theme === 'dark', `The display preferences were not restored: ${JSON.stringify(restored)}`);
      await again.click(css('[data-welcome-preferences] summary'), 'the Preferences disclosure of the Welcome screen');
      await again.until('the preferences on the Welcome screen', async () => await again.visible(css('[data-app-preferences]')) || undefined);
      for (const [selector, label] of [['[data-setting="density"]', 'Compact'], ['[data-setting="language"]', 'English'], ['[data-setting="editorFontSize"]', '20 px'], ['[data-setting="editorTabSize"]', '2 spaces'], ['[data-setting="autosaveSeconds"]', 'After 5 seconds without typing']] as const) {
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
      const welcome = async () => await app.until('the Welcome screen, titled ZPLC', async () => await app.eval<string | null>(WELCOME_TITLE) === 'ZPLC' && !await app.visible(toolbar) && await app.eval<string>('document.title') === 'ZPLC' || undefined);
      const questionTitle = () => app.eval<string | null>(`document.querySelector('[role="alertdialog"] h2')?.textContent ?? null`);
      const choice = (label: string) => `[...document.querySelectorAll('[role="alertdialog"] button')].find((item) => item.textContent?.trim() === ${JSON.stringify(label)})`;
      const askToClose = async () => { await showExplorer(app); await app.click(button('Close project')); await app.until('the question before the project closes', async () => await questionTitle() === 'Discard unsaved changes?' || undefined); };

      // Cancel keeps the project and its changes.
      await openFolder(app, project);
      await edit();
      await askToClose();
      await app.click(choice('Continue editing'), 'Continue editing');
      await app.until('the question to close', async () => await questionTitle() === null || undefined);
      assert(await app.visible(toolbar) && (await editorText(app)).includes(EDIT), 'Continue editing must keep the project and its changes.');
      // UX-016: with a project open the window is titled "<project> — ZPLC".
      const title = await app.eval<string>('document.title');
      assert(/^\S.* — ZPLC$/.test(title), `The window of an open project must be titled "<project> — ZPLC": ${title}`);
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
      await showExplorer(app);
      await app.click(button('New folder'));
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
      // the task list is rewritten after the tree and the tab have moved: on a loaded machine that is later than the tab
      await app.until('no task to run Motor.st after the rename', () => JSON.parse(disk(join(project, 'zplc.json'))).tasks.every((task: { programs: string[] }) => !task.programs.includes('Motor.st')) || undefined)
        .catch(() => { throw new Error('A task still runs Motor.st after the rename.'); });
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
      await app.until('the confirmation', async () => (await app.text()).includes('Delete folder') && await app.visible(css('[role="alertdialog"]')) || undefined);
      // UX-020: the question starts on Cancel and Escape keeps the folder.
      assert(await app.eval<boolean>(`document.activeElement?.textContent?.trim() === 'Cancel' && document.activeElement.closest('[role="alertdialog"]') !== null`), 'The delete confirmation must start with focus on Cancel.');
      await app.press('Escape');
      await app.until('the confirmation to close', async () => !await app.visible(css('[role="alertdialog"]')) || undefined);
      assert(existsSync(join(project, 'src', 'drivers')), 'Cancelling the delete must keep the folder.');
      await contextMenu('src/drivers', 'dir', 'Delete folder');
      await app.until('the confirmation again', async () => await app.visible(css('[role="alertdialog"]')) || undefined);
      await app.click(button('Delete folder', 'prefix'), 'the Delete folder button');
      await app.until('the folder gone from the tree', async () => !await inTree('src/drivers', 'dir') || undefined);
      assert(!existsSync(join(project, 'src', 'drivers')), 'The folder is still on disk.');
    },
  },

  {
    name: '24 Changes made outside Studio', example: 'motor_start_stop', proves: [], partly: ['IDE-004'],
    run: async (app, { project }) => {
      const motor = join(project, 'src', 'Motor.st');
      const outside = (text: string) => writeFileSync(motor, text);
      const original = disk(motor);
      const prompt = css('[data-external-change-prompt]');
      const tabModified = () => app.eval<boolean>(`document.getElementById('editor-tab-file:src/Motor.st')?.textContent?.includes('*') === true`);

      // An unmodified file reloads by itself, with no question.
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const first = `${original}\n(* edited by another program *)\n`;
      outside(first);
      await app.until('the editor to show the new content', async () => (await editorText(app)).includes('edited by another program') || undefined, 10_000);
      assert(!await app.visible(prompt) && !await tabModified(), 'An unmodified file that changed outside Studio must reload without a question and without being marked modified.');

      // A modified file asks; Keep my version keeps the buffer and saves over the disk.
      await cursorAtEndOfLine(app, 1);
      await app.type(EDIT);
      await app.until('the typed text', async () => (await editorText(app)).includes(EDIT) || undefined);
      outside(`${first}(* second outside edit *)\n`);
      await app.until('the question about Motor.st', async () => await app.visible(prompt) || undefined, 10_000);
      assert((await app.eval<string>(`document.querySelector('[data-external-change-prompt]').innerText`)).includes('Motor.st'), 'The question should name the file.');
      await app.click(button('Keep my version of Motor.st'));
      await app.until('the question to close', async () => !await app.visible(prompt) || undefined);
      assert((await editorText(app)).includes(EDIT) && !(await editorText(app)).includes('second outside edit'), 'Keep my version must keep the buffer as it was.');
      await app.click(saveButton);
      await app.until('the buffer on disk', () => disk(motor).includes(EDIT) && !disk(motor).includes('second outside edit') || undefined);

      // Load from disk replaces the buffer and clears the modified mark.
      await cursorAtEndOfLine(app, 1);
      await app.type(' (* local again *)');
      await app.until('the typed text', async () => (await editorText(app)).includes('local again') || undefined);
      outside(`${original}\n(* third outside edit *)\n`);
      await app.until('the question about Motor.st', async () => await app.visible(prompt) || undefined, 10_000);
      await app.click(button('Load from disk Motor.st'));
      await app.until('the disk text in the editor', async () => (await editorText(app)).includes('third outside edit') && !(await editorText(app)).includes('local again') || undefined);
      assert(!await tabModified(), 'Loading from disk must clear the modified mark.');

      // A new file made outside shows up in the tree, and a deleted unmodified file closes.
      writeFileSync(join(project, 'src', 'Outside.st'), 'PROGRAM Outside\nEND_PROGRAM\n');
      await showExplorer(app);
      await app.until('the new file in the tree', async () => await app.visible(treeItem('file:src/Outside.st')) || undefined, 10_000);
      await openFile(app, 'src/Outside.st');
      rmSync(join(project, 'src', 'Outside.st'));
      await app.until('the deleted file gone from the tree and its tab closed', async () => !await app.visible(treeItem('file:src/Outside.st')) && !await app.visible(editorTab('file:src/Outside.st')) || undefined, 10_000);
    },
  },

  {
    name: '25 Problems select the block of a diagram', example: 'blinky_fbd', proves: [], partly: ['LNG-003'],
    run: async (app, { project }) => {
      // the NOT block loses the wire into its input: the build says which block, and the problem has no line to go to
      const file = join(project, 'src', 'main.fbd.json');
      const intact = disk(file);
      const model = JSON.parse(intact) as { connections: Array<{ to: { block: string } }> };
      model.connections = model.connections.filter((wire) => wire.to.block !== 'not_led');
      writeFileSync(file, JSON.stringify(model, null, 2));
      await openFolder(app, project);
      await openDiagram(app, 'src/main.fbd.json', '.react-flow__node');
      assert((await compile(app)).kind === 'failed', 'A diagram with an unwired input should not build.');
      const selectedBlock = () => app.eval<string | null>(`document.querySelector('.react-flow__node.selected')?.getAttribute('data-id') ?? null`);
      await activateFirstProblem(app);
      await app.until('the block of the problem selected on the canvas', async () => await selectedBlock() === 'not_led' || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: selected nodes are ${JSON.stringify(await app.eval(`[...document.querySelectorAll('.react-flow__node.selected')].map((node) => node.getAttribute('data-id'))`))}`); });

      // The element comes with the diagnostic, as the build named it: the wire is put back on disk and the open diagram
      // follows it, so the open file no longer has the finding to place the problem from, and the problem is still the
      // block's that the build named.
      const wires = model.connections.length;
      writeFileSync(file, intact);
      await app.until('the open diagram to follow the file on disk', async () => await app.eval<number>(`document.querySelectorAll('.react-flow__edge').length`) === wires + 1 || undefined);
      await app.click(css('.react-flow__node[data-id="ton_on"]'), 'another block');
      await app.until('the other block selected', async () => await selectedBlock() === 'ton_on' || undefined);
      await activateFirstProblem(app);
      await app.until('the block the build named selected again, from the element it carried', async () => await selectedBlock() === 'not_led' || undefined);
    },
  },
  {
    name: '26 Problems select the cell of a rung', example: 'blinky', proves: [], partly: ['LNG-003'],
    run: async (app, { project }) => {
      // a contact reads a variable that the rung does not declare: the problem names the rung and the cell
      const file = join(project, 'src', 'main.ld.json');
      const model = JSON.parse(disk(file)) as { rungs: Array<{ id: string; grid: Array<Array<{ element: { id: string; variable?: string } | null }>> }> };
      model.rungs[0]!.grid.flat().find((cell) => cell.element?.id === 'nc_led_off')!.element!.variable = 'Missing';
      writeFileSync(file, JSON.stringify(model, null, 2));
      await openFolder(app, project);
      await openDiagram(app, 'src/main.ld.json', '[data-ld-rung-id]');
      assert((await compile(app)).kind === 'failed', 'A rung with a contact on an undeclared variable should not build.');
      await activateFirstProblem(app);
      await app.until('the contact of the problem selected, with its properties', async () => await app.eval<boolean>(`document.querySelector('input[placeholder="Variable name"]')?.value === 'Missing'`) || undefined)
        .catch((error: Error) => { throw new Error(`${error.message}: no element of the rung is selected after the problem was activated`); });
    },
  },
  {
    name: '27 Problems select the step of an action', example: 'blinky_sfc', proves: [], partly: ['LNG-003', 'LNG-026'],
    run: async (app, { project }) => {
      // the body of an action holds a statement that the compiler refuses: the problem is the action's, shown on its step
      const file = join(project, 'src', 'main.sfc.json');
      const model = JSON.parse(disk(file)) as { actions: Array<{ id: string; body: string }> };
      const action = model.actions.find((candidate) => candidate.id === 'SET_LED_ON')!;
      action.body = `Undeclared := TRUE;\n${action.body}`;
      writeFileSync(file, JSON.stringify(model, null, 2));
      await openFolder(app, project);
      await openDiagram(app, 'src/main.sfc.json', '.react-flow__node');
      assert((await compile(app)).kind === 'failed', 'A chart with an action that uses an undeclared variable should not build.');
      await activateFirstProblem(app);
      await app.until('the step that uses the action selected on the canvas', async () => await app.eval<boolean>(`document.querySelector('.react-flow__node.selected')?.getAttribute('data-id') === 'step_led_on'`) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: selected nodes are ${JSON.stringify(await app.eval(`[...document.querySelectorAll('.react-flow__node.selected')].map((node) => node.getAttribute('data-id'))`))}`); });
      const text = await app.eval<string>(`document.querySelector('[aria-label="Latest build diagnostics"]')?.innerText ?? ''`);
      assert(text.includes("SFC action 'SET_LED_ON' body"), `The problem should say that it is in the body of the action: ${JSON.stringify(text)}`);
    },
  },
  {
    name: '28 A breakpoint on a rung stops execution', example: 'blinky', proves: [], partly: ['LNG-004', 'LNG-027'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.ld.json', '[data-ld-rung-id]');
      const dot = css('[data-breakpoint-rung="rung_3"]');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky Ladder example does not build: ${result.message}`);
      await app.click(dot, 'the breakpoint dot of rung 3');
      await app.until('the dot to say that the breakpoint is set', async () => await app.eval<boolean>(`${dot}?.getAttribute('aria-pressed') === 'true'`) || undefined);
      await app.click(button('Connect'));
      await app.until('the simulation to connect', async () => await app.visible(button('Disconnect')) || undefined);
      await app.click(button('Run (F5)', 'prefix'));
      await app.until('execution to stop at the rung', async () => await app.visible(button('Resume (F5)', 'prefix')) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the program keeps running past the breakpoint on rung 3`); });
      await app.until('the rung where the program is stopped to be marked', async () => await app.eval<boolean>(`document.querySelector('[data-ld-rung-id="rung_3"]')?.className.includes('ring-2') === true`) || undefined);
    },
  },

  {
    // Every poll of a running program once rendered the whole window again (the runtime info was React state of the app), so
    // the renderer fell behind the runtime a little more each second: a trivial evaluate took 0.2 s, then 2.5 s, then 6 s.
    // The bound is on the answer time and on its growth, not on the machine: the last third may cost at most 3 times the first.
    name: '28l A running Ladder keeps the window responsive', example: 'blinky', proves: [], partly: ['LNG-006', 'IDE-013'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.ld.json', '[data-ld-rung-id]');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky Ladder example does not build: ${result.message}`);
      await app.cdp.command('Performance.enable');
      await connectAndRun(app);
      await app.until('power to reach an element of a rung', async () => await app.eval<number>(`document.querySelectorAll('[data-ld-cell][data-powered="true"]').length`) > 0 || undefined);
      const nodes = async () => ((await app.cdp.command('Performance.getMetrics') as { metrics: Array<{ name: string; value: number }> }).metrics.find((item) => item.name === 'Nodes')?.value ?? 0);
      const first = await nodes();
      // The window can only answer as fast as the machine schedules it. Every latency is divided by how much slower than
      // alone this machine runs a busy process just then (the wall time of 20 ms of CPU time here, like the renderer's), so
      // the bounds below are those of an idle machine; a window that stalls on its own work still fails.
      const slowdown = (): number => {
        const cpu = process.cpuUsage(); const wall = performance.now();
        while ((process.cpuUsage(cpu).user + process.cpuUsage(cpu).system) / 1000 < 20) { /* spin */ }
        return Math.max(1, (performance.now() - wall) / 20);
      };
      const latencies: number[] = []; const raw: number[] = []; let worst = 1;
      const started = Date.now();
      while (Date.now() - started < 30_000) {
        const factor = slowdown(); worst = Math.max(worst, factor);
        const before = Date.now();
        await app.eval<number>('1 + 1');
        raw.push(Date.now() - before);
        latencies.push(Math.round((Date.now() - before) / factor));
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
      const third = Math.floor(latencies.length / 3);
      const early = mean(latencies.slice(0, third)); const late = mean(latencies.slice(-third));
      assert(late <= early * 3 + 300, `The window answers slower the longer a Ladder program runs: the first third took ${Math.round(early)} ms and the last third ${Math.round(late)} ms of an idle machine (measured ${JSON.stringify(raw)}, machine up to ${worst.toFixed(1)}x slower).`);
      assert(Math.max(...latencies) < 2_000, `The window stopped answering for ${Math.max(...latencies)} ms of an idle machine while a Ladder program ran (measured ${JSON.stringify(raw)}, machine up to ${worst.toFixed(1)}x slower).`);
      assert(await nodes() <= first + 300, `The page grows while a Ladder program runs: ${first} nodes, then ${await nodes()}.`);
    },
  },
  {
    // The build records which variable holds the state of each element, so the editor shows what the program holds and
    // not what a name suggests: power through the rung, the value of each contact, and a dash where nothing was read.
    name: '28b Online values of a rung come from the debug map', example: 'blinky', proves: [], partly: ['LNG-006'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.ld.json', '[data-ld-rung-id]');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky Ladder example does not build: ${result.message}`);
      await connectAndRun(app);
      const cells = (powered: boolean) => `document.querySelectorAll('[data-ld-cell][data-powered="${powered}"]').length`;
      await app.until('power to reach an element of a rung', async () => await app.eval<number>(cells(true)) > 0 || undefined);
      await app.until('an element that power does not reach', async () => await app.eval<number>(cells(false)) > 0 || undefined);
      // the values arrive with the first complete poll, and then every variable the example declares has one
      const texts = () => app.eval<string[]>(`[...document.querySelectorAll('[data-ld-cell] text')].map((node) => node.textContent ?? '')`);
      await app.until('a contact to show the value of its variable', async () => (await texts()).some((text) => /^[●○◆▲] [TF]$/.test(text)) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the cells show ${JSON.stringify(await texts())}`); });
      const shown = await texts();
      assert(!shown.includes('◌ —'), `A variable that the example declares is shown as unavailable: ${JSON.stringify(shown)}`);
    },
  },
  {
    name: '28c Online values of an FBD come from the debug map', example: 'blinky_fbd', proves: [], partly: ['LNG-006'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.fbd.json', '.react-flow__node');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky FBD example does not build: ${result.message}`);
      await connectAndRun(app);
      const variable = css('.react-flow__node[data-id="var_led_read"] [data-live-value]');
      await app.until('the variable block to show a value', async () => ['TRUE', 'FALSE'].includes(await app.eval<string>(`${variable}?.textContent?.trim() ?? ''`)) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the block is ${await app.eval<string>(`document.querySelector('.react-flow__node[data-id="var_led_read"]')?.outerHTML.slice(0, 600) ?? 'not on the canvas'`)}`); });
      // the timers of the blinker complete in turn: the pin of a block shows it, 500 ms after the program starts
      await app.until('a timer block to show its output as TRUE', async () => await app.eval<boolean>(`[...document.querySelectorAll('.react-flow__node[data-id^="ton_"]')].some((node) => node.innerText.includes('TRUE'))`) || undefined, 30_000)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the timers show ${JSON.stringify(await app.eval<string[]>(`[...document.querySelectorAll('.react-flow__node[data-id^="ton_"]')].map((node) => node.innerText.replace(/\\s+/g, ' '))`))}`); });
    },
  },
  {
    name: '28d Online state of an SFC comes from the debug map', example: 'blinky_sfc', proves: [], partly: ['LNG-006'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.sfc.json', '.react-flow__node');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky SFC example does not build: ${result.message}`);
      await connectAndRun(app);
      const active = (id: string) => app.eval<boolean>(`document.querySelector('.react-flow__node[data-id="${id}"]')?.innerText.includes('ACTIVE') === true`);
      await app.until('the first step to be active', async () => await active('step_led_on') || undefined);
      await app.until('the chart to move to the second step', async () => await active('step_led_off') || undefined, 30_000);
      const text = await app.eval<string>(`document.querySelector('.react-flow')?.innerText ?? ''`);
      assert(!text.includes('UNAVAILABLE'), `A step of the chart is shown as unavailable: ${text}`);
    },
  },
  {
    // The editor names the variables of a line with the language service and reads them through the debug map of the
    // build: the value shown after the line is the one the runtime holds, and a keyword or a function has none.
    name: '28e Inline values in Structured Text come from the debug map', example: 'blinky_st', proves: [], partly: ['LNG-006'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/main.st');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky (Structured Text) example does not build: ${result.message}`);
      await connectAndRun(app);
      // the text that the editor puts after a line is an injected decoration of the model
      const shown = () => monacoEval<string[]>(app, `return editor.getModel().getAllDecorations().filter((decoration) => decoration.options.after).map((decoration) => decoration.options.after.content);`);
      await app.until('a line to show the value of LED_Output after it', async () => (await shown()).some((text) => /LED_Output=(?:TRUE|FALSE)/.test(text)) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the editor shows ${JSON.stringify(await shown())}`); });
      assert(!(await shown()).some((text) => /(?:IF|THEN|END_IF|TON|NOT)=/.test(text)), `A keyword or a function block type was given a value: ${JSON.stringify(await shown())}`);
    },
  },
  {
    // Every editing action of the ladder is reachable from the keyboard: the cursor, the palette, the list of declared
    // symbols a contact or a coil is bound from, and the structure. The rung built here is saved and built by the app.
    name: '28f A rung is built from the keyboard', example: 'blinky', proves: [], partly: ['LNG-012'],
    run: async (app, { project }) => {
      // the program has one output and the build lets one rung write it: the rung typed here writes a variable of its own
      const file = join(project, 'src', 'main.ld.json');
      const document = JSON.parse(disk(file)) as { variables: { local: Array<{ name: string; type: string }> } };
      document.variables.local.push({ name: 'Hold', type: 'BOOL' });
      writeFileSync(file, JSON.stringify(document, null, 2));
      await openFolder(app, project);
      await openDiagram(app, 'src/main.ld.json', '[data-ld-rung-id]');
      const rungs = () => app.eval<number>(`document.querySelectorAll('[data-ld-rung-id]').length`);
      const before = await rungs();
      // a click on the label of a rung puts the focus in the editor; from then on the hands stay on the keyboard
      // The chord is retried: the click and the first key can reach the editor before it has taken the focus, and then the chord does nothing.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await app.click(`[...document.querySelectorAll('[data-ld-rung-id="rung_1"] span')].find((node) => node.textContent === 'Rung 1')`, 'the label of rung 1');
        await app.press('Ctrl+End');
        await app.press('Ctrl+Enter');
        const added = await app.until('a rung after the last one', async () => await rungs() === before + 1 || undefined, 4_000).then(() => true, () => false);
        if (added) break;
      }
      await app.until('a rung after the last one', async () => await rungs() === before + 1 || undefined);
      const last = await app.eval<string>(`[...document.querySelectorAll('[data-ld-rung-id]')].at(-1).getAttribute('data-ld-rung-id')`);
      await app.until('the cursor in the first cell of the new rung', async () => await app.eval<boolean>(`document.querySelector('[data-ld-rung-id="${last}"] [data-ld-cursor="0,0"]') !== null`) || undefined);

      await app.press('C');
      await answerSearchList(app, 'OnTimer.Q', 'OnTimer.Q');
      await app.press('ArrowRight');
      await app.press('N');
      await answerSearchList(app, 'OffTimer.Q', 'OffTimer.Q');
      await app.press('ArrowRight');
      await app.press('O');
      await answerSearchList(app, 'Hold', 'Hold');
      await app.until('the three elements on the new rung', async () => await app.eval<number>(`document.querySelectorAll('[data-ld-rung-id="${last}"] [data-ld-element-id]').length`) === 3 || undefined);

      await app.click(saveButton, 'the Save button');
      const saved = () => {
        const model = JSON.parse(disk(join(project, 'src', 'main.ld.json'))) as { variables: { local: Array<{ name: string; type: string }> }; rungs: Array<{ grid: Array<Array<{ element: { type: string; variable?: string; fbType?: string; instance?: string } | null }>> }> };
        return { model, rung: model.rungs.at(-1)!.grid.flat().flatMap((cell) => (cell.element ? [cell.element] : [])) };
      };
      await app.until('the rung to be written to the file', () => saved().rung.length === 3 || undefined);
      assert(JSON.stringify(saved().rung.map((element) => [element.type, element.variable])) === JSON.stringify([['contact_no', 'OnTimer.Q'], ['contact_nc', 'OffTimer.Q'], ['coil', 'Hold']]),
        `The rung written to the file is not the one typed: ${JSON.stringify(saved().rung)}`);
      const result = await compile(app);
      assert(result.kind === 'built', `The rung built from the keyboard does not build: ${result.message}`);

      // the palette: another rung, a function block found by its name, declared with an instance of its own
      await app.click(`[...document.querySelectorAll('[data-ld-rung-id="rung_1"] span')].find((node) => node.textContent === 'Rung 1')`, 'the label of rung 1');
      await app.press('Ctrl+End');
      await app.press('Ctrl+Enter');
      await app.until('a rung for the block', async () => await rungs() === before + 2 || undefined);
      await app.press('I');
      await answerSearchList(app, 'TON', 'function_block:TON');
      await app.click(saveButton, 'the Save button');
      await app.until('the function block and its instance to be written', () => {
        const { model, rung } = saved();
        return rung.some((element) => element.type === 'function_block' && element.fbType === 'TON' && element.instance === 'TON_1') && model.variables.local.some((variable) => variable.name === 'TON_1' && variable.type === 'TON') || undefined;
      });
    },
  },
  {
    // The wires of a block are listed from the keyboard, each from an output to an input that takes it, and a variable
    // block is bound from the declared symbols; deleting takes the block and the wires on it in one step.
    name: '28g A function block diagram is edited from the keyboard', example: 'blinky_fbd', proves: [], partly: ['LNG-012'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.fbd.json', '.react-flow__node');
      const nodes = () => app.eval<number>(`document.querySelectorAll('.react-flow__node').length`);
      const before = await nodes();
      await app.click(css('.react-flow__node[data-id="and_run"]'), 'the AND block');
      await app.press('I');
      await answerSearchList(app, 'NOT', 'NOT');
      await app.until('a block beside the AND, selected', async () => await nodes() === before + 1 && await app.eval<boolean>(`document.querySelectorAll('.react-flow__node.selected').length === 1 && document.querySelector('.react-flow__node.selected').getAttribute('data-id') !== 'and_run'`) || undefined);
      const inserted = await app.eval<string>(`document.querySelector('.react-flow__node.selected').getAttribute('data-id')`);
      // the arrow keys without a modifier are the canvas's own: they nudge the selected block
      const place = () => app.eval<string>(`document.querySelector('.react-flow__node[data-id="${inserted}"]').style.transform`);
      const placed = await place();
      await app.until('the focus on the new block', async () => await app.eval<boolean>(`document.activeElement?.getAttribute('data-id') === ${JSON.stringify(inserted)}`) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the focus is on ${await app.eval<string>(`document.activeElement?.outerHTML.slice(0, 200)`)}`); });
      await app.press('ArrowRight');
      await app.until('the arrow key to nudge the block', async () => (await place()) !== placed || undefined);

      await app.press('C');
      await answerSearchList(app, 'AND.OUT');
      await app.until('the wire of the AND to the new block', async () => await app.eval<boolean>(`document.querySelectorAll('.react-flow__edge[data-id]').length > 11`) || undefined);

      // the cursor goes to the first block in reading order
      await app.press('Home');
      await app.until('the first block selected', async () => await app.eval<boolean>(`document.querySelector('.react-flow__node.selected')?.getAttribute('data-id') === 'not_led'`) || undefined);

      // a variable block bound from the declared symbols
      const withLed = () => app.eval<number>(`[...document.querySelectorAll('.react-flow__node')].filter((node) => node.innerText.includes('LED_Output')).length`);
      const ledBefore = await withLed();
      await app.press('V');
      await answerSearchList(app, 'LED_Output');
      await app.until('a variable block that holds LED_Output', async () => await withLed() === ledBefore + 1 || undefined);

      await app.click(saveButton, 'the Save button');
      const saved = () => JSON.parse(disk(join(project, 'src', 'main.fbd.json'))) as { blocks: Array<{ id: string; type: string; variableName?: string }>; connections: Array<{ from: { block: string; port: string }; to: { block: string; port: string } }> };
      await app.until('the blocks to be written', () => saved().blocks.length === before + 2 || undefined);
      assert(saved().connections.some((wire) => wire.from.block === 'and_run' && wire.from.port === 'OUT' && wire.to.block === inserted && wire.to.port === 'IN'),
        `The wire drawn from the keyboard is not in the file: ${JSON.stringify(saved().connections.filter((wire) => wire.to.block === inserted))}`);
      assert(saved().blocks.some((block) => block.type === 'variable' && block.variableName === 'LED_Output' && block.id !== 'var_led_read'), 'The variable block bound from the keyboard is not in the file.');
      const result = await compile(app);
      assert(result.kind === 'built', `The diagram edited from the keyboard does not build: ${result.message}`);

      // Delete takes the selected block with its wires, as one step (a click on the block puts the focus back on the canvas)
      await app.click(css('.react-flow__node.selected'), 'the selected variable block');
      await app.press('Delete');
      await app.until('the variable block to be gone', async () => await nodes() === before + 1 || undefined);
    },
  },
  {
    // A chart is edited by inserting a transition below a step and a step below a transition, each wired to the one it
    // follows; a condition is chosen from the declared symbols and a step is named by typing.
    name: '28h A sequential function chart is edited from the keyboard', example: 'blinky_sfc', proves: [], partly: ['LNG-012'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.sfc.json', '.react-flow__node');
      const nodes = () => app.eval<number>(`document.querySelectorAll('.react-flow__node').length`);
      const before = await nodes();
      await app.click(css('.react-flow__node[data-id="step_led_off"]'), 'the step LED_OFF');
      await app.press('T');
      await app.until('a transition below the step', async () => await nodes() === before + 1 || undefined);
      await app.press('F2');
      await answerSearchList(app, 'LED_Output', 'LED_Output');
      await app.press('S');
      await app.until('a step after the transition', async () => await nodes() === before + 2 || undefined);
      await app.press('F2');
      await answerSearchList(app, 'Hold');

      await app.click(saveButton, 'the Save button');
      const saved = () => JSON.parse(disk(join(project, 'src', 'main.sfc.json'))) as { steps: Array<{ id: string; name: string }>; transitions: Array<{ id: string; fromStep: string; toStep: string; condition: string }> };
      await app.until('the chart to be written', () => saved().steps.some((step) => step.name === 'Hold') || undefined);
      const hold = saved().steps.find((step) => step.name === 'Hold')!;
      const added = saved().transitions.find((transition) => transition.toStep === hold.id);
      assert(added !== undefined && added.fromStep === 'step_led_off' && added.condition === 'LED_Output',
        `The transition inserted from the keyboard is not in the file as typed: ${JSON.stringify(saved().transitions)}`);
      const result = await compile(app);
      assert(result.kind === 'built', `The chart edited from the keyboard does not build: ${result.message}`);
    },
  },
  {
    // A toolbox item dropped on a cell is inserted by the command that the key runs, so the two cannot differ: the element
    // gets an id nothing else has, and a function block an instance that is declared. The drop is made of DOM drag events
    // with the data the toolbox sets; the pointer itself is not driven.
    name: '28i An element dropped on a rung is inserted as the keyboard inserts it', example: 'blinky', proves: [], partly: ['LNG-012', 'LNG-010'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.ld.json', '[data-ld-rung-id]');
      const rungs = () => app.eval<number>(`document.querySelectorAll('[data-ld-rung-id]').length`);
      const before = await rungs();
      await app.click(button('Add rung'), 'the Add rung button');
      await app.until('a new rung', async () => await rungs() === before + 1 || undefined);
      const last = await app.eval<string>(`[...document.querySelectorAll('[data-ld-rung-id]')].at(-1).getAttribute('data-ld-rung-id')`);
      const drop = async (column: number, item: { type: string; category: string; fbType?: string }) => {
        await app.eval(`(() => {
          const transfer = new DataTransfer();
          transfer.setData('application/zplc-ld-element', ${JSON.stringify(JSON.stringify(item))});
          document.querySelector('[data-ld-rung-id="${last}"] [data-ld-drop-zone="0,${column}"]').dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
          window.__dropTransfer = transfer;
        })()`);
        // the cell under the pointer is state of the grid: the drop is made in the next frame
        await app.eval(`new Promise((resolve) => requestAnimationFrame(() => resolve(true)))`);
        await app.eval(`document.querySelector('[data-ld-rung-id="${last}"] [data-ld-drop-zone="0,${column}"]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: window.__dropTransfer }))`);
      };
      await drop(1, { type: 'contact_no', category: 'contact' });
      await app.until('the contact on the rung', async () => await app.eval<boolean>(`document.querySelector('[data-ld-rung-id="${last}"] [data-ld-cell="0,1"] [data-ld-element-id]') !== null`) || undefined);
      await drop(3, { type: 'function_block', category: 'function_block', fbType: 'TON' });
      await app.until('the function block on the rung', async () => await app.eval<boolean>(`document.querySelector('[data-ld-rung-id="${last}"] [data-ld-cell="0,3"] [data-ld-element-id]') !== null`) || undefined);
      await app.click(saveButton, 'the Save button');
      const saved = () => JSON.parse(disk(join(project, 'src', 'main.ld.json'))) as { variables: { local: Array<{ name: string; type: string }> }; rungs: Array<{ id: string; grid: Array<Array<{ element: { id: string; type: string; variable?: string; instance?: string; col: number } | null }>> }> };
      await app.until('the new rung to be written', () => saved().rungs.length === before + 1 && saved().rungs.at(-1)!.grid.flat().filter((cell) => cell.element).length === 2 || undefined);
      const elements = saved().rungs.at(-1)!.grid.flat().flatMap((cell) => (cell.element ? [cell.element] : []));
      assert(elements.map((element) => [element.type, element.col]).join() === 'contact_no,1,function_block,3', `The rung written to the file is not what was dropped: ${JSON.stringify(elements)}`);
      assert(elements[0]!.variable === undefined, `A contact that was dropped is bound to a name nobody gave it: ${elements[0]!.variable}`);
      assert(elements[1]!.instance === 'TON_1' && saved().variables.local.some((variable) => variable.name === 'TON_1' && variable.type === 'TON'), `The function block that was dropped has no declared instance of its own: ${JSON.stringify(elements[1])}`);
    },
  },
  {
    // A drag with the pointer reaches the canvas as a stream of position changes; the file gets one change when the block
    // is put down, and one undo takes it back: the pointer is the real one (mouse events from the DevTools protocol).
    name: '28j A block dragged with the pointer is one undo step', example: 'blinky_fbd', proves: [], partly: ['LNG-010'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.fbd.json', '.react-flow__node');
      const node = css('.react-flow__node[data-id="and_run"]');
      const place = () => app.eval<string>(`document.querySelector('.react-flow__node[data-id="and_run"]').style.transform`);
      const original = await place();
      const centre = await app.eval<{ x: number; y: number }>(`(() => { const box = document.querySelector('.react-flow__node[data-id="and_run"]').getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()`);
      const mouse = (type: string, x: number, buttons: number) => app.cdp.command('Input.dispatchMouseEvent', { type, x, y: centre.y, button: 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
      await mouse('mouseMoved', centre.x, 0);
      await mouse('mousePressed', centre.x, 1);
      for (let step = 1; step <= 12; step++) await mouse('mouseMoved', centre.x + step * 12, 1);
      await mouse('mouseReleased', centre.x + 144, 0);
      await app.until('the block to be where it was put down', async () => (await place()) !== original || undefined);
      const moved = await place();
      // one undo takes the whole drag back, and one redo does it again
      await app.click(node, 'the dragged block');
      await app.press('Ctrl+Z');
      await app.until('the block back where it was', async () => (await place()) === original || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the block is at ${await place()}, was at ${original} and was put down at ${moved}`); });
      await app.press('Ctrl+Shift+Z');
      await app.until('the drag done again', async () => (await place()) === moved || undefined);
    },
  },
  {
    // The user forces a variable from the Watch table, against the native simulator, and the diagram shows the cue of the
    // signal vocabulary on the block that reads it: amber, a diamond and the word FORCED, never the colour alone (UX-009).
    name: '51 A forced variable is shown as forced in the function block diagram', example: 'blinky_fbd', proves: [], partly: ['UX-009', 'LNG-006'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.fbd.json', '.react-flow__node');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky FBD example does not build: ${result.message}`);
      await connectAndRun(app);
      const cue = css('.react-flow__node[data-id="var_led_read"] [data-live-value] [data-signal]');
      const signal = () => app.eval<string>(`document.querySelector(${JSON.stringify('.react-flow__node[data-id="var_led_read"] [data-live-value] [data-signal]')})?.getAttribute('data-signal') ?? ''`);
      await app.until('the variable block to show a value that is not forced', async () => ['true', 'false'].includes(await signal()) || undefined);
      await watch(app, 'LED_Output');
      // the Force checkbox is offered once the row has its first value, which takes longer on a loaded machine
      await app.until('LED_Output to have a value in the Watch table', async () => { const shown = await watchValue(app, 'LED_Output'); return shown !== null && shown !== '...' || undefined; }, 60_000);
      await app.click(css('input[aria-label="Force LED_Output"]'), 'the Force checkbox of LED_Output')
        .catch(async (error: Error) => { throw new Error(`${error.message}: the row is ${await app.eval<string>(`${watchRow('LED_Output')}?.outerHTML.slice(0, 900) ?? 'not in the table'`)}`); });
      await app.until('LED_Output to be forced', async () => await app.eval(`${watchRow('LED_Output')}?.querySelector('[data-forced="true"]') !== null`) === true || undefined);
      await app.until('the variable block to be drawn as forced', async () => await signal() === 'forced' || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the block is ${await app.eval<string>(`document.querySelector('.react-flow__node[data-id="var_led_read"]')?.outerHTML.slice(0, 700) ?? 'not on the canvas'`)}`); });
      const shown = await app.eval<string>(`document.querySelector(${JSON.stringify('.react-flow__node[data-id="var_led_read"] [data-live-value]')})?.innerText ?? ''`);
      assert(shown.includes('FORCED') && shown.includes('◆'), `A forced variable is drawn with a diamond and the word FORCED, not as "${shown}".`);
      assert(await app.visible(cue), 'The forced cue is not visible on the canvas.');
      // red means a fault and nothing else
      assert(!(await app.eval<boolean>(`document.querySelector('.react-flow')?.querySelector('[data-signal="fault"]') !== null`)), 'A forced variable is drawn as a fault.');
      // releasing the force takes the cue away
      if (!await app.clickable(css('input[aria-label="Force LED_Output"]'))) {
        app.note('With a force active the Watch table has no visible row at the default panel size');
        await app.click(css('#workspace-separator'), 'the separator above the lower panel');
        for (let step = 0; step < 6; step++) await app.press('ArrowUp');
      }
      await app.click(css('input[aria-label="Force LED_Output"]'), 'the Force checkbox of LED_Output');
      await app.until('the force to be released', async () => await app.eval(`${watchRow('LED_Output')}?.querySelector('input[type="checkbox"]')?.checked === false`) === true || undefined);
      await app.until('the variable block to stop being drawn as forced', async () => await signal() !== 'forced' || undefined);
    },
  },
  {
    // The same in a rung: LED_Output is forced from the Watch table and every contact and coil that names it says so (UX-009).
    name: '51d A forced variable is shown as forced in the Ladder', example: 'blinky', proves: [], partly: ['UX-009', 'LNG-006'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.ld.json', '[data-ld-rung-id]');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky Ladder example does not build: ${result.message}`);
      await connectAndRun(app);
      const marks = () => app.eval<string[]>(`[...document.querySelectorAll('[data-ld-cell] text')].map((node) => node.textContent ?? '')`);
      await app.until('a contact to show a value that is not forced', async () => (await marks()).some((text) => /^[●○] [TF]$/.test(text)) || undefined);
      await watch(app, 'LED_Output');
      // the Force checkbox is offered once the row has its first value, which takes longer on a loaded machine
      await app.until('LED_Output to have a value in the Watch table', async () => { const shown = await watchValue(app, 'LED_Output'); return shown !== null && shown !== '...' || undefined; }, 60_000);
      await app.click(css('input[aria-label="Force LED_Output"]'), 'the Force checkbox of LED_Output');
      await app.until('LED_Output to be forced', async () => await app.eval(`${watchRow('LED_Output')}?.querySelector('[data-forced="true"]') !== null`) === true || undefined);
      await app.until('a contact or coil of the rung to be drawn as forced', async () => (await marks()).some((text) => text.includes('◆')) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the cells show ${JSON.stringify(await marks())}`); });
      assert(!(await marks()).some((text) => text.includes('▲')), 'A forced variable is drawn as a fault.');
      if (!await app.clickable(css('input[aria-label="Force LED_Output"]'))) {
        app.note('With a force active the Watch table has no visible row at the default panel size');
        await app.click(css('#workspace-separator'), 'the separator above the lower panel');
        for (let step = 0; step < 6; step++) await app.press('ArrowUp');
      }
      await app.click(css('input[aria-label="Force LED_Output"]'), 'the Force checkbox of LED_Output');
      await app.until('the force to be released', async () => await app.eval(`${watchRow('LED_Output')}?.querySelector('input[type="checkbox"]')?.checked === false`) === true || undefined);
      await app.until('the cells to stop being drawn as forced', async () => !(await marks()).some((text) => text.includes('◆')) || undefined);
    },
  },
  {
    // The same on a chart: Go is forced from the Watch table and both transitions that read it say so (UX-009).
    name: '51b A forced variable is shown as forced in the sequential function chart', example: 'blinky_sfc', proves: [], partly: ['UX-009', 'LNG-006'],
    run: async (app, { project }) => {
      writeFileSync(join(project, 'src', 'main.sfc.json'), JSON.stringify({ name: 'Gate',
        variables: { local: [], inputs: [{ name: 'Go', type: 'BOOL', address: '%I0.0' }], outputs: [] },
        steps: [
          { id: 'idle', name: 'Idle', isInitial: true, position: { x: 200, y: 0 } },
          { id: 'work', name: 'Work', isInitial: false, position: { x: 200, y: 260 } },
        ],
        transitions: [
          { id: 'start', fromStep: 'idle', toStep: 'work', condition: 'Go', position: { x: 200, y: 130 } },
          { id: 'finish', fromStep: 'work', toStep: 'idle', condition: 'NOT Go', position: { x: 200, y: 390 } },
        ],
      }));
      await openFolder(app, project);
      await openDiagram(app, 'src/main.sfc.json', '.react-flow__node');
      const result = await compile(app);
      assert(result.kind === 'built', `The Gate chart does not build: ${result.message}`);
      await connectAndRun(app);
      const signalOf = (id: string) => app.eval<string>(`document.querySelector('.react-flow__node[data-id="${id}"] [data-signal]')?.getAttribute('data-signal') ?? ''`);
      await app.until('the transition to show a state that is not forced', async () => ['true', 'false'].includes(await signalOf('start')) || undefined);
      await watch(app, 'Go');
      // the Force checkbox is offered once the row has its first value, which takes longer on a loaded machine
      await app.until('Go to have a value in the Watch table', async () => { const shown = await watchValue(app, 'Go'); return shown !== null && shown !== '...' || undefined; }, 60_000);
      await app.click(css('input[aria-label="Force Go"]'), 'the Force checkbox of Go')
        .catch(async (error: Error) => { throw new Error(`${error.message}: the row is ${await app.eval<string>(`${watchRow('Go')}?.outerHTML.slice(0, 900) ?? 'not in the table'`)}`); });
      await app.until('Go to be forced', async () => await app.eval(`${watchRow('Go')}?.querySelector('[data-forced="true"]') !== null`) === true || undefined);
      for (const id of ['start', 'finish']) {
        await app.until(`the transition ${id} to be drawn as forced`, async () => await signalOf(id) === 'forced' || undefined)
          .catch(async (error: Error) => { throw new Error(`${error.message}: the transition is ${await app.eval<string>(`document.querySelector('.react-flow__node[data-id="${id}"]')?.outerHTML.slice(0, 700) ?? 'not on the canvas'`)}`); });
        const shown = await app.eval<string>(`document.querySelector('.react-flow__node[data-id="${id}"]')?.innerText ?? ''`);
        assert(shown.includes('FORCED'), `A transition that reads a forced variable says FORCED, not "${shown}".`);
      }
      assert(!(await app.eval<boolean>(`document.querySelector('.react-flow')?.querySelector('[data-signal="fault"]') !== null`)), 'A forced variable is drawn as a fault.');
      if (!await app.clickable(css('input[aria-label="Force Go"]'))) {
        app.note('With a force active the Watch table has no visible row at the default panel size');
        await app.click(css('#workspace-separator'), 'the separator above the lower panel');
        for (let step = 0; step < 6; step++) await app.press('ArrowUp');
      }
      await app.click(css('input[aria-label="Force Go"]'), 'the Force checkbox of Go');
      await app.until('the force to be released', async () => await app.eval(`${watchRow('Go')}?.querySelector('input[type="checkbox"]')?.checked === false`) === true || undefined);
      await app.until('the transition to stop being drawn as forced', async () => await signalOf('start') !== 'forced' || undefined);
    },
  },
  {
    // The gestures of the visual editors (UX-033), the way a user makes them: Ladder rungs use the width of the view, fit to
    // view is a key in all three editors, the diagram editors zoom from 10% to 400%, and a context menu opens from the
    // keyboard (Shift+F10), names its items and says why one is disabled.
    name: '51c The visual editors fit to the view, zoom wide, and open context menus from the keyboard', example: 'blinky', proves: [], partly: ['UX-033', 'LNG-010'],
    run: async (app, { project }) => {
      cpSync(join(packageRoot, 'projects', 'blinky_fbd', 'src', 'main.fbd.json'), join(project, 'src', 'second.fbd.json'));
      cpSync(join(packageRoot, 'projects', 'blinky_sfc', 'src', 'main.sfc.json'), join(project, 'src', 'second.sfc.json'));
      await openFolder(app, project);
      const said = () => app.eval<string>(`document.querySelector('[data-live-region="polite"]')?.textContent ?? ''`);
      const menu = () => app.eval<Array<{ text: string; disabled: boolean }>>(`[...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((item) => ({ text: item.textContent.trim(), disabled: item.getAttribute('aria-disabled') === 'true' }))`);
      const closeMenu = async () => { await app.press('Escape'); await app.until('the menu to close', async () => (await menu()).length === 0 || undefined); };
      const scale = () => app.eval<number>(`new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a`);

      // Ladder: the rung is as wide as the view, so its right rail is at the edge of the view and not in a narrow column
      await openDiagram(app, 'src/main.ld.json', '[data-ld-rung-id]');
      const width = await app.eval<{ svg: number; view: number; rail: number }>(`(() => { const view = document.querySelector('[data-ld-rung-id] .overflow-x-auto'); const svg = view.querySelector('svg'); return { svg: svg.getBoundingClientRect().width, view: view.clientWidth, rail: view.getBoundingClientRect().right - svg.getBoundingClientRect().right }; })()`);
      assert(width.svg >= width.view - 1, `A rung is ${width.svg}px wide in a view of ${width.view}px: it does not use the available width.`);
      await app.click(`[...document.querySelectorAll('[data-ld-rung-id="rung_1"] span')].find((node) => node.textContent === 'Rung 1')`, 'the label of rung 1');
      await app.press('Ctrl+Alt+0');
      await app.until('Ladder to say that it fitted', async () => (await said()).includes('Every rung is shown from its left edge') || undefined);
      await app.press('Shift+F10');
      await app.until('the menu of the rung', async () => (await menu()).some((item) => item.text.startsWith('Add rung after')) || undefined);
      const rung = await menu();
      assert(rung.find((item) => item.text.startsWith('Move rung up'))?.disabled === true && rung.find((item) => item.text.startsWith('Move rung up'))!.text.includes('This is the first rung'), `The first rung can be moved up, or does not say why not: ${JSON.stringify(rung)}`);
      await closeMenu();

      // FBD and SFC: fit by key, a zoom range from 10% to 400%, and the menu of an element with the reason of a disabled item
      for (const editor of [
        { file: 'src/second.fbd.json', name: 'FBD', aim: '.react-flow__node', expect: ['Bind variable', 'Edit comment', 'Toggle breakpoint', 'Align left'] },
        { file: 'src/second.sfc.json', name: 'SFC', aim: '.react-flow__node', expect: ['Name the step or set the condition', 'Toggle breakpoint', 'Align left'] },
      ]) {
        await openDiagram(app, editor.file, editor.aim);
        await app.click(css(editor.aim), `a node of the ${editor.name}`);
        await app.press('Ctrl+Alt+0');
        await app.until(`the ${editor.name} to say that it fitted`, async () => (await said()).includes('Diagram fitted to the view') || undefined);
        // each press of a zoom button is awaited, because the button is disabled at the end of the range
        const zoomTo = async (button: string, reached: (zoom: number) => boolean) => {
          for (let step = 0; step < 40 && !reached(await scale()); step++) {
            const before = await scale();
            await app.click(css(button), 'the zoom button');
            await app.until('the zoom to change', async () => Math.abs(await scale() - before) > 0.001 || undefined, 5_000);
          }
        };
        await zoomTo('.react-flow__controls-zoomout', (zoom) => zoom < 0.45);
        assert(await scale() < 0.45, `The ${editor.name} cannot zoom out past 50%: ${await scale()}`);
        await zoomTo('.react-flow__controls-zoomin', (zoom) => zoom > 2);
        assert(await scale() > 2, `The ${editor.name} cannot zoom in past 200%: ${await scale()}`);
        // zoomed in, the nodes may be out of the window: the canvas takes the focus as it does when Tab reaches it
        await app.eval(`document.querySelector('[role="region"][aria-label$="canvas"]').focus()`);
        await app.press('Ctrl+Alt+0');
        await app.until(`the ${editor.name} to fit the diagram back into the view`, async () => await scale() <= 1 || undefined, 15_000);
        await app.click(css(editor.aim), `a node of the ${editor.name}`);
        await app.press('Shift+F10');
        await app.until(`the menu of an element of the ${editor.name}`, async () => (await menu()).length > 0 || undefined);
        const items = await menu();
        for (const name of editor.expect) assert(items.some((item) => item.text.startsWith(name)), `The ${editor.name} menu of an element has no "${name}": ${JSON.stringify(items)}`);
        const align = items.find((item) => item.text.startsWith('Align left'))!;
        assert(align.disabled && align.text.includes('Select at least two elements'), `With one element selected, aligning is not disabled with its reason: ${JSON.stringify(align)}`);
        await closeMenu();
      }
    },
  },
  {
    // LNG-004 in the three other languages: a breakpoint set from the keyboard on a block, a step or an IL line stops the
    // simulation, and the element where it stopped is marked (the yellow outline of a paused element on a canvas).
    name: '28ka A breakpoint on an FBD block stops execution', example: 'blinky_fbd', proves: [], partly: ['LNG-004', 'LNG-027'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.fbd.json', '.react-flow__node');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky FBD example does not build: ${result.message}`);
      await app.click(css('.react-flow__node[data-id="and_run"]'), 'the AND block');
      await app.press('F9');
      await app.until('the red outline of the breakpoint on the block', async () => await app.eval<boolean>(`document.querySelector('.react-flow__node[data-id="and_run"]')?.getAttribute('style')?.includes('accent-red') === true`) || undefined);
      await app.click(button('Connect'));
      await app.until('the simulation to connect', async () => await app.visible(button('Disconnect')) || undefined);
      await app.click(button('Run (F5)', 'prefix'));
      await app.until('execution to stop at the block', async () => await app.visible(button('Resume (F5)', 'prefix')) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the program keeps running past the breakpoint on the AND block`); });
      await app.until('the block where the program is stopped to be marked', async () => await app.eval<boolean>(`document.querySelector('.react-flow__node[data-id="and_run"]')?.getAttribute('style')?.includes('accent-yellow') === true`) || undefined);
    },
  },
  {
    name: '28kb A breakpoint on an SFC step stops execution', example: 'blinky_sfc', proves: [], partly: ['LNG-004', 'LNG-027'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.sfc.json', '.react-flow__node');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky SFC example does not build: ${result.message}`);
      await app.click(css('.react-flow__node[data-id="step_led_on"]'), 'the step LED_ON');
      await app.press('F9');
      await app.until('the red outline of the breakpoint on the step', async () => await app.eval<boolean>(`document.querySelector('.react-flow__node[data-id="step_led_on"]')?.getAttribute('style')?.includes('accent-red') === true`) || undefined);
      await app.click(button('Connect'));
      await app.until('the simulation to connect', async () => await app.visible(button('Disconnect')) || undefined);
      await app.click(button('Run (F5)', 'prefix'));
      await app.until('execution to stop at the step', async () => await app.visible(button('Resume (F5)', 'prefix')) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the program keeps running past the breakpoint on the step`); });
      await app.until('the step where the program is stopped to be marked', async () => await app.eval<boolean>(`document.querySelector('.react-flow__node[data-id="step_led_on"]')?.getAttribute('style')?.includes('accent-yellow') === true`) || undefined);
    },
  },
  {
    name: '28kc A breakpoint on an IL line stops execution', example: 'blinky_il', proves: [], partly: ['LNG-004', 'LNG-027'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/main.il');
      const line = await lineWith(app, 'LD      OffTimer.Q');
      assert(line > 0, 'main.il no longer has the instruction LD OffTimer.Q the journey aims at.');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky IL example does not build: ${result.message}`);
      await clickEditorLine(app, line, 'gutter');
      await app.until(`a breakpoint dot on line ${line}`, async () => (await decoratedLines(app, 'glyphMarginClassName', 'breakpoint-glyph')).includes(line) || undefined);
      await app.click(button('Connect'));
      await app.until('the simulation to connect', async () => await app.visible(button('Disconnect')) || undefined);
      await app.click(button('Run (F5)', 'prefix'));
      await app.until(`execution to stop at line ${line}`, async () => await app.visible(button('Resume (F5)', 'prefix')) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the program keeps running past the breakpoint on the IL line`); });
      assert((await decoratedLines(app, 'className', 'current-line-highlight')).includes(line), `Execution paused but the editor does not mark line ${line}.`);
    },
  },
  {
    // Alignment needs two selected blocks, and the keyboard reaches them: Ctrl+Alt+Arrow adds the nearest block in that
    // direction to the selection, then Alt+Shift+Arrow aligns them, as one undo step.
    name: '28ja Two blocks are selected and aligned from the keyboard alone', example: 'blinky_fbd', proves: [], partly: ['LNG-012'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.fbd.json', '.react-flow__node');
      const left = (id: string) => app.eval<number>(`document.querySelector('.react-flow__node[data-id="${id}"]').getBoundingClientRect().x`);
      await app.click(css('.react-flow__node[data-id="and_run"]'), 'the AND block');
      await app.press('Ctrl+Alt+ArrowRight');
      await app.until('the AND and the block to its right selected', async () => await app.eval<boolean>(`[...document.querySelectorAll('.react-flow__node.selected')].map((node) => node.getAttribute('data-id')).sort().join() === 'and_run,output_led'`) || undefined);
      assert(await left('and_run') !== await left('output_led'), 'The two blocks start aligned, so the journey proves nothing.');
      await app.press('Alt+Shift+ArrowLeft');
      await app.until('the two blocks on one left edge', async () => Math.abs(await left('and_run') - await left('output_led')) < 1 || undefined);
    },
  },
  {
    // LNG-027 / LNG-004: Pause, Step one cycle and Resume work the same in every language; the cycle counter is the witness.
    name: '53a Pause, step one cycle and resume a Ladder program', example: 'blinky', proves: [], partly: ['LNG-004', 'LNG-027'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.ld.json', '[data-ld-rung-id]');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky Ladder example does not build: ${result.message}`);
      await pauseStepResume(app);
    },
  },
  {
    name: '53b Pause, step one cycle and resume a function block diagram', example: 'blinky_fbd', proves: [], partly: ['LNG-004', 'LNG-027'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.fbd.json', '.react-flow__node');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky FBD example does not build: ${result.message}`);
      await pauseStepResume(app);
    },
  },
  {
    name: '53c Pause, step one cycle and resume a sequential function chart', example: 'blinky_sfc', proves: [], partly: ['LNG-004', 'LNG-027'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openDiagram(app, 'src/main.sfc.json', '.react-flow__node');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky SFC example does not build: ${result.message}`);
      await pauseStepResume(app);
    },
  },
  {
    name: '53d Pause, step one cycle and resume an Instruction List program', example: 'blinky_il', proves: [], partly: ['LNG-004', 'LNG-027'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/main.il');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky IL example does not build: ${result.message}`);
      await pauseStepResume(app);
    },
  },
  {
    name: '53e Pause, step one cycle and resume a Structured Text program', example: 'blinky_st', proves: [], partly: ['LNG-004', 'LNG-027'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/main.st');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky ST example does not build: ${result.message}`);
      await pauseStepResume(app);
    },
  },
  {
    name: '54 Instruction List is edited, saved and reopened', example: 'blinky_il', proves: [], partly: ['LNG-001'],
    run: async (app, { project }) => {
      const file = join(project, 'src', 'main.il'); const original = disk(file);
      await openFolder(app, project);
      await openFile(app, 'src/main.il');
      await cursorAtEndOfLine(app, 1);
      await app.type(IL_EDIT);
      const edited = original.replace(/^[^\n]*/, (first) => `${first}${IL_EDIT}`);
      await app.until('the editor to hold the typed text', async () => await editorText(app) === edited.replace(/\r\n/g, '\n') || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the first line reads ${JSON.stringify((await editorText(app)).split('\n')[0])}`); });
      assert(disk(file) === original, 'Typing alone must not write the file.');
      await app.click(saveButton, 'the Save button');
      await app.until('the edited file on disk', () => disk(file) === edited || undefined);
      const result = await compile(app);
      assert(result.kind === 'built', `The edited Instruction List program does not build: ${result.message}`);
      await app.click(button('Close project'));
      await app.until('the Welcome screen', async () => await app.visible(button('Open project', 'contains')) || undefined);
      await openFolder(app, project);
      await openFile(app, 'src/main.il');
      assert(await editorText(app) === edited, 'The reopened project does not show the saved text.');
    },
  },
  {
    name: '54b Instruction List values are watched and a variable is forced and released', example: 'blinky_il', proves: [], partly: ['LNG-006'],
    run: async (app, { project }) => {
      await openFolder(app, project);
      await openFile(app, 'src/main.il');
      const result = await compile(app);
      assert(result.kind === 'built', `The Blinky IL example does not build: ${result.message}`);
      await connectAndRun(app);
      await watch(app, 'LED_Output');
      const first = await watchValue(app, 'LED_Output');
      await app.until('LED_Output to change in the Watch table: the program blinks', async () => { const now = await watchValue(app, 'LED_Output'); return now !== null && now !== '...' && now !== first || undefined; }, 30_000);
      await forceAndRelease(app, 'LED_Output');
      assert((await app.text()).includes('1 active force'), 'The force banner does not show one active force.');
      await releaseForce(app, 'LED_Output');
    },
  },
  {
    name: '64a Structured Text from a new project to a deployed program that is watched', example: 'blinky_st', proves: ['LNG-001'], partly: [],
    run: (app, context) => languageChain(app, context, CHAINS.ST),
  },
  {
    name: '64b Instruction List from a new project to a deployed program that is watched', example: 'blinky_il', proves: ['LNG-001'], partly: [],
    run: (app, context) => languageChain(app, context, CHAINS.IL),
  },
  {
    name: '64c Ladder Diagram from a new project to a deployed program that is watched', example: 'blinky', proves: ['LNG-001'], partly: [],
    run: (app, context) => languageChain(app, context, CHAINS.LD),
  },
  {
    name: '64d Function Block Diagram from a new project to a deployed program that is watched', example: 'blinky_fbd', proves: ['LNG-001'], partly: [],
    run: (app, context) => languageChain(app, context, CHAINS.FBD),
  },
  {
    name: '64e Sequential Function Chart from a new project to a deployed program that is watched', example: 'blinky_sfc', proves: ['LNG-001'], partly: [],
    run: (app, context) => languageChain(app, context, CHAINS.SFC),
  },
  {
    name: '29 The Welcome screen loads no editor', example: 'motor_start_stop', proves: [], partly: ['IDE-015'],
    run: async (app, { project }) => {
      // What the page has fetched, as modules (the development host serves each one by its path). The page keeps the first
      // 250 resources unless told otherwise, so it is told to keep every one and loaded again from a clean start.
      await app.cdp.command('Page.addScriptToEvaluateOnNewDocument', { source: 'performance.setResourceTimingBufferSize(100000);' });
      await app.cdp.command('Page.reload');
      await app.until('the Welcome screen again', async () => await app.eval<string | null>(WELCOME_TITLE) === 'ZPLC' || undefined);
      const fetched = () => app.eval<string[]>(`performance.getEntriesByType('resource').map((entry) => entry.name)`);
      const has = async (pattern: RegExp) => (await fetched()).some((name) => pattern.test(name));
      const MONACO = /monaco-editor_esm_vs_editor_edcore__main\.js/;
      const CODE_EDITOR = /\/src\/components\/CodeEditor\.tsx/;
      const VISUAL_EDITOR = /\/src\/editors\/(?:fbd|ld|sfc)\/(?:FBD|LD|SFC)Editor\.tsx/;
      const SETTINGS = /\/src\/components\/settings\/ProjectSettings\.tsx/;

      await app.until('the Welcome screen', async () => await app.visible(css('main')) || undefined);
      for (const [what, pattern] of [['Monaco', MONACO], ['the code editor', CODE_EDITOR], ['a visual editor', VISUAL_EDITOR], ['the settings', SETTINGS]] as const) {
        assert(!await has(pattern), `The Welcome screen loaded ${what}.`);
      }

      // A Structured Text file brings the code editor and Monaco, and neither the visual editors nor the settings.
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      assert(await has(CODE_EDITOR) && await has(MONACO), 'Opening a Structured Text file did not load the code editor.');
      assert(!await has(VISUAL_EDITOR) && !await has(SETTINGS), 'A Structured Text file loaded a visual editor or the settings.');

      // The settings load when they are opened.
      await app.click(button('Project settings'), 'the Project settings button');
      await app.until('the settings', async () => await has(SETTINGS) && await app.visible(css('[data-app-preferences]')) || undefined);
    },
  },

  {
    name: '30 Export a project to one archive and import it back', example: 'motor_start_stop', proves: [], partly: ['IDE-022'],
    run: async (app, { project, root }) => {
      const archive = join(root, 'motor.zplc.zip');
      const folder = join(root, 'imported');
      mkdirSync(folder);
      /** Every file under `directory`, relative, with its bytes as base64: two folders are equal when these are. */
      const tree = (directory: string, prefix = ''): Record<string, string> => Object.fromEntries(readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? Object.entries(tree(join(directory, entry.name), `${prefix}${entry.name}/`)) : [[`${prefix}${entry.name}`, readFileSync(join(directory, entry.name)).toString('base64')]]));

      // Export: the save dialog is answered with a path, and one file appears there.
      await openFolder(app, project);
      app.answer(archive);
      await app.click(button('Build options'));
      await app.click(menuItem('Export project archive'));
      await app.until('the archive on disk', () => existsSync(archive) || undefined);
      await app.until('the export reported in Output', async () => /Exported motor\.zplc\.zip: \d+ files/.test(await outputText(app)) || undefined);
      const entries = readZip(new Uint8Array(readFileSync(archive))).filter((entry) => entry.kind === 'file').map((entry) => entry.path);
      assert(entries.includes('zplc.json') && entries.includes('src/Motor.st'), `The archive does not hold the project files: ${JSON.stringify(entries)}`);
      assert(!entries.some((path) => path.startsWith('.git/') || path.startsWith('node_modules/')), 'The archive holds files that are not part of the project.');

      // Import from the Welcome screen: choosing the archive writes nothing, the dialog says what is in it.
      await showExplorer(app);
      await app.click(button('Close project'));
      await app.until('the Welcome screen', async () => await app.visible(button('Import a project archive', 'contains')) || undefined);
      app.answer(archive);
      await app.click(button('Import a project archive', 'contains'), 'the Import a project archive button');
      await app.until('the import dialog', async () => await app.visible(css('[data-import-archive-dialog]')) || undefined);
      const summary = await app.eval<string>(`document.querySelector('[data-import-archive-dialog]').innerText`);
      assert(summary.includes('motor.zplc.zip') && summary.includes('Motor Start Stop') && summary.includes('Nothing has been written'), `The import dialog does not say what the archive holds: ${summary}`);
      assert(readdirSync(folder).length === 0, 'Choosing the archive wrote into the folder.');

      // Import: an empty folder is chosen, the files are written and the project opens by itself.
      app.answer(folder);
      await app.click(button('Choose a folder and import'), 'the import button');
      await app.until('the imported project open', async () => await app.visible(toolbar) || undefined);
      assert(JSON.stringify(tree(folder)) === JSON.stringify(tree(project)), 'The imported folder is not equal to the project that was exported.');
      assert(disk(join(folder, 'zplc.json')) === disk(join(project, 'zplc.json')), 'zplc.json is not byte-equal after the round trip.');
      await openFile(app, 'src/Motor.st');
      assert(hasProgram(await editorText(app), 'Motor'), 'The imported project does not open Motor.st.');
    },
  },

  {
    name: '31 A version 1 project shows its migration before it is applied', example: 'none', proves: [], partly: ['IDE-022'],
    run: async (app, { project }) => {
      mkdirSync(join(project, 'src'), { recursive: true });
      const legacy = JSON.stringify({ name: 'Legacy', version: '1.0.0', tasks: [{ name: 'Main', type: 'CYCLIC', interval: 20, priority: 2, file: 'main.st' }] }, null, 2);
      writeFileSync(join(project, 'zplc.json'), legacy);
      writeFileSync(join(project, 'src', 'main.st'), 'PROGRAM Main\nEND_PROGRAM\n');

      await openFolder(app, project);
      await showExplorer(app);
      await app.until('the migration notice', async () => (await app.text()).includes('Migration preview') || undefined);
      assert(disk(join(project, 'zplc.json')) === legacy, 'Opening a version 1 project changed zplc.json.');

      // The difference is a dialog of its own, and closing it changes nothing.
      await app.click(button('Review the difference', 'prefix'), 'the Review the difference button');
      await app.until('the difference', async () => await app.visible(css('[data-migration-difference]')) || undefined);
      const shown = await app.eval<string>(`document.querySelector('[data-migration-difference]').innerText`);
      assert(shown.includes('"schemaVersion": 2') && shown.includes('"trigger": "cyclic"') && shown.includes('"interval": 20'), `The difference does not show the migration: ${shown}`);
      await app.click(button('Close'), 'Close');
      await app.until('the dialog to close', async () => !await app.visible(css('[data-migration-preview]')) || undefined);
      assert(disk(join(project, 'zplc.json')) === legacy, 'Closing the difference changed zplc.json.');

      // Applying it is the save: zplc.json is then version 2, and the notice is gone.
      await app.click(button('Review the difference', 'prefix'), 'the Review the difference button');
      await app.until('the dialog', async () => await app.visible(button('Apply migration')) || undefined);
      await app.click(button('Apply migration'), 'Apply migration');
      await app.until('zplc.json at version 2', () => JSON.parse(disk(join(project, 'zplc.json'))).schemaVersion === 2 || undefined);
      await app.until('the notice gone', async () => !(await app.text()).includes('Migration preview') || undefined);
      assert(disk(join(project, 'src', 'main.st')) === 'PROGRAM Main\nEND_PROGRAM\n', 'The migration changed a program.');
    },
  },

  {
    name: '32 Declarations in the tree, and a library folder offered to every editor', example: 'motor_start_stop', proves: [], partly: ['IDE-023'],
    run: async (app, { project }) => {
      mkdirSync(join(project, 'lib'));
      const library = ['(* A library file: the block of the project that the palettes and the completion offer. *)', 'FUNCTION_BLOCK Debounce', 'VAR_INPUT', '  Raw : BOOL;', 'END_VAR', 'VAR_OUTPUT', '  Clean : BOOL;', 'END_VAR', 'Clean := Raw;', 'END_FUNCTION_BLOCK', ''].join('\n');
      writeFileSync(join(project, 'lib', 'Debounce.st'), library);
      writeFileSync(join(project, 'src', 'boiler.ld'), JSON.stringify({ name: 'boiler', version: '1.0.0', variables: { local: [], inputs: [], outputs: [] }, rungs: [], metadata: {} }));
      const declarations = css('[data-project-declarations]');
      const declaration = (name: string): Target => css(`[data-declaration="${name}"]`);
      const toolbox = `[...document.querySelectorAll('h2')].find((heading) => heading.textContent === 'Toolbox')?.parentElement`;

      // The tree lists what the files of src declare, grouped under their file, before any library exists.
      await openFolder(app, project);
      await showExplorer(app);
      await app.click(button('Declarations', 'prefix'), 'the Declarations heading');
      await app.until('the declarations of the project', async () => await app.visible(declaration('Motor')) || undefined);
      assert(await app.visible(declarations) && !await app.visible(declaration('Debounce')), 'A file outside src and the libraries was listed.');
      const group = await app.eval<string>(`document.querySelector('[data-declaration-file="src/Motor.st"]')?.innerText ?? ''`);
      assert(group.includes('src/Motor.st') && group.includes('Motor'), `The declarations are not grouped under their file: ${JSON.stringify(group)}`);
      // The file of the folder that is not listed is one no build reads, and the tree and the section say so (CMP-046).
      await app.until('the unlisted folder in the section', async () => await app.visible(css('[data-unlisted-folder="lib"]')) || undefined);
      assert(!await app.eval<boolean>(`document.querySelector('[data-tree-node-id="dir:lib"]').innerText.includes('library')`), 'The folder is marked as a library before it is listed.');

      // The block of the library is not in the palette of the Ladder editor yet.
      await clickTreeFile(app, 'src/boiler.ld');
      await app.until('the Ladder toolbox', async () => await app.eval<boolean>(`Boolean(${toolbox})`) || undefined);
      assert(!await app.eval<boolean>(`${toolbox}.innerText.includes('Debounce')`), 'The palette offered a block that no library or src file declares.');

      // Adding the folder as a library: zplc.json names it, the tree lists the block, and the palette offers it.
      await showExplorer(app);
      await app.click(button('Add library folder'), 'the Add library folder button');
      await app.until('the library dialog', async () => await app.visible(css('[data-library-dialog]')) || undefined);
      await app.eval(`document.getElementById('library-folder').focus()`);
      const folders = await app.eval<string[]>(`[...document.getElementById('library-folder').options].map((option) => option.value)`);
      const at = folders.indexOf('lib');
      assert(at >= 0, `The dialog does not offer the folder: ${JSON.stringify(folders)}`);
      const current = await app.eval<number>(`document.getElementById('library-folder').selectedIndex`);
      for (let step = 0; step < Math.abs(at - current); step++) await app.press(at > current ? 'ArrowDown' : 'ArrowUp');
      await app.click(button('Add library'), 'the Add library button');
      await app.until('zplc.json to name the library', () => (JSON.parse(disk(join(project, 'zplc.json'))) as { libraries?: string[] }).libraries?.join() === 'lib' || undefined);
      await app.until('the block of the library in the tree', async () => await app.visible(declaration('Debounce')) || undefined);
      await app.until('the library marked in the file tree', async () => await app.eval<boolean>(`document.querySelector('[data-tree-node-id="dir:lib"]')?.innerText.includes('library') === true`) || undefined);
      assert(!await app.visible(css('[data-unlisted-folder="lib"]')), 'The folder is still reported as not compiled after it is listed.');
      await app.until('the block of the library in the Ladder palette', async () => await app.eval<boolean>(`${toolbox}?.innerText.includes('Debounce') === true`) || undefined);

      // Activating a declaration opens its file with the cursor on it.
      await app.click(declaration('Debounce'), 'the Debounce declaration');
      await app.until('Debounce.st in the editor, the cursor on the block', async () => (await editorText(app)).includes('FUNCTION_BLOCK Debounce') && (await editorView(app)).line === 2 || undefined);

      // The build reads the library with src: it builds, with the library file in the program.
      const built = await compile(app);
      assert(built.kind === 'built', `The project with its library did not build: ${built.message}`);

      // Taking the library away takes the block away from the tree and the palette, and the file is not compiled again.
      await showExplorer(app);
      await app.click(button('Remove library lib'), 'Remove library lib');
      await app.until('the block gone from the tree', async () => !await app.visible(declaration('Debounce')) || undefined);
      assert((JSON.parse(disk(join(project, 'zplc.json'))) as { libraries?: string[] }).libraries?.length === 0, 'zplc.json still names the library.');
      await app.until('the folder reported as not compiled again', async () => await app.visible(css('[data-unlisted-folder="lib"]')) || undefined);

      // The section offers to list the folder, which is the same change as the dialog.
      await app.click(button('List lib as a library'), 'List lib as a library');
      await app.until('zplc.json to name the library again', () => (JSON.parse(disk(join(project, 'zplc.json'))) as { libraries?: string[] }).libraries?.join() === 'lib' || undefined);
      await app.until('the block back in the tree', async () => await app.visible(declaration('Debounce')) || undefined);
    },
  },

  {
    name: '33 Declared interlock coverage has a tab of its own', example: 'motor_start_stop', proves: [], partly: ['IDE-032'],
    run: async (app, { project }) => {
      const view = css('[data-interlock-coverage]');
      await openFolder(app, project);

      // It is not part of Problems or of Tests any more.
      await app.click(tab('Problems'));
      assert(!await app.visible(view) && !(await app.text()).toLowerCase().includes('declared interlock coverage'), 'Declared interlock coverage is still shown inside Problems.');
      await app.click(tab('Tests', 'prefix'));
      assert(!await app.visible(view), 'Declared interlock coverage is shown inside Tests.');

      // It is a tab: it says what it checks and what it does not, and runs the check on the saved project.
      await app.click(tab('Interlocks'), 'the Interlocks tab');
      await app.until('the view', async () => await app.visible(view) || undefined);
      const before = await app.eval<string>(`document.querySelector('[data-interlock-coverage]').innerText`);
      assert(before.toLowerCase().includes('declared interlock coverage') && before.includes('does not establish physical safety, timing, or certification'), `The view lacks its title or its scope: ${before}`);
      await app.click(button('Check declared interlocks'), 'the Check declared interlocks button');
      await app.until('the declared pair in the table', async () => await app.eval<boolean>(`document.querySelector('[data-interlock-coverage] table')?.innerText.includes('Motor.Forward') === true`) || undefined);
      const report = await app.eval<string>(`document.querySelector('[data-interlock-coverage] table').innerText`);
      assert(report.includes('Motor.Reverse') && /Covered|Missing exact NEVER coverage/.test(report), `The table does not say whether the pair is covered: ${report}`);
    },
  },
  {
    // IDE-002: a message crafted through the bridge cannot make Build or Test act on a folder other than the one the window
    // shows. The bridge calls are the same ones the toolbar makes; only the ids they carry are the ones of another project.
    name: '34 A build and a test run act only on the project shown', example: 'motor_start_stop', proves: ['IDE-002'], partly: ['IDE-001'],
    run: async (app, { root, project }) => {
      const other = join(root, 'other-project');
      cpSync(join(packageRoot, 'projects', 'blinky_st'), other, { recursive: true });
      const shownName = (JSON.parse(disk(join(project, 'zplc.json'))) as { name: string }).name;
      const otherName = (JSON.parse(disk(join(other, 'zplc.json'))) as { name: string }).name;
      assert(shownName !== otherName, 'The two example projects must have different names for this journey to tell them apart.');

      await openFolder(app, project);
      const built = await compile(app);
      assert(built.kind === 'built', `The project shown should build from the toolbar: ${built.kind} ${built.message}`);

      type Answer = { ok: boolean; value?: unknown; message?: string };
      const call = (body: string) => app.eval<Answer>(`(async () => { const api = window.electronAPI; try { return { ok: true, value: await (async () => { ${body} })() }; } catch (error) { return { ok: false, message: String((error && error.message) || error) }; } })()`);
      const folderId = async (folder: string) => {
        app.answer(folder);
        const answer = await call('return await api.projectFiles.chooseFolder();');
        const typed = answer.value as { ok: boolean; value: { rootId: string } | null } | undefined;
        assert(answer.ok && typed?.ok && typed.value, `The bridge did not hand back a folder id: ${JSON.stringify(answer)}`);
        return typed.value!.rootId;
      };
      const workspaceOf = async (rootId: string) => {
        const answer = await call(`return await api.workspaceTests.registerProjectRoot({ rootId: ${JSON.stringify(rootId)} });`);
        return answer.ok ? (answer.value as { workspaceId: string } | null)?.workspaceId ?? null : null;
      };
      /** What the bridge answers to an operation, reduced to whether it was refused and which project it built. */
      const operation = async (name: 'compile' | 'safetyCheck' | 'run', workspaceId: string, rootId: string) => {
        const answer = await call(`const result = await api.workspaceTests.${name}({ workspaceId: ${JSON.stringify(workspaceId)}, rootId: ${JSON.stringify(rootId)} }); return { ok: result && result.ok === true, name: result && result.summary && result.summary.name };`);
        return { refused: !answer.ok, built: answer.ok ? (answer.value as { ok: boolean; name?: string }) : undefined };
      };

      // The window shows the project: a build asked for that project is the project's build.
      const shownId = await folderId(project);
      const shownWorkspace = await workspaceOf(shownId);
      assert(shownWorkspace, 'The folder of the window could not be registered as a workspace.');
      const control = await operation('compile', shownWorkspace, shownId);
      assert(!control.refused && control.built?.ok && control.built.name === shownName, `A build of the project shown must succeed and be that project's: ${JSON.stringify(control)}`);

      // The window now holds another folder. Everything addressed to the project it showed is refused.
      const otherId = await folderId(other);
      for (const name of ['compile', 'safetyCheck', 'run'] as const) {
        const stale = await operation(name, shownWorkspace, shownId);
        assert(stale.refused, `${name} for the folder that the window no longer holds must be refused: ${JSON.stringify(stale)}`);
        const crossed = await operation(name, shownWorkspace, otherId);
        assert(crossed.refused, `${name} with the workspace of one project and the id of another must be refused: ${JSON.stringify(crossed)}`);
      }
      assert(await workspaceOf(shownId) === null, 'The folder that the window no longer holds must not be registered as a workspace.');

      // The project the window holds now builds, and it is its own build, not the earlier project's.
      const otherWorkspace = await workspaceOf(otherId);
      assert(otherWorkspace, 'The folder of the window could not be registered as a workspace.');
      const rebuilt = await operation('compile', otherWorkspace, otherId);
      assert(!rebuilt.refused && rebuilt.built?.ok && rebuilt.built.name === otherName, `A build of the project now held must be that project's: ${JSON.stringify(rebuilt)}`);
      assert((await operation('compile', shownWorkspace, otherId)).refused, 'The earlier workspace must stay refused after the new one is registered.');
    },
  },

  {
    // IDE-012: the work of Tests runs in processes of its own and is cancellable; the window keeps answering throughout.
    name: '35 A long test run can be cancelled and leaves no process behind', example: 'motor_start_stop', proves: ['IDE-012'], partly: [],
    run: async (app, { project, root }) => {
      // Three scenarios of the longest allowed length (10,000 samples each): seconds of work in the runtime.
      for (const name of ['LongA', 'LongB', 'LongC']) {
        const scenario = { schemaVersion: 1, id: name, tickMs: 10, durationMs: 99_990, events: [{ atMs: 0, set: { 'Motor.Start': true, 'Motor.Stop': false, 'Motor.EStop': false, 'Motor.Overload': false } }], expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Forward': false, 'Motor.Reverse': false } }] };
        writeFileSync(join(project, 'tests', `${name}.scenario.json`), JSON.stringify(scenario));
      }
      /**
       * The processes below the main process of the app under test (found by the private user-data directory only it
       * carries: other applications may be running on the machine): pid and name.
       * A utility process rewrites its command line once it is up, so the tree and the process name are what identify it.
       */
      const descendants = (): Array<{ pid: number; name: string }> => {
        const table = new Map<number, { parent: number; name: string; command: string }>();
        for (const entry of readdirSync('/proc')) {
          if (!/^\d+$/.test(entry)) continue;
          try {
            const parent = Number(/PPid:\s+(\d+)/.exec(readFileSync(`/proc/${entry}/status`, 'utf8'))?.[1]);
            table.set(Number(entry), { parent, name: readFileSync(`/proc/${entry}/comm`, 'utf8').trim(), command: readFileSync(`/proc/${entry}/cmdline`, 'utf8').split('\0').join(' ') });
          } catch { /* it exited meanwhile */ }
        }
        const profile = `--user-data-dir=${join(root, 'profile')}`;
        const main = [...table.entries()].find(([, entry]) => entry.command.split(' ').includes(profile) && entry.command.includes('--zplc-smoke-port=') && !entry.command.includes('--type='))?.[0];
        const found: Array<{ pid: number; name: string }> = [];
        const walk = (pid: number) => { for (const [child, entry] of table) if (entry.parent === pid) { found.push({ pid: child, name: entry.name }); walk(child); } };
        if (main !== undefined) walk(main);
        return found;
      };
      const reply = () => app.eval<number>(`(async () => { const started = performance.now(); await window.electronAPI.getAppInfo(); return performance.now() - started; })()`);
      const run = button('Run host scenarios');
      const cancel = button('Cancel scenarios');

      await openFolder(app, project);
      const known = new Set(descendants().map((process) => process.pid));
      const added = () => descendants().filter((process) => !known.has(process.pid));
      assert(known.size > 0, 'The journey could not find the processes of the app under test.');
      await app.click(tab('Tests'));
      await app.click(run);
      await app.until('Cancel scenarios while the scenarios run', async () => await app.visible(cancel) || undefined);
      // The tests run in a process of their own, which starts the native runtime: neither is a process of the app's main process alone.
      const during = await app.until('a worker process that owns a native runtime', async () => {
        const now = added();
        return now.some((process) => process.name === 'zplc_runtime') && now.some((process) => process.name !== 'zplc_runtime') ? now : undefined;
      }, 20_000);
      assert(during.filter((process) => process.name !== 'zplc_runtime').length >= 1, 'The tests did not run in a process of their own.');

      // The main process answers the window promptly while the work runs somewhere else.
      const latencies: number[] = [];
      for (let probe = 0; probe < 10; probe++) latencies.push(await reply());
      assert(Math.max(...latencies) < 500, `The main process answered slowly while tests ran: ${latencies.map((value) => Math.round(value)).join(', ')} ms`);

      await app.click(cancel);
      await app.until('the run to end and Run host scenarios to come back', async () => !await app.visible(cancel) && await app.clickable(run) || undefined, 10_000);
      await app.until('no worker and no runtime left', async () => added().length === 0 || undefined, 10_000);
      assert((await app.text()).includes('Cancelled') || (await app.text()).toLowerCase().includes('cancel'), 'The Tests panel should say that the run was cancelled.');

      // The window is alive and the next operation works.
      assert(await reply() < 500, 'The main process does not answer after the cancel.');
      const built = await compile(app);
      assert(built.kind === 'built', `A build after a cancelled run should succeed: ${built.kind} ${built.message}`);
    },
  },

  {
    // IDE-021: the result of a save, a build, a connection change and a test run appears as a notification that opens the
    // panel with its details, and a long operation shows progress with a Cancel action.
    name: '36 Results appear as notifications that lead to their details', example: 'motor_start_stop', proves: ['IDE-021'], partly: [],
    run: async (app, { project }) => {
      const notification = (kind: string, status?: string) => css(`[data-notification="${kind}"]${status ? `[data-status="${status}"]` : ''}`);
      const openDetails = css('[data-notification] [data-details]');
      const textOf = (kind: string) => app.eval<string>(`document.querySelector('[data-notification="${kind}"]')?.innerText ?? ''`);
      /** What every notification on screen says, for the failure message of a wait that ran out. */
      const onScreen = () => app.eval<string>(`[...document.querySelectorAll('[data-notification]')].map((item) => item.getAttribute('data-notification') + '/' + item.getAttribute('data-status') + ': ' + item.innerText.replace(/\\s+/g, ' ')).join(' | ')`);
      const waitFor = (description: string, kind: string, status: string, timeoutMs?: number) => app.until(description, async () => await app.visible(notification(kind, status)) || undefined, timeoutMs)
        .catch(async (error: Error) => { throw new Error(`${error.message}; on screen: ${await onScreen()}`); });
      const selectedPanel = () => app.eval<string | null>(`document.querySelector('[role="tab"][aria-selected="true"][id^="console-tab-"]')?.id ?? null`);
      /** Click Details of the only notification on screen and say which panel opened. */
      const followDetails = async (kind: string, otherTab: string) => {
        await app.click(tab(otherTab));
        await app.click(css(`[data-notification="${kind}"] [data-details]`), `Details of the ${kind} notification`);
        return await app.until('a panel to open', async () => await selectedPanel() ?? undefined);
      };
      void openDetails;

      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      // A trailing comment on the last statement: valid Structured Text, so that the build below succeeds.
      const statement = await lineWith(app, 'Reverse := FALSE;');
      assert(statement > 0, 'Motor.st no longer has the statement Reverse := FALSE; the journey edits after it.');
      await cursorAtEndOfLine(app, statement);
      await app.type(EDIT);
      await app.until('the typed text', async () => (await editorText(app)).includes(EDIT) || undefined);

      // A save is a result: it names the file and leads to Output.
      await app.click(saveButton);
      await waitFor('the save notification', 'save', 'success');
      assert((await textOf('save')).includes('Saved Motor.st'), `The save notification should name the file: ${await textOf('save')}`);
      assert(await followDetails('save', 'Watch') === 'console-tab-output', 'Details of a save should open Output.');

      // A build is a result too, with the project's own numbers.
      await app.click(button('Build options'));
      await app.click(menuItem('Compile'));
      await waitFor('the build notification', 'build', 'success');
      assert((await textOf('build')).includes('Build succeeded') && /\d+ bytes/.test(await textOf('build')), `The build notification should say it succeeded and how large the artifact is: ${await textOf('build')}`);
      assert(await followDetails('build', 'Watch') === 'console-tab-output', 'Details of a successful build should open Output.');

      // A connection change.
      await app.click(button('Connect'));
      await waitFor('the connection notification', 'connection', 'success');
      assert((await textOf('connection')).includes('Simulator ready'), `The connection notification should say the simulator is ready: ${await textOf('connection')}`);

      // A long operation shows progress and a Cancel action, and its end is a result.
      for (const name of ['LongA', 'LongB', 'LongC']) {
        const scenario = { schemaVersion: 1, id: name, tickMs: 10, durationMs: 99_990, events: [{ atMs: 0, set: { 'Motor.Start': true, 'Motor.Stop': false, 'Motor.EStop': false, 'Motor.Overload': false } }], expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Forward': false, 'Motor.Reverse': false } }] };
        writeFileSync(join(project, 'tests', `${name}.scenario.json`), JSON.stringify(scenario));
      }
      await app.click(tab('Tests'));
      await app.click(button('Run host scenarios'));
      await app.until('the running notification with progress and Cancel', async () => await app.visible(css('[data-notification="tests"][data-status="running"] [role="progressbar"]')) && await app.visible(button('Cancel: Running host scenarios')) || undefined);
      await app.click(button('Cancel: Running host scenarios'));
      await waitFor('the cancelled notification', 'tests', 'cancelled', 10_000);
      assert(await followDetails('tests', 'Watch') === 'console-tab-tests', 'Details of a test run should open Tests.');

      // A failed build leads to Problems.
      await openFile(app, 'src/Motor.st');
      await cursorAtEndOfLine(app, await lineWith(app, 'Reverse := FALSE;'));
      await app.press('Enter');
      await app.type('UndefinedVariable := 1;');
      await app.click(saveButton);
      await app.until('the faulty file on disk', () => disk(join(project, 'src', 'Motor.st')).includes('UndefinedVariable') || undefined);
      await app.click(button('Build options'));
      await app.click(menuItem('Compile'));
      await waitFor('the failed build notification', 'build', 'error');
      assert(await followDetails('build', 'Watch') === 'console-tab-problems', 'Details of a failed build should open Problems.');
    },
  },

  {
    // IDE-024: any input the program declares can be set from Studio, whatever its name: none of these names is one the
    // runtime or Studio knows. Each set is seen by the program on its next scan.
    name: '37 Any declared input of the running program can be set', example: 'none', proves: ['IDE-024'], partly: [],
    run: async (app, { root }) => {
      const folder = join(root, 'plant-inputs');
      mkdirSync(join(folder, 'src'), { recursive: true });
      writeFileSync(join(folder, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'Plant Inputs', version: '1.0.0', target: { board: 'posix' }, tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Plant.st'] }] }));
      // Result follows Setpoint only while both gates are set, so that one watched value proves all three inputs reached the program.
      writeFileSync(join(folder, 'src', 'Plant.st'), [
        'PROGRAM Plant',
        'VAR_INPUT',
        '  SensorWest AT %IX0.3 : BOOL;',
        '  Setpoint AT %IW2 : INT;',
        '  Enable : BOOL;',
        'END_VAR',
        'VAR_OUTPUT',
        '  Result AT %QW2 : INT;',
        'END_VAR',
        'IF SensorWest AND Enable THEN',
        '  Result := Setpoint;',
        'ELSE',
        '  Result := 0;',
        'END_IF;',
        'END_PROGRAM',
        '',
      ].join('\n'));
      // The steps wait on a runtime and a Watch table that share the machine with other work: a generous bound, not a slow product.
      const patiently = <T,>(description: string, check: () => Promise<T | undefined | false> | T | undefined | false) => app.until(description, check, 45_000);
      const switchFor = (name: string, state: 'TRUE' | 'FALSE') => button(`${name}: ${state}`);

      await openFolder(app, folder);
      const built = await compile(app);
      assert(built.kind === 'built', `The program with custom-named inputs does not build: ${built.message}`);
      await connectAndRun(app);
      await watch(app, 'Result');

      // Every declared input is listed, by its own name: a mapped bit, a mapped word and a plain program input.
      for (const name of ['Plant.SensorWest', 'Plant.Setpoint', 'Plant.Enable']) {
        await patiently(`${name} in the simulation inputs`, async () => await app.visible(css(`[data-input="${name}"]`)) || undefined);
      }

      await app.click(switchFor('SensorWest', 'FALSE'));
      await patiently('SensorWest to read TRUE', async () => await app.visible(switchFor('SensorWest', 'TRUE')) || undefined);
      await app.click(switchFor('Enable', 'FALSE'));
      await patiently('Enable to read TRUE', async () => await app.visible(switchFor('Enable', 'TRUE')) || undefined);
      await app.click(css('input[aria-label="Value of Setpoint"]'));
      await app.type('1234');
      await app.click(button('Set Setpoint'));
      await patiently('Setpoint to read 1234', async () => (await app.eval<string>(`document.querySelector('[data-input="Plant.Setpoint"] [data-input-value]')?.textContent ?? ''`)) === '1234' || undefined);

      // The program saw all three on its next scans.
      await patiently('Result to be 1234: the three inputs reached the program', async () => await watchValue(app, 'Result') === '1234' || undefined);

      // Setting one input leaves the others alone: clearing the bit of SensorWest does not clear Enable or Setpoint.
      await app.click(switchFor('SensorWest', 'TRUE'));
      await patiently('SensorWest to read FALSE', async () => await app.visible(switchFor('SensorWest', 'FALSE')) || undefined);
      assert(await app.visible(switchFor('Enable', 'TRUE')), 'Clearing SensorWest changed Enable.');
      assert((await app.eval<string>(`document.querySelector('[data-input="Plant.Setpoint"] [data-input-value]')?.textContent ?? ''`)) === '1234', 'Clearing SensorWest changed Setpoint.');
      await patiently('Result to go 0: the gate closed', async () => await watchValue(app, 'Result') === '0' || undefined);
    },
  },

  {
    // IDE-016 on the development host: the policy is applied, permissions other than serial are refused, navigation and new
    // windows are refused, and a hostile project path is refused. The inline-script probe needs the production policy and
    // is made on the packaged application (runPackagedSecurityProbes).
    name: '38 The security properties hold in the running application', example: 'none', proves: [], partly: ['IDE-016', 'IDE-001'],
    run: async (app, { root }) => {
      const fixture = writeSecurityFixture(root);
      await probeSecurity(app, {
        packaged: false,
        fixture,
        open: async () => {
          app.answer(fixture.project);
          const chosen = await app.eval<{ ok: boolean; value: { rootId: string } | null }>(`window.electronAPI.projectFiles.chooseFolder()`);
          assert(chosen.ok && chosen.value, `The development host did not hand back the folder: ${JSON.stringify(chosen)}`);
          return chosen.value.rootId;
        },
      });
    },
  },
  {
    // The starter of lesson 1 fails its scenario. Learn must say which assertion failed, when, what was expected against what
    // was observed, and where in the trace (LRN-026), after the learner pressed Check: the program of the shown project is
    // graded against the scenario of the lesson package, in the tool worker (LRN-022).
    name: '39 Learn reports the failed assertion of a lesson', example: 'motor_start_stop_starter', proves: [], partly: ['LRN-022', 'LRN-026', 'LRN-031'],
    run: async (app, { project, root }) => {
      await unlockAllLessons(app);
      await openFolder(app, project);
      await app.click(css('[data-activity="learn"]'), 'the Learn activity');
      await app.click(lessonButton('Safe motor start-stop'), 'the Safe motor start-stop lesson');
      await app.until('the Check button to be enabled', async () => await app.eval<boolean>(`document.querySelector('[data-learn-check]')?.disabled === false`) || undefined);
      await app.click(css('[data-learn-check]'), 'the Check button');
      await app.until('Learn to grade the program as failed', async () => await app.eval<boolean>(`document.querySelector('[data-learn-grade="failed"]') !== null`) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the grade shown is ${await app.eval<string>(`document.querySelector('[data-learn-grade]')?.getAttribute('data-learn-grade') ?? 'none'`)}; ${await app.eval<string>(`document.querySelector('[data-learn-check-status]')?.textContent ?? ''`)}`); });
      const failures = await app.eval<string[]>(`[...document.querySelectorAll('[data-learn-failures] li')].map((item) => item.textContent ?? '')`);
      assert(failures.length > 0, 'Learn lists no failed assertion.');
      assert(failures.every((line) => /Motor\./.test(line) && /(expected|se esperaba)/.test(line) && /(observed|se observó)/.test(line)), `A failed assertion does not say what was expected against what was observed: ${JSON.stringify(failures[0])}`);
      assert(failures.every((line) => line.includes('zplc://runtime/snapshot/MotorStartStop/')), `A failed assertion does not give the address of its trace point: ${JSON.stringify(failures[0])}`);
      // The grade record is kept by the main process in the user-data directory, and a failure does not pass the lesson.
      const file = join(root, 'profile', 'zplc-learn-progress.v2.json');
      await app.until('the progress file', () => existsSync(file) || undefined);
      const progress = JSON.parse(disk(file)) as { last: { lessonId: string } | null; lessons: Record<string, { state: string; grade: unknown }> };
      assert(progress.lessons['motor-start-stop-safe']?.state === 'in-progress' && progress.lessons['motor-start-stop-safe'].grade === null && progress.last?.lessonId === 'motor-start-stop-safe', `The progress file does not show the lesson in progress: ${JSON.stringify(progress)}`);
    },
  },
  {
    // The reference solution is put in the starter folder before Studio opens it: the check passes, and the grade record says
    // which lesson version, scenario hash and program it was for (LRN-023, LRN-031).
    name: '39b Learn records the grade of a passed lesson', example: 'motor_start_stop_starter', proves: [], partly: ['LRN-023', 'LRN-031'],
    run: async (app, { project, root }) => {
      const lesson = learnLessonCatalog.en.find(({ id }) => id === 'motor-start-stop-safe')!;
      writeFileSync(join(project, 'src', 'Motor.st'), disk(join(packageRoot, 'projects', lesson.referenceExampleId, lesson.solutionProgram)));
      await unlockAllLessons(app);
      await openFolder(app, project);
      await app.click(css('[data-activity="learn"]'), 'the Learn activity');
      await app.click(lessonButton('Safe motor start-stop'), 'the Safe motor start-stop lesson');
      await app.until('the Check button to be enabled', async () => await app.eval<boolean>(`document.querySelector('[data-learn-check]')?.disabled === false`) || undefined);
      await app.click(css('[data-learn-check]'), 'the Check button');
      await app.until('Learn to grade the program as passed', async () => await app.eval<boolean>(`document.querySelector('[data-learn-grade="passed"]') !== null`) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the grade shown is ${await app.eval<string>(`document.querySelector('[data-learn-grade]')?.getAttribute('data-learn-grade') ?? 'none'`)}; ${await app.eval<string>(`document.querySelector('[data-learn-check-status]')?.textContent ?? ''`)}`); });
      const file = join(root, 'profile', 'zplc-learn-progress.v2.json');
      await app.until('the passed lesson in the progress file', () => existsSync(file) && disk(file).includes('"state":"passed"') || undefined);
      const progress = JSON.parse(disk(file)) as { lessons: Record<string, { state: string; grade: { lessonId: string; lessonVersion: number; scenarioSha256: string; programSha256: string; runtimeVersion: string; time: string; result: string } | null }> };
      const grade = progress.lessons['motor-start-stop-safe']?.grade;
      assert(grade && grade.result === 'passed' && grade.lessonId === lesson.id && grade.lessonVersion === lesson.version && grade.scenarioSha256 === lesson.scenarioSha256, `The grade record is not the one of this lesson: ${JSON.stringify(grade)}`);
      assert(/^[0-9a-f]{64}$/.test(grade.programSha256) && grade.runtimeVersion.length > 0 && !Number.isNaN(Date.parse(grade.time)), `The grade record lacks the program hash, the runtime version or the time: ${JSON.stringify(grade)}`);
    },
  },
  {
    // The development gallery (UX-004) in the real window: every kit component in the three themes and two densities. The
    // structure is audited on the rendered DOM, the colours are the ones the browser computes from the generated stylesheet,
    // and the keyboard behaviour is driven with real key events (the pure logic is proven in src/ui/logic).
    name: '41 The component kit behaves from the keyboard in a real window', example: 'none', proves: ['UX-004'], partly: ['UX-001', 'UX-005', 'UX-008', 'UX-024', 'UX-025', 'UX-026'],
    run: async (app) => {
      await app.eval(`location.hash = '#ui-gallery'; location.reload();`).catch(() => undefined);
      await app.until('the component gallery', async () => await app.visible(css('main.ui-gallery')) || undefined, 30_000);
      const panel = (theme: string, density: string) => `[data-ui-theme="${theme}"][data-ui-density="${density}"]`;
      const inPanel = (theme: string, density: string, selector: string) => css(`${panel(theme, density)} ${selector}`);
      const active = () => app.eval<{ tag: string; role: string | null; text: string; inDialog: boolean; label: string | null }>(`(() => { const el = document.activeElement; return { tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), text: (el.textContent ?? '').trim(), inDialog: el.closest('[role="dialog"], [role="alertdialog"]') !== null, label: el.getAttribute('aria-label') }; })()`);
      const focus = (target: Target) => app.eval(`${target}.focus()`);

      // Structure: every control of the rendered gallery is named, ids are unique, references resolve.
      const markup = await app.eval<string>(`document.querySelector('main.ui-gallery').outerHTML`);
      const problems = auditMarkup(markup);
      assert(problems.length === 0, `The rendered gallery has accessibility problems: ${JSON.stringify(problems.slice(0, 5))}`);
      const sections = await app.eval<number>(`document.querySelectorAll('.ui-gallery-panel').length`);
      assert(sections === 6, `The gallery shows ${sections} panels, not 3 themes x 2 densities.`);

      // Type: the two bundled faces are what the page uses and they have loaded (UX-006); values use tabular numerals.
      const faces = await app.eval<string[]>(`(async () => { await document.fonts.ready; return [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family.replace(/"/g, '') + ' ' + face.weight); })()`);
      assert(faces.some((face) => face.startsWith('Inter ')), `The bundled Inter did not load: ${JSON.stringify(faces)}`);
      assert(faces.some((face) => face.startsWith('JetBrains Mono')), `The bundled JetBrains Mono did not load: ${JSON.stringify(faces)}`);
      const type = await app.eval<{ body: string; mono: string; numerals: string; caption: string }>(`(() => ({ body: getComputedStyle(document.body).fontFamily, mono: getComputedStyle(document.querySelector('.ui-signal')).fontFamily, numerals: getComputedStyle(document.querySelector('.ui-tabular')).fontVariantNumeric, caption: getComputedStyle(document.querySelector('.ui-hint')).fontSize }))()`);
      assert(type.body.startsWith('Inter') && type.mono.includes('JetBrains Mono'), `The page does not use the bundled faces first: ${JSON.stringify(type)}`);
      assert(type.numerals.includes('tabular-nums'), `A value does not use tabular numerals: ${type.numerals}`);
      assert(Number.parseFloat(type.caption) >= 11, `The smallest text is under 11px: ${type.caption}`);

      // Colour, as computed by the browser in each theme: the label of a primary button, body text on the panel, the
      // forced and fault chips, and the focus ring of a control that has keyboard focus.
      const computed = (target: Target) => app.eval<{ color: string; background: string; outline: string; outlineWidth: string; outlineStyle: string; minHeight: string }>(`(() => { const el = ${target}; const s = getComputedStyle(el); return { color: s.color, background: s.backgroundColor, outline: s.outlineColor, outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle, minHeight: s.minHeight }; })()`);
      const heights: Record<string, string> = {};
      for (const theme of ['light', 'dark', 'high-contrast']) {
        for (const density of ['comfortable', 'compact']) {
          const primary = await computed(inPanel(theme, density, '.ui-button[data-variant="primary"]'));
          const ratio = contrastRatio(primary.color, primary.background);
          assert(ratio >= 4.5, `The primary button label is ${ratio.toFixed(2)}:1 in ${theme} (${primary.color} on ${primary.background}).`);
          const panelColours = await app.eval<{ color: string; background: string }>(`(() => { const s = getComputedStyle(document.querySelector(${JSON.stringify(panel(theme, density))})); return { color: s.color, background: s.backgroundColor }; })()`);
          assert(contrastRatio(panelColours.color, panelColours.background) >= 4.5, `Body text on the panel is under 4.5:1 in ${theme}.`);
          for (const state of ['forced', 'fault', 'false']) {
            const chip = await computed(inPanel(theme, density, `.ui-signal[data-signal="${state}"]`));
            const over = chip.background === 'rgba(0, 0, 0, 0)' ? panelColours.background : chip.background;
            assert(contrastRatio(chip.color, over) >= 3, `The ${state} chip is unreadable in ${theme}: ${chip.color} on ${over}.`);
          }
          heights[`${theme}/${density}`] = primary.minHeight;
        }
        assert(Number.parseFloat(heights[`${theme}/compact`]!) < Number.parseFloat(heights[`${theme}/comfortable`]!), `Compact density does not make the controls of the ${theme} panel shorter: ${JSON.stringify(heights)}`);
      }

      // Focus: a real Tab lands on a control of each theme and it shows the one ring, at least 3:1 against its surface.
      for (const [theme, width] of [['light', '2px'], ['dark', '2px'], ['high-contrast', '3px']] as const) {
        await focus(inPanel(theme, 'comfortable', '.ui-button[data-variant="primary"]'));
        await app.press('Tab');
        await app.press('Shift+Tab');
        const ring = await computed(inPanel(theme, 'comfortable', '.ui-button[data-variant="primary"]'));
        const surface = await app.eval<string>(`getComputedStyle(document.querySelector(${JSON.stringify(panel(theme, 'comfortable'))})).backgroundColor`);
        assert(ring.outlineStyle === 'solid' && ring.outlineWidth === width, `The focus ring in ${theme} is ${ring.outlineStyle} ${ring.outlineWidth}, not solid ${width}.`);
        assert(contrastRatio(ring.outline, surface) >= 3, `The focus ring in ${theme} is under 3:1 (${ring.outline} on ${surface}).`);
      }

      // Tabs: the arrows move focus and selection, skip the disabled tab and wrap.
      const tabs = (selector: string) => inPanel('light', 'comfortable', selector);
      await focus(tabs('[role="tab"]'));
      await app.press('ArrowRight');
      let now = await active();
      assert(now.role === 'tab' && now.text.startsWith('Problems'), `ArrowRight on the Output tab should focus Problems: ${JSON.stringify(now)}`);
      assert(await app.eval<boolean>(`document.activeElement.getAttribute('aria-selected') === 'true'`), 'A tab that takes focus from an arrow key should be selected.');
      await app.press('ArrowRight');
      now = await active();
      assert(now.role === 'tab' && now.text.startsWith('Output'), `ArrowRight on Problems should skip the disabled Trace tab and wrap to Output: ${JSON.stringify(now)}`);

      // Menu: ArrowDown opens it on the first enabled item, the arrows skip a disabled item, Escape closes it and returns focus.
      await focus(tabs('[aria-haspopup="menu"]'));
      await app.press('ArrowDown');
      await app.until('the menu', async () => await app.visible(css('[role="menu"][aria-label="Build options"]')) || undefined);
      await app.until('the first item to have focus', async () => (await active()).role === 'menuitem' || undefined);
      assert((await active()).text.startsWith('Compile'), `The menu should open on its first item: ${JSON.stringify(await active())}`);
      await app.press('ArrowDown');
      now = await active();
      assert(now.text.startsWith('Project settings'), `ArrowDown should skip the disabled item: ${JSON.stringify(now)}`);
      await app.press('Escape');
      await app.until('the menu to close', async () => !await app.visible(css('[role="menu"][aria-label="Build options"]')) || undefined);
      now = await active();
      assert(now.tag === 'button' && now.text.startsWith('Build options'), `Escape should return focus to the menu button: ${JSON.stringify(now)}`);

      // Tooltip: it appears on keyboard focus, describes the control, and Escape dismisses it without moving focus.
      await app.eval(`document.activeElement.blur()`);
      const trigger = await app.eval<string>(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(panel('light', 'comfortable'))} + ' button')].find((b) => b.textContent === 'Hover or focus me'); el.focus(); return el.textContent; })()`);
      assert(trigger === 'Hover or focus me', 'The tooltip specimen is missing.');
      await app.until('the tooltip', async () => await app.visible(css('[role="tooltip"]')) || undefined);
      assert(await app.eval<boolean>(`document.activeElement.getAttribute('aria-describedby') === document.querySelector('[role="tooltip"]').id`), 'The control should be described by its tooltip while it is open.');
      await app.press('Escape');
      await app.until('the tooltip to go', async () => !await app.visible(css('[role="tooltip"]')) || undefined);
      assert((await active()).text === 'Hover or focus me', 'Escape on a tooltip must not move focus.');

      // Dialog: focus moves in, Tab wraps inside, Escape closes and focus returns to the opener.
      await app.click(inPanel('light', 'comfortable', '[data-open-dialog]'), 'the Open dialog button');
      await app.until('the dialog', async () => await app.visible(css('body > .ui-scrim [role="dialog"]')) || undefined);
      assert((await active()).inDialog, `Focus should move into the dialog: ${JSON.stringify(await active())}`);
      for (let step = 0; step < 6; step++) {
        await app.press('Tab');
        assert((await active()).inDialog, `Tab left the dialog at step ${step}: ${JSON.stringify(await active())}`);
      }
      for (let step = 0; step < 6; step++) {
        await app.press('Shift+Tab');
        assert((await active()).inDialog, `Shift+Tab left the dialog at step ${step}: ${JSON.stringify(await active())}`);
      }
      await app.press('Escape');
      await app.until('the dialog to close', async () => !await app.visible(css('body > .ui-scrim [role="dialog"]')) || undefined);
      assert((await active()).text === 'Open dialog', `Focus should return to the Open dialog button: ${JSON.stringify(await active())}`);

      // Alert dialog: focus starts on the safe answer, Escape cancels, and the action is its own named button.
      await app.click(inPanel('light', 'comfortable', '[data-open-alert]'), 'the Open alert dialog button');
      await app.until('the alert dialog', async () => await app.visible(css('body > .ui-scrim [role="alertdialog"]')) || undefined);
      assert((await active()).text === 'Keep draft', `An alert dialog should start on its cancel button: ${JSON.stringify(await active())}`);
      await app.press('Escape');
      await app.until('the alert dialog to close', async () => !await app.visible(css('body > .ui-scrim [role="alertdialog"]')) || undefined);
      assert(await app.eval<boolean>(`document.querySelector(${JSON.stringify(panel('light', 'comfortable') + ' [data-alert-result]')}).textContent === 'Last choice: keep'`), 'Escape on an alert dialog should cancel it.');
      await app.click(inPanel('light', 'comfortable', '[data-open-alert]'), 'the Open alert dialog button');
      await app.until('the alert dialog', async () => await app.visible(css('body > .ui-scrim [role="alertdialog"]')) || undefined);
      await app.click(button('Discard draft'), 'the Discard draft action');
      await app.until('the action to be taken', async () => await app.eval<boolean>(`document.querySelector(${JSON.stringify(panel('light', 'comfortable') + ' [data-alert-result]')}).textContent === 'Last choice: discard'`) || undefined);
    },
  },
  {
    name: '40 The I/O mapping editor lists the channels of the board and flags a row it does not have', example: 'pico_blinky', proves: [], partly: ['IO-003', 'IO-009'],
    run: async (app, { project }) => {
      // A project from an older Studio that maps an output where the Pico has no channel.
      const manifestPath = join(project, 'zplc.json');
      const manifest = JSON.parse(disk(manifestPath)) as { io: { outputs: Array<{ name: string; address: string }> } };
      manifest.io.outputs[1]!.address = '%QX0.6';
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      await openFolder(app, project);
      await app.click(button('Project settings'), 'the Project settings button');
      await app.click(css('[data-open-config-editor="io"]'), 'the I/O mapping editor');

      // The I/O Mapping section is the I/O mapping editor, a tab. The editor lists what the board has, with the pin names
      // printed on it, the on-board LED among them.
      await app.until('the channels of the selected board', async () => await app.eval<boolean>(`document.querySelector('ul[aria-label="Channels of Raspberry Pi Pico (RP2040)"]') !== null`) || undefined);
      const listed = await app.eval<string>(`document.querySelector('ul[aria-label^="Channels of"]').innerText`);
      for (const wanted of ['%QX0.0', 'GP0', '%QX0.4', 'GP25', '%IX0.0', 'GP15', '%IW4', 'GP26']) assert(listed.includes(wanted), `The channel list of the Pico does not show ${wanted}: ${listed}`);

      // The row on a channel the board has is quiet; the row on the address it does not have says so and names the board.
      await app.until('the problem of the row', async () => await app.eval<boolean>(`document.querySelector('[role="alert"]') !== null`) || undefined);
      const problem = await app.eval<string>(`document.querySelector('[role="alert"]').innerText`);
      assert(problem.includes('Raspberry Pi Pico (RP2040)') && problem.includes('%QX0.6') && problem.includes('DO4 %QX0.4'), `The problem does not name the board, the address and the channels: ${problem}`);
      assert(await app.eval<number>(`document.querySelectorAll('[role="alert"]').length`) === 1, 'Only the row that has no channel should be flagged.');

      // The choice of a channel is a list of the board's channels, so a row cannot be put where the board has nothing.
      const options = await app.eval<string[]>(`[...document.querySelector('select[aria-label="Channel of LED_Output"]').options].map((option) => option.value)`);
      assert(options.join() === '%QX0.0,%QX0.1,%QX0.2,%QX0.3,%QX0.4', `The output channels offered are ${options.join()}.`);

      // Keeping the address as a virtual one (an image word no pin drives) takes the flag away and lists it apart.
      await app.click(button('Keep as virtual (no pin)'), 'Keep as virtual (no pin)');
      await app.until('the flag gone', async () => await app.eval<boolean>(`document.querySelector('[role="alert"]') === null`) || undefined);
      const virtual = await app.eval<string>(`document.body.innerText`);
      assert(virtual.includes('Virtual (no pin)') && virtual.includes('%QX0.6'), 'The address was not listed as virtual.');
    },
  },

  {
    // LRN-013, LRN-024, LRN-015: the hardware track of the Learn home. The learner chooses a board with the keyboard; the choice
    // is said in words, announced and kept after a restart. A lesson passed on a board is listed under "Passed on hardware" and
    // labelled so on the lesson panel, while the course does not count it as passed. The hardware grade is put in the progress
    // file: no board is attached here, and the button that records a run on the board comes with the wiring card. Throughout,
    // no control of Learn asks for a serial port or connects.
    name: '62 Learn hardware track: the board choice and the hardware labels', example: 'none', proves: [], partly: ['LRN-013', 'LRN-015', 'LRN-024'],
    run: async (app, { root }) => {
      const [FIRST] = courseOrder(LESSON_INDEX).map(({ id }) => id) as [string];
      const title = buildCourseView(LESSON_INDEX, null, { locale: 'en', unlockAll: false }).titles[FIRST]!;
      const at = '2026-10-20T10:00:00.000Z';
      const hardware = { schemaVersion: 1, lessonId: FIRST, lessonVersion: 1, track: 'hardware', scenarioId: 'S', scenarioSha256: 'a'.repeat(64), programSha256: 'b'.repeat(64), runtimeVersion: '2.0.0', time: at, result: 'passed', assertions: { total: 1, passed: 1 }, failedAssertions: [] };
      writeFileSync(join(root, 'profile', 'zplc-learn-progress.v2.json'), JSON.stringify({ schemaVersion: 4, last: null, lessons: { [FIRST]: { state: 'in-progress', grade: null, passedAt: null, startedAt: at, hintsShown: [], solutionShown: false, hardware } } }));
      // Web Serial is the way to a board from the window: every use of it is counted (LRN-015).
      const countSerial = () => app.eval(`(() => { window.__serialUses = 0; const serial = navigator.serial; if (!serial) return; for (const name of ['requestPort', 'getPorts']) { const original = serial[name]?.bind(serial); serial[name] = (...args) => { window.__serialUses += 1; return original ? original(...args) : Promise.resolve([]); }; } })()`);
      const serialUses = () => app.eval<number>('window.__serialUses ?? 0');
      const strip = css('[data-learn-hardware]');
      const pressed = () => app.eval<string[]>(`[...document.querySelectorAll('[data-learn-hardware] [aria-pressed="true"]')].map((element) => element.textContent)`);
      const stripText = () => app.eval<string>(`document.querySelector('[data-learn-hardware]')?.innerText ?? ''`);
      await countSerial();

      // 1. The strip sits below the Learn home with both boards, and none is chosen.
      await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await app.until('the hardware track strip', async () => await app.visible(strip) || undefined);
      assert((await pressed()).length === 0 && (await stripText()).includes('No board chosen yet.'), `A board is chosen before the learner chose one: ${await stripText()}`);

      // 2. LRN-013 by the keyboard: the first board takes the focus, the arrow moves to the second, Enter chooses it.
      await app.eval(`document.querySelector('[data-learn-hardware] [role="group"] button').focus()`);
      await app.press('ArrowRight');
      await app.press('Enter');
      await app.until('the ESP32-S3 to be chosen', async () => (await pressed()).join() === 'ESP32-S3-DevKitC-1' || undefined);
      assert((await stripText()).includes('Board for the hardware track: ESP32-S3-DevKitC-1'), 'The chosen board is not said in words.');
      await app.until('the announcement', async () => (await app.eval<string>('document.body.innerText')).includes('Board for the hardware track: ESP32-S3-DevKitC-1') || undefined);

      // 3. LRN-024: the lesson passed on hardware is listed under its own label, and the course does not count it as passed.
      assert((await stripText()).includes(`Passed on hardware: ${title}`), `The hardware pass is not listed: ${await stripText()}`);
      assert((await app.eval<string | null>(`document.querySelector('[data-learn-lesson="${FIRST}"]')?.getAttribute('data-state') ?? null`)) !== 'passed', 'A hardware run passed the lesson in the course.');
      assert((await serialUses()) === 0, `Learn used Web Serial ${await serialUses()} times.`);

      // 4. The choice is kept after a restart.
      await app.cdp.command('Page.reload');
      await app.until('the Welcome screen', async () => await app.visible(button('Learn', 'prefix')) || undefined);
      await countSerial();
      await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await app.until('the board kept after the restart', async () => (await pressed()).join() === 'ESP32-S3-DevKitC-1' || undefined);

      // 5. The lesson panel labels the run on the board apart from the course state of the lesson.
      await app.click(css('[data-learn-continue]'), 'the Start the course button');
      await app.until('the hardware label on the lesson panel', async () => (await app.eval<string>(`document.querySelector('[data-learn-hardware-state]')?.textContent ?? ''`)) === 'Passed on hardware' || undefined);
      assert((await app.eval<string>(`document.querySelector('[aria-label="Lesson progress"]')?.textContent ?? ''`)).startsWith('Not completed'), 'The lesson panel counts the hardware run as the course pass.');

      // 6. LRN-015: none of this asked for a serial port or connected.
      assert((await serialUses()) === 0, `Learn used Web Serial ${await serialUses()} times.`);
      assert((await app.eval<string | null>(`document.querySelector('[data-connection]')?.getAttribute('data-connection') ?? null`)) !== 'connected', 'The window is connected to a device.');
    },
  },
  {
    // LRN-013, LRN-014, LRN-015, LRN-024: a hardware lesson on the chosen board, by the keyboard only. The learner chooses the
    // Raspberry Pi Pico, continues the course, and the lesson shows the Pico's wiring (the diagram draws, the list and the pin
    // map name the parts); switching to the ESP32-S3-DevKitC-1 redraws it for that board. With no board connected, Check on
    // board is disabled and says why, and nothing asks for a serial port. No board is attached; nothing physical is started.
    name: '63 Learn hardware track: the wiring of each board and the check that waits for the learner', example: 'none', proves: [], partly: ['LRN-013', 'LRN-014', 'LRN-015', 'LRN-024'],
    run: async (app, { root }) => {
      const [FIRST] = courseOrder(LESSON_INDEX).map(({ id }) => id) as [string];
      writeFileSync(join(root, 'profile', 'zplc-learn-progress.v2.json'), JSON.stringify({ schemaVersion: 4, last: null, lessons: { [FIRST]: { state: 'passed', grade: null, passedAt: null, startedAt: null, hintsShown: [], solutionShown: false, hardware: null } } }));
      await app.eval(`(() => { window.__serialUses = 0; const serial = navigator.serial; if (!serial) return; for (const name of ['requestPort', 'getPorts']) { const original = serial[name]?.bind(serial); serial[name] = (...args) => { window.__serialUses += 1; return original ? original(...args) : Promise.resolve([]); }; } })()`);
      const focus = (selector: string) => app.eval(`document.querySelector(${JSON.stringify(selector)})?.focus()`);
      const drawn = (board: string) => app.eval<boolean>(`(() => { const image = document.querySelector('[data-learn-wiring="${board}"] img'); return !!image && image.complete && image.naturalWidth > 0; })()`);
      const pins = () => app.eval<string[]>(`[...document.querySelectorAll('[data-learn-pin-map] tr[data-learn-pin]')].map((row) => row.getAttribute('data-learn-pin'))`);

      // 1. The Pico is chosen on the Learn home by the keyboard, and Enter on Continue opens the next lesson of the course.
      await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await app.until('the hardware track strip', async () => await app.visible(css('[data-learn-hardware]')) || undefined);
      await focus('[data-learn-hardware] [role="group"] button');
      await app.press('Enter');
      await app.until('the Pico to be chosen', async () => await app.eval<boolean>(`document.querySelector('[data-learn-hardware] [aria-pressed="true"]')?.textContent === 'Raspberry Pi Pico'`) || undefined);
      await focus('[data-learn-continue]');
      await app.press('Enter');
      await app.until('the lesson on the board', async () => await app.visible(css('[data-learn-board-lesson]')) || undefined);

      // 2. LRN-014: the Pico's wiring is drawn and written, and the pin map names its parts.
      await app.until('the Pico wiring to be drawn', async () => await drawn('rpi-pico-rp2040') || undefined);
      assert((await app.eval<number>(`document.querySelectorAll('[data-learn-wiring-list] li').length`)) > 0, 'The wiring is not listed in words.');
      const picoPins = await pins();
      assert(picoPins.length > 0, 'The pin map is empty.');

      // 3. LRN-013: the board picker of the lesson switches to the ESP32-S3 by the keyboard, and the wiring is drawn for it.
      await focus('[data-learn-board-lesson] [role="group"] button[aria-pressed="true"]');
      await app.press('ArrowRight');
      await app.press('Enter');
      await app.until('the ESP32-S3 wiring to be drawn', async () => await drawn('esp32-s3-devkitc') || undefined);
      assert((await pins()).length > 0, 'The pin map of the ESP32-S3 is empty.');

      // 4. LRN-016: the voltage limit is one key press away.
      await focus('[data-learn-voltage-link]');
      await app.press('Enter');
      await app.until('the voltage limit to take the focus', async () => await app.eval<boolean>(`document.activeElement?.hasAttribute('data-learn-voltage') === true`) || undefined);

      // 5. LRN-015: with no board connected, Check on board is disabled and says what the learner has to do first.
      assert(await app.eval<boolean>(`document.querySelector('[data-learn-board-check]')?.disabled === true`), 'Check on board can be pressed with no board connected.');
      const reason = await app.eval<string>(`document.querySelector('[data-learn-board-check-reason]')?.textContent ?? ''`);
      assert(reason === 'Connect to your board first, from the toolbar.', `Check on board does not say why it is disabled: ${reason}`);
      assert((await app.eval<number>('window.__serialUses ?? 0')) === 0, 'Learn used Web Serial.');
      assert((await app.eval<string | null>(`document.querySelector('[data-connection]')?.getAttribute('data-connection') ?? null`)) !== 'connected', 'The window is connected to a device.');
    },
  },
  {
    // DOC-003: the tutorial "Blink without hardware" (docs/docs/tutorials/blink-without-hardware.md), step for step: the
    // example is copied from the Welcome screen into an empty folder, read, built, run in the simulator with its output
    // watched while it toggles, and its scenario test run. With ZPLC_DOC_SHOTS=<folder> the picture of each step is
    // saved too, which is where the screenshots of the tutorial come from (DOC-013, tools/docs/capture-screenshots.ts).
    name: '56 Blink without hardware (the tutorial)', example: 'none', proves: ['DOC-003'], partly: ['DOC-013'],
    run: async (app, { root }) => {
      const folder = join(root, 'blink'); mkdirSync(folder);
      await app.until('the Welcome screen with the example', async () => await app.visible(css('button[data-welcome-example="blinky_st"]')) || undefined);
      await app.eval(`document.querySelector('button[data-welcome-example="blinky_st"]')?.scrollIntoView({ block: 'center' })`);
      await docShot(app, 'blink-1-welcome');

      // Step 2: copy the example into an empty folder; Studio opens it.
      app.answer(folder);
      await app.click(css('button[data-welcome-example="blinky_st"]'), 'the Blinky (Structured Text) example');
      await app.until('the project workbench to appear', async () => await app.visible(toolbar) || undefined);
      for (const file of ['zplc.json', 'src/main.st', 'tests/blinky-st.scenario.json']) {
        assert(existsSync(join(folder, ...file.split('/'))), `The copied example has no ${file}.`);
      }

      // Step 3: read the program.
      await openFile(app, 'src/main.st');
      assert(hasProgram(await editorText(app), 'Blinky'), 'The example does not open its program Blinky.');
      await docShot(app, 'blink-2-program');

      // Step 4: build it.
      const built = await compile(app);
      assert(built.kind === 'built', `The example does not build: ${built.message}`);
      await docShot(app, 'blink-3-built');

      // Steps 5 and 6: connect to the simulator, run, and watch the output change.
      await connectAndRun(app);
      await watch(app, 'LED_Output');
      // The divider above the lower panel is dragged up so that the Watch table has room (the user's own choice).
      await app.click(css('#workspace-separator'), 'the divider above the lower panel');
      for (let step = 0; step < 6; step++) await app.press('ArrowUp');
      // The output changes every 500 ms: a picture counts when the table showed the value before and after it was taken.
      const outputShot = async (name: string, value: 'TRUE' | 'FALSE') => {
        for (let attempt = 0; attempt < 20; attempt++) {
          await app.until(`LED_Output to be ${value}`, async () => await watchValue(app, 'LED_Output') === value || undefined);
          await docShot(app, name);
          if (await watchValue(app, 'LED_Output') === value) return;
        }
        throw new Error(`The picture of LED_Output = ${value} could not be taken while the table showed it.`);
      };
      await outputShot('blink-4-output-true', 'TRUE');
      await outputShot('blink-5-output-false', 'FALSE');
      await app.click(button('Stop (Shift+F5)', 'prefix'), 'Stop');
      await app.until('the program to stop', async () => await app.visible(button('Run (F5)', 'prefix')) || undefined);

      // Step 7: run the scenario test of the project.
      await app.click(tab('Tests'));
      await app.click(button('Run host scenarios'));
      await app.until('the scenario to pass', async () => (await app.text()).includes('Host POSIX scenarios passed.') || undefined, 30_000);
      assert(!(await app.text()).includes('scenario assertions failed'), 'The tutorial scenario reports a failed assertion.');
      await docShot(app, 'blink-6-scenario');
    },
  },
  {
    // LRN-012: a first-time user reaches a blinking simulated output within ten minutes of first launch by following only
    // what Studio shows. A fresh profile with no project and no progress: Learn on the Welcome screen, Start the course on
    // the Learn home, the first lesson opens beside its workspace, the toolbar's simulation controls run its program, and
    // the faceplate of the Watch tab shows the lesson's output turn on and off. Every step is a visible control with a name
    // a person reads. The time from the first screen to the blink is recorded and must stay under ten minutes; the lessons
    // on the path must not ask for more than ten minutes either. This proves the path exists and is short; how long people
    // take is manual evidence (the spec asks for three first-time users), which no journey replaces.
    name: '57 First launch to a blinking simulated output, following only what Studio shows', example: 'none', proves: ['LRN-012'], partly: [],
    run: async (app, { root }) => {
      const started = Date.now();
      const steps: string[] = [];
      // A step is a control the learner sees and can name (its text, else its aria-label); the journey never runs a command
      // a person could not see, and never writes a file of the workspace.
      const press = async (target: Target, what: string) => {
        await app.until(`${what} to be shown`, async () => await app.visible(target) || undefined, 45_000);
        const name = await app.eval<string>(`(() => { const element = ${target}; return ((element?.textContent || element?.getAttribute('aria-label')) ?? '').trim(); })()`);
        assert(name.length > 0, `${what} has no name a person can read.`);
        steps.push(name);
        await app.click(target, what).catch(async (error: Error) => { throw new Error(`${error.message}; the toolbar offers ${await app.eval<string>(`JSON.stringify([...document.querySelectorAll('[role="toolbar"] button')].map((item) => [item.getAttribute('aria-label') || item.textContent?.trim(), item.disabled, item.title]))`)}`); });
      };
      // The path: the lessons Continue opens until the first one that runs in simulation, which is the tour ending in a blink.
      const ordered = courseOrder(LESSON_INDEX);
      const first = ordered.find((lesson) => lesson.tracks.includes('simulation'))!;
      const onPath = ordered.slice(0, ordered.indexOf(first) + 1).filter((lesson) => lesson.tracks.includes('simulation'));
      const minutes = onPath.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0);
      assert(minutes <= 10, `The lessons before the first blink ask for ${minutes} minutes, more than ten.`);
      assert(!existsSync(join(root, 'profile', 'zplc-learn-progress.v2.json')), 'The profile is not fresh: it holds a progress file.');
      const program = first.starter.program.split('/').at(-1)!.replace(/\.[^.]+$/, '');

      await press(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await app.until('the Learn home', async () => await app.visible(css('[data-learn-home]')) || undefined);
      const startText = await app.eval<string>(`document.querySelector('[data-learn-continue]')?.textContent ?? ''`);
      assert(startText.startsWith('Start the course') && startText.includes(first.text.en.title), `Continue does not offer to start the course with "${first.text.en.title}": ${startText}`);
      await press(css('[data-learn-continue]'), 'Start the course on the Learn home');
      await app.until('the lesson beside its workspace', async () => await app.visible(toolbar) && (await app.eval<string>(`document.getElementById('learn-title')?.textContent?.trim() ?? ''`)) === first.text.en.title || undefined, 45_000);

      // The toolbar: build the program, connect to the simulation, run. Run stays disabled until a build exists.
      const builds = (await outputText(app)).match(BUILD_RESULT)?.length ?? 0;
      await press(button('Build options'), 'Build options on the toolbar');
      await press(menuItem('Compile'), 'Compile in the build menu');
      const built = await app.until('a build result in Output', async () => { const found = (await outputText(app)).match(BUILD_RESULT) ?? []; return found.length > builds ? found.at(-1) : undefined; }, 45_000);
      assert(buildKind(built) === 'built', `The starter of the first lesson does not build: ${built}`);
      await press(button('Connect'), 'Connect on the toolbar');
      await app.until('the simulation to connect', async () => await app.visible(button('Disconnect')) || undefined, 45_000);
      await press(button('Run (F5)', 'prefix'), 'Run on the toolbar');
      await app.until('the program to run', async () => await app.visible(button('Pause (F6)', 'prefix')) || undefined, 45_000)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the window says ${JSON.stringify((await app.text()).replace(/\s+/g, ' ').slice(-900))}`); });

      // The faceplate lists the program's outputs from its I/O map and shows them live: the output turns on, then off.
      await press(tab('Watch', 'prefix'), 'the Watch tab');
      await outputTurnsOnAndOff(app, program);

      const seconds = (Date.now() - started) / 1000;
      assert(seconds < 600, `The blink took ${seconds.toFixed(0)} s from the first screen, more than ten minutes.`);
      app.note(`first screen to a blinking output in ${seconds.toFixed(1)} s through ${steps.length} named controls (${steps.join(' > ')}); lessons on the path: ${minutes} min`);
    },
  },
  {
    // LRN-030: the simulation track works offline, including module 10 against the endpoints its simulation starts (COM-009).
    // The development host serves the window from a server on this computer, so a cut network is emulated as an offline
    // machine sees it: from a reload before the first click to the end, every request the window makes to another host is
    // refused with "Internet disconnected" and recorded, and a request to this computer goes through. The first lesson is
    // started, run (its output turns on and off) and checked; then a Communications lesson is started, run and checked,
    // its Modbus and MQTT peers being the loopback endpoints the simulation starts on 127.0.0.1. No request may have tried
    // to leave the computer, and a fetch of a remote page from the window must fail. The main process is not cut here: its
    // only network call is the update check, off by default, which the static test of LRN-030 holds (welcomeBundle.test.ts).
    name: '58 The simulation track works offline: a lesson and a Communications lesson run and pass with every remote request refused', example: 'none', proves: ['LRN-030'], partly: [],
    run: async (app, { root }) => {
      const remote: string[] = [];
      let local = 0;
      app.cdp.on('Fetch.requestPaused', (params) => {
        const { requestId, request } = params as { requestId: string; request: { url: string } };
        let here = false;
        try { const url = new URL(request.url); here = !/^(https?|wss?):$/.test(url.protocol) || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname); } catch { here = false; }
        if (here) { local += 1; void app.cdp.command('Fetch.continueRequest', { requestId }).catch(() => undefined); return; }
        remote.push(request.url);
        void app.cdp.command('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' }).catch(() => undefined);
      });
      await app.cdp.command('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
      // A remote load that the content security policy stops never reaches the network; the page records it as a violation.
      await app.cdp.command('Page.addScriptToEvaluateOnNewDocument', { source: `window.__zplcBlocked = []; document.addEventListener('securitypolicyviolation', (event) => window.__zplcBlocked.push(event.blockedURI));` });
      await app.cdp.command('Page.reload');
      await app.until('the Welcome screen, loaded offline', async () => await app.visible(button('Learn', 'prefix')) || undefined, 45_000);
      assert(local > 0, 'No request of the window was seen: the offline emulation is not in place.');

      /** Start a lesson from the Learn home, build, connect and run it, then stop, put the reference solution in its program and check it. */
      const doLesson = async (id: string, start: Target, running: () => Promise<void>) => {
        const entry = LESSON_INDEX.lessons.find((lesson) => lesson.id === id)!;
        await app.click(start, `Start for ${id}`);
        await app.until(`the lesson ${id} beside its workspace`, async () => await app.visible(toolbar) && (await app.eval<string>(`document.getElementById('learn-title')?.textContent?.trim() ?? ''`)) === entry.text.en.title || undefined, 45_000);
        const built = await compile(app);
        assert(built.kind === 'built', `The starter of ${id} does not build offline: ${built.message}`);
        await connectAndRun(app);
        await app.click(tab('Watch', 'prefix'), 'the Watch tab');
        await running();
        await app.click(button('Stop (Shift+F5)', 'prefix'), 'Stop');
        await app.until('the program to stop', async () => await app.visible(button('Run (F5)', 'prefix')) || undefined);
        await app.click(button('Disconnect'), 'Disconnect');
        await app.until('the simulation to disconnect', async () => await app.visible(button('Connect')) || undefined);
        writeFileSync(join(root, 'profile', 'learn-workspaces', id, entry.starter.program), disk(join(packageRoot, 'projects', entry.solution.project, entry.solution.program)));
        await app.until('the Check button to be enabled', async () => await app.eval<boolean>(`document.querySelector('[data-learn-check]')?.disabled === false`) || undefined, 45_000);
        await app.click(css('[data-learn-check]'), 'Check');
        await app.until(`Learn to grade ${id} as passed offline`, async () => await app.eval<boolean>(`document.querySelector('[data-learn-grade="passed"]') !== null`) || undefined, 90_000)
          .catch(async (error: Error) => { throw new Error(`${error.message}: the grade shown is ${await app.eval<string>(`document.querySelector('[data-learn-grade]')?.getAttribute('data-learn-grade') ?? 'none'`)}; ${await app.eval<string>(`document.querySelector('[data-learn-check-status]')?.textContent ?? ''`)}`); });
      };

      // The first lesson: its output blinks in the simulation, and the reference solution passes its scenario.
      const first = courseOrder(LESSON_INDEX).find((lesson) => lesson.tracks.includes('simulation'))!;
      await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await doLesson(first.id, css('[data-learn-continue]'), () => outputTurnsOnAndOff(app, first.starter.program.split('/').at(-1)!.replace(/\.[^.]+$/, '')));

      // A Communications lesson (module 10): its blocks talk to the Modbus server and MQTT broker of the simulation, on this computer.
      const communications = courseOrder(LESSON_INDEX).find((lesson) => lesson.module === 10 && lesson.tracks.includes('simulation'))!;
      await app.click(css('[data-activity="learn"]'), 'the Learn item of the rail');
      await app.until('the Learn home', async () => await app.visible(css('[data-learn-home]')) || undefined);
      await app.click(css('[data-learn-unlock-all]'), 'the Unlock all lessons switch');
      const startCommunications = css(`[data-learn-start="${communications.id}"]`);
      await app.until(`${communications.id} to be available`, async () => await app.clickable(startCommunications) || undefined);
      await doLesson(communications.id, startCommunications, async () => {
        // The program runs against the loopback endpoints: it keeps scanning and no communication block reports that its peer is unavailable.
        await app.until('the scans to be counted', async () => await cycles(app) >= 50 || undefined, 45_000);
        assert(!/unavailable in simulation/i.test(await app.text()), 'A communication block reports that its endpoint is unavailable in simulation.');
      });

      // Both grades are recorded as passes in the progress of this fresh profile.
      const progressFile = join(root, 'profile', 'zplc-learn-progress.v2.json');
      const passed = () => { try { const saved = JSON.parse(disk(progressFile)) as { lessons: Record<string, { state: string }> }; return [first.id, communications.id].every((id) => saved.lessons[id]?.state === 'passed'); } catch { return false; } };
      await app.until('both lessons recorded as passed', () => passed() || undefined);
      // Only a load from another host counts: a policy report of "eval" or "inline" is not a network request.
      const blocked = async () => (await app.eval<string[]>('window.__zplcBlocked ?? []')).filter((uri) => /^(https?|wss?):\/\//.test(uri) && !/^\w+:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(uri));
      assert(remote.length === 0, `The window tried to reach another host while offline: ${remote.join(', ')}`);
      assert((await blocked()).length === 0, `The window tried to load something its policy refuses: ${(await blocked()).join(', ')}`);
      // The recorders work: a fetch of a remote page fails, and the attempt is recorded.
      const reached = await app.eval<string>(`fetch('https://example.com/', { cache: 'no-store' }).then(() => 'reached', (error) => 'refused: ' + error.message)`);
      assert(reached.startsWith('refused'), `A remote page could be fetched from the window: ${reached}`);
      await app.until('the refused fetch to be recorded', async () => [...remote, ...await blocked()].some((url) => url.startsWith('https://example.com')) || undefined);
      app.note(`offline: ${first.id} and ${communications.id} ran and passed; ${local} requests to this computer went through, none to another host; a remote fetch was ${reached}`);
    },
  },
  {
    // IDE-018: choosing a port is a dialog of the application, not an operating-system message box. The journey only looks at it
    // and cancels: it never connects, and it does not depend on a port being plugged in (the list is empty on a build machine).
    name: '42 Choosing a serial port is a dialog of the application', example: 'motor_start_stop', proves: [], partly: ['IDE-018'],
    run: async (app, { project }) => {
      const dialog = css('[data-serial-port-dialog]');
      await openFolder(app, project);
      await app.click(button('Hardware'), 'the Hardware mode');
      await app.click(button('Connect'), 'Connect');
      await app.until('the port dialog', async () => await app.visible(dialog) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the window says ${JSON.stringify((await app.text()).replace(/\s+/g, ' ').slice(-600))}`); });

      const shown = await app.eval<{ title: string; rows: Array<{ kind: string; text: string }>; empty: boolean; modal: boolean }>(`(() => {
        const root = document.querySelector('[data-serial-port-dialog]');
        const dialog = root?.closest('[role="dialog"]');
        return { title: dialog?.textContent?.slice(0, 60) ?? '',
          rows: [...root.querySelectorAll('[data-serial-port-row]')].map((row) => ({ kind: row.getAttribute('data-serial-port-row'), text: row.innerText })),
          empty: Boolean(root.querySelector('[data-serial-port-empty]')), modal: dialog?.getAttribute('aria-modal') === 'true' };
      })()`);
      assert(shown.title.includes('Choose a serial port'), `The dialog has no title: ${JSON.stringify(shown)}`);
      assert(shown.modal, `The port dialog is not a modal dialog: ${JSON.stringify(shown)}`);
      assert(shown.empty || shown.rows.length > 0, `The dialog lists no port and does not say that there is none: ${JSON.stringify(shown)}`);
      for (const row of shown.rows) assert(/USB [0-9A-F]{4}(:[0-9A-F]{4})?|No USB identifiers/.test(row.text), `A port row does not show its USB identifiers: ${JSON.stringify(row)}`);
      assert(!(await app.text()).includes('Select the serial port to request'), 'The operating-system message box text is still in use.');

      // It can be refreshed, and it is still there afterwards.
      await app.click(button('Refresh'), 'Refresh');
      await app.until('the refresh to end', async () => await app.eval<boolean>(`[...document.querySelectorAll('[data-serial-port-dialog] button')].some((el) => el.textContent?.trim() === 'Refresh')`) || undefined);
      assert(await app.visible(dialog), 'The dialog is gone after a refresh.');

      // Cancel closes it and the application stays disconnected.
      await app.click(button('Cancel'), 'Cancel');
      await app.until('the dialog to close', async () => !await app.visible(dialog) || undefined);
      await app.until('the application to be disconnected again', async () => await app.visible(button('Connect')) || undefined);
      assert(!await app.visible(button('Disconnect')), 'The application connected although the dialog was cancelled.');
    },
  },
  {
    // UX-019 and UX-020: the deploy dialog and the alert dialogs start with focus on Cancel, Escape cancels and a cancelled
    // question leaves the running program alone. No hardware is involved: the dialog is asked for a deploy of a made-up device
    // through the same host that the deploy handler uses, and what it shows and does is read from the window.
    name: '44 The connection indicator, the deploy dialog and the alert dialogs', example: 'motor_start_stop', proves: [], partly: ['UX-018', 'UX-019', 'UX-020', 'COM-028'],
    run: async (app, { project }) => {
      const alert = css('[role="alertdialog"]');
      const ask = (running: boolean, device: string) => app.eval(`(async () => {
        const { confirmDeploy } = await import('/src/components/deployConfirm.tsx');
        const facts = { project: { name: 'Pump station', board: 'STM32F746G Discovery', boardProfile: 'stm32f746g_disco/stm32f746xx', abi: { major: 1, minor: 0, draft: 6 }, sha256: 'a1b2c3d4e5f6a7b8c9d0', byteLength: 512, taskCount: 2 }, device: ${device}, declaredSafe: [], transfer: 'framed' };
        window.__deployAnswer = 'asking';
        confirmDeploy({ facts }, ${running}).then((answer) => { window.__deployAnswer = answer; });
      })()`);
      const matching = '{ board: "stm32f746g_disco", boardProfile: "stm32f746g_disco/stm32f746xx", zplcVersion: "1.0.0", zephyrVersion: "4.0.0", abi: { major: 1, minor: 0 }, draft: 6, maxArtifactBytes: 4096, maxTasks: 4 }';
      const other = '{ board: "rpi_pico", boardProfile: "rpi_pico/rp2040", zplcVersion: "1.0.0", zephyrVersion: "4.0.0", abi: { major: 1, minor: 0 }, draft: 6, maxArtifactBytes: 4096, maxTasks: 4 }';
      const answer = () => app.eval<unknown>('window.__deployAnswer');
      const focusText = () => app.eval<string | null>(`document.activeElement?.closest('[role="alertdialog"]') ? document.activeElement.textContent?.trim() ?? null : null`);

      await openFolder(app, project);
      const built = await compile(app);
      assert(built.kind === 'built', `The example does not build: ${built.message}`);
      await connectAndRun(app);

      // UX-018: the status bar says in words and icon that this is a simulation, not real hardware.
      const indicator = await app.eval<{ state: string | null; text: string; icon: boolean }>(`(() => { const el = document.querySelector('[aria-label="Operational status"] [data-connection]'); return { state: el?.getAttribute('data-connection') ?? null, text: el?.textContent?.trim() ?? '', icon: Boolean(el?.querySelector('svg[aria-hidden="true"]')) }; })()`);
      assert(indicator.state === 'simulation-native' && indicator.text === 'Simulation · native runtime' && indicator.icon, `The status bar must say that Studio is attached to the native simulation: ${JSON.stringify(indicator)}`);

      // The question names its action by the effect and starts on Cancel.
      await ask(true, matching);
      await app.until('the deploy dialog', async () => await app.visible(alert) || undefined);
      const shown = await app.eval<{ title: string; buttons: string[]; table: string; modal: boolean }>(`(() => { const dialog = document.querySelector('[role="alertdialog"]'); return { title: dialog.querySelector('h2')?.textContent ?? '', buttons: [...dialog.querySelectorAll('button')].map((b) => b.textContent.trim()), table: dialog.querySelector('table')?.innerText ?? '', modal: dialog.getAttribute('aria-modal') === 'true' }; })()`);
      assert(shown.title === 'Deploy to the device?' && shown.modal, `The deploy dialog has no title or is not modal: ${JSON.stringify(shown)}`);
      assert(JSON.stringify(shown.buttons) === JSON.stringify(['Cancel', 'Stop PLC and deploy']), `The deploy dialog must offer Cancel and the named action: ${JSON.stringify(shown.buttons)}`);
      for (const row of ['Board', 'Board profile', 'Firmware version', 'ABI version', 'Program', 'Size', 'Tasks']) assert(shown.table.includes(row), `The deploy dialog does not compare ${row}: ${shown.table}`);
      assert(shown.table.includes('Not reported by the device'), 'The deploy dialog must say what the device does not report.');
      assert(await focusText() === 'Cancel', `Focus must start on Cancel, it is on ${JSON.stringify(await focusText())}`);

      // Tab stays inside the dialog and Escape cancels, without touching the running program.
      await app.press('Tab'); await app.press('Tab');
      assert(await focusText() === 'Cancel', 'Tab must wrap inside the dialog.');
      await app.press('Escape');
      await app.until('the dialog to close', async () => !await app.visible(alert) || undefined);
      assert(await answer() === false, `Escape must answer no, it answered ${JSON.stringify(await answer())}`);
      assert(await app.visible(button('Stop (Shift+F5)', 'prefix')), 'A cancelled deploy question must leave the program running.');

      // The action button answers yes, and Cancel answers no.
      await ask(false, matching);
      await app.until('the dialog again', async () => await app.visible(alert) || undefined);
      assert(await app.eval<boolean>(`[...document.querySelectorAll('[role="alertdialog"] button')].some((b) => b.textContent.trim() === 'Deploy')`), 'A stopped PLC must be offered "Deploy".');
      await app.click(button('Deploy', 'exact'), 'Deploy');
      await app.until('the answer', async () => await answer() === true || undefined);

      // A device that does not match cannot be confirmed: the rows say why and the only button is Close.
      await ask(false, other);
      await app.until('the blocked dialog', async () => await app.visible(alert) || undefined);
      const blocked = await app.eval<{ title: string; buttons: string[]; mismatch: string }>(`(() => { const dialog = document.querySelector('[role="alertdialog"]'); return { title: dialog.querySelector('h2')?.textContent ?? '', buttons: [...dialog.querySelectorAll('button')].map((b) => b.textContent.trim()), mismatch: dialog.querySelector('[data-status="mismatch"]')?.innerText ?? '' }; })()`);
      assert(blocked.title === 'Deploy blocked' && JSON.stringify(blocked.buttons) === JSON.stringify(['Close']), `A mismatch must block the deploy: ${JSON.stringify(blocked)}`);
      assert(blocked.mismatch.includes('Does not match'), `A mismatched row must say so in words: ${JSON.stringify(blocked)}`);
      await app.press('Escape');
      await app.until('the blocked dialog to close', async () => !await app.visible(alert) || undefined);
      assert(await answer() === false, 'A blocked deploy must never answer yes.');
    },
  },
  {
    // IDE-030: a change is a difference that is reviewed, in isolation, before a person saves it, and Studio does all this
    // without the assistant, which is optional and, until it is configured, cannot be asked. The assistant's own proposal
    // takes the same road (the review of the Changes tab, then the same button); it is not driven here, because the
    // provider needs the secret store of the system and the headless host has none (electron/aiProvider.test.ts holds it).
    name: '43 A change is reviewed as a difference and saved by a person, and Studio works without the assistant', example: 'motor_start_stop', proves: [], partly: ['IDE-030'],
    run: async (app, { project }) => {
      const file = join(project, 'src', 'Motor.st');
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st');
      const original = disk(file);

      // the assistant is optional: it says so, says it cannot operate hardware, and cannot be asked before it is configured
      await app.click(tab('Agent'), 'the Agent tab');
      const agent = await app.until('the Agent panel', async () => {
        const text = await app.eval<string>(`document.querySelector('[aria-label="Optional agent"]')?.innerText ?? ''`);
        return text.includes('Agent') ? text : undefined;
      });
      assert(agent.includes('It cannot operate hardware.'), `The Agent panel does not say that it cannot operate hardware: ${JSON.stringify(agent)}`);
      assert(!await app.clickable(button('Send request')), 'The assistant can be asked although no provider is configured.');

      // a statement of the person's own, added to the open file and not saved: it breaks what the scenario of the project says
      const before = await editorText(app);
      const last = await lineWith(app, 'Reverse := FALSE;');
      assert(last > 0, 'Motor.st no longer has the statement Reverse := FALSE; the journey adds one after it.');
      await cursorAtEndOfLine(app, last);
      await app.press('Enter');
      await app.type('Forward := FALSE;');
      assert(disk(file) === original, 'The file changed on disk before the person saved it.');

      // Changes: the review is run in isolation and shows the difference; it writes nothing; a change that fails is not offered for saving
      const reviewed = async () => {
        await app.click(button('Review active ST change'), 'Review active ST change');
        await app.until('the review result', async () => await app.visible(css('[aria-label="Change review result"]')) || undefined, 60_000)
          .catch(async (error: Error) => { throw new Error(`${error.message}: the Changes tab says ${JSON.stringify((await app.text()).replace(/\s+/g, ' ').slice(-700))}`); });
        return app.eval<string>(`document.querySelector('[aria-label="Change review result"]').innerText`);
      };
      await app.click(tab('Changes'), 'the Changes tab');
      const refused = await reviewed();
      assert(refused.includes('Rejected: the change was not accepted.') && refused.includes('SCENARIO_ASSERTION_FAILED'), `The review does not refuse a change that breaks the scenario: ${JSON.stringify(refused)}`);
      assert(refused.includes('No file has been written.'), `The review of a refused change does not say that nothing was written: ${JSON.stringify(refused)}`);
      assert(await app.visible(css('[aria-label="Change review result"] .monaco-diff-editor')), `The review of a refused change does not show the difference: ${await app.eval<string>(`document.querySelector('[aria-label="Change review result"]')?.outerHTML.slice(0, 400) ?? 'no result'`)}`);
      assert(!await app.visible(button('Save reviewed change')), 'A change that the review refused is offered for saving.');
      assert(disk(file) === original, 'Reviewing the change wrote the file.');

      // the person takes the statement back and writes one that is harmless
      await showExplorer(app);
      await clickEditorLine(app, last + 1);
      for (let attempt = 0; attempt < 6 && (await editorText(app)) !== before; attempt++) await app.press('Ctrl+Z');
      assert((await editorText(app)) === before, 'The journey could not undo its statement.');
      await cursorAtEndOfLine(app, last);
      await app.press('Enter');
      await app.type('Reverse := FALSE;');
      await app.click(tab('Changes'), 'the Changes tab');
      const accepted = await reviewed();
      assert(accepted.includes('Accepted: the change passed in an isolated host run.'), `The review does not accept a harmless statement: ${JSON.stringify(accepted)}`);
      assert(accepted.includes('No file has been written.') && disk(file) === original, 'Reviewing the change wrote the file.');

      // only the person's own click saves it
      await app.click(button('Save reviewed change'), 'Save reviewed change');
      await app.until('the reviewed change on disk', () => disk(file) !== original && disk(file).split('Reverse := FALSE;').length > original.split('Reverse := FALSE;').length || undefined);

      // and the rest of Studio, which needs no assistant, still builds the project
      const built = await compile(app);
      assert(built.kind === 'built', `The project does not build without the assistant: ${built.kind} ${built.message}`);
    },
  },
  {
    name: '45 The shell fits 1366 by 768 and 1024 by 768, and its separators move from the keyboard', example: 'blinky_st', proves: ['UX-023'], partly: ['UX-011', 'UX-012', 'UX-017'],
    run: async (app, { project }) => {
      const resize = async (width: number) => {
        await app.cdp.command('Emulation.setDeviceMetricsOverride', { width, height: 768, deviceScaleFactor: 1, mobile: false });
        await app.until(`the window to be ${width} wide`, async () => await app.eval<number>('window.innerWidth') === width || undefined);
      };
      // Every control of the main path has a box inside the window, and none overlaps another.
      const assertFits = async (when: string) => {
        const problems = await app.eval<string[]>(`(() => {
          const vw = window.innerWidth, vh = window.innerHeight;
          const controls = [...document.querySelectorAll('[role="toolbar"][aria-label="Project operations"] button, [data-activity-rail] button, [aria-label="Navigator view"] button, [role="tab"][id^="editor-tab-"], #console-tab-output, #console-tab-problems, #console-tab-watch')]
            .map((element) => ({ element, rect: element.getBoundingClientRect(), name: element.getAttribute('aria-label') || element.textContent?.trim() || element.id }))
            .filter(({ rect, element }) => rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden');
          const found = [];
          // a tab of a strip that scrolls sideways (the results panel has ten) is reached by scrolling it: it is not clipped, and the selected one is always in view
          const scrolledOut = (element, rect) => { for (let parent = element.parentElement; parent; parent = parent.parentElement) { if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth) { const box = parent.getBoundingClientRect(); return element.getAttribute('aria-selected') !== 'true' && (rect.left < box.left - 0.5 || rect.right > box.right + 0.5); } } return false; };
          for (let index = controls.length - 1; index >= 0; index--) if (scrolledOut(controls[index].element, controls[index].rect)) controls.splice(index, 1);
          for (const { rect, name } of controls) if (rect.left < -0.5 || rect.top < -0.5 || rect.right > vw + 0.5 || rect.bottom > vh + 0.5) found.push('clipped: ' + name + ' ' + Math.round(rect.left) + '..' + Math.round(rect.right) + ' of ' + vw);
          for (let first = 0; first < controls.length; first++) for (let second = first + 1; second < controls.length; second++) {
            const a = controls[first], b = controls[second];
            if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
            const across = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left), down = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
            if (across > 1 && down > 1) found.push('overlap: ' + a.name + ' and ' + b.name);
          }
          if (document.documentElement.scrollWidth > vw) found.push('the page scrolls sideways');
          return found;
        })()`);
        assert(problems.length === 0, `At ${when}: ${problems.slice(0, 6).join('; ')}`);
      };
      const value = (id: string) => app.eval<number>(`Number(document.getElementById(${JSON.stringify(id)})?.getAttribute('aria-valuenow'))`);
      const press = async (id: string, chord: string) => { await app.eval(`document.getElementById(${JSON.stringify(id)})?.focus()`); await app.press(chord); };

      await resize(1366);
      await openFolder(app, project);

      // the regions of the shell (UX-011), with the navigator showing the project's objects as soon as it opens (UX-012)
      for (const region of ['[data-activity-rail]', '[aria-label="Primary sidebar"]', '#editor', '[aria-label="Workbench panels"]', '[aria-label="Operational status"]']) {
        assert(await app.visible(css(region)), `The region ${region} is not shown at 1366 by 768.`);
      }
      assert(await app.eval<boolean>(`document.querySelectorAll('[data-object-navigator] [data-navigator-group]').length === 9`), 'The navigator does not list the nine groups of PLC objects when the project opens.');
      assert(await app.eval<boolean>(`[...document.querySelectorAll('[data-activity-rail] button')].map((button) => button.getAttribute('aria-label')).join() === 'Project,Search,Tests,Learn'`), 'The activity rail does not offer Project, Search, Tests and Learn.');
      assert(await app.eval<boolean>(`document.querySelector('[data-activity="project"]')?.getAttribute('aria-current') === 'true'`), 'The selected activity is not marked.');
      // the secondary sidebar starts hidden, and the command bar has the button that shows it
      assert(!await app.visible(css('[aria-label="Secondary sidebar"]')), 'The secondary sidebar is shown before it was asked for.');
      await app.click(css('[data-toggle-inspector]'), 'the Inspector button of the command bar');
      await app.until('the Inspector in the secondary sidebar', async () => await app.visible(css('[aria-label="Secondary sidebar"] [aria-label="Workbench inspector"]')) || undefined);
      await assertFits('1366 by 768 with the project open');

      // the separators (UX-017): named, valued, moved by arrow, Shift+arrow, Home and End, restored by a double click
      for (const id of ['primary-separator', 'secondary-separator', 'workspace-separator']) {
        assert(await app.eval<boolean>(`(() => { const element = document.getElementById(${JSON.stringify(id)}); return element?.getAttribute('role') === 'separator' && Boolean(element.getAttribute('aria-label')) && ['aria-orientation', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax'].every((name) => element.hasAttribute(name)); })()`), `The separator ${id} lacks its role, name, orientation or value.`);
      }
      const start = await value('primary-separator');
      await press('primary-separator', 'ArrowRight');
      await app.until('the arrow key to move the primary separator', async () => await value('primary-separator') > start + 0.5 || undefined);
      const small = (await value('primary-separator')) - start;
      await press('primary-separator', 'Shift+ArrowRight');
      await app.until('Shift+arrow to move it further', async () => (await value('primary-separator')) - start > small + 5 || undefined);
      await press('primary-separator', 'Home');
      const lowest = await app.until('Home to reach the limit', async () => (await value('primary-separator')) < start - 0.5 ? await value('primary-separator') : undefined);
      await press('primary-separator', 'End');
      await app.until('End to reach the other limit', async () => await value('primary-separator') > lowest + 5 || undefined);
      await press('primary-separator', 'ArrowLeft');
      const moved = await value('primary-separator');
      const hover = await app.eval<string>(`(() => { const rect = document.getElementById('primary-separator').getBoundingClientRect(); return JSON.stringify([rect.left + rect.width / 2, rect.top + rect.height / 2]); })()`);
      const [x, y] = JSON.parse(hover) as [number, number];
      await app.clickAt(x, y, 2);
      await app.until('the double click to restore the default size', async () => Math.abs(await value('primary-separator') - moved) > 0.5 || undefined);
      await press('primary-separator', 'ArrowRight');
      const saved = await value('primary-separator');
      const stored = await app.eval<number | null>(`(() => { try { return JSON.parse(localStorage.getItem('react-resizable-panels:zplc-ide-shell.v1') ?? 'null')?.primary ?? null; } catch { return null; } })()`);
      assert(stored !== null && Math.abs(stored - saved) < 1, `The separator position is not kept: stored ${stored}, shown ${saved}.`);

      // the main path at 1366: edit, save, build, simulate, watch
      await openFile(app, 'src/main.st');
      // an empty line is short enough to click at both window sizes, unlike the comment on the first line
      await cursorAtEndOfLine(app, 9);
      await app.type('  ');
      await app.until('the typed text in the editor', async () => (await editorText(app)).split('\n')[8] === '  ' || undefined);
      await app.press('Ctrl+S');
      const built = await compile(app);
      assert(built.kind === 'built', `The example does not build at 1366: ${built.message}`);
      await connectAndRun(app);
      await watch(app, 'LED_Output');
      await assertFits('1366 by 768 while the simulation runs and the Watch table shows');

      // one lesson of Learn opens from the rail (UX-011)
      await app.click(css('[data-activity="learn"]'), 'the Learn activity');
      await app.until('the lessons in the primary sidebar', async () => await app.visible(css('[aria-label="Primary sidebar"] [aria-label="Lesson"] button, [aria-label="Primary sidebar"] [aria-label="Lección"] button')) || undefined);
      await assertFits('1366 by 768 with the lessons shown');

      // the minimum window: the rail is icons only, the secondary sidebar hides itself, the command bar still fits (UX-023)
      await resize(1024);
      await app.until('the compact shell', async () => await app.eval<boolean>(`document.querySelector('[data-activity-rail]')?.getAttribute('data-density') === 'compact' && !document.querySelector('[aria-label="Secondary sidebar"]')`) || undefined);
      assert(await app.eval<boolean>(`!document.querySelector('.activity-rail-label')`), 'The rail keeps its labels at the minimum window.');
      await assertFits('1024 by 768 while the simulation runs');
      await app.click(css('[data-activity="project"]'), 'the Project activity');
      await app.until('the navigator at 1024', async () => await app.visible(css('[aria-label="Navigator view"]')) || undefined);
      await assertFits('1024 by 768 with the navigator shown');
      await app.cdp.command('Emulation.clearDeviceMetricsOverride');
    },
  },
  {
    name: '46 The themes, forced colours and reduced motion reach the three visual editors and the code editor', example: 'blinky', proves: ['UX-027'], partly: ['UX-005', 'UX-009', 'UX-010', 'UX-034'],
    run: async (app, { project }) => {
      // the three diagrams and a Structured Text file in one folder
      cpSync(join(packageRoot, 'projects', 'blinky_fbd', 'src', 'main.fbd.json'), join(project, 'src', 'second.fbd.json'));
      cpSync(join(packageRoot, 'projects', 'blinky_sfc', 'src', 'main.sfc.json'), join(project, 'src', 'second.sfc.json'));
      writeFileSync(join(project, 'src', 'note.st'), 'PROGRAM Note\nVAR\n  Lamp : BOOL;\nEND_VAR\nLamp := TRUE;\nEND_PROGRAM\n');
      await openFolder(app, project);

      /** The computed colours a person sees, read from the page: no screenshot is compared. */
      // the editor draws a moment after its canvas exists: the probe is repeated until it finds every element it reads
      const colours = (probe: string) => app.until('the editor to be drawn', async () => await app.eval<Record<string, string>>(`(() => { const pick = (selector) => document.querySelector(selector); const style = (element) => getComputedStyle(element); return (${probe})(pick, style); })()`).catch(() => undefined) || undefined);
      /** The background a piece of text really sits on: the first ancestor that paints one. */
      const behind = `(element) => { for (let node = element; node; node = node.parentElement) { const colour = getComputedStyle(node).backgroundColor; if (colour !== 'rgba(0, 0, 0, 0)' && colour !== 'transparent') return colour; } return 'rgb(255, 255, 255)'; }`;
      const sameColour = (a: string, b: string) => { const x = parseColor(a), y = parseColor(b); return x.r === y.r && x.g === y.g && x.b === y.b; };
      const EDITORS = [
        { file: 'src/main.ld.json', ready: '[data-ld-rung-id]', name: 'Ladder', probe: `(pick, style) => ({ background: style(pick('.zplc-visual-editor')).backgroundColor, text: style(pick('[data-ld-rung-id] svg text')).fill, behind: (${behind})(pick('[data-ld-rung-id] svg text')), wire: style(pick('[data-ld-rung-id] svg line')).stroke })` },
        { file: 'src/second.fbd.json', ready: '.react-flow__node', name: 'FBD', probe: `(pick, style) => ({ background: style(pick('.zplc-visual-editor')).backgroundColor, card: style(pick('.zplc-visual-card')).backgroundColor, text: style(pick('.zplc-visual-card span')).color, behind: (${behind})(pick('.zplc-visual-card span')), wire: style(pick('.react-flow__edge-path')).stroke })` },
        { file: 'src/second.sfc.json', ready: '.react-flow__node', name: 'SFC', probe: `(pick, style) => ({ background: style(pick('.zplc-visual-editor')).backgroundColor, card: style(pick('.sfc-step-box')).backgroundColor, text: style(pick('.sfc-step-box span')).color, behind: (${behind})(pick('.sfc-step-box span')), wire: style(pick('.react-flow__edge-path')).stroke })` },
      ];

      // each file is opened once from the Explorer; after that its editor tab brings it back, whatever tab is shown
      for (const editor of EDITORS) await openDiagram(app, editor.file, editor.ready);
      await openFile(app, 'src/note.st');
      const show = async (editor: (typeof EDITORS)[number]) => {
        await app.click(editorTab(`file:${editor.file}`), `the ${editor.name} tab`);
        await app.until(`${editor.name} on its canvas`, async () => await app.visible(css(editor.ready)) || undefined);
      };

      for (const theme of ['light', 'dark', 'high-contrast'] as ThemeId[]) {
        await app.click(button('Project settings'), 'the Project settings button');
        await app.until('the preferences in the settings tab', async () => await app.visible(css('[data-app-preferences]')) || undefined);
        await selectOption(app, 'select[data-theme-control]', theme === 'high-contrast' ? 'High contrast' : theme === 'dark' ? 'Dark' : 'Light');
        await app.until(`the ${theme} theme to apply`, async () => await app.eval<string>(`document.documentElement.getAttribute('data-theme')`) === theme || undefined);
        const tokens = resolveTokens(theme);

        for (const editor of EDITORS) {
          await show(editor);
          const found = await colours(editor.probe);
          assert(sameColour(found.background, tokens['--visual-canvas']), `${editor.name} in the ${theme} theme paints its canvas ${found.background}, not ${tokens['--visual-canvas']}.`);
          assert(contrastRatio(found.text, found.behind) >= 4.5, `${editor.name} text in the ${theme} theme is under 4.5:1: ${found.text} on ${found.behind}.`);
          assert(contrastRatio(found.wire, found.background) >= 3, `A wire of ${editor.name} in the ${theme} theme is under 3:1: ${found.wire} on ${found.background}.`);
        }

        // the code editor wears the same theme
        await app.click(editorTab('file:src/note.st'), 'the code editor tab');
        const code = await monacoEval<{ background: string; text: string }>(app, `const root = editor.getContainerDomNode(); const background = getComputedStyle(root.querySelector('.monaco-editor-background')).backgroundColor; const token = root.querySelector('.view-lines .view-line span span'); return { background, text: getComputedStyle(token ?? root.querySelector('.view-line span')).color };`);
        assert(await monacoEval<boolean>(app, 'return editor.getOption(monaco.editor.EditorOption.minimap).enabled === false'), 'The minimap of the code editor is on before the user turned it on (UX-034).');
        assert(sameColour(code.background, tokens['--editor-bg']), `The code editor in the ${theme} theme paints ${code.background}, not ${tokens['--editor-bg']}.`);
        assert(contrastRatio(code.text, code.background) >= 4.5, `Code in the ${theme} theme is under 4.5:1: ${code.text} on ${code.background}.`);
      }

      // a node reached by keyboard shows the one focus ring, in every diagram (UX-005)
      for (const editor of EDITORS.slice(1)) {
        await show(editor);
        // a key was pressed, so that a focus given by script counts as a keyboard focus, as :focus-visible decides
        await app.press('Tab');
        const ring = await app.eval<{ focusVisible: boolean; style: string; width: string; colour: string; background: string }>(`(() => { const node = document.querySelector('.react-flow__node'); node.focus(); const style = getComputedStyle(node); return { focusVisible: node.matches(':focus-visible'), style: style.outlineStyle, width: style.outlineWidth, colour: style.outlineColor, background: getComputedStyle(document.querySelector('.zplc-visual-editor')).backgroundColor }; })()`);
        assert(ring.focusVisible && ring.style !== 'none' && parseFloat(ring.width) >= 2 && contrastRatio(ring.colour, ring.background) >= 3, `A focused ${editor.name} node shows no ring: ${JSON.stringify(ring)}.`);
      }

      // forced colours: the editors take the system palette and keep their cue besides colour
      await app.cdp.command('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
      for (const editor of EDITORS) {
        await show(editor);
        const forced = await app.eval<{ active: boolean; editor: string; canvas: string }>(`(() => { const probe = document.createElement('div'); probe.style.backgroundColor = 'Canvas'; document.body.append(probe); const canvas = getComputedStyle(probe).backgroundColor; probe.remove(); return { active: matchMedia('(forced-colors: active)').matches, editor: getComputedStyle(document.querySelector('.zplc-visual-editor')).backgroundColor, canvas }; })()`);
        assert(forced.active && sameColour(forced.editor, forced.canvas), `${editor.name} in forced-colours mode paints ${forced.editor}, not the system canvas ${forced.canvas}.`);
      }
      await app.cdp.command('Emulation.setEmulatedMedia', { features: [] });

      // reduced motion: no element of a diagram or of the toolbar takes longer than a hundredth of a second to change
      await app.cdp.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      for (const editor of EDITORS) {
        await show(editor);
        const slow = await app.eval<string[]>(`(() => [...document.querySelectorAll('.zplc-visual-editor *, [role="toolbar"] *')].flatMap((element) => { const style = getComputedStyle(element); return [...style.transitionDuration.split(','), ...style.animationDuration.split(',')].map((value) => parseFloat(value) * (value.trim().endsWith('ms') ? 0.001 : 1)).some((seconds) => seconds > 0.01) ? [element.className.toString().slice(0, 60)] : []; }).slice(0, 5))()`);
        assert(slow.length === 0, `${editor.name} keeps a transition or animation under reduced motion: ${JSON.stringify(slow)}.`);
      }
      await app.cdp.command('Emulation.setEmulatedMedia', { features: [] });
    },
  },
  {
    // UX-025: the path open, edit, build, simulate, watch, force, deploy dialog and one Learn lesson, with key presses only. The
    // folder dialog is the one native window; it is answered by the hook of the unpackaged app, as in every journey. Nothing
    // here is pointed at: `app.click` is not used after the window opens. The simulator is the native one, never a device.
    name: '47 The main path is completed with the keyboard alone', example: 'motor_start_stop_starter', proves: ['UX-025'], partly: ['UX-015', 'UX-026'],
    run: async (app, { project }) => {
      const lesson = learnLessonCatalog.en.find(({ id }) => id === 'motor-start-stop-safe')!;
      const solution = disk(join(packageRoot, 'projects', lesson.referenceExampleId, lesson.solutionProgram));
      // The learner has unlocked every lesson (a setting of the Learn home), so the lesson of this example can be chosen first.
      await app.eval(`import('/src/store/useAppSettings.ts').then(({ useAppSettings }) => useAppSettings.getState().update({ unlockAllLessons: true }))`);
      cpSync(join(packageRoot, 'projects', 'blinky_fbd', 'src', 'main.fbd.json'), join(project, 'src', 'diagram.fbd.json'));
      const focused = (): Promise<string> => app.eval<string>(`(() => { const el = document.activeElement; if (!el || el === document.body) return '(page)'; return ((el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.id || el.tagName).trim().replace(/\\s+/g, ' ')).slice(0, 48) + (el.getAttribute('role') ? ' [' + el.getAttribute('role') + ']' : ''); })()`);
      const live = (politeness: 'polite' | 'assertive') => app.eval<string>(`document.querySelector('[data-live-region="${politeness}"]')?.textContent?.replace(/\\u00a0/g, '') ?? ''`);
      /** Presses `key` until the element holding the focus satisfies `condition` (an expression on `el`); the names it passed are returned, in order, and a miss fails with them. */
      const reach = async (what: string, condition: string, key = 'Tab', max = 45): Promise<string[]> => {
        const path: string[] = [];
        for (let step = 0; step <= max; step++) {
          if (await app.eval<boolean>(`(() => { const el = document.activeElement; return Boolean(el) && el !== document.body && (${condition}); })()`)) return path;
          await app.press(key);
          path.push(await focused());
        }
        throw new Error(`${what} was not reached with ${key} in ${max} presses; the focus passed ${path.join(' > ')}`);
      };
      const isEnabled = (selector: string) => app.eval<boolean>(`document.querySelector(${JSON.stringify(selector)})?.disabled === false`);

      // 1. Open: Welcome focuses its own region; Tab walks the screen from there until it comes round, and the walk follows the screen
      app.answer(project);
      const stop = (): Promise<{ name: string; top: number; left: number }> => app.eval(`(() => { const el = document.activeElement; let top = 0, left = 0; for (let node = el; node; node = node.offsetParent) { top += node.offsetTop; left += node.offsetLeft; } return { name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40), top, left }; })()`);
      const welcomePath: Array<{ name: string; top: number; left: number }> = [];
      for (let step = 0; step < 60; step++) {
        await app.press('Tab');
        const next = await stop();
        if (welcomePath.length > 0 && next.name === welcomePath[0]!.name && next.top === welcomePath[0]!.top) break;
        welcomePath.push(next);
      }
      assert(welcomePath.some((entry) => /Open project/.test(entry.name)), `Tab does not reach Open project on Welcome: ${JSON.stringify(welcomePath.map((entry) => entry.name))}`);
      assert(welcomePath.length > 3, `Tab finds fewer than four stops on Welcome: ${JSON.stringify(welcomePath)}`);
      for (let index = 1; index < welcomePath.length; index++) {
        const [before, after] = [welcomePath[index - 1]!, welcomePath[index]!];
        assert(after.top > before.top - 4 || after.left >= before.left, `The focus order of Welcome goes back up the screen from ${before.name} to ${after.name}: ${JSON.stringify(welcomePath)}`);
      }
      while (!(await app.eval<boolean>(`document.activeElement?.textContent?.includes('Open project') === true`))) await app.press('Tab');
      await app.press('Enter');
      await app.until('the project workbench to appear', async () => await app.visible(toolbar) || undefined);
      // the Welcome screen closed with the button that opened the project: the focus must not fall to the page body (UX-028)
      assert(await focused() !== '(page)', 'The focus fell to the page body when the project opened.');

      // 2. Edit: the project navigator holds Motor.st; Tab reaches its row and Enter opens the file.
      await app.press('Ctrl+Shift+E');
      await reach('the Motor.st row of the navigator', `el.textContent.includes('src/Motor.st')`, 'Tab', 60);
      await app.press('Enter');
      await app.until('Motor.st in the code editor', async () => (await editorText(app)).includes('PROGRAM Motor') || undefined);
      // the code editor is reached with Tab; the whole program is replaced by the reference solution and saved with Ctrl+S
      // (typing the text would let the editor indent and close brackets as it does for a person; the solution is pasted)
      await app.eval(`(() => { const area = document.createElement('textarea'); area.value = ${JSON.stringify(solution)}; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); })()`);
      await reach('the code editor', `el.closest('.monaco-editor') !== null`, 'Tab', 80);
      // the editor takes Tab as a character, so its name tells a person who cannot see it the way out (UX-028)
      assert(await app.eval<boolean>(`(document.activeElement?.getAttribute('aria-label') ?? '').includes('Ctrl+M')`), `The code editor does not name the way out of it: ${await app.eval<string>(`document.activeElement?.getAttribute('aria-label') ?? ''`)}`);
      await app.press('Ctrl+A');
      await app.press('Ctrl+V');
      await app.until('the solution in the editor', async () => (await editorText(app)).includes('Forward') || undefined);
      await app.press('Ctrl+S');
      await app.until('the save to be announced', async () => /Saved/.test(await live('polite')) || undefined);

      // no keyboard trap in the code editor: Tab types a tab there, and Ctrl+M (Monaco's Tab focus mode) makes Tab and Shift+Tab move the focus
      await app.press('Ctrl+M');
      await app.press('Tab');
      assert(await app.eval<boolean>(`document.activeElement?.closest('.monaco-editor') === null`), 'Tab stayed in the code editor after Ctrl+M (toggle Tab focus mode).');
      await reach('the code editor again', `el.closest('.monaco-editor') !== null`, 'Shift+Tab', 8);
      await app.press('Ctrl+M');

      // 3. Build: Ctrl+B; the result is written to Output and announced
      await app.press('Ctrl+B');
      await app.until('a successful build in Output', async () => /Built saved workspace locally/.test(await outputText(app)) || undefined, 30_000)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the announcer says ${JSON.stringify([await live('polite'), await live('assertive')])}; Output says ${JSON.stringify((await outputText(app)).slice(-300))}`); });
      await app.until('the result of the build to be announced', async () => { const said = await live('polite'); return (said !== '' && !/^Building/.test(said) && /build|built/i.test(said)) || undefined; });

      // 4. Simulate: Connect from the palette and Run with F5
      const palette = async (title: string) => {
        await app.press('Ctrl+Shift+P');
        await app.until('the command palette', async () => await app.eval<boolean>(`Boolean(document.querySelector('[role="dialog"] [role="combobox"]'))`) || undefined);
        await app.type(title);
        await app.press('Enter');
        await app.until('the palette to close', async () => !await app.eval<boolean>(`Boolean(document.querySelector('[role="dialog"] [role="combobox"]'))`) || undefined);
      };
      await palette('Connect');
      await app.until('the simulation to connect', async () => await app.visible(button('Disconnect')) || undefined);
      await app.until('the connection to be announced', async () => /ready|connected/i.test(await live('polite')) || undefined);
      await app.press('F5');
      await app.until('the program to run', async () => await app.visible(button('Pause (F6)', 'prefix')) || undefined);
      assert(/Running|RUN/i.test(await app.eval<string>(`document.querySelector('[aria-label="Operational status"] [role="status"]:not([data-connection])')?.textContent ?? ''`)), 'The status bar does not say that the program runs.');

      // 5. Watch: the Watch tab by command, which leaves the focus on it; the inputs of the program head the tab
      await palette('Show watched variables');
      await app.until('the focus on the Watch tab', async () => await app.eval<boolean>(`document.activeElement?.id === 'console-tab-watch'`) || undefined, 5_000).catch(async () => { throw new Error(`Show watched variables must leave the focus on the Watch tab, it is on ${await focused()}`); });
      await reach('the switch of Start', `el.getAttribute('role') === 'switch' && /^Start/.test(el.getAttribute('aria-label') ?? el.textContent ?? '')`, 'Tab', 10);
      await app.press('Space');
      await app.until('Start to read TRUE', async () => await app.eval<boolean>(`document.activeElement?.getAttribute('aria-checked') === 'true'`) || undefined, 8_000);

      // 6. Force: the checkbox of the row is the next stop; Space forces it, the announcer says so, and Space releases it
      await reach('the Force checkbox of Start', `el.matches('input[type="checkbox"]') && /^Force.*Start$/.test(el.getAttribute('aria-label') ?? '')`, 'Tab', 5);
      await app.press('Space');
      await app.until('Start to be forced and announced', async () => /Forced/.test(await live('polite')) || undefined)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the polite region says ${JSON.stringify(await live('polite'))}, the checkbox is ${await app.eval<string>(`String(document.activeElement?.checked)`)}`); });
      await app.press('Space');
      await app.until('the force to be released and announced', async () => /released/i.test(await live('polite')) || undefined);
      // Watch: a variable is added to the table with the keyboard, and its value follows the program
      await reach('the Add variable button', `el.textContent?.trim() === 'Add variable' || el.getAttribute('aria-label') === 'Add variable'`, 'Tab', 20);
      await app.press('Enter');
      await reach('the variable field of Watch', `el.matches('input[placeholder^="Variable path"]')`, 'Tab', 5);
      await app.type('Forward'); await app.press('Enter');
      await app.until('Forward to read TRUE in the Watch table', async () => await watchValue(app, 'Forward') === 'TRUE' || undefined);
      // the field leaves the page with the form: the focus goes back to the button that opened it, and the row is announced (UX-028)
      await app.until('the focus to return to Add variable', async () => (await focused()).startsWith('Add variable') || undefined, 3_000).catch(async () => { throw new Error(`Adding a variable must return the focus to Add variable, it is on ${await focused()}`); });
      assert(/Forward added to the watch table/.test(await live('polite')), `Adding a variable is not announced: ${JSON.stringify(await live('polite'))}`);

      // 7. The deploy dialog: asked as the toolbar asks it; focus starts on Cancel, Tab stays inside, Escape closes it and gives the focus back
      const trigger = await focused();
      await app.eval(`(async () => {
        const { confirmDeploy } = await import('/src/components/deployConfirm.tsx');
        const facts = { project: { name: 'Pump station', board: 'STM32F746G Discovery', boardProfile: 'stm32f746g_disco/stm32f746xx', abi: { major: 1, minor: 0, draft: 6 }, sha256: 'a1b2c3d4e5f6a7b8c9d0', byteLength: 512, taskCount: 2 }, device: { board: 'stm32f746g_disco', boardProfile: 'stm32f746g_disco/stm32f746xx', zplcVersion: '1.0.0', zephyrVersion: '4.0.0', abi: { major: 1, minor: 0 }, draft: 6, maxArtifactBytes: 4096, maxTasks: 4 }, declaredSafe: [], transfer: 'framed' };
        window.__deployAnswer = 'asking';
        confirmDeploy({ facts }, true).then((answer) => { window.__deployAnswer = answer; });
      })()`);
      await app.until('the deploy dialog', async () => await app.visible(css('[role="alertdialog"]')) || undefined);
      assert(await app.eval<string>(`document.activeElement?.textContent?.trim() ?? ''`) === 'Cancel', `Focus in the deploy dialog must start on Cancel, it is on ${await focused()}`);
      const inside: string[] = [];
      for (let step = 0; step < 4; step++) { await app.press('Tab'); inside.push(await focused()); assert(await app.eval<boolean>(`document.activeElement?.closest('[role="alertdialog"]') !== null`), `Tab left the deploy dialog for ${inside.at(-1)}`); }
      await app.press('Escape');
      await app.until('the dialog to close', async () => !await app.visible(css('[role="alertdialog"]')) || undefined);
      assert(await app.eval<unknown>('window.__deployAnswer') === false, 'Escape must refuse the deploy.');
      assert(await focused() === trigger, `Escape must return the focus to ${trigger}, it is on ${await focused()}`);
      // the command palette and the shortcut reference give the focus back in the same way
      for (const [open, shown] of [[() => app.press('Ctrl+Shift+P'), '[role="dialog"] [role="combobox"]'], [async () => { await app.press('Ctrl+K'); await app.press('Ctrl+S'); }, '[data-command="debug.run"] kbd']] as const) {
        await open();
        await app.until('the dialog', async () => await app.visible(css(shown)) || undefined);
        await app.press('Escape');
        await app.until('the dialog to close', async () => !await app.visible(css(shown)) || undefined);
        assert(await focused() === trigger, `Escape must return the focus to ${trigger}, it is on ${await focused()}`);
      }

      // 8. A visual editor is not a trap: Tab leaves the diagram
      await app.press('Ctrl+Shift+P'); await app.type('Show the project navigator'); await app.press('Enter');
      await reach('the diagram row of the navigator', `el.textContent.includes('src/diagram.fbd.json')`, 'Tab', 60);
      await app.press('Enter');
      await app.until('the diagram', async () => await app.visible(css('.react-flow__node')) || undefined);
      await reach('the diagram', `el.closest('.zplc-visual-editor') !== null`, 'Tab', 80);
      await reach('the end of the diagram', `el.closest('.zplc-visual-editor') === null`, 'Tab', 60);

      // 9. One Learn lesson: the lesson list by command, Check reached with Tab and pressed with Enter, graded as passed
      await palette('Show the lessons');
      await app.until('the Learn tab', async () => await app.eval<boolean>(`document.querySelector('[data-activity="learn"]')?.getAttribute('aria-current') === 'true'`) || undefined);
      // The lesson of this example is chosen with the arrow keys of the lesson list, as a keyboard user would.
      await reach('the lesson list', `el.closest('[aria-label="Lesson"]') !== null && el.getAttribute('aria-pressed') === 'true'`, 'Tab', 80);
      // The lesson list follows the course order, so the number of presses is bounded by the lessons that come before this one.
      await reach('the Safe motor start-stop lesson', `el.textContent.trim().startsWith('Safe motor start-stop')`, 'ArrowRight', courseOrder(LESSON_INDEX).findIndex(({ id }) => id === 'motor-start-stop-safe'));
      await app.press('Enter');
      await app.until('the Safe motor start-stop lesson to be chosen', async () => await app.eval<boolean>(`document.getElementById('learn-title')?.textContent?.trim() === 'Safe motor start-stop'`) || undefined);
      await app.until('the Check button to be enabled', async () => await isEnabled('[data-learn-check]') || undefined);
      await reach('the Check button', `el.matches('[data-learn-check]')`, 'Tab', 60);
      // each stage's checkpoint disclosure has its own name, and the Check button keeps the focus while it works (UX-028)
      const checkpointNames = await app.eval<string[]>(`[...document.querySelectorAll('[aria-label="Primary sidebar"] ol summary')].map((el) => el.getAttribute('aria-label') ?? el.textContent)`);
      assert(checkpointNames.length > 1 && new Set(checkpointNames).size === checkpointNames.length, `The checkpoint disclosures share a name: ${JSON.stringify(checkpointNames)}`);
      await app.press('Enter');
      assert(await app.eval<boolean>(`document.activeElement?.matches('[data-learn-check]') === true`), `The Check button must keep the focus while it checks, it is on ${await focused()}`);
      await app.until('Learn to grade the program as passed', async () => await app.eval<boolean>(`document.querySelector('[data-learn-grade="passed"]') !== null`) || undefined, 60_000)
        .catch(async (error: Error) => { throw new Error(`${error.message}: the grade shown is ${await app.eval<string>(`document.querySelector('[data-learn-grade]')?.getAttribute('data-learn-grade') ?? 'none'`)}; ${await app.eval<string>(`document.querySelector('[data-learn-check-status]')?.textContent ?? ''`)}`); });
    },
  },
  {
    // UX-024, UX-026: the rendered-DOM check (scripts/domAudit.ts) over the main screens in the three themes. It is a structural
    // and computed check, not a screen-reader test (UX-028 is a manual task on Windows and macOS).
    name: '48 The main screens pass the rendered accessibility check in light, dark and high contrast', example: 'blinky', proves: ['UX-024'], partly: ['UX-026', 'UX-005'],
    run: async (app, { project }) => {
      cpSync(join(packageRoot, 'projects', 'blinky_fbd', 'src', 'main.fbd.json'), join(project, 'src', 'second.fbd.json'));
      cpSync(join(packageRoot, 'projects', 'blinky_sfc', 'src', 'main.sfc.json'), join(project, 'src', 'second.sfc.json'));
      writeFileSync(join(project, 'src', 'note.st'), 'PROGRAM Note\nVAR\n  Lamp : BOOL;\nEND_VAR\nLamp := TRUE;\nEND_PROGRAM\n');
      const themes: Array<{ id: ThemeId; command: string }> = [{ id: 'light', command: 'Use the light theme' }, { id: 'dark', command: 'Use the dark theme' }, { id: 'high-contrast', command: 'Use the high contrast theme' }];
      const paletteOpen = () => app.eval<boolean>(`Boolean(document.querySelector('[role="dialog"] [role="combobox"]'))`);
      const chooseTheme = async (theme: (typeof themes)[number]) => {
        await app.press('Ctrl+Shift+P');
        await app.until('the command palette', async () => await paletteOpen() || undefined);
        await app.type(theme.command);
        await app.press('Enter');
        await app.until(`the ${theme.id} theme to apply`, async () => await app.eval<string>(`document.documentElement.getAttribute('data-theme')`) === theme.id || undefined);
      };
      const found: string[] = [];
      const covered: string[] = [];
      let theme = themes[0]!;
      /** One screen, as it is now: the audit runs in the page after a key press, so that a focus given by script is a keyboard focus. */
      const audit = async (screen: string) => {
        await app.press('Tab');
        // a colour read in the middle of a transition is not the colour the screen settles on: wait for the finite ones
        await app.eval('Promise.race([Promise.allSettled(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished)), new Promise((resolve) => setTimeout(resolve, 1500))]).then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))');
        const result = await app.eval<DomAuditResult>(domAuditExpression);
        covered.push(`${theme.id} | ${screen}: ${result.checked.text} texts, ${result.checked.interactive} controls, ${result.checked.focus} focus (${result.unchecked.focus} unverified), ${result.unchecked.background} on an image`);
        for (const finding of result.findings.slice(0, 40)) found.push(`${theme.id} | ${screen} | ${finding.rule} | ${finding.where} | ${finding.detail}`);
      };
      const withDialog = async (screen: string, open: () => Promise<void>, shown: Target) => {
        await open();
        await app.until(`${screen} to show`, async () => await app.visible(shown) || undefined);
        await audit(screen);
        await app.press('Escape');
        await app.until(`${screen} to close`, async () => !await app.visible(shown) || undefined);
      };

      // the audit can fail: a page with an unlabelled field, a duplicate id and pale text is reported for each rule
      await app.eval(`(() => { const host = document.createElement('div'); host.id = 'audit-fixture'; host.innerHTML = '<input type="text" id="fx"><p id="fx">pale</p><p style="color:#bbb;background:#fff">pale text</p>'; document.body.append(host); })()`);
      const fixture = await app.eval<DomAuditResult>(domAuditExpression);
      await app.eval(`document.getElementById('audit-fixture').remove()`);
      for (const rule of ['name', 'duplicate-id', 'contrast']) assert(fixture.findings.some((finding) => finding.rule === rule), `The audit does not report a ${rule} problem it was given: ${JSON.stringify(fixture.findings.map((finding) => finding.rule))}`);

      // Welcome
      for (theme of themes) { await chooseTheme(theme); await audit('Welcome'); }

      await openFolder(app, project);
      const EDITORS = [
        { file: 'src/main.ld.json', ready: '[data-ld-rung-id]', name: 'Ladder' },
        { file: 'src/second.fbd.json', ready: '.react-flow__node', name: 'Function block diagram' },
        { file: 'src/second.sfc.json', ready: '.react-flow__node', name: 'Sequential function chart' },
      ];
      for (const editor of EDITORS) await openDiagram(app, editor.file, editor.ready);
      await openFile(app, 'src/note.st');
      for (theme of themes) {
        await chooseTheme(theme);
        await app.click(editorTab('file:src/note.st'), 'the Structured Text tab');
        await audit('Editor, Structured Text');
        for (const editor of EDITORS) {
          await app.click(editorTab(`file:${editor.file}`), `the ${editor.name} tab`);
          await app.until(`${editor.name} on its canvas`, async () => await app.visible(css(editor.ready)) || undefined);
          await audit(`Editor, ${editor.name}`);
        }
        for (const panel of ['Problems', 'Output', 'Watch', 'Trace', 'Tests', 'Terminal']) {
          if (!await app.visible(tab(panel, 'prefix'))) continue;
          await app.click(tab(panel, 'prefix'), `the ${panel} tab`);
          await audit(`Results panel, ${panel}`);
        }
        for (const view of ['project', 'search', 'tests', 'learn']) {
          await app.click(css(`[data-activity="${view}"]`), `the ${view} view of the rail`);
          await audit(`Sidebar, ${view}`);
          // The rail's Learn item also opens the Learn home over the editor: it is a screen of its own, and Escape returns to the editor.
          if (view === 'learn') {
            await app.until('the Learn home', async () => await app.visible(css('[data-learn-home]')) || undefined);
            await audit('Learn home');
            await app.press('Escape');
            await app.until('the editor again', async () => !(await app.visible(css('[data-learn-home]'))) || undefined);
          }
        }
        await app.click(button('Project settings'), 'the Project settings button');
        await app.until('the preferences', async () => await app.visible(css('[data-app-preferences]')) || undefined);
        await audit('Settings');
        await withDialog('The command palette', () => app.press('Ctrl+Shift+P'), css('[role="dialog"] [role="combobox"]'));
        await withDialog('The shortcut reference', async () => { await app.press('Ctrl+K'); await app.press('Ctrl+S'); }, css('[data-command="debug.run"] kbd'));
        // the deploy question, asked as the toolbar asks it (the journey never answers it with a device)
        await withDialog('The deploy dialog', async () => { await app.eval(`(async () => {
          const { confirmDeploy } = await import('/src/components/deployConfirm.tsx');
          const facts = { project: { name: 'Pump station', board: 'STM32F746G Discovery', boardProfile: 'stm32f746g_disco/stm32f746xx', abi: { major: 1, minor: 0, draft: 6 }, sha256: 'a1b2c3d4e5f6a7b8c9d0', byteLength: 512, taskCount: 2 }, device: { board: 'rpi_pico', boardProfile: 'rpi_pico/rp2040', zplcVersion: '1.0.0', zephyrVersion: '4.0.0', abi: { major: 1, minor: 0 }, draft: 6, maxArtifactBytes: 4096, maxTasks: 4 }, declaredSafe: [], transfer: 'framed' };
          confirmDeploy({ facts }, false);
        })()`); }, css('[role="alertdialog"]'));
      }
      // the same element on many screens and in three themes is one problem: group by rule and element
      const groups = new Map<string, { sample: string; themes: Set<string>; screens: Set<string> }>();
      for (const line of found) {
        const [themeId = '', screen = '', rule = '', where = '', detail = ''] = line.split(' | ');
        const key = `${rule} | ${where} | ${rule === 'contrast' ? detail.replace(/^[\d.]+:1/, '').replace(/ rgb.*$/, '') : detail}`;
        const group = groups.get(key) ?? { sample: detail, themes: new Set<string>(), screens: new Set<string>() };
        group.themes.add(themeId); group.screens.add(screen); groups.set(key, group);
      }
      const report = [...groups].map(([key, group]) => `${key} [${group.sample}] themes=${[...group.themes].join('/')} screens=${group.screens.size} (${[...group.screens].slice(0, 3).join('; ')})`);
      assert(found.length === 0, `The rendered accessibility check found ${found.length} findings, ${report.length} distinct, on ${covered.length} screens:\n${report.slice(0, 90).join('\n')}`);
    },
  },
  {
    name: '49 The migrated screens read in Spanish, with no raw catalog key, no English left over and no clipped control at 1366 by 768', example: 'motor_start_stop', proves: [], partly: ['UX-029', 'UX-030'],
    run: async (app, { project }) => {
      await app.cdp.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      // The user chose Spanish in Preferences: the setting is stored, and the window starts again from it.
      await app.eval(`(() => { const key = 'zplc-ide-settings'; const stored = JSON.parse(localStorage.getItem(key) || '{}'); const target = stored.settings ?? stored; target.language = 'es'; localStorage.setItem(key, JSON.stringify(stored)); })()`);
      await app.cdp.command('Page.reload');
      await app.until('the Welcome screen in Spanish', async () => await app.visible(button('Abrir proyecto', 'contains')) || undefined);
      const welcome = await app.eval<string>('document.body.innerText');
      assert(welcome.includes('Marcha y paro de un motor') && !welcome.includes('Open project'), `The Welcome screen is not in Spanish: ${welcome.slice(0, 400)}`);
      app.answer(project);
      await app.click(button('Abrir proyecto', 'contains'), 'the Abrir proyecto button');
      await app.until('the project workbench to appear', async () => await app.visible(css('[role="toolbar"]')) || undefined);

      /** A catalog key shown as it is written (`console.tab.lab`), or one of the English phrases the migrated screens used to hard-code. */
      const RAW_KEY = String.raw`\b(?:console|mqtt|modbus|network|io|controller|lab|toolchain|commtags|project|ld|importArchive|interlock|learn|toolbarMsg|examples|panel|toolbar|welcome|common|labScene|notices|terminal|deploy|library|declarationKind|keyboard|sfc|fbd|testDiag|archive|tree|picker|types|signal|store|debugger|link|labPlayback|workbench\.[a-z]+|editors\.[a-z]+|settings\.(?:communication|firmware|metadata|target|tasks))\.[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*\b`;
      const text = (id: string) => app.eval<string>(`document.getElementById(${JSON.stringify(id)})?.innerText ?? ''`);
      const walk = async (tab: string, expected: string[], english: string[]) => {
        await app.click(css(`#console-tab-${tab}`), `the ${tab} tab`);
        await app.until(`the ${tab} panel`, async () => (await text(`console-panel-${tab}`)) !== '' || undefined);
        const body = await text(`console-panel-${tab}`);
        for (const phrase of expected) assert(body.toLowerCase().includes(phrase.toLowerCase()), `The ${tab} panel does not say "${phrase}" in Spanish: ${body.slice(0, 500)}`);
        for (const phrase of english) assert(!body.toLowerCase().includes(phrase.toLowerCase()), `The ${tab} panel still says "${phrase}" in English: ${body.slice(0, 500)}`);
        assert(!new RegExp(RAW_KEY).test(body), `The ${tab} panel shows a raw catalog key: ${body.match(new RegExp(RAW_KEY))?.[0]}`);
      };
      await walk('tests', ['zplc.json'], ['Choose zplc.json', 'Run host scenarios', 'Select the saved']);
      await walk('interlocks', ['Cobertura de enclavamientos declarados'], ['Declared interlock coverage', 'Check declared interlocks']);
      await walk('lab', ['Laboratorio'], ['Run the saved host scenarios']);
      await walk('changes', ['cambio'], ['Review active ST change', 'requires the desktop app']);
      await walk('agent', ['Actualizar el estado'], ['Provider settings', 'Refresh status']);
      const tabs = await app.eval<string[]>(`[...document.querySelectorAll('[role="tab"][id^="console-tab-"]')].map((tab) => tab.textContent.trim())`);
      for (const label of ['Salida', 'Problemas', 'Enclavamientos', 'Laboratorio', 'Cambios', 'Agente']) assert(tabs.some((tab) => tab.includes(label)), `The results tabs are ${JSON.stringify(tabs)}, without ${label}.`);
      const chrome = await app.eval<string>('document.body.innerText');
      assert(!new RegExp(RAW_KEY).test(chrome), `The window shows a raw catalog key: ${chrome.match(new RegExp(RAW_KEY))?.[0]}`);
      // The second batch of migrated surfaces (WP-65): the Watch and Terminal tabs, the Inspector and the project settings sections.
      await walk('watch', [], ['Add variable', 'Start debugging to see live values', 'Watch']);
      // WP-75: the opening lines of the Terminal come from the catalog too (they were written in a plain .ts module).
      await walk('terminal', ['Sin conexión', 'Terminal serie de ZPLC', 'Use la conexión compartida de la barra de herramientas'], ['Not connected', 'Connect to send commands', 'ZPLC serial terminal', 'Use the shared connection']);
      await app.click(css('[data-toggle-inspector]'), 'the Inspector button of the command bar');
      await app.until('the Inspector in Spanish', async () => await app.visible(css('[aria-label="Inspector del entorno de trabajo"]')) || undefined);
      const inspector = await app.eval<string>(`document.querySelector('[aria-label="Inspector del entorno de trabajo"]')?.innerText ?? ''`);
      for (const phrase of ['Archivo activo', 'Proyecto', 'Evidencia', 'La traza del equipo anfitrión no es evidencia de hardware ni de HIL', 'Sin forzados activos', 'Desconectado']) assert(inspector.toLowerCase().includes(phrase.toLowerCase()), `The Inspector does not say "${phrase}" in Spanish: ${inspector.slice(0, 400)}`);
      for (const phrase of ['Active file', 'Evidence', 'Diagnostics', 'No active forces', 'Not checked', 'Disconnected']) assert(!inspector.toLowerCase().includes(phrase.toLowerCase()), `The Inspector still says "${phrase}" in English: ${inspector.slice(0, 400)}`);
      await app.click(button('Configuración del proyecto'), 'the Configuración del proyecto button');
      await app.until('the project settings in Spanish', async () => (await app.eval<string>('document.body.innerText')).includes('Nombre del proyecto') || undefined);
      let settings = await app.eval<string>('document.body.innerText');
      for (const phrase of ['Nombre del proyecto']) assert(settings.includes(phrase), `The project settings do not say "${phrase}" in Spanish: ${settings.slice(0, 600)}`);
      for (const [kind, phrase] of [['target', 'Placa de destino'], ['tasks', 'Agregar tarea'], ['communication', 'Alcance de la comunicación de la v1.5']] as const) {
        await app.click(css(`[data-open-config-editor="${kind}"]`), `the ${kind} editor`);
        await app.until(`the ${kind} editor in Spanish`, async () => (await app.eval<string>('document.body.innerText')).includes(phrase) || undefined);
        settings += '\n' + await app.eval<string>('document.body.innerText');
        await app.click(button('Configuración del proyecto'), 'the Configuración del proyecto button');
        await app.until('the project settings again', async () => await app.visible(css('[data-open-config-editor]')) || undefined);
      }
      for (const phrase of ['Placa de destino', 'Velocidad de reloj (MHz)', 'Agregar tarea', 'Alcance de la comunicación de la v1.5']) assert(settings.includes(phrase), `The project settings do not say "${phrase}" in Spanish: ${settings.slice(0, 900)}`);
      for (const phrase of ['Project Name', 'Target Board', 'Clock Speed', 'Add Task']) assert(!settings.includes(phrase), `The project settings still say "${phrase}" in English.`);
      assert(!new RegExp(RAW_KEY).test(settings), `The project settings show a raw catalog key: ${settings.match(new RegExp(RAW_KEY))?.[0]}`);

      // No button of the toolbar or of the results tabs is cut off by the window (a tab strip that scrolls sideways is reached by scrolling it).
      const clipped = await app.eval<string[]>(`(() => {
        const vw = window.innerWidth, vh = window.innerHeight, found = [];
        const scrolls = (element) => { for (let parent = element.parentElement; parent; parent = parent.parentElement) if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth) return true; return false; };
        for (const element of document.querySelectorAll('[role="toolbar"] button, [role="tab"], [data-activity-rail] button')) {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0 || scrolls(element)) continue;
          if (rect.left < -0.5 || rect.top < -0.5 || rect.right > vw + 0.5 || rect.bottom > vh + 0.5) found.push((element.getAttribute('aria-label') || element.textContent.trim() || element.id) + ' ' + Math.round(rect.left) + '..' + Math.round(rect.right));
        }
        return found;
      })()`);
      assert(clipped.length === 0, `Controls are clipped at 1366 by 768 in Spanish: ${clipped.join('; ')}`);
    },
  },
  {
    // LRN-017 (and IDE-024): during a live simulation the faceplate lists the inputs and the outputs of the program from its I/O
    // map and lets a person operate the inputs. None of these names is one that the runtime or Studio knows. A change reaches
    // the program at a scan boundary; the journey sees the output follow, with the pointer and with the keyboard alone.
    name: '50 The live I/O faceplate operates the inputs of any program and shows its outputs, with the pointer and with the keyboard', example: 'none', proves: ['LRN-017'], partly: ['IDE-024'],
    run: async (app, { root }) => {
      const folder = join(root, 'faceplate-io');
      mkdirSync(join(folder, 'src'), { recursive: true });
      writeFileSync(join(folder, 'zplc.json'), JSON.stringify({ schemaVersion: 2, name: 'Faceplate IO', version: '1.0.0', target: { board: 'posix' }, tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Panel.st'] }] }));
      writeFileSync(join(folder, 'src', 'Panel.st'), [
        'PROGRAM Panel',
        'VAR_INPUT',
        '  Gate AT %IX0.1 : BOOL;',
        '  Bell AT %IX0.2 : BOOL;',
        '  Dial AT %IW2 : INT;',
        '  Scale AT %ID2 : DINT;',
        'END_VAR',
        'VAR_OUTPUT',
        '  Lamp AT %QX0.0 : BOOL;',
        '  Ring AT %QX0.1 : BOOL;',
        '  Echo AT %QW2 : INT;',
        '  Total AT %QD2 : DINT;',
        'END_VAR',
        'Lamp := Gate;',
        'Ring := Bell;',
        'Echo := Dial;',
        'Total := Scale;',
        'END_PROGRAM',
        '',
      ].join('\n'));
      // The steps wait on a runtime that shares the machine with other work: a generous bound, not a slow product.
      const patiently = <T,>(description: string, check: () => Promise<T | undefined | false> | T | undefined | false) => app.until(description, check, 45_000);
      const outputText = (name: string) => app.eval<string>(`document.querySelector('[data-output="Panel.${name}"] [data-output-value]')?.textContent?.trim() ?? ''`);
      const inputText = (name: string) => app.eval<string>(`document.querySelector('[data-input="Panel.${name}"] [data-input-value]')?.textContent?.trim() ?? ''`);
      const outputIs = (name: string, text: string) => patiently(`${name} to read ${text}`, async () => (await outputText(name)).includes(text) || undefined);
      const centre = async (selector: string) => app.eval<{ x: number; y: number }>(`(() => { const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`);
      const focus = (selector: string) => app.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
      const key = (type: 'keyDown' | 'keyUp') => app.cdp.command('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32, ...(type === 'keyDown' ? { text: ' ' } : {}) });

      await openFolder(app, folder);
      const built = await compile(app);
      assert(built.kind === 'built', `The program with custom-named I/O does not build: ${built.message}`);
      await connectAndRun(app);
      await app.click(tab('Watch', 'prefix'));
      await patiently('the faceplate', async () => await app.visible(css('[data-faceplate]')) || undefined);

      // Every input and every output of the program is listed, by its own name, from the I/O map.
      for (const name of ['Gate', 'Bell', 'Dial', 'Scale']) assert(await app.visible(css(`[data-input="Panel.${name}"]`)), `The input ${name} is not on the faceplate.`);
      for (const name of ['Lamp', 'Ring', 'Echo', 'Total']) assert(await app.visible(css(`[data-output="Panel.${name}"]`)), `The output ${name} is not on the faceplate.`);
      await outputIs('Lamp', 'FALSE');

      // The switch, with the pointer: the change shows as pending or applied beside the input and the output follows the scan.
      await app.click(button('Gate: FALSE'));
      await patiently('the change of Gate to be shown', async () => await app.visible(css('[data-input="Panel.Gate"] [data-input-phase]')) || undefined);
      await outputIs('Lamp', 'TRUE');
      await patiently('Gate to read TRUE', async () => (await inputText('Gate')).includes('TRUE') || undefined);
      // The switch, with the keyboard alone: focus it and press Space.
      await focus('[data-input="Panel.Gate"] button[role="switch"]');
      await app.press('Space');
      await outputIs('Lamp', 'FALSE');

      // The push button, with the pointer: TRUE while it is held and FALSE when it is let go.
      const { x, y } = await centre('button[aria-label="Hold Bell"]');
      await app.cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await app.cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await outputIs('Ring', 'TRUE');
      await app.cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
      await outputIs('Ring', 'FALSE');
      // The push button, with the keyboard alone: Space held and let go.
      await focus('button[aria-label="Hold Bell"]');
      await key('keyDown');
      await outputIs('Ring', 'TRUE');
      await key('keyUp');
      await outputIs('Ring', 'FALSE');

      // The slider of a 16-bit integer, with the keyboard: its type gives the range, so End is the top of the range.
      await focus('input[aria-label="Slider for Dial"]');
      await app.press('End');
      await outputIs('Echo', '32767');
      await app.press('Home');
      await outputIs('Echo', '-32768');
      await app.press('ArrowRight');
      await outputIs('Echo', '-32767');

      // A 32-bit input has no slider (its type gives no range to point at) and a number box with Set, typed with the keyboard.
      assert(!await app.visible(css('input[aria-label="Slider for Scale"]')), 'A DINT should have no slider.');
      await focus('input[aria-label="Value of Scale"]');
      await app.type('100000');
      await app.press('Enter');
      await outputIs('Total', '100000');

      // Where the runtime cannot apply a change the controls are disabled and the panel says why in words.
      await app.click(button('Stop (Shift+F5)', 'prefix'), 'Stop');
      await patiently('the faceplate to say that the simulation is not running', async () => (await app.eval<string>(`document.querySelector('[data-faceplate-reason]')?.textContent ?? ''`)).includes('not running') || undefined);
      assert(!await app.clickable(button('Gate: FALSE')), 'The switch should be disabled while the simulation is not running.');
      assert(!await app.clickable(css('button[aria-label="Hold Bell"]')), 'The push button should be disabled while the simulation is not running.');
    },
  },
  {
    // LRN-018 (and LRN-019, LRN-020, LRN-021, LRN-037): the plant of a lesson runs live in closed loop with the starter, bound by the
    // mapping the lesson ships. An input is operated on the faceplate and the plant reacts; play, pause, step and a fault action
    // work with the keyboard alone, the state is announced in words, and the recorded run stays available as a labelled replay.
    name: '52 A lesson plant runs live in closed loop, with pause, step and a fault action, and the recorded run stays a labelled replay', example: 'none', proves: ['LRN-018'], partly: ['LRN-019', 'LRN-020', 'LRN-021', 'LRN-037'],
    run: async (app, { root }) => {
      const lesson = LESSON_INDEX.lessons.find(({ plant }) => plant === 'motor-v1')!;
      assert(lesson.plantMap !== null, 'The motor lesson ships no plant mapping.');
      const folder = join(root, 'plant-lesson'); mkdirSync(folder);
      const patiently = <T,>(description: string, check: () => Promise<T | undefined | false> | T | undefined | false) => app.until(description, check, 45_000);
      const fact = () => app.eval<string>(`document.querySelector('[data-plant-fact]')?.getAttribute('data-plant-fact') ?? ''`);
      const scans = async () => Number(/(\d+) scans/.exec(await app.eval<string>(`document.querySelector('[data-plant-scans]')?.textContent ?? ''`))?.[1] ?? 'NaN');
      const outputText = (name: string) => app.eval<string>(`document.querySelector('[data-output="MotorPlant.${name}"] [data-output-value]')?.textContent?.trim() ?? ''`);
      const focus = (selector: string) => app.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
      const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      await unlockAllLessons(app);
      await app.click(button('Learn', 'prefix'), 'the Learn button on the Welcome screen');
      await app.until('the Learn home', async () => await app.visible(css('[data-learn-start]')) || undefined);
      app.answer(folder);
      await app.click(css(`[data-learn-start="${lesson.id}"]`), 'the start of the motor plant lesson');
      await app.until('the project workbench to appear', async () => await app.visible(toolbar) || undefined);
      const built = await compile(app);
      assert(built.kind === 'built', `The starter of the plant lesson does not build: ${built.message}`);
      await connectAndRun(app);

      // 1. The plant is drawn and bound by the mapping the lesson ships: no name is typed anywhere.
      await app.click(tab('Lab', 'prefix'));
      await patiently('the live motor plant', async () => await app.visible(css('[data-plant="motor-v1"]')) || undefined);
      assert((await fact()) === 'plant.motor.stopped', `The motor starts as ${await fact()}.`);
      // Everything the two live regions are told, in order (a later message replaces an earlier one in the region itself).
      await app.eval(`(() => { window.__said = []; for (const region of document.querySelectorAll('[data-live-region]')) new MutationObserver(() => { window.__said.push(region.textContent); }).observe(region, { childList: true, characterData: true, subtree: true }); })()`);
      const said = (text: string) => app.eval<boolean>(`window.__said.some((message) => message.includes(${JSON.stringify(text)}))`);

      // 2. Operate the Start input on the faceplate: the program commands the motor, the plant reaches speed, AtSpeed returns to the program.
      await app.click(css('[data-input="MotorPlant.Start"] button[role="switch"]'), 'the Start switch');
      await patiently('the motor to reach speed', async () => (await fact()) === 'plant.motor.atSpeed' || undefined);
      await patiently('Running to follow the plant', async () => (await outputText('Running')).includes('TRUE') || undefined);
      await patiently('the state to be announced in words', async () => await said('Motor at speed') || undefined);

      // 3. Pause, with the keyboard: the plant stops advancing; Step advances exactly one scan; Play resumes.
      await focus('[data-plant-control="play-pause"]');
      await app.press('Enter');
      await patiently('the plant to say it is paused', async () => (await app.eval<string>(`document.querySelector('[data-plant-scans]')?.textContent ?? ''`)).includes('paused') || undefined);
      const held = await scans();
      await pause(700);
      assert((await scans()) === held, 'The plant advanced while paused.');
      await focus('[data-plant-control="step"]');
      await app.press('Space');
      await patiently('one scan to be stepped', async () => (await scans()) === held + 1 || undefined);
      await pause(500);
      assert((await scans()) === held + 1, 'Step advanced more than one scan.');
      await focus('[data-plant-control="play-pause"]');
      await app.press('Enter');
      await patiently('the plant to run again', async () => (await scans()) > held + 1 || undefined);

      // 4. The fault action, with the keyboard: the motor stalls, never reaches speed, and the program sees it.
      await focus('[data-plant-action="stall"]');
      await app.press('Enter');
      await patiently('the motor to stall', async () => (await fact()) === 'plant.motor.stalled' || undefined);
      await patiently('Running to drop', async () => (await outputText('Running')).includes('FALSE') || undefined);
      await patiently('the stall to be announced in words', async () => await said('Motor stalled') || undefined);
      assert(await app.eval<boolean>(`document.querySelector('[data-plant-action="stall"]')?.getAttribute('aria-pressed') === 'true'`), 'The stall action does not say it is on.');
      assert((await app.eval<string>(`document.querySelector('[data-plant="motor-v1"]')?.getAttribute('aria-label') ?? ''`)).includes('STALL FAULT'), 'The drawing does not name the fault in words.');

      // 5. The recorded run stays, and says it is a replay.
      await app.click(button('Run host scenarios'), 'Run host scenarios');
      await patiently('the replay of the recorded run', async () => (await app.eval<string>(`document.body.innerText`)).includes('Replay of a recorded run') || undefined);
      assert((await app.eval<string>(`document.body.innerText`)).includes('This is a replay'), 'The recorded run is not labelled as a replay.');
    },
  },
  {
    // IDE-005: the reload chord is taken before the page sees it (before-input-event), and a key injected through the DevTools
    // protocol skips that event, so the chord is pressed here by the display server (xdotool) on the window that the headless host still
    // opens on the X display.
    name: '53 Ctrl+R in the development host asks before it discards unsaved work, through a real key press', example: 'motor_start_stop', proves: [], partly: ['IDE-005'],
    run: async (app, { project }) => {
      if (process.platform !== 'linux') notPossible('the real key press is made with xdotool on an X display');
      const xdotool = (...args: string[]) => Bun.spawnSync(['xdotool', ...args], { stdout: 'pipe', stderr: 'pipe' });
      if (!xdotool('version').success) throw new Error('xdotool is not installed: apt-get install xdotool (the Linux journey job installs it).');
      const file = join(project, 'src', 'Motor.st'); const original = disk(file);
      await openFolder(app, project);
      await openFile(app, 'src/Motor.st'); await cursorAtEndOfLine(app, 1); await app.type(EDIT);
      await app.until('the typed text', async () => (await editorText(app)).includes(EDIT) || undefined);
      const window = (await app.until('the application window on the display', async () => {
        const found = xdotool('search', '--onlyvisible', '--name', 'ZPLC');
        return found.success ? found.stdout.toString().trim().split('\n').at(-1) || undefined : undefined;
      }));
      xdotool('windowfocus', '--sync', window);
      const marker = await app.eval<string>(`window.__reloadProbe = 'kept'; window.__reloadProbe`);
      const press = xdotool('key', '--clearmodifiers', 'ctrl+r');
      assert(press.success, `xdotool could not press Ctrl+R: ${press.stderr.toString()}`);
      await app.until('the prompt before the window reloads', async () => await dialogTitle(app) === 'Unsaved changes before you reload' || undefined);
      await app.click(dialogChoice('Cancel'));
      await app.until('the prompt to close', async () => await dialogTitle(app) === null || undefined);
      assert((await editorText(app)).includes(EDIT) && await app.eval<string>('window.__reloadProbe') === marker, 'Cancel must keep the page and its changes: the page reloaded.');
      assert(disk(file) === original, 'The file on disk must be as it was.');
    },
  },
  {
    name: '55 The density setting makes controls and rows smaller on every screen, and the setting is one the person reaches from the Welcome screen', example: 'motor_start_stop', proves: ['UX-008'], partly: [],
    run: async (app, { project }) => {
      /** The sizes the density tokens give: the control and row tokens on the root, and what two kit controls actually measure. */
      const measure = () => app.eval<{ density: string; control: number; row: number; spacing: number; field: number; button: number }>(`(() => {
        const style = getComputedStyle(document.documentElement);
        const height = (selector) => { const element = document.querySelector(selector); return element ? element.getBoundingClientRect().height : Number.NaN; };
        return { density: document.documentElement.dataset.density, control: parseFloat(style.getPropertyValue('--control-height')), row: parseFloat(style.getPropertyValue('--row-height')), spacing: parseFloat(style.getPropertyValue('--spacing')), field: height('[data-setting="density"]'), button: height('.ui-button:not([data-variant="bare"])') };
      })()`);
      await app.click(css('[data-welcome-preferences] summary'), 'the Preferences disclosure of the Welcome screen');
      await app.until('the preferences on the Welcome screen', async () => await app.visible(css('[data-app-preferences]')) || undefined);
      const comfortable = await measure();
      assert(comfortable.density === 'comfortable', `The density starts as ${comfortable.density}.`);

      await selectOption(app, '[data-setting="density"]', 'Compact');
      const compact = await measure();
      assert(compact.density === 'compact', `The root says ${compact.density}, not compact.`);
      for (const key of ['control', 'row', 'spacing', 'field'] as const) {
        assert(compact[key] < comfortable[key], `Compact does not shrink ${key}: ${JSON.stringify({ comfortable, compact })}`);
      }

      // The same setting reaches the other screen: the project workbench measures with the compact tokens.
      await openFolder(app, project);
      const inProject = await measure();
      assert(inProject.density === 'compact' && inProject.control === compact.control && inProject.row === compact.row, `The workbench does not use the compact tokens: ${JSON.stringify(inProject)}`);
      assert(Number.isFinite(inProject.button) && inProject.button <= compact.control + 0.5, `A button of the workbench is taller than the compact control height: ${JSON.stringify(inProject)}`);
    },
  },
];

/** Walks a native select to the option with this text with the arrow keys, as a keyboard user would. */
async function selectOption(app: App, selector: string, label: string): Promise<void> {
  const state = () => app.eval<{ labels: string[]; index: number }>(`(() => { const select = document.querySelector(${JSON.stringify(selector)}); return { labels: [...select.options].map((option) => option.textContent), index: select.selectedIndex }; })()`);
  const { labels, index } = await state();
  const wanted = labels.indexOf(label);
  assert(wanted >= 0, `${selector} offers ${JSON.stringify(labels)}, not ${label}`);
  await app.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  for (let step = 0; step < Math.abs(wanted - index); step++) await app.press(wanted > index ? 'ArrowDown' : 'ArrowUp');
  await app.until(`${selector} to show ${label}`, async () => (await state()).index === wanted || undefined);
}
