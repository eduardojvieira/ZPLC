/**
 * The interface budget of spec 013, section 8.1: how many controls the command bar holds, how many tabs of the results panel
 * show their name, how many items the status rail has and how many times the target is shown, counted on the running
 * application. Task W0 of the M1 plan writes it and records the 2.0.0 baseline with it; Task W10 turns the counts into a CI
 * check against the targets (interfaceBudget.targets.json).
 *
 *   bun scripts/interfaceBudget.ts --out <file.json>        measure Blinky at 1366 by 768 and 1440 by 900, in English and in
 *                                                           Spanish, open, built, running in simulation and paused
 *   bun scripts/interfaceBudget.ts --check                  the same measurement, then exit 1 naming every count over its target
 *                                                           (the state, the language, the viewport and the control)
 *
 * The counting functions are pure and work on an `InterfaceSnapshot`, a plain record of what the page showed, so they are
 * checked on a stored snapshot (interfaceBudget.test.ts). Only `capture` and `main` need the application: the same journey
 * harness as `run-journeys.ts` (a Vite dev server and an Electron development host, headless, native POSIX runtime). Nothing
 * here touches a board.
 */
import { translate } from '../src/i18n/translate';
import type { Locale } from '../src/i18n/locale';

export type BudgetState = 'open' | 'built' | 'running' | 'paused';

export interface InterfaceSnapshot {
  locale: Locale;
  viewport: { width: number; height: number };
  state: BudgetState;
  commandBar: {
    /** Left edge of the project name, in page pixels; null when the bar shows none. */
    projectNameX: number | null;
    /** The interactive controls of the bar, with the room they take (a control of zero width is not shown). */
    controls: Array<{ label: string; x: number; width: number }>;
  };
  /** The strip that holds the tabs of the results panel. */
  tabStrip: { left: number; right: number } | null;
  resultsTabs: Array<{
    id: string;
    name: string;
    /** The width the name takes on screen: about one pixel when it is there for screen readers only. */
    nameWidth: number;
    left: number;
    right: number;
  }>;
  /** The buttons that are the transport (Run, Pause or Resume with their shortcut) anywhere in the page: sets of run controls. */
  runControlSets: number;
  /** The items of the status rail, one text each, separators and the details control left out. */
  statusRail: Array<{ text: string }>;
}

/** A name that takes more than this many pixels is on screen (the visually hidden class clips it to one). */
const NAME_VISIBLE_PX = 4;

export function commandBarCounts(snapshot: InterfaceSnapshot): { left: number; right: number; total: number } {
  const { projectNameX, controls } = snapshot.commandBar;
  const shown = controls.filter((control) => control.width > 0);
  const left = shown.filter((control) => projectNameX === null || control.x + control.width / 2 < projectNameX).length;
  return { left, right: shown.length - left, total: shown.length };
}

export function resultsTabCounts(snapshot: InterfaceSnapshot): { total: number; named: number; namedIds: string[]; unnamedIds: string[] } {
  const strip = snapshot.tabStrip;
  const isNamed = (tab: InterfaceSnapshot['resultsTabs'][number]): boolean =>
    tab.nameWidth > NAME_VISIBLE_PX && (strip === null || (tab.left >= strip.left - 1 && tab.right <= strip.right + 1));
  const namedIds = snapshot.resultsTabs.filter(isNamed).map((tab) => tab.id);
  const unnamedIds = snapshot.resultsTabs.filter((tab) => !isNamed(tab)).map((tab) => tab.id);
  return { total: snapshot.resultsTabs.length, named: namedIds.length, namedIds, unnamedIds };
}

/** The first line of each item of the status rail: the label of a detail, or the whole text of an item that has none. */
export const statusRailItems = (snapshot: InterfaceSnapshot): string[] =>
  snapshot.statusRail.map((item) => item.text.split('\n')[0]!.trim());

/**
 * Where the snapshot shows the target (where Run goes): the mode selector of the command bar, and each item of the status rail
 * that names the mode in the words of the interface or is the Target detail.
 */
