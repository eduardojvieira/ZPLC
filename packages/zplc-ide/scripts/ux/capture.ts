/**
 * The capture tool of spec 014 (UXV-003, UXV-004): every surface of screens.md that a command opens, in the covering set of
 * conditions of D-36, captured without a person and measured for the defects a machine can find.
 *
 *   bun scripts/ux/capture.ts [--out <folder>] [--surface <id>]... [--condition <name>]...
 *
 * The folder (default `<repository>/.cache/claude-ux-review/uxv`) gets `<surface>--<state>--<condition>.png` for each capture,
 * `manifest.json` (every capture with its measures and defects, and every surface the tool cannot reach yet, with why) and one
 * `sheet-<area>.html` per section of screens.md. It exits 1 when any capture has a measured defect.
 *
 * What is fixed so that two runs on one build give the same picture: the data (Blinky with one I/O point and the assembler
 * scene, at one path under the output folder), the window size and scale, the language, the theme and the density, set
 * through the stores before anything is shown; motion (reduced motion, no animation, no transition, no caret); and the plant
 * time, because nothing here runs the program or the plant: the virtual clock stays at zero.
 *
 * The same journey harness as run-journeys.ts and interfaceBudget.ts: a Vite dev server and a headless Electron development
 * host with the native POSIX runtime, one fresh profile per condition. Nothing here touches a board, deploys, forces or runs.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { translate } from '../../src/i18n/translate';
import { clippersOf, findTextOutOfBox } from '../textFit';
import {
  captureName,
  captureRecord,
  defectSummary,
  conditionName,
  conditionsFor,
  manifestText,
  parseScreens,
  type CaptureRecord,
  type Condition,
  type Surface,
} from './manifest';
import { collectMeasurement, type Measurement } from './measurement';
import type { Harness } from '../journeyApp';

const REPOSITORY = resolve(import.meta.dir, '..', '..', '..', '..');
const SCREENS = join(REPOSITORY, 'specs', '014-zplc-2-1-release-quality', 'screens.md');

/** Commands a capture must not run: they close the project, act on a board or a program, or start long work. */
const NEVER = new RegExp(
  '^(file\\.(closeProject|open|export)|online\\.|debug\\.|learn\\.|' +
    'build\\.(runAllTests|runFailedTests|checkInterlocks)|plant\\.(createDeclarations|endEdit))',
);
/** The surfaces the open workbench shows with no command, and the state they are in there. */
const ON_OPEN: Array<[string, string]> = [
  ['shell.commandBar', 'idle'],
  ['shell.activityRail', 'normal'],
  ['shell.status', 'idle'],
  ['activity.project', 'normal'],
];
/** The language editors, each opened on its file of the fixture project, and the name its tab shows. */
const EDITORS: Record<string, { file: string; tab: string; body: string }> = {
  'editor.ld': { file: 'src/main.ld.json', tab: 'main.ld', body: '[data-ld-rung-id]' },
  'editor.st': { file: 'src/main.st', tab: 'main.st', body: '.monaco-editor .view-lines' },
  'editor.il': { file: 'src/main.il', tab: 'main.il', body: '.monaco-editor .view-lines' },
  'editor.fbd': { file: 'src/main.fbd.json', tab: 'main.fbd', body: '.react-flow__node' },
  'editor.sfc': { file: 'src/main.sfc.json', tab: 'main.sfc', body: '.react-flow__node' },
};
/** Surfaces reached another way than their command of screens.md, or that cannot be reached yet, and why. */
const SPECIAL: Record<string, { command: string; click: string; state: string } | { unreached: string }> = {
  // plant.edit is pending in the command registry: the Edit scene button of the 3D view is the way in
  'plant.editor': { command: 'view.plant', click: '[data-plant-edit-scene]', state: 'parts' },
  'dialog.importArchive': {
    unreached:
      'opened by the Import a project archive button of the Welcome screen, which asks for an archive file through a native ' +
      'dialog the capture cannot answer yet; screens.md maps it to file.export and file.exportProjectJson, which export instead',
  },
  'secondary.guide': {
    unreached:
      'view.guide is pending in the command registry (no handler yet), and the Guide shows only while a lesson workspace is ' +
      'open, which only a learn command starts',
  },
};
const STILL = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }';

