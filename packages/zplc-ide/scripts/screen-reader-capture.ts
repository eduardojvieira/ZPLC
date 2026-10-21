/**
 * The recorded screen-reader check (UX-028, LRN-037): the eight steps of docs/docs/development/screen-reader-check.md plus the
 * Learn path, walked with the keyboard alone against the real Electron development host, in English and then in Spanish.
 * Each step writes a screenshot and the accessibility record of the focused element and of the live regions (see
 * screenReaderRecorder.ts), and is judged by the script's own criterion: would a person who cannot see the screen have known where
 * they are and what to do? The result is docs/static/img/screen-reader-check/<date>/results.json and the screenshots.
 *
 *   bun run scripts/screen-reader-capture.ts [--date YYYY-MM-DD] [--out <folder>] [--language en|es] [--only <id,id>] [--strict]
 *
 * It needs a display (DISPLAY, ELECTRON_OZONE_PLATFORM_HINT=x11) and a built native runtime (ZPLC_NATIVE_SIM_BIN), like
 * `bun run smoke:journeys`. It is a recorded check on this machine, not a screen reader on Windows or macOS.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { translate } from '../src/i18n/translate';
import { LESSON_INDEX } from '../src/generated/lessonIndex';
import { courseOrder } from '../src/learn/course';
import { packageRoot, assert } from './run-desktop-smoke';
import { launchApp, startHarness, type App } from './journeyApp';
import { Recorder, type StepRecord } from './screenReaderRecorder';

type Language = 'en' | 'es';
const REPOSITORY = join(packageRoot, '..', '..');
const argument = (name: string) => { const at = process.argv.indexOf(`--${name}`); return at >= 0 ? process.argv[at + 1] : undefined; };
const DATE = argument('date') ?? new Date().toISOString().slice(0, 10);
const OUT = argument('out') ?? join(REPOSITORY, 'docs', 'static', 'img', 'screen-reader-check', DATE);
const ONLY = argument('only')?.split(',');
const LANGUAGES = (argument('language') ? [argument('language') as Language] : ['en', 'es']) as Language[];

const toolbarSelector = '[role="toolbar"][aria-label]';
const inEditor = `el.closest('.monaco-editor') !== null`;
/** Monaco's text input: a textarea, or the contenteditable element of its edit context. */
const editorInput = `${inEditor} && (el.matches('textarea') || el.getAttribute('role') === 'textbox' || el.isContentEditable)`;

/** Everything one language run needs to say in the words of the interface, from the same catalogs the app reads. */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (language: Language) => {
  const t = (key: string, values?: Record<string, string | number>) => translate(language, key, values);
  return {
    t,
    openProject: t('welcome.open.title'), learn: t('welcome.learn.title'),
    connect: t('toolbar.connect'), disconnect: t('command.online.disconnect'),
    addVariable: t('workbench.watch.addVariable'), releaseAll: t('workbench.watch.releaseAll'),
    paletteWatch: t('command.view.watch'), paletteProblems: t('command.view.problems'), paletteOutput: t('command.view.output'),
    paletteProject: t('command.view.showProject'), paletteLearn: t('command.view.showLearn'),
    buildOk: new RegExp(escape(t('toolbarMsg.buildSucceeded'))), buildFailed: new RegExp(escape(t('toolbarMsg.buildFailed'))),
    simulatorReady: new RegExp(escape(t('toolbarMsg.simulatorReady'))),
    running: new RegExp(`^${escape(t('toolbarMsg.status.running'))}$`),
  };
};

interface Session { app: App; recorder: Recorder; language: Language; project: string; stop(): Promise<void> }

/** The code editor's own text input, reached backwards from the bottom panel (the sticky-scroll line is a stop on the way). */
async function reachEditor(rec: Recorder): Promise<void> {
  const target = editorInput;
  await rec.reach('the code editor', target, 'Shift+Tab', 8, false).catch(() => rec.reach('the code editor', target, 'Tab', 80));
}

async function palette(rec: Recorder, app: App, title: string): Promise<void> {
  await rec.key('Ctrl+Shift+P', 'open the command palette');
  await app.until('the command palette', async () => await app.eval<boolean>(`Boolean(document.querySelector('[role="dialog"] [role="combobox"]'))`) || undefined);
  await rec.stop('the command palette is open');
  await rec.type(title);
  await rec.key('Enter', `run "${title}"`);
  await app.until('the palette to close', async () => !await app.eval<boolean>(`Boolean(document.querySelector('[role="dialog"] [role="combobox"]'))`) || undefined);
  await rec.stop('after the palette closes');
}

const selectedTab = (app: App) => app.eval<string>(`(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? '').trim()`);

// ---------------------------------------------------------------------------------------------------------------------
// The eight steps
// ---------------------------------------------------------------------------------------------------------------------