export function targetPlaces(snapshot: InterfaceSnapshot): string[] {
  const { locale } = snapshot;
  const places: string[] = [];
  // the selector's label is "Where the run goes: <target>"; the words before the target tell it from every other control
  const selectorPrefix = translate(locale, 'studio.flow.target.title', { target: '' }).trim();
  if (snapshot.commandBar.controls.some((control) => control.width > 0 && control.label.startsWith(selectorPrefix)))
    places.push('command bar: target selector');
  const words = [translate(locale, 'statusText.mode.simulation'), translate(locale, 'statusText.mode.hardware')].map((word) =>
    word.toLowerCase(),
  );
  const targetLabel = translate(locale, 'status.target').toLowerCase();
  for (const item of snapshot.statusRail) {
    const first = item.text.split('\n')[0]!.trim();
    const lowered = item.text.toLowerCase();
    if (words.some((word) => lowered.includes(word)) || first.toLowerCase() === targetLabel) places.push(`status rail: ${first}`);
  }
  return places;
}

// ---------------------------------------------------------------------------------------------------------------------
// Capture and run (need the application)
// ---------------------------------------------------------------------------------------------------------------------

/** The page expression that records what `InterfaceSnapshot` needs, with the interface names of one language. */
export function captureExpression(locale: Locale): string {
  const toolbar = translate(locale, 'toolbar.label');
  const status = translate(locale, 'status.label');
  const panels = translate(locale, 'console.workbenchPanels');
  const [run, pause, resume] = ['toolbar.run.label', 'toolbar.pause.label', 'toolbar.resume.label'].map((key) =>
    translate(locale, key as Parameters<typeof translate>[1]),
  );
  return `(() => {
    const box = (element) => element.getBoundingClientRect();
    const bar = document.querySelector('[role="toolbar"][aria-label=${JSON.stringify(toolbar)}]');
    const name = document.querySelector('[data-project-name]');
    const controlSelector = 'button, select, input, a[href], [role="switch"], [role="radio"], [role="menuitem"]';
    const controls = bar ? [...bar.querySelectorAll(controlSelector)]
      .filter((element) => getComputedStyle(element).visibility !== 'hidden')
      .map((element) => ({
        label: element.getAttribute('aria-label') ?? (element.textContent ?? '').trim(),
        x: Math.round(box(element).x),
        width: Math.round(box(element).width),
      })) : [];
    const strip = document.querySelector('[role="tablist"][aria-label=${JSON.stringify(panels)}]');
    const tabs = [...document.querySelectorAll('[role="tab"][id^="console-tab-"]')].map((tab) => {
      const label = [...tab.querySelectorAll('span')]
        .find((span) => (span.textContent ?? '').trim() !== '' && !span.classList.contains('ml-1'));
      return {
        id: tab.id.replace('console-tab-', ''),
        name: (label?.textContent ?? '').trim(),
        nameWidth: label ? Math.round(box(label).width) : 0,
        left: Math.round(box(tab).left),
        right: Math.round(box(tab).right),
      };
    });
    const rail = document.querySelector('section[aria-label=${JSON.stringify(status)}] [data-status-line]');
    const items = rail ? [...rail.querySelectorAll('[data-status-item]')]
      .map((child) => ({ text: (child.innerText ?? '').trim() })) : [];
    const transport = [${JSON.stringify(run)}, ${JSON.stringify(pause)}, ${JSON.stringify(resume)}];
    const sets = [...document.querySelectorAll('button')]
      .filter((element) => box(element).width > 0 && transport.some((word) => (element.getAttribute('aria-label') ?? '').startsWith(word + ' (')))
      .length;
    return { runControlSets: sets, commandBar: { projectNameX: name ? Math.round(box(name).x) : null, controls },
      tabStrip: strip ? { left: Math.round(box(strip).left), right: Math.round(box(strip).right) } : null,
      resultsTabs: tabs, statusRail: items };
  })()`;
}

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
] as const;
const LOCALES: Locale[] = ['en', 'es'];