interface Plan {
  surface: Surface;
  state: string;
  command: string | null;
  /** A file of the fixture project to open instead of a command. */
  open?: string;
  /** A control to click once the command ran. */
  click?: string;
}

/** The page expression that is true when the surface shows; null for a surface the tool has no marker for. */
export function markerOf(surface: string, locale: 'en' | 'es'): string | null {
  const sel = (selector: string) => `Boolean(document.querySelector(${JSON.stringify(selector)}))`;
  const tab = (view: string) => sel(`[id="editor-tab-${view}"][aria-selected="true"]`);
  const activity = (view: string) => sel(`[data-activity="${view}"][aria-current="true"]`);
  const secondary = (key: 'shell.secondary.inspector' | 'shell.secondary.assistant' | 'shell.secondary.lesson') =>
    `[...document.querySelectorAll('[data-sidebar-kind="secondary"] h2')]` +
    `.some((heading) => heading.textContent.trim() === ${JSON.stringify(translate(locale, key))})`;
  const editor = EDITORS[surface];
  if (editor)
    return (
      `[...document.querySelectorAll('[id^="editor-tab-"][aria-selected="true"]')]` +
      `.some((tab) => tab.textContent.includes(${JSON.stringify(editor.tab)})) && ${sel(editor.body)}`
    );
  const [area, rest] = [surface.slice(0, surface.indexOf('.')), surface.slice(surface.indexOf('.') + 1)];
  if (area === 'results') return sel(`[role="tabpanel"][aria-labelledby="console-tab-${rest}"]`);
  if (surface.startsWith('editor.config.')) return tab(`config:${surface.slice('editor.config.'.length)}`);
  const markers: Record<string, string> = {
    'shell.welcome': sel('[data-welcome-preferences]'),
    'shell.commandBar': sel('[data-command-bar]'),
    'shell.activityRail': sel('[data-activity-rail]'),
    'shell.status': sel('[data-status-line]'),
    'shell.statusDetails': sel(
      '[data-command="view.statusDetails"][aria-expanded="true"], [data-command="view.statusDetails"][data-state="open"]',
    ),
    'activity.project': activity('project'),
    'activity.search': activity('search'),
    'activity.tests': activity('tests'),
    'activity.tests.interlocks': sel('[data-interlocks-view]'),
    'activity.plant': activity('plant'),
    'activity.learn': activity('learn'),
    'secondary.inspector': secondary('shell.secondary.inspector'),
    'secondary.assistant': secondary('shell.secondary.assistant'),
    'secondary.guide': secondary('shell.secondary.lesson'),
    'editor.settings': tab('settings'),
    'editor.preferences': `${tab('preferences')} && ${sel('[data-preferences-document]')}`,
    'editor.learn': sel('[data-learn-home]'),
    'editor.changes': tab('review:changes'),
    'editor.plant': `${tab('plant')} && ${sel('[data-plant-document]')}`,
    'plant.editor': sel('[data-plant-editor]'),
    'dialog.palette': sel('[role="dialog"] [role="combobox"]'),
    'dialog.shortcuts': sel('[data-shortcut-group]'),
    'dialog.newProject': sel('[data-new-project]'),
    'dialog.explorer': sel('[data-entry-dialog]'),
    'dialog.generatedCode': sel('[role="dialog"]'),
  };
  return markers[surface] ?? null;
}