async function stepOpen({ app, recorder: rec, language, project }: Session): Promise<void> {
  const w = words(language);
  rec.begin('1', 'Open', 'Welcome names every control, the walk by Tab is finite and in reading order, and Open project lands focus inside the workbench.');
  rec.fact('windowTitle', await app.eval<string>('document.title'));
  rec.fact('heading', await app.eval<string>(`document.querySelector('h1')?.textContent ?? ''`));
  rec.fact('documentLanguage', await app.eval<string>('document.documentElement.lang'));
  await rec.stop('the window has just opened', true);
  app.answer(project);
  const seen: string[] = [];
  let wrapped = false;
  for (let step = 0; step < 90; step++) {
    const stop = await rec.key('Tab', 'Tab on the Welcome screen');
    const key = `${stop.focus?.role}|${stop.focus?.name}`;
    if (seen.length > 0 && key === seen[0]) { wrapped = true; break; }
    seen.push(key);
    const onOpen = await app.eval<boolean>(`document.activeElement?.textContent?.includes(${JSON.stringify(w.openProject)}) === true`);
    if (onOpen && seen.length > 6 && seen.some((entry) => entry.includes(w.learn))) break;
  }
  rec.fact('welcomeStops', String(seen.length));
  rec.check('the walk by Tab on Welcome reaches Learn and Open project', seen.some((entry) => entry.includes(w.learn)) && seen.some((entry) => entry.includes(w.openProject)), seen.slice(0, 8).join(' > '));
  rec.check('no keyboard trap on Welcome (Tab keeps moving)', new Set(seen).size > 3 || wrapped, `${seen.length} stops`);
  await rec.reach('the Open project button', `el.textContent.includes(${JSON.stringify(w.openProject)})`, 'Tab', 90);
  await rec.shot('1-welcome-open-project');
  await rec.key('Enter', 'activate Open project', true);
  await app.until('the project workbench', async () => await app.visible(`document.querySelector(${JSON.stringify(toolbarSelector)})`) || undefined);
  const after = await rec.stop('after the project opens');
  rec.check('focus is inside the workbench after the project opens, not on the page body', after.focus !== null, JSON.stringify(after.focus?.within ?? []));
  await rec.shot('1-workbench');
  rec.end();
}

async function stepEdit({ app, recorder: rec }: Session): Promise<void> {
  rec.begin('2', 'Edit', 'The file is opened from the file tree, the editor is announced as a text input, the tab as selected, and a save is announced.');
  await rec.key('Ctrl+Shift+E', 'show the project navigator');
  await rec.reach('the row of main.st in the file tree', `el.textContent.includes('main.st')`, 'Tab', 60);
  rec.fact('fileRow', (await rec.focus())?.spoken ?? '');
  await rec.key('Enter', 'open main.st');
  await app.until('main.st in the code editor', async () => (await app.eval<string>(`window.monaco?.editor.getModels()[0]?.getValue() ?? ''`)).includes('PROGRAM Blinky') || undefined, 30_000)
    .catch(async () => { await Bun.sleep(1_500); });
  await rec.reach('the code editor', inEditor, 'Tab', 80);
  rec.fact('selectedTab', await selectedTab(app));
  await rec.key('Ctrl+End', 'go to the end of the program');
  await rec.type('\n(* checked with the keyboard *)');
  await rec.stop('after typing a comment');
  await rec.key('Ctrl+S', 'save');
  await rec.expectAnnounced('the save is announced in the status region', /Saved|guard/i);
  await rec.shot('2-editor-saved');
  // The editor takes Tab as a character. Ctrl+M (Monaco's Tab focus mode) is the way out; a person must be able to learn it from the editor itself.
  const editor = await rec.stop('the editor, before looking for the way out');
  rec.fact('editorDescription', editor.focus?.description ?? '');
  rec.check('the editor tells a screen reader user how to move focus out with Tab (Ctrl+M)', /Ctrl\+M|Control\+M/i.test(`${editor.focus?.description} ${editor.focus?.name}`), `name "${editor.focus?.name}", description "${editor.focus?.description}"`);
  await rec.key('Ctrl+M', 'Ctrl+M: Tab moves focus');
  await rec.expectAnnounced('the change of Tab behavior is announced', /Tab|focus|foco|tabulaci/i, 4_000);
  const away = await rec.key('Tab', 'Tab leaves the editor');
  rec.check('Tab leaves the editor after Ctrl+M (no keyboard trap)', away.focus !== null && !away.focus.within.some((entry) => entry.role === 'region' && entry.name === 'Editor' && away.focus!.role === 'textbox'), away.focus?.spoken ?? '');
  rec.end();
}

