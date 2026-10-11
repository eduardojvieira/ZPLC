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
import { contrastRatio } from '../src/theme/color';
import { auditMarkup } from '../src/ui/audit';
import { compilerCompile } from '../src/cli/toolApi';
import { NATIVE_PROGRAM_MAX_BYTES } from '../electron/security';
import { assert, MONACO_MODULE_URL, packageRoot } from './run-desktop-smoke';
import { button, css, launchPackagedApp, menuItem, tab, type App, type Target } from './journeyApp';

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

/** Open a diagram file from the Explorer, and wait for its canvas (`ready` is a selector that exists once the editor has drawn it). */
async function openDiagram(app: App, path: string, ready: string): Promise<void> {
  await clickTreeFile(app, path);
  await app.until(`${path.split('/').at(-1)} on its canvas`, async () => await app.visible(css(ready)) || undefined);
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
  await app.until('the program to run', async () => await app.visible(button('Pause (F6)', 'prefix')) || undefined);
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
 * `packaged` says that the page runs the production policy (`script-src 'self'`): the development host serves its own
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
      await app.click(tab('Explorer', 'exact'));
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
    name: '29 The Welcome screen loads no editor', example: 'motor_start_stop', proves: [], partly: ['IDE-015'],
    run: async (app, { project }) => {
      // What the page has fetched, as modules (the development host serves each one by its path). The page keeps the first
      // 250 resources unless told otherwise, so it is told to keep every one and loaded again from a clean start.
      await app.cdp.command('Page.addScriptToEvaluateOnNewDocument', { source: 'performance.setResourceTimingBufferSize(100000);' });
      await app.cdp.command('Page.reload');
      await app.until('the Welcome screen again', async () => (await app.text()).includes('ZPLC Studio 2.0') || undefined);
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
      await app.click(button('Project Settings'), 'the Project Settings button');
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
      await app.click(menuItem('Export Project Archive'));
      await app.until('the archive on disk', () => existsSync(archive) || undefined);
      await app.until('the export reported in Output', async () => /Exported motor\.zplc\.zip: \d+ files/.test(await outputText(app)) || undefined);
      const entries = readZip(new Uint8Array(readFileSync(archive))).filter((entry) => entry.kind === 'file').map((entry) => entry.path);
      assert(entries.includes('zplc.json') && entries.includes('src/Motor.st'), `The archive does not hold the project files: ${JSON.stringify(entries)}`);
      assert(!entries.some((path) => path.startsWith('.git/') || path.startsWith('node_modules/')), 'The archive holds files that are not part of the project.');

      // Import from the Welcome screen: choosing the archive writes nothing, the dialog says what is in it.
      await app.click(tab('Explorer', 'exact'));
      await app.click(button('Close Project'));
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
      await app.click(tab('Explorer', 'exact'));
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
      await app.click(tab('Explorer', 'exact'));
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
      await app.click(tab('Explorer', 'exact'));
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
      await app.click(tab('Explorer', 'exact'));
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
      await openFolder(app, project);
      await app.click(css('#console-tab-learn'), 'the Learn tab');
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
      await openFolder(app, project);
      await app.click(css('#console-tab-learn'), 'the Learn tab');
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
    name: '40 The component kit behaves from the keyboard in a real window', example: 'none', proves: ['UX-004'], partly: ['UX-001', 'UX-005', 'UX-008', 'UX-024', 'UX-025', 'UX-026'],
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
];