/** Which surfaces this tool reaches, how, and in which state; the others with the reason. */
export function plan(surfaces: Surface[]): { reached: Plan[]; unreached: Array<{ surface: string; reason: string }> } {
  const reached: Plan[] = [];
  const unreached: Array<{ surface: string; reason: string }> = [];
  for (const surface of surfaces) {
    const special = SPECIAL[surface.id];
    if (special && 'unreached' in special) {
      unreached.push({ surface: surface.id, reason: special.unreached });
      continue;
    }
    if (special) {
      reached.push({ surface, state: special.state, command: special.command, click: special.click });
      continue;
    }
    if (surface.id === 'shell.welcome') {
      reached.push({ surface, state: 'normal', command: null });
      continue;
    }
    const open = ON_OPEN.find(([id]) => id === surface.id);
    if (open) {
      reached.push({ surface, state: open[1], command: null });
      continue;
    }
    const editor = EDITORS[surface.id];
    if (editor) {
      reached.push({ surface, state: 'normal', command: null, open: editor.file });
      continue;
    }
    if (surface.area === 'Outside Studio') {
      unreached.push({ surface: surface.id, reason: 'outside Studio: an installer window or the documentation site' });
      continue;
    }
    const commands = surface.reachedBy.filter((command) => !NEVER.test(command));
    // a command that shows the surface over one that toggles it, which could hide it
    const command = commands.find((candidate) => !candidate.startsWith('view.toggle')) ?? commands[0];
    if (!command) {
      unreached.push({
        surface: surface.id,
        reason:
          surface.reachedBy.length > 0 ? `only by commands a capture must not run: ${surface.reachedBy.join(', ')}` : 'no command opens it',
      });
      continue;
    }
    if (markerOf(surface.id, 'en') === null) {
      unreached.push({ surface: surface.id, reason: `${command} opens it, but the tool has no marker to tell that it shows` });
      continue;
    }
    reached.push({ surface, state: surface.states[0]!, command });
  }
  return { reached, unreached };
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function sheet(area: string, captures: CaptureRecord[]): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const escape = (text: string) => text.replace(/[&<>"]/g, (character) => entities[character]!);
  const list = (capture: CaptureRecord) =>
    capture.defects.length === 0
      ? ''
      : `<ul>${capture.defects.map((defect) => `<li>${escape(`${defect.kind}: ${defect.where}: ${defect.detail}`)}</li>`).join('')}</ul>`;
  const figures = captures
    .map(
      (capture) =>
        `<figure><img src="${escape(capture.file)}" alt="${escape(capture.name)}" loading="lazy">` +
        `<figcaption><b>${escape(capture.name)}</b>${list(capture)}</figcaption></figure>`,
    )
    .join('\n');
  return (
    `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>UXV: ${escape(area)}</title><style>` +
    'body{font:14px system-ui;margin:24px;background:#f4f4f4}figure{display:inline-block;vertical-align:top;margin:0 16px 24px 0;' +
    'width:480px;background:#fff;padding:8px}img{width:100%;border:1px solid #ccc}li{color:#a00}</style></head><body>' +
    `<h1>${escape(area)}</h1>\n${figures}\n</body></html>\n`
  );
}

/** The editor tabs, the layout and the results panel of the open workbench, to go back to before each surface. */
const BASELINE = `(async () => {
  const { useShellLayout } = await import('/src/store/useShellLayout.ts');
  const { useIDEStore } = await import('/src/store/useIDEStore.ts');
  const plain = (state) => Object.fromEntries(Object.entries(state).filter(([, value]) => typeof value !== 'function'));
  const ide = useIDEStore.getState();
  return {
    tabs: [...document.querySelectorAll('[id^="editor-tab-"]')].map((tab) => tab.id),
    layout: JSON.parse(JSON.stringify(plain(useShellLayout.getState()))),
    console: { activeConsoleTab: ide.activeConsoleTab, isConsoleCollapsed: ide.isConsoleCollapsed },
  };
})()`;
const RESET = (baseline: unknown) => `(async (baseline) => {
  const { useShellLayout } = await import('/src/store/useShellLayout.ts');
  const { useIDEStore } = await import('/src/store/useIDEStore.ts');
  // close every editor tab the open workbench did not have, with the close button beside it
  for (let round = 0; round < 10; round++) {
    const extra = [...document.querySelectorAll('[id^="editor-tab-"]')].filter((tab) => !baseline.tabs.includes(tab.id));
    if (extra.length === 0) break;
    for (const tab of extra) tab.parentElement?.querySelector('button:not([role="tab"])')?.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  document.getElementById(baseline.tabs[0] ?? '')?.click();
  useShellLayout.setState(baseline.layout);
  useIDEStore.setState(baseline.console);
  await new Promise((resolve) => requestAnimationFrame(() => resolve(true)));
  for (const element of document.querySelectorAll('*'))
    if (element.scrollTop !== 0 || element.scrollLeft !== 0) element.scrollTo(0, 0);
  return true;
})(${JSON.stringify(baseline)})`;

async function captureCondition(
  condition: Condition,
  plans: Plan[],
  surfaces: Surface[],
  project: string,
  out: string,
  shared: { harness: Harness; scratch: string },
): Promise<ConditionRun> {
  const { launchApp, button, css } = await import('../journeyApp');
  const ui = (key: Parameters<typeof translate>[1]) => translate(condition.locale, key);
  const { harness, scratch } = shared;
  const launched = await launchApp(harness, mkdtempSync(join(scratch, 'uxv-')));
  const app = launched.app;
  const captures: CaptureRecord[] = [];
  const failed: Array<{ surface: string; reason: string }> = [];
  const notes: string[] = [];
  const strips = [`[role="tablist"][aria-label=${JSON.stringify(ui('workbench.editor.views'))}]`, '[data-ld-rung-id] .overflow-x-auto'];
  const collect = (focus: boolean) =>
    app.eval<Omit<Measurement, 'textOutOfBox'>>(
      `(${collectMeasurement.toString()})(${JSON.stringify({ locale: condition.locale, focus })}, ${clippersOf.toString()})`,
    );

  const still = async () => {
    await app.eval(
      `(() => { let s = document.getElementById('uxv-still'); if (!s) { s = document.createElement('style'); s.id = 'uxv-still'; ` +
        `document.head.append(s); } s.textContent = ${JSON.stringify(STILL)}; })()`,
    );
  };
  /**
   * The region-error screen, or the workbench's own failure screen, shown when a module request was dropped (Chromium's
   * net::ERR_NETWORK_CHANGED reaches localhost too): its Retry is clicked once. True when it clicked.
   */
  let retried = false;
  const recoverOnce = async (where: string): Promise<boolean> => {
    if (retried) return false;
    const clicked = await app.eval<boolean>(
      `(() => { const failure = document.querySelector('[data-region-error]') ?? ` +
        `(document.body.innerText.includes(${JSON.stringify(ui('app.workbenchFailedTitle'))}) ? document.body : null); ` +
        `if (!failure) return false; const retry = [...failure.querySelectorAll('button')]` +
        `.find((button) => button.textContent.trim() === ${JSON.stringify(ui('common.retry'))}); ` +
        `if (!retry) return false; retry.click(); return true; })()`,
    );
    if (clicked) {
      retried = true;
      const note = `${conditionName(condition)}: a failure screen showed at ${where}; Retry was clicked once`;
      notes.push(note);
      console.log(note);
    }
    return clicked;
  };
  /** Polls a page expression until it is true, clicking a failure screen's Retry once on the way; false when time runs out. */
  const showing = async (expression: string, where: string, timeoutMs = 30_000): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await app.eval<boolean>(`(() => { try { return Boolean(${expression}); } catch { return false; } })()`)) return true;
      await recoverOnce(where);
      await Bun.sleep(200);
    }
    return false;
  };
  const take = async (plan: Plan) => {
    const name = captureName(surfaces, plan.surface.id, plan.state, condition);
    await app.eval('document.fonts.ready.then(() => true)');
    await Bun.sleep(400);
    if (await app.eval<boolean>('document.activeElement instanceof HTMLElement')) await app.eval('document.activeElement.blur()');
    // the picture once two in a row are the same: a layout that follows a command can still be settling
    let previous = '';
    let data = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      data = ((await app.cdp.command('Page.captureScreenshot', { format: 'png' })) as { data: string }).data;
      if (data === previous) break;
      previous = data;
      await Bun.sleep(250);
    }
    writeFileSync(join(out, `${name}.png`), Buffer.from(data, 'base64'));
    const page = await collect(false);
    const textOutOfBox = await app.eval<string[]>(`(${findTextOutOfBox.toString()})(${JSON.stringify(strips)})`);
    // the focus pass last, after the picture: focusing can open a tooltip. A key first (Shift, which closes nothing), so that
    // programmatic focus counts as keyboard focus for :focus-visible.
    for (const type of ['keyDown', 'keyUp'])
      await app.cdp.command('Input.dispatchKeyEvent', { type, key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    const focused = await collect(true);
    const rings = new Map(focused.elements.map((element) => [`${element.name}@${element.rect.x},${element.rect.y}`, element.focusRing]));
    for (const element of page.elements) element.focusRing = rings.get(`${element.name}@${element.rect.x},${element.rect.y}`) ?? null;
    captures.push(captureRecord(name, plan.surface.id, plan.state, condition, { ...page, textOutOfBox }));
  };
  /** Measures the surface only once its marker shows; otherwise records that the wrong surface was on screen. */
  const takeIfShowing = async (plan: Plan) => {
    if (await showing(markerOf(plan.surface.id, condition.locale)!, plan.surface.id)) await take(plan);
    else failed.push({ surface: plan.surface.id, reason: 'not reached: wrong surface (its marker never showed)' });
  };
  const run = async (command: string): Promise<string> =>
    app.eval<string>(
      `import('/src/commands/bus.ts').then(({ runCommand }) => runCommand(${JSON.stringify(command)}, { respectEnabled: true }))`,
    );
  const openFile = async (path: string): Promise<string> =>
    app.eval<string>(
      `(async () => { const { useIDEStore } = await import('/src/store/useIDEStore.ts'); const state = useIDEStore.getState(); ` +
        `const find = (node) => node.path === ${JSON.stringify(path)} ? node : (node.children ?? []).map(find).find(Boolean); ` +
        `const node = state.fileTree && find(state.fileTree); if (!node) return 'missing'; ` +
        `await state.openFile(node.id); return 'ran'; })()`,
    );

  try {
    await app.cdp.command('Emulation.setDeviceMetricsOverride', {
      width: condition.width,
      height: condition.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await app.cdp.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await app.eval(
      `(async () => { const { useAppSettings } = await import('/src/store/useAppSettings.ts'); ` +
        `const { useIDEStore } = await import('/src/store/useIDEStore.ts'); ` +
        `useAppSettings.getState().update(${JSON.stringify({ language: condition.locale, density: condition.density })}); ` +
        `useIDEStore.getState().setTheme(${JSON.stringify(condition.theme)}); return true; })()`,
    );
    await app.until(
      'the window and the language to apply',
      async () =>
        (await app.eval<boolean>(
          `window.innerWidth === ${condition.width} && document.documentElement.lang.startsWith(${JSON.stringify(condition.locale)})`,
        )) || undefined,
    );
    await still();
    await app.until('the Welcome screen', async () => (await app.visible(button(ui('welcome.open.title'), 'contains'))) || undefined);
    const welcome = plans.find((plan) => plan.surface.id === 'shell.welcome');
    if (welcome) await takeIfShowing(welcome);

    app.answer(project);
    await app.click(button(ui('welcome.open.title'), 'contains'), 'the Open project button');
    if (!(await showing(`document.querySelector('[role="toolbar"]')`, 'the opening of the project', 60_000)))
      throw new Error('Timed out waiting for the project workbench');
    await still();
    const baseline = await app.eval<unknown>(BASELINE);
    const reset = async () => {
      for (let i = 0; i < 2; i++) await app.press('Escape');
      await app.eval(RESET(baseline));
    };

    for (const plan of plans.filter((candidate) => candidate.surface.id !== 'shell.welcome')) {
      try {
        await reset();
        const how = plan.command ?? (plan.open ? `open ${plan.open}` : null);
        const outcome = plan.command ? await run(plan.command) : plan.open ? await openFile(plan.open) : 'ran';
        if (outcome !== 'ran') {
          failed.push({ surface: plan.surface.id, reason: `${how} is ${outcome} with the fixture project open` });
          continue;
        }
        if (plan.click) {
          const ready = await showing(
            `(() => { const b = document.querySelector(${JSON.stringify(plan.click)}); return b && !b.disabled; })()`,
            plan.click,
          );
          if (!ready) {
            failed.push({ surface: plan.surface.id, reason: `${plan.click} is not there or not enabled after ${how}` });
            continue;
          }
          await app.click(css(plan.click), plan.click);
        }
        await still();
        await takeIfShowing(plan);
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
        failed.push({ surface: plan.surface.id, reason: `${plan.command ?? plan.open ?? 'the open workbench'}: ${message}` });
      }
    }
  } catch (error) {
    // what the window showed and what the app logged when the condition stopped, so the failure can be read afterwards
    const shot = `${conditionName(condition)}--failure.png`;
    try {
      // a hung renderer never answers: five seconds, then the log alone
      const picture = (await Promise.race([
        app.cdp.command('Page.captureScreenshot', { format: 'png' }),
        Bun.sleep(5_000).then(() => null),
      ])) as { data: string } | null;
      if (picture) writeFileSync(join(out, shot), Buffer.from(picture.data, 'base64'));
    } catch {
      /* the window is gone: the log has to say it */
    }
    const message = error instanceof Error ? error.message : String(error);
    const errors = app.errors.length > 0 ? `\nrenderer errors:\n${app.errors.slice(-10).join('\n')}` : '';
    throw new Error(`${message}\npicture: ${shot}${errors}\napplication log (last 4000 characters):\n${app.log().slice(-4_000)}`);
  } finally {
    await launched.stop();
  }
  return { captures, failed, notes };
}

export interface ConditionRun {
  captures: CaptureRecord[];
  failed: Array<{ surface: string; reason: string }>;
  /** What the run had to do that a person would not, such as clicking Retry on a failure screen. */
  notes?: string[];
}

export interface RunResult {
  captures: CaptureRecord[];
  /** Surfaces a command did not open, each with the condition it failed in. */
  failed: Array<{ surface: string; reason: string }>;
  /** Conditions that stopped before their last capture, with the error. */
  failedConditions: Array<{ condition: string; error: string }>;
  notes: string[];
}

/** Every condition in turn; one that throws is recorded with its error and the run goes on to the next. */
export async function runConditions(
  conditions: Condition[],
  captureOne: (condition: Condition) => Promise<ConditionRun>,
  log: (line: string) => void = console.log,
): Promise<RunResult> {
  const result: RunResult = { captures: [], failed: [], failedConditions: [], notes: [] };
  for (const condition of conditions) {
    const started = Date.now();
    let run: ConditionRun;
    try {
      run = await captureOne(condition);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failedConditions.push({ condition: conditionName(condition), error: message });
      log(`${conditionName(condition)}: failed: ${message.split('\n')[0]}`);
      continue;
    }
    result.captures.push(...run.captures);
    result.notes.push(...(run.notes ?? []));
    for (const { surface, reason } of run.failed) result.failed.push({ surface, reason: `${conditionName(condition)}: ${reason}` });
    log(`${conditionName(condition)}: ${run.captures.length} captures in ${Math.round((Date.now() - started) / 1000)} s`);
  }
  return result;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { out: { type: 'string' }, surface: { type: 'string', multiple: true }, condition: { type: 'string', multiple: true } },
  });
  const out = resolve(values.out ?? join(REPOSITORY, '.cache', 'claude-ux-review', 'uxv'));
  const surfaces = parseScreens(readFileSync(SCREENS, 'utf8'));
  for (const id of values.surface ?? [])
    if (!surfaces.some((surface) => surface.id === id)) throw new Error(`${id} is not a surface of screens.md`);
  const chosen = values.surface ? surfaces.filter((surface) => values.surface!.includes(surface.id)) : surfaces;
  const { reached, unreached } = plan(chosen);

  // the data: one fixed copy of Blinky at one path, with the I/O point and the scene interfaceBudget.ts gives it
  const { packageRoot } = await import('../run-desktop-smoke');
  const project = join(resolve(out, '..'), 'uxv-fixture', 'blinky');
  rmSync(project, { recursive: true, force: true });
  cpSync(join(packageRoot, 'projects', 'blinky'), project, { recursive: true });
  const config = JSON.parse(readFileSync(join(project, 'zplc.json'), 'utf8')) as Record<string, unknown>;
  config.io = { inputs: [], outputs: [{ name: 'LED_Output', address: '%Q0.0', type: 'BOOL' }] };
  writeFileSync(join(project, 'zplc.json'), `${JSON.stringify(config, null, 2)}\n`);
  mkdirSync(join(project, 'scenes'));
  cpSync(join(packageRoot, 'projects', 'plant_assembler', 'scene.json'), join(project, 'scenes', 'station.scene.json'));
  // a file of each other language, so that every language editor opens on the same program Blinky shows in Ladder
  for (const [example, file] of [
    ['blinky_st', 'main.st'],
    ['blinky_il', 'main.il'],
    ['blinky_fbd', 'main.fbd.json'],
    ['blinky_sfc', 'main.sfc.json'],
  ])
    cpSync(join(packageRoot, 'projects', example, 'src', file), join(project, 'src', file));

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  // every Studio surface has the same covering set; one launch per condition holds every surface in it
  let conditions = conditionsFor({ id: '', area: '', states: [], reachedBy: [] });
  if (values.condition) conditions = conditions.filter((condition) => values.condition!.includes(conditionName(condition)));
  // one Vite server for the whole run, as run-journeys.ts has; every condition launches its own Electron against it
  const { startHarness } = await import('../journeyApp');
  const { harness, scratch, stop } = await startHarness();
  let run: RunResult;
  try {
    run = await runConditions(conditions, (condition) =>
      captureCondition(condition, reached, surfaces, project, out, { harness, scratch }),
    );
  } finally {
    await stop();
  }
  const { captures, failed, failedConditions, notes } = run;
  const notReached = [...unreached, ...failed];
  writeFileSync(join(out, 'manifest.json'), manifestText(captures, notReached, failedConditions, notes));
  const areas = [...new Set(reached.map((entry) => entry.surface.area))];
  for (const area of areas) {
    const ids = new Set(reached.filter((entry) => entry.surface.area === area).map((entry) => entry.surface.id));
    writeFileSync(
      join(out, `sheet-${slug(area)}.html`),
      sheet(
        area,
        captures.filter((capture) => ids.has(capture.surface)),
      ),
    );
  }
  const defects = captures.reduce((total, capture) => total + capture.defects.length, 0);
  const summary = defectSummary(captures);
  console.log(`uxv: ${captures.length} captures, ${defects} measured defects, ${notReached.length} surfaces not reached; ${out}`);
  console.log(`  one per condition, selector and kind: ${summary.defects}`);
  for (const [kind, count] of Object.entries(summary.byKind)) console.log(`    ${kind}: ${count}`);
  for (const note of notes) console.log(`  note: ${note}`);
  for (const { condition, error } of failedConditions) console.log(`  condition ${condition} failed: ${error.split('\n')[0]}`);
  process.exit(defects === 0 && failedConditions.length === 0 ? 0 : 1);
}

if (import.meta.main) await main();