async function stepBuild({ app, recorder: rec, language, project }: Session): Promise<void> {
  const w = words(language);
  const original = readFileSync(join(packageRoot, 'projects', 'blinky_st', 'src', 'main.st'), 'utf8') + '\n(* checked with the keyboard *)';
  void project;
  rec.begin('3', 'Build', 'The result of the build is announced (success politely, failure in the alert region), and the diagnostics of Problems are readable with file, line and message.');
  await rec.key('Ctrl+B', 'build');
  await rec.expectAnnounced('a successful build is announced', w.buildOk, 30_000);
  await palette(rec, app, w.paletteOutput);
  rec.fact('outputTail', (await app.eval<string>(`document.querySelector('[role="log"], [data-output-log], #console-panel-output')?.textContent ?? document.body.innerText`)).slice(-160));
  await rec.shot('3-build-succeeded');
  // A broken program: the failure goes to the alert region and the diagnostic to Problems.
  await reachEditor(rec);
  await rec.key('Ctrl+End', 'go to the end of the program');
  await rec.type('\nBROKEN @@ ;');
  await rec.key('Ctrl+S', 'save the broken program');
  await rec.key('Ctrl+B', 'build the broken program');
  await rec.expectAnnounced('a failed build is announced', w.buildFailed, 30_000);
  rec.check('the failure arrives in an assertive region', rec.said(w.buildFailed).some((entry) => entry.region === 'assertive'), JSON.stringify(rec.said(w.buildFailed)));
  await palette(rec, app, w.paletteProblems);
  await rec.reach('a diagnostic of Problems', `/BROKEN|main\\.st:|line \\d|:\\d+/.test(el.textContent ?? '') && el.closest('[role="tabpanel"], [aria-label]') !== null && !el.closest('.monaco-editor')`, 'Tab', 10).catch(() => undefined);
  rec.fact('problemsText', (await app.eval<string>(`document.querySelector('[role="tabpanel"]')?.textContent ?? ''`)).slice(0, 200));
  await rec.shot('3-build-failed-problems');
  // restore the program: the original text replaces the broken one, and is saved
  await pasteIntoEditor(app, original);
  await reachEditor(rec);
  await rec.key('Ctrl+A', 'select the program');
  await rec.key('Ctrl+V', 'paste the original program');
  await rec.key('Ctrl+S', 'save');
  rec.end();
}

async function stepSimulate({ app, recorder: rec, language }: Session): Promise<void> {
  const w = words(language);
  rec.begin('4', 'Simulate', 'Connect and Run are reachable by name, the toolbar messages are announced, and the status bar says running.');
  await rec.key('Ctrl+B', 'build');
  await rec.expectAnnounced('the build is announced', w.buildOk, 30_000);
  await rec.reach('the Connect button of the toolbar', `el.closest('[role="toolbar"]') !== null && (el.getAttribute('aria-label') ?? el.textContent ?? '').includes(${JSON.stringify(w.connect)})`, 'Tab', 60)
    .catch(async () => { rec.fact('connectVia', 'the command palette (the toolbar button was not reached with Tab)'); await palette(rec, app, w.connect); });
  if (!rec.steps.at(-1)!.facts.connectVia) await rec.key('Enter', 'activate Connect');
  await app.until('the simulation to connect', async () => await app.eval<boolean>(`[...document.querySelectorAll('button')].some((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').includes(${JSON.stringify(w.disconnect)}))`) || undefined, 30_000);
  await rec.expectAnnounced('the connection is announced', w.simulatorReady);
  await rec.key('F5', 'Run');
  await rec.expectAnnounced('running is announced, in the interface language', w.running);
  const status = await app.eval<string>(`document.querySelector('[aria-label="Operational status"], [role="status"]')?.textContent ?? ''`);
  rec.fact('statusBar', status.replace(/\s+/g, ' ').slice(0, 120));
  rec.check('the status bar says that the program runs', /RUN|Running|En ejecuci|Ejecut/i.test(await app.eval<string>(`document.querySelector('[aria-label="Operational status"]')?.innerText ?? document.body.innerText`)), status.slice(0, 80));
  await rec.shot('4-simulating');
  rec.end();
}

async function stepWatch({ app, recorder: rec, language }: Session): Promise<void> {
  const w = words(language);
  rec.begin('5', 'Watch', 'The Watch tab takes the focus, a variable is added with the keyboard, its row is read with name and value, and the value changes.');
  await palette(rec, app, w.paletteWatch);
  rec.check('the Watch tab holds the focus after the command', await app.eval<boolean>(`document.activeElement?.id === 'console-tab-watch'`), JSON.stringify((await rec.focus())?.spoken));
  await rec.reach('the Add variable button', `(el.getAttribute('aria-label') ?? el.textContent ?? '').trim() === ${JSON.stringify(w.addVariable)}`, 'Tab', 20);
  await rec.key('Enter', 'Add variable');
  await rec.reach('the variable field', `el.matches('input')`, 'Tab', 6).catch(() => undefined);
  await rec.type('LED_Output');
  await rec.key('Enter', 'add LED_Output');
  const values: string[] = [];
  for (let sample = 0; sample < 8; sample++) { values.push(await app.eval<string>(`(() => { const row = [...document.querySelectorAll('[role="row"], tr')].find((r) => (r.textContent ?? '').includes('LED_Output')); return (row?.textContent ?? '').replace(/\\s+/g, ' ').trim(); })()`)); await Bun.sleep(350); }
  rec.fact('rowSamples', JSON.stringify([...new Set(values)]));
  rec.check('the row of LED_Output is in the table with a value', values.some((row) => /TRUE|FALSE/.test(row)), values[0] ?? '');
  const states = new Set(values.map((row) => /TRUE/.test(row) ? 'TRUE' : /FALSE/.test(row) ? 'FALSE' : '?'));
  rec.check('the value is seen changing between TRUE and FALSE', states.has('TRUE') && states.has('FALSE'), [...states].join(', '));
  rec.fact('valueChangesAreNotAnnounced', 'by design: a value that changes twice a second is read by moving to its row, not announced; the row is named and its value is readable');
  await rec.shot('5-watch-row');
  rec.end();
}