export interface BudgetSample {
  locale: Locale;
  viewport: { width: number; height: number };
  state: BudgetState;
  commandBar: ReturnType<typeof commandBarCounts> & { labels: string[] };
  resultsTabs: ReturnType<typeof resultsTabCounts>;
  runControlSets: number;
  statusRail: { count: number; items: string[] };
  targetPlaces: string[];
}

export function measure(snapshot: InterfaceSnapshot): BudgetSample {
  const { locale, viewport, state } = snapshot;
  return {
    locale,
    viewport,
    state,
    commandBar: {
      ...commandBarCounts(snapshot),
      labels: snapshot.commandBar.controls.filter((control) => control.width > 0).map((c) => c.label),
    },
    resultsTabs: resultsTabCounts(snapshot),
    runControlSets: snapshot.runControlSets,
    statusRail: { count: snapshot.statusRail.length, items: statusRailItems(snapshot) },
    targetPlaces: targetPlaces(snapshot),
  };
}

async function runLocale(locale: Locale): Promise<BudgetSample[]> {
  const { cpSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { button, css, launchApp, menuItem, startHarness } = await import('./journeyApp');
  const { packageRoot } = await import('./run-desktop-smoke');
  const ui = (key: Parameters<typeof translate>[1]): string => translate(locale, key);
  const { harness, scratch, stop } = await startHarness();
  const root = mkdtempSync(join(scratch, 'budget-'));
  const project = join(root, 'project');
  cpSync(join(packageRoot, 'projects', 'blinky'), project, { recursive: true });
  const launched = await launchApp(harness, root);
  const app = launched.app;
  const samples: BudgetSample[] = [];
  const sample = async (state: BudgetState) => {
    for (const viewport of VIEWPORTS) {
      await app.cdp.command('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
      await app.until(
        `the window to be ${viewport.width} wide`,
        async () => (await app.eval<number>('window.innerWidth')) === viewport.width || undefined,
      );
      await new Promise((resolve) => setTimeout(resolve, 600)); // the layout that follows a resize
      const captured = await app.eval<Omit<InterfaceSnapshot, 'locale' | 'viewport' | 'state'>>(captureExpression(locale));
      samples.push(measure({ locale, viewport, state, ...captured }));
    }
  };
  try {
    if (locale !== 'en') {
      await app.eval(
        `(() => { const key = 'zplc-ide-settings'; const stored = JSON.parse(localStorage.getItem(key) || '{}'); const target = ` +
          `stored.settings ?? stored; target.language = ${JSON.stringify(locale)}; localStorage.setItem(key, JSON.stringify(stored)); })()`,
      );
      await app.cdp.command('Page.reload');
    }
    await app.until('the Welcome screen', async () => (await app.visible(button(ui('welcome.open.title'), 'contains'))) || undefined);
    app.answer(project);
    await app.click(button(ui('welcome.open.title'), 'contains'), 'the Open project button');
    await app.until('the project workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
    await sample('open');
    await app.click(button(ui('toolbar.build.label')), 'the Build button');
    await app.click(menuItem(ui('toolbar.compile.text')), 'Compile');
    await app.until(
      'a build result',
      async () =>
        /\b\d+ (bytes|bytes\b)/.test(
          await app.eval<string>(`document.querySelector('[role="tabpanel"][id^="console-panel-"]')?.innerText ?? ''`),
        ) || undefined,
    );
    await sample('built');
    // Run is one action in simulation: the session is implicit, nothing to connect (FLW-001, FLW-008)
    await app.click(button(`${ui('toolbar.run.label')} (F5)`, 'prefix'), 'Run');
    await app.until(
      'the program to run',
      async () => (await app.visible(button(`${ui('toolbar.pause.label')} (F6)`, 'prefix'))) || undefined,
    );
    await sample('running');
    await app.click(button(`${ui('toolbar.pause.label')} (F6)`, 'prefix'), 'Pause');
    await app.until(
      'the program to pause',
      async () => (await app.visible(button(ui('toolbar.resume.label'), 'prefix'))) || undefined,
      60_000,
    );
    await sample('paused');
  } finally {
    await launched.stop();
    await stop();
  }
  return samples;
}

export interface BudgetTargets {
  commandBar: { simulation: { left: number; right: number; total: number }; board: { left: number; right: number } };
  statusRailItems: number;
  targetPlaces: number;
  runControlSets: number;
  resultsTabs: { total: number; reason: string };
}

/** Every count over its target, one line each, naming the state, the language, the viewport and the controls that make it. */
export function checkBudget(samples: BudgetSample[], targets: BudgetTargets): string[] {
  const violations: string[] = [];
  for (const sample of samples) {
    const where = `${sample.locale} ${sample.state} ${sample.viewport.width}x${sample.viewport.height}`;
    const over = (what: string, count: number, limit: number, names: string[]) => {
      if (count > limit) violations.push(`${where}: ${what} has ${count}, over ${limit} (${names.join(', ')})`);
    };
    const bar = targets.commandBar.simulation;
    over('command bar, left of the project name', sample.commandBar.left, bar.left, sample.commandBar.labels);
    over('command bar, right of the project name', sample.commandBar.right, bar.right, sample.commandBar.labels);
    over('command bar', sample.commandBar.total, bar.total, sample.commandBar.labels);
    over('status rail', sample.statusRail.count, targets.statusRailItems, sample.statusRail.items);
    over('the target shown', sample.targetPlaces.length, targets.targetPlaces, sample.targetPlaces);
    over('run controls', sample.runControlSets, targets.runControlSets, ['Run, Pause or Resume of the page']);
    over('results panel tabs', sample.resultsTabs.total, targets.resultsTabs.total, [...sample.resultsTabs.namedIds, ...sample.resultsTabs.unnamedIds]);
  }
  return violations;
}

/** The numbers of rows 2, 3, 4, 6, 7 and 8 of spec 013 section 8.1, from the samples at 1366 by 768. */
export function budgetRows(samples: BudgetSample[]) {
  const at = (locale: Locale, state: BudgetState) =>
    samples.find((sample) => sample.locale === locale && sample.state === state && sample.viewport.width === 1366)!;
  const en = at('en', 'running');
  return {
    '2 tabs in the results panel by default': at('en', 'open').resultsTabs.total,
    '3 results tabs shown with their name at 1366 by 768': Object.fromEntries(
      LOCALES.map((locale) => [locale, `${at(locale, 'running').resultsTabs.named} of ${at(locale, 'running').resultsTabs.total}`]),
    ),
    '4 sets of run controls that act on the simulation': en.runControlSets,
    '6 controls in the command bar while a simulation runs': en.commandBar.total,
    '7 items in the status rail while a simulation runs': en.statusRail.count,
    '8 times the target is shown': en.targetPlaces.length,
  };
}

async function main(): Promise<void> {
  const { parseArgs } = await import('node:util');
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { out: { type: 'string' }, check: { type: 'boolean' } } });
  const samples: BudgetSample[] = [];
  for (const locale of LOCALES) samples.push(...(await runLocale(locale)));
  const record = {
    what:
      'The interface of the M1 state (U0 and U1) against spec 013 section 8.1 (rows 2, 3, 4, 6, 7 and 8), ' +
      'measured on the running application by scripts/interfaceBudget.ts',
    runtime: 'Electron development host, headless, native POSIX runtime; example Blinky; Linux only (no macOS or Windows evidence)',
    measuredOn: new Date().toISOString().slice(0, 10),
    rows: budgetRows(samples),
    samples,
  };
  const text = `${JSON.stringify(record, null, 2)}\n`;
  if (values.out) await Bun.write(values.out, text);
  else if (!values.check) console.log(text);
  if (values.check) {
    const targets = (await Bun.file(new URL('./interfaceBudget.targets.json', import.meta.url)).json()) as BudgetTargets;
    const violations = checkBudget(samples, targets);
    console.log(`interface budget: ${samples.length} samples, ${violations.length} over their target`);
    for (const violation of violations) console.error(`  over budget: ${violation}`);
    process.exit(violations.length === 0 ? 0 : 1);
  }
  process.exit(0);
}

if (import.meta.main) await main();