async function stepForce({ app, recorder: rec, language }: Session): Promise<void> {
  const w = words(language);
  rec.begin('6', 'Force', 'A force is made, released, and released all at once, each announced; losing the connection with a force active raises the alert.');
  const forceBox = `el.matches('input[type="checkbox"]') && (el.getAttribute('aria-label') ?? '').includes('LED_Output')`;
  await rec.reach('the Force checkbox of LED_Output', forceBox, 'Tab', 25);
  await rec.key('Space', 'force LED_Output');
  await rec.expectAnnounced('the force is announced', /forced|forzad/i);
  await rec.key('Space', 'release the force');
  await rec.expectAnnounced('the release is announced', /released|liber/i);
  await rec.key('Space', 'force again');
  await rec.expectAnnounced('the second force is announced', /forced|forzad/i);
  // Release all forces is a physical-device action (it is disabled in the simulator), so the announcement that several forces were released together is not reachable here.
  rec.fact('releaseAll', 'not reachable in the simulator: the button is disabled without a device; the words are covered by the unit tests of the force announcements');
  await rec.key('Space', 'release the force');
  await rec.expectAnnounced('the second release is announced', /released|liber/i);
  // Force once more and lose the connection: the alert region must say that a force is unconfirmed.
  await rec.key('Space', 'force LED_Output again');
  await palette(rec, app, w.disconnect);
  // In the simulator, ending the connection clears the forces (they are the simulator's own); only a physical device keeps a force that nobody confirms.
  await rec.expectAnnounced('ending the connection says that the force was released', /released|liber/i, 8_000);
  rec.fact('unconfirmedAlert', 'not reachable in the simulator: it needs a device that keeps a force after the link is lost; the assertive announcement is covered by the unit tests of the force announcements');
  await rec.shot('6-force-after-disconnect');
  rec.end();
}

async function stepDeploy({ app, recorder: rec }: Session): Promise<void> {
  rec.begin('7', 'Deploy dialog', 'The dialog moves focus in, keeps it in, names itself and its table, and returns focus to the control that opened it. Opened with the product\'s own dialog and fixed device facts: no board was connected.');
  const trigger = await rec.stop('the control that has the focus before the dialog opens');
  const open = () => app.eval(`(async () => {
    const { confirmDeploy } = await import('/src/components/deployConfirm.tsx');
    const facts = { project: { name: 'Pump station', board: 'STM32F746G Discovery', boardProfile: 'stm32f746g_disco/stm32f746xx', abi: { major: 1, minor: 0, draft: 6 }, sha256: 'a1b2c3d4e5f6a7b8c9d0', byteLength: 512, taskCount: 2 }, device: { board: 'stm32f746g_disco', boardProfile: 'stm32f746g_disco/stm32f746xx', zplcVersion: '1.0.0', zephyrVersion: '4.0.0', abi: { major: 1, minor: 0 }, draft: 6, maxArtifactBytes: 4096, maxTasks: 4 }, declaredSafe: [], transfer: 'framed' };
    window.__deployAnswer = 'asking';
    confirmDeploy({ facts }, true).then((answer) => { window.__deployAnswer = answer; });
  })()`);
  // a cold Vite cache reloads the page while the dialog module is first fetched; the second call finds it warm
  await open().catch(async () => { await Bun.sleep(3_000); await app.until('the page after a reload', async () => await app.eval<boolean>('document.readyState === "complete"') || undefined); await open(); });
  await app.until('the deploy dialog', async () => await app.visible(`document.querySelector('[role="alertdialog"]')`) || undefined);
  const opened = await rec.stop('the deploy dialog has opened');
  rec.check('focus moves into the dialog on open', opened.focus?.within.some((entry) => entry.role === 'alertdialog') === true, JSON.stringify(opened.focus?.within ?? []));
  rec.check('the dialog has a name and a description', Boolean(opened.focus?.within.find((entry) => entry.role === 'alertdialog')?.name), JSON.stringify(opened.focus?.within ?? []));
  rec.fact('dialogText', (await app.eval<string>(`document.querySelector('[role="alertdialog"]')?.innerText ?? ''`)).replace(/\s+/g, ' ').slice(0, 300));
  rec.fact('tableCaption', await app.eval<string>(`document.querySelector('[role="alertdialog"] table caption')?.textContent ?? '(no caption)'`));
  await rec.shot('7-deploy-dialog');
  let inside = true;
  for (let press = 0; press < 5; press++) { await rec.key('Tab', 'Tab inside the dialog'); inside &&= await app.eval<boolean>(`document.activeElement?.closest('[role="alertdialog"]') !== null`); }
  rec.check('Tab stays inside the dialog', inside);
  await rec.key('Escape', 'Escape closes the dialog');
  await app.until('the dialog to close', async () => !await app.visible(`document.querySelector('[role="alertdialog"]')`) || undefined);
  const back = await rec.stop('after the dialog closes');
  rec.check('focus returns to the control that opened the dialog', back.focus?.element === trigger.focus?.element && back.focus?.name === trigger.focus?.name, `before ${trigger.focus?.spoken}; after ${back.focus?.spoken}`);
  rec.check('Escape refuses the deploy', (await app.eval<unknown>('window.__deployAnswer')) === false);
  rec.end();
}

// ---------------------------------------------------------------------------------------------------------------------
// The Learn path (LRN-037)
// ---------------------------------------------------------------------------------------------------------------------

/** Puts text on the clipboard of the page and pastes it into the focused editor, as a person pasting a solution would. */
async function pasteIntoEditor(app: App, content: string): Promise<void> {
  await app.eval(`(() => { const area = document.createElement('textarea'); area.value = ${JSON.stringify(content)}; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); })()`);
}

async function stepLearn({ app, recorder: rec, language }: Session): Promise<void> {
  const w = words(language);
  const [first] = courseOrder(LESSON_INDEX).map(({ id }) => id) as [string];
  const entry = LESSON_INDEX.lessons.find(({ id }) => id === first)!;
  const solution = readFileSync(join(packageRoot, 'projects', entry.solution.project, entry.solution.program), 'utf8');
  rec.begin('8', 'One Learn lesson', 'The Learn home is read in order, a lesson starts from the keyboard, its stages are named, the check result is announced, and the restore action says what it did.');
  await rec.reach('the Learn button of Welcome', `(el.textContent ?? '').trim().startsWith(${JSON.stringify(w.learn)})`, 'Tab', 90);
  await rec.key('Enter', 'activate Learn');
  await app.until('the Learn home', async () => await app.visible(`document.querySelector('[data-learn-home]')`) || undefined);
  const home = await rec.stop('the Learn home has opened');
  rec.check('focus is in the Learn home after it opens, not on the page body', home.focus !== null);
  rec.fact('homeHeading', await app.eval<string>(`document.querySelector('[data-learn-home] h1, [data-learn-home] h2, h1')?.textContent ?? ''`));
  rec.fact('modules', await app.eval<string>(`String(document.querySelectorAll('[data-learn-module]').length)`));
  // the controls of the home, in reading order
  const order: string[] = [];
  await rec.reach('Continue', `el.hasAttribute('data-learn-continue')`, 'Tab', 12).catch(async () => { await app.eval(`document.querySelector('[data-learn-continue]')?.focus()`); await rec.stop('focus placed on Continue (Tab did not reach it)'); });
  order.push('continue');
  await rec.shot('8-learn-home');
  for (let step = 0; step < 6; step++) {
    const stop = await rec.key('Tab', 'Tab through the Learn home');
    order.push(await app.eval<string>(`(() => { const el = document.activeElement; return el.hasAttribute('data-learn-unlock-all') ? 'unlock' : el.hasAttribute('data-learn-hide-solutions') ? 'hide' : el.hasAttribute('data-learn-export') ? 'export' : el.hasAttribute('data-learn-import') ? 'import' : el.hasAttribute('data-learn-start') ? 'start' : 'other'; })()`));
    void stop;
  }
  rec.fact('homeOrder', order.join(' > '));
  rec.check('Tab walks the Learn home in reading order (Continue, the two switches, Export, Import)', ['continue', 'unlock', 'hide', 'export', 'import'].every((name, index) => order[index] === name), order.join(' > '));
  // a switch announces its change
  await rec.reach('the Unlock all lessons switch', `el.hasAttribute('data-learn-unlock-all')`, 'Shift+Tab', 8);
  await rec.key('Space', 'flip Unlock all lessons');
  await rec.expectAnnounced('the switch change is announced', /unlocked|desbloquead/i);
  // start the course
  await rec.reach('Continue', `el.hasAttribute('data-learn-continue')`, 'Shift+Tab', 8);
  await rec.key('Enter', 'Start the course', true);
  await app.until('the lesson beside the editor', async () => await app.eval<boolean>(`document.querySelector('[data-activity="learn"]')?.getAttribute('aria-current') === 'true' && document.querySelector('[data-learn-home]') === null && Boolean(document.getElementById('learn-title'))`) || undefined, 60_000);
  const opened = await rec.stop('the lesson has opened');
  rec.check('focus is somewhere in the workbench after the lesson opens', opened.focus !== null);
  rec.fact('lessonTitle', await app.eval<string>(`document.getElementById('learn-title')?.textContent?.trim() ?? ''`));
  const panel = `document.getElementById('learn-title').closest('section')`;
  const headings = await app.eval<string[]>(`[document.getElementById('learn-title'), ...${panel}.querySelectorAll('h3')].map((h) => h.textContent.trim())`);
  rec.fact('lessonHeadings', JSON.stringify(headings));
  rec.check('the lesson has a heading and a named heading per stage', headings.length >= 3, JSON.stringify(headings));
  rec.fact('stagesList', await app.eval<string>(`${panel}.querySelector('ol')?.getAttribute('aria-label') ?? '(unnamed list)'`));
  await rec.shot('8-lesson-panel');
  // a hint: a disclosure that says whether it is open
  await rec.reach('the first hint', `el.tagName === 'SUMMARY' && el.closest('details') !== null`, 'Shift+Tab', 60);
  await rec.key('Enter', 'open the first hint');
  const hint = await rec.stop('the first hint is open');
  rec.check('a hint disclosure says that it is expanded', hint.focus?.states.some((state) => state.startsWith('expanded')) === true, hint.focus?.spoken ?? '');
  // the edit: the reference solution replaces the program in the editor, then Check
  await pasteIntoEditor(app, solution);
  await rec.reach('the code editor', editorInput, 'Tab', 120);
  await rec.key('Ctrl+A', 'select the program');
  await rec.key('Ctrl+V', 'paste the solution');
  await rec.key('Ctrl+S', 'save');
  await rec.key('Ctrl+M', 'Ctrl+M: Tab moves focus');
  await rec.reach('the Check button', `el.hasAttribute('data-learn-check')`, 'Shift+Tab', 80, false).catch(() => rec.reach('the Check button', `el.hasAttribute('data-learn-check')`, 'Tab', 120));
  rec.check('Check is a named button', Boolean(rec.steps.at(-1)!.stops.at(-1)?.focus?.name), rec.steps.at(-1)!.stops.at(-1)?.focus?.spoken ?? '');
  await rec.key('Enter', 'Check');
  await app.until('the lesson to be graded as passed', async () => await app.eval<boolean>(`document.querySelector('[data-learn-grade="passed"]') !== null`) || undefined, 90_000);
  await rec.expectAnnounced('the result of the check is announced', new RegExp(escape(w.t('learn.grade.passed.title'))), 10_000);
  await rec.shot('8-check-passed');
  // restore the starter
  await rec.reach('the restore action', `el.hasAttribute('data-learn-reset')`, 'Tab', 60);
  await rec.key('Enter', 'restore the starter');
  await app.until('the confirmation', async () => await app.visible(`document.querySelector('[role="alertdialog"]')`) || undefined);
  const confirmation = await rec.stop('the confirmation to restore the starter');
  rec.check('the confirmation is an alert dialog that holds the focus', confirmation.focus?.within.some((entry) => entry.role === 'alertdialog') === true, JSON.stringify(confirmation.focus?.within));
  await rec.shot('8-restore-confirmation');
  await rec.reach('the confirm button', `el.closest('[role="alertdialog"]') !== null && (el.hasAttribute('data-confirm') || /restor|restaur|restablec/i.test(el.textContent ?? ''))`, 'Tab', 6);
  await rec.key('Enter', 'confirm');
  await rec.expectAnnounced('the restore is announced', new RegExp(escape(w.t('learn.reset.done'))), 10_000);
  rec.end();
}

/** LRN-037: the plant of a lesson is operated with the keyboard and each state of its animation is said in words. */
async function stepPlant({ app, recorder: rec, language, project }: Session): Promise<void> {
  const w = words(language);
  const lesson = LESSON_INDEX.lessons.find(({ plant }) => plant === 'motor-v1')!;
  rec.begin('9', 'A plant lesson', 'The plant is operated with the keyboard, every state of its animation has a text equivalent that is announced, and the fault action says it is on.');
  app.answer(project);
  await rec.reach('the Learn button of Welcome', `(el.textContent ?? '').trim().startsWith(${JSON.stringify(w.learn)})`, 'Tab', 90);
  await rec.key('Enter', 'activate Learn');
  await app.until('the Learn home', async () => await app.visible(`document.querySelector('[data-learn-home]')`) || undefined);
  await rec.reach('the start of the motor plant lesson', `el.getAttribute('data-learn-start') === ${JSON.stringify(lesson.id)}`, 'Tab', 200);
  await rec.key('Enter', 'start the motor plant lesson', true);
  await app.until('the workbench', async () => await app.visible(`document.querySelector(${JSON.stringify(toolbarSelector)})`) || undefined, 60_000);
  await rec.stop('the lesson workspace has opened');
  await rec.key('Ctrl+B', 'build');
  await rec.expectAnnounced('the build is announced', w.buildOk, 60_000);
  await palette(rec, app, w.connect);
  await app.until('the simulation to connect', async () => await app.eval<boolean>(`[...document.querySelectorAll('button')].some((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').includes(${JSON.stringify(w.disconnect)}))`) || undefined, 30_000);
  await rec.key('F5', 'Run');
  // the Lab tab, by the tab list
  await palette(rec, app, w.paletteWatch);
  await rec.reach('the Lab tab', `el.id === 'console-tab-lab'`, 'ArrowRight', 12);
  await rec.key('Enter', 'open the Lab tab');
  await app.until('the live motor plant', async () => await app.eval<boolean>(`Boolean(document.querySelector('[data-plant="motor-v1"]'))`) || undefined, 45_000);
  const state = async (label: string) => {
    const picture = await app.eval<string>(`document.querySelector('[data-plant="motor-v1"]')?.getAttribute('aria-label') ?? ''`);
    const fact = await app.eval<string>(`document.querySelector('[data-plant-fact]')?.getAttribute('data-plant-fact') ?? ''`);
    const roleOfPicture = await app.eval<string>(`document.querySelector('[data-plant="motor-v1"]')?.getAttribute('role') ?? '(none)'`);
    rec.fact(`state ${label}`, JSON.stringify({ fact, picture, role: roleOfPicture }));
    return { fact, picture };
  };
  const stopped = await state('stopped');
  rec.check('the stopped plant has a text equivalent', stopped.picture.length > 10 && stopped.fact === 'plant.motor.stopped', JSON.stringify(stopped));
  await rec.shot('9-plant-stopped');
  // operate Start on the faceplate with the keyboard
  await rec.reach('the Start switch of the faceplate', `el.getAttribute('role') === 'switch' && Boolean(el.closest('[data-input="MotorPlant.Start"]'))`, 'Tab', 60);
  await rec.key('Space', 'turn Start on');
  await app.until('the motor to reach speed', async () => (await state('at speed')).fact === 'plant.motor.atSpeed' || undefined, 45_000);
  await rec.expectAnnounced('the change of state is announced in words', new RegExp(escape(w.t('plant.motor.atSpeed', { speed: '' }).split(',')[0]!)), 15_000);
  await rec.shot('9-plant-at-speed');
  // pause, step and the fault action
  await rec.reach('the pause control', `el.getAttribute('data-plant-control') === 'play-pause'`, 'Shift+Tab', 40, false).catch(() => rec.reach('the pause control', `el.getAttribute('data-plant-control') === 'play-pause'`, 'Tab', 60));
  await rec.key('Enter', 'pause the plant');
  await rec.stop('the plant is paused');
  rec.fact('pausedText', await app.eval<string>(`document.querySelector('[data-plant-scans]')?.textContent ?? ''`));
  await rec.key('Enter', 'play again');
  await rec.reach('the stall fault action', `el.getAttribute('data-plant-action') === 'stall'`, 'Tab', 20, false).catch(() => rec.reach('the stall fault action', `el.getAttribute('data-plant-action') === 'stall'`, 'Shift+Tab', 30));
  await rec.key('Enter', 'switch the stall fault on');
  await app.until('the motor to stall', async () => (await state('stalled')).fact === 'plant.motor.stalled' || undefined, 45_000);
  await rec.expectAnnounced('the stall is announced in words', new RegExp(escape(w.t('plant.motor.stalled', { speed: '' }).split(' ')[0]! + ' ' + w.t('plant.motor.stalled', { speed: '' }).split(' ')[1]!)), 15_000);
  const stall = await rec.stop('the stall action');
  rec.check('the fault action says that it is on', stall.focus?.states.includes('pressed') === true, stall.focus?.spoken ?? '');
  rec.check('the drawing names the fault in words', /STALL|atasc/i.test((await state('stalled picture')).picture));
  await rec.shot('9-plant-stalled');
  rec.end();
}

// ---------------------------------------------------------------------------------------------------------------------

async function runStep(session: Session, id: string, run: (s: Session) => Promise<void>): Promise<void> {
  if (ONLY && !ONLY.includes(id)) return;
  console.log(`step ${id} (${session.language})`);
  try { await run(session); } catch (error) {
    const step = session.recorder.steps.at(-1);
    if (step && step.result === 'pass' && !session.recorder.steps.at(-1)!.checks.some((check) => !check.ok)) {
      step.checks.push({ description: 'the step ran to its end', ok: false, detail: error instanceof Error ? error.message.split('\n')[0]! : String(error) });
    } else step?.checks.push({ description: 'the step ran to its end', ok: false, detail: error instanceof Error ? error.message.split('\n')[0]! : String(error) });
    if (step) { step.checks.unshift(...[]); step.result = 'fail'; }
    await session.recorder.shot(`${id}-failed`).catch(() => undefined);
    console.error(`step ${id} (${language(session)}) stopped: ${error instanceof Error ? error.message : error}`);
  }
}
const language = (session: Session) => session.language;

/** One launch of the app in one language: a fresh profile, the language set the way the settings screen sets it, the recorder ready. */
async function withSession(harness: Awaited<ReturnType<typeof startHarness>>['harness'], scratch: string, lang: Language, example: string | null, unlockAll: boolean, onDemand: boolean, body: (session: Session) => Promise<void>): Promise<Recorder> {
  const root = mkdtempSync(join(scratch, 'sr-'));
  const project = join(root, 'project');
  if (example) cpSync(join(packageRoot, 'projects', example), project, { recursive: true }); else mkdirSync(project);
  const launched = await launchApp(harness, root);
  // This machine runs other work at the same time and a call can wait longer than the protocol allows: a read is asked again, a key press never is.
  const send = launched.app.cdp.command.bind(launched.app.cdp);
  launched.app.cdp.command = async (method, params) => {
    for (let attempt = 1; ; attempt++) {
      try { return await send(method, params); } catch (error) {
        if (method.startsWith('Input.') || attempt >= 4 || !/timed out|collected/i.test(error instanceof Error ? error.message : String(error))) throw error;
        await Bun.sleep(2_000);
      }
    }
  };
  const recorder = new Recorder(launched.app, OUT, lang, 0.75, onDemand);
  try {
    // The settings the person would have chosen, stored the way the app stores them, and the window started again from them.
    await launched.app.eval(`(() => { const key = 'zplc-ide-settings'; const stored = JSON.parse(localStorage.getItem(key) || '{}'); const target = stored.settings ?? stored; target.language = ${JSON.stringify(lang)}; target.unlockAllLessons = ${unlockAll}; localStorage.setItem(key, JSON.stringify(stored)); })()`);
    await launched.app.cdp.command('Page.reload');
    await launched.app.until('the Welcome screen', async () => await launched.app.eval<boolean>(`Boolean(document.querySelector('h1')) && document.documentElement.lang === ${JSON.stringify(lang)}`) || undefined, 60_000);
    await launched.app.cdp.command('Emulation.setFocusEmulationEnabled', { enabled: true });
    await launched.app.cdp.command('Page.bringToFront');
    await recorder.prepare();
    await body({ app: launched.app, recorder, language: lang, project, stop: launched.stop });
  } finally {
    await launched.stop();
    rmSync(root, { recursive: true, force: true });
  }
  return recorder;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const { harness, scratch, stop } = await startHarness();
  const all: Record<string, { steps: StepRecord[]; live: unknown }> = {};
  const images: Recorder['images'] = [];
  try {
    for (const lang of LANGUAGES) {
      all[lang] = { steps: [], live: [] };
      const keep = (recorder: Recorder) => { all[lang]!.steps.push(...recorder.steps); images.push(...recorder.images); };
      keep(await withSession(harness, scratch, lang, 'blinky_st', false, true, async (session) => {
        for (const [id, step] of [['1', stepOpen], ['2', stepEdit], ['3', stepBuild], ['4', stepSimulate], ['5', stepWatch], ['6', stepForce], ['7', stepDeploy]] as const) await runStep(session, id, step);
        all[lang]!.live = await session.recorder.liveRegions().catch(() => []);
      }));
      keep(await withSession(harness, scratch, lang, null, false, true, async (session) => { await runStep(session, '8', stepLearn); }));
      keep(await withSession(harness, scratch, lang, null, true, true, async (session) => { await runStep(session, '9', stepPlant); }));
    }
  } finally { await stop(); }
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPOSITORY, encoding: 'utf8' }).stdout.trim();
  // A run of one language keeps what an earlier run of the other language recorded in the same folder.
  const earlier = existsSync(join(OUT, 'results.json')) ? JSON.parse(readFileSync(join(OUT, 'results.json'), 'utf8')) as { languages?: typeof all; images?: Recorder['images'] } : {};
  const kept = Object.fromEntries(Object.entries(earlier.languages ?? {}).filter(([lang]) => !LANGUAGES.includes(lang as Language)));
  images.unshift(...(earlier.images ?? []).filter((image) => Object.keys(kept).some((lang) => image.file.startsWith(`${lang}-`))));
  Object.assign(all, kept);
  const results = { schemaVersion: 1, date: DATE, commit, command: 'bun run packages/zplc-ide/scripts/screen-reader-capture.ts', method: 'Linux, Chromium accessibility tree over the DevTools protocol, keyboard only, real Electron development host', languages: Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b))), images };
  writeFileSync(join(OUT, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  let failed = 0;
  for (const [lang, run] of Object.entries(all)) for (const step of run.steps) { if (step.result === 'fail') failed += 1; console.log(`${lang} ${step.id} ${step.title}: ${step.result}${step.checks.filter((check) => !check.ok).map((check) => `\n    - ${check.description}: ${check.detail}`).join('')}`); }
  console.log(`\nscreen-reader-capture: ${Object.values(all).reduce((sum, run) => sum + run.steps.length, 0)} steps, ${failed} failed, written to ${OUT}`);
  if (process.argv.includes('--strict') && failed > 0) process.exit(1);
}

assert(existsSync(join(packageRoot, 'node_modules', 'electron', 'dist')), 'Electron is not installed');
if (import.meta.main) await main();
