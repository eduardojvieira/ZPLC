/**
 * The capture tool of spec 014 (UXV-003, UXV-004): every surface of screens.md that a command opens, in the covering set of
 * conditions of D-36, captured without a person and measured for the defects a machine can find.
 *
 *   bun scripts/ux/capture.ts [--out <folder>] [--surface <id>]... [--condition <name>]... [--lesson <id>]... [--no-lessons]
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
import { join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

import { translate } from '../../src/i18n/translate';
import { clippersOf, findTextOutOfBox } from '../textFit';
import {
  captureName,
  captureRecord,
  defectSummary,
  conditionName,
  conditionsFor,
  lessonCaptureName,
  lessonConditions,
  lessonPlan,
  type LessonKind,
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

/**
 * The only commands a capture may run (AGENTS.md rule 8): they show a view, open a configuration editor or a dialog, or move
 * through a lesson. Anything else (build, save, delete, rename, deploy, connect, run, debug, grade, assistant connections) is refused.
 */
const ALLOWED = new RegExp(
  '^(view\\.|help\\.|project\\.(settings|tasks|io|network|communication|target|plantMap|newProgram)$|file\\.(new|preferences)$|' +
    'build\\.generateSt$|learn\\.guide\\.(next|back)$)',
);
export const isNever = (command: string): boolean => !ALLOWED.test(command);

/** `--out` is emptied before a run: it must be a folder inside a `.cache` folder, never a place that holds real work. */
export function assertSafeOut(out: string): void {
  const parts = resolve(out).split(sep);
  const cache = parts.lastIndexOf('.cache');
  if (cache < 0 || cache >= parts.length - 1)
    throw new Error(`--out ${out} must be a folder inside a .cache folder (the run empties it); try ${join(REPOSITORY, '.cache', 'uxv')}`);
}
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
/** The lesson the surfaces of Learn are captured from: it has a reading with a try-it and an exercise with a Guide. */
const LESSON_SAMPLE = 'ld-no-nc-contacts';
/** Surfaces reached another way than their command of screens.md, or that cannot be reached yet, and why. */
const SPECIAL: Record<
  string,
  | { command: string; click?: string; state: string }
  | { lesson: { id: string; stage: LessonKind }; command?: string; state: string }
  | { script: string; state: string }
  | { unreached: string }
> = {
  // the plant document shows the operate panel beside the 3D view as soon as the fixture scene is open (no run, no board)
  'plant.operate': { command: 'view.plant', state: 'idle' },
  'plant.chooser': { command: 'view.plant', state: 'normal' },
  // the navigator hosts the dialog; where the primary sidebar is hidden (the compact shell) it is shown first, as a click on its rail would
  'dialog.explorer': {
    state: 'normal',
    script:
      `(async () => { const { useShellLayout } = await import('/src/store/useShellLayout.ts'); ` +
      `useShellLayout.getState().showActivity('project'); useShellLayout.getState().setPrimaryVisible(true); ` +
      `const { runCommand } = await import('/src/commands/bus.ts'); ` +
      `return runCommand('project.newProgram', { respectEnabled: true }); })()`,
  },
  'activity.plant.group': { command: 'view.showProject', state: 'scenes' },
  // the Assistant exists only while a provider is configured: the store the view reads says one is (no request is made)
  'secondary.assistant': {
    state: 'normal',
    script:
      `(async () => { const { useSecondaryView, useAssistantProvider } = await import('/src/shell/useSelection.ts'); ` +
      `useAssistantProvider.setState({ available: true, refresh: async () => undefined }); ` +
      `const { useShellLayout } = await import('/src/store/useShellLayout.ts'); ` +
      `const { shellDensity } = await import('/src/shell/shellDensity.ts'); ` +
      `const compact = shellDensity(window.innerWidth) === 'compact'; useSecondaryView.getState().show('assistant'); ` +
      `useSecondaryView.getState().setInPrimary(compact); ` +
      `const layout = useShellLayout.getState(); if (compact) layout.setPrimaryVisible(true); else layout.setSecondaryVisible(true); ` +
      `return 'ran'; })()`,
  },

  // a lesson with a reading, opened as a person opens it from the Learn home: its reading, the try-it in it, then the exercise
  'learn.reading': { lesson: { id: LESSON_SAMPLE, stage: 'reading' }, state: 'normal' },
  'learn.readingFrame': { lesson: { id: LESSON_SAMPLE, stage: 'reading' }, state: 'normal' },
  'learn.tryIt': { lesson: { id: LESSON_SAMPLE, stage: 'reading' }, state: 'idle' },
  'secondary.guide': { lesson: { id: LESSON_SAMPLE, stage: 'exercise' }, state: 'a stage' },
  'learn.exercise': { lesson: { id: LESSON_SAMPLE, stage: 'exercise' }, state: 'a stage' },
  // plant.edit is pending in the command registry: the Edit scene button of the 3D view is the way in
  'plant.editor': { command: 'view.plant', click: '[data-plant-edit-scene]', state: 'parts' },
  'dialog.importArchive': {
    unreached:
      'opened by the Import a project archive button of the Welcome screen, which asks for an archive file through a native ' +
      'dialog the capture cannot answer yet; screens.md maps it to file.export and file.exportProjectJson, which export instead',
  },
};
/**
 * The state each surface really shows with the fixture (Blinky open, one output, the assembler scene, nothing run, a fresh profile),
 * where it is not the first state screens.md lists. A capture is named by the state on screen; the others are not produced.
 */
const SHOWN: Record<string, string> = {
  'activity.tests': 'normal',
  'editor.config.tasks': 'normal',
  'editor.config.io': 'normal',
  'secondary.inspector': 'no element',
  'results.watch': 'offline',
  'activity.plant': 'normal',
  'results.output': 'normal',
  'editor.plant': 'waiting for Run',
};
/** Why a surface has no way in yet; what a fixture cannot show without a real failure or a hook in the product code. */
const REASONS: Record<string, string> = {
  'shell.notifications': 'shown only after the app raises one; no command or fixture raises one without a real event (needs a test hook)',
  'shell.toast': 'shown only after an action reports; no safe command reports one and the surface has no marker the tool can wait for',
  'shell.regionError': 'an error boundary that shows only on a render failure; a capture must not cause one (needs a test hook)',
  'shell.updateNotice': 'shown only when the update service reports a newer release; offline captures never get one (needs a test hook)',
  'shell.recovery': 'offered only after a crash left modified files; the fixture profile is fresh (needs a test hook)',
  'shell.boundaryBadge': 'shown with a running hardware or replay session, which a capture must not start',
  'editor.fbInstance': 'no command opens it: it opens from a function block instance in a diagram, which the fixture project has none of',
  'editor.controller': 'no command opens it and the fixture project has no controller to open',
  'learn.lab': 'opens beside a lesson with a plant, which needs a plant lesson with a recorded replay; the panel has no marker to wait for',
  'learn.boardTrack': 'opens from the hardware track, which asks for a board; a capture touches no board',
  'plant.live':
    'the live plant shows when the lesson plant map binds to the compiled program (the I/O map of a debug map), which needs a build; ' +
    'a capture runs no build',
  'plant.faceplate': 'shown only while a program runs, which a capture never starts',
  'editor.config.plantMap':
    'on this branch the plant-map item of the navigator opens the plant document (editor.plant); it becomes a config editor with U3-P4',
  'learn.result': 'shown only after learn.check grades a lesson, which runs the program',
  'dialog.modal': 'a generic modal with no command of its own: each dialog above is one of them',
};
/**
 * True when there is no 3D canvas, or when the last frame of each holds more than one colour. It reads the frame inside a frame
 * callback queued after the renderer's, because a WebGL canvas that keeps no buffer is blank outside one.
 */
export const DRAWN =
  `new Promise((resolve) => requestAnimationFrame(() => resolve([...document.querySelectorAll('[data-plant-canvas]')]` +
  `.every((canvas) => { ` +
  `const copy = document.createElement('canvas'); copy.width = 32; copy.height = 32; const context = copy.getContext('2d'); ` +
  `context.drawImage(canvas, 0, 0, 32, 32); const data = context.getImageData(0, 0, 32, 32).data; ` +
  `for (let i = 4; i < data.length; i += 4) if (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2]) return true; ` +
  `return false; }))))`;
/** Motion, the caret and the scrollbars of Monaco (its scrollbar and overview ruler fade on a timer) stand still. */
export const STILL =
  '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; } ' +
  '.monaco-scrollable-element > .scrollbar, .monaco-editor .decorationsOverviewRuler ' +
  '{ opacity: 0 !important; visibility: hidden !important; }';
/** The clock of the page, fixed: the Output panel prints the time of each line, so two runs would differ by it (never product code). */
export const CLOCK =
  '(() => { const Real = Date; const T = Real.UTC(2026, 10, 28, 10, 0, 0); ' +
  'function Fixed(...args) { if (!new.target) return new Real(T).toString(); return args.length > 0 ? new Real(...args) : new Real(T); } ' +
  'Fixed.prototype = Real.prototype; Fixed.now = () => T; Fixed.UTC = Real.UTC; Fixed.parse = Real.parse; globalThis.Date = Fixed; })()';

interface Plan {
  surface: Surface;
  state: string;
  command: string | null;
  /** A file of the fixture project to open instead of a command. */
  open?: string;
  /** A control to click once the command ran. */
  click?: string;
  /** A page expression that shows the surface where its command shows something else. */
  script?: string;
  /** A lesson to start, as the Learn home does, and the stage of it to show. */
  lesson?: { id: string; stage: LessonKind };
}

/** The page expression that is true when the surface shows; null for a surface the tool has no marker for. */
export function markerOf(surface: string, locale: 'en' | 'es'): string | null {
  const sel = (selector: string) => `Boolean(document.querySelector(${JSON.stringify(selector)}))`;
  const tab = (view: string) => sel(`[id="editor-tab-${view}"][aria-selected="true"]`);
  const activity = (view: string) => sel(`[data-activity="${view}"][aria-current="true"]`);
  const secondary = (key: 'shell.secondary.inspector' | 'shell.secondary.assistant' | 'shell.secondary.lesson') =>
    `[...document.querySelectorAll('[data-sidebar-kind] h2')]` +
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
    'learn.reading': sel('[data-reading-page]'),
    'learn.readingFrame': sel('[data-learn-reading]'),
    'learn.tryIt': sel('[data-reading-block="ld-try"]'),
    'learn.exercise': `${secondary('shell.secondary.lesson')} && ${sel('[data-guide-stage]')}`,
    'plant.operate': sel('[data-plant-operate]'),
    'plant.chooser':
      `[...document.querySelectorAll('[data-plant-document] label')].some((label) => ` +
      `label.textContent.trim() === ${JSON.stringify(translate(locale, 'plant.panel.scene'))})`,
    'plant.live': sel('[data-plant-panel]'),
    'activity.plant.group': sel('[data-navigator-group="plant"]'),
    'editor.changes': tab('review:changes'),
    'editor.plant': `${tab('plant')} && ${sel('[data-plant-document]')}`,
    'plant.editor': sel('[data-plant-editor]'),
    'dialog.palette': sel('[role="dialog"] [role="combobox"]'),
    'dialog.shortcuts': sel('[data-shortcut-group]'),
    'dialog.newProject': sel('[data-new-project]'),
    'dialog.explorer': sel('[data-entry-dialog], [data-new-object-dialog]'),
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
    if (special && 'script' in special) {
      reached.push({ surface, state: special.state, command: null, script: special.script });
      continue;
    }
    if (special && 'lesson' in special) {
      reached.push({ surface, state: special.state, command: special.command ?? null, lesson: special.lesson });
      continue;
    }
    if (special) {
      reached.push({ surface, state: special.state, command: special.command, ...(special.click ? { click: special.click } : {}) });
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
    if (REASONS[surface.id] && surface.reachedBy.filter((command) => !isNever(command)).length === 0) {
      unreached.push({ surface: surface.id, reason: REASONS[surface.id]! });
      continue;
    }
    const commands = surface.reachedBy.filter((command) => !isNever(command));
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
  for (const entry of reached) if (SHOWN[entry.surface.id]) entry.state = SHOWN[entry.surface.id]!;
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
  lessons: Array<{ id: string; kinds: LessonKind[] }> = [],
): Promise<ConditionRun> {
  const { launchApp, button, css } = await import('../journeyApp');
  const ui = (key: Parameters<typeof translate>[1]) => translate(condition.locale, key);
  const { harness, scratch } = shared;
  const launched = await launchApp(harness, mkdtempSync(join(scratch, 'uxv-')), {}, { gl: 'software' });
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
  const take = async (plan: Plan) => takeAs(captureName(surfaces, plan.surface.id, plan.state, condition), plan.surface.id, plan.state);
  const takeAs = async (name: string, surface: string, state: string) => {
    await app.eval('document.fonts.ready.then(() => true)');
    // a 3D view is only the picture once its canvas has drawn something other than the background (it loads the scene after it shows)
    for (let attempt = 0; attempt < 40 && !(await app.eval<boolean>(DRAWN)); attempt++) await Bun.sleep(500);
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
    captures.push(captureRecord(name, surface, state, condition, { ...page, textOutOfBox }));
  };
  /** Measures the surface only once its marker shows; otherwise records that the wrong surface was on screen. */
  const takeIfShowing = async (plan: Plan) => {
    if (await showing(markerOf(plan.surface.id, condition.locale)!, plan.surface.id)) await take(plan);
    else failed.push({ surface: plan.surface.id, reason: 'not reached: wrong surface (its marker never showed)' });
  };
  /** Starts a lesson with the function the Learn home's lesson button calls: its workspace opens, and its reading when it has one. */
  const startLesson = (id: string): Promise<boolean> =>
    app.eval<boolean>(`import('/src/learn/learnUi.ts').then(({ useLearnUi }) => useLearnUi.getState().startLesson(${JSON.stringify(id)}))`);
  /** From the reading to the exercise, with the control a person presses (Go to the practice), or by closing the reading. */
  const toExercise = () =>
    app.eval<boolean>(
      `(() => { const practice = document.querySelector('[data-learn-reading-practice]'); ` +
        `if (practice) { practice.click(); return true; } ` +
        `return import('/src/learn/learnUi.ts').then(({ useLearnUi }) => { useLearnUi.getState().closeReading(); return true; }); })()`,
    );
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
      deviceScaleFactor: condition.scale ?? 1,
      mobile: false,
    });
    await app.cdp.command('Page.addScriptToEvaluateOnNewDocument', { source: CLOCK });
    await app.eval(CLOCK);
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
    const welcome = plans.find(
      (plan) =>
        plan.surface.id === 'shell.welcome' && conditionsFor(plan.surface).some((c) => conditionName(c) === conditionName(condition)),
    );
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

    // the plans that start a lesson replace the project, so they come after every other surface
    const ordered = plans.filter((candidate) => candidate.surface.id !== 'shell.welcome');
    ordered.sort((a, b) => Number(Boolean(a.lesson)) - Number(Boolean(b.lesson)));
    for (const plan of ordered) {
      if (!conditionsFor(plan.surface).some((c) => conditionName(c) === conditionName(condition))) continue;
      try {
        if (plan.lesson) {
          if (!(await startLesson(plan.lesson.id))) {
            failed.push({ surface: plan.surface.id, reason: `lesson ${plan.lesson.id} did not open` });
            continue;
          }
          if (plan.lesson.stage === 'exercise') await toExercise();
          if (plan.command && (await run(plan.command)) !== 'ran') {
            failed.push({ surface: plan.surface.id, reason: `${plan.command} did not run after the lesson` });
            continue;
          }
          await still();
          await takeIfShowing(plan);
          continue;
        }
        await reset();
        const how = plan.command ?? (plan.open ? `open ${plan.open}` : plan.script ? 'its script' : null);
        const outcome = plan.script
          ? await app.eval<string>(plan.script)
          : plan.command
            ? await run(plan.command)
            : plan.open
              ? await openFile(plan.open)
              : 'ran';
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
    for (const lesson of lessons) {
      const kinds = lesson.kinds.filter((kind) => lessonConditions(kind).some((c) => conditionName(c) === conditionName(condition)));
      if (kinds.length === 0) continue;
      try {
        for (let i = 0; i < 2; i++) await app.press('Escape');
        if (!(await startLesson(lesson.id))) {
          failed.push({ surface: `lesson.${lesson.id}`, reason: 'the lesson did not open' });
          continue;
        }
        await still();
        if (lesson.kinds.includes('reading')) {
          if (kinds.includes('reading')) {
            if (await showing(`document.querySelector('[data-reading-page=${JSON.stringify(lesson.id)}]')`, `reading of ${lesson.id}`))
              await takeAs(lessonCaptureName(lesson.id, 'reading', condition), `lesson.${lesson.id}`, 'reading');
            else failed.push({ surface: `lesson.${lesson.id}.reading`, reason: 'its reading never showed' });
          }
          if (kinds.includes('exercise')) await toExercise();
        }
        if (kinds.includes('exercise')) {
          if (
            await showing(
              `${markerOf('secondary.guide', condition.locale)!} && !document.querySelector('[data-reading-page]')`,
              `exercise of ${lesson.id}`,
            )
          )
            await takeAs(lessonCaptureName(lesson.id, 'exercise', condition), `lesson.${lesson.id}`, 'exercise');
          else failed.push({ surface: `lesson.${lesson.id}.exercise`, reason: 'its Guide never showed' });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
        failed.push({ surface: `lesson.${lesson.id}`, reason: message });
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
    options: {
      out: { type: 'string' },
      surface: { type: 'string', multiple: true },
      condition: { type: 'string', multiple: true },
      lesson: { type: 'string', multiple: true },
      'no-lessons': { type: 'boolean' },
    },
  });
  const out = resolve(values.out ?? join(REPOSITORY, '.cache', 'claude-ux-review', 'uxv'));
  assertSafeOut(out);
  const surfaces = parseScreens(readFileSync(SCREENS, 'utf8'));
  for (const id of values.surface ?? [])
    if (!surfaces.some((surface) => surface.id === id)) throw new Error(`${id} is not a surface of screens.md`);
  // no filter: every surface and every lesson; only --surface: no lesson; only --lesson: those lessons and no surface
  const index = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', 'src', 'generated', 'lessonIndex.json'), 'utf8')) as {
    lessons: Array<{ id: string; module: number; order: number; reading?: unknown }>;
  };
  for (const id of values.lesson ?? []) if (!index.lessons.some((lesson) => lesson.id === id)) throw new Error(`${id} is not a lesson`);
  const allLessons = lessonPlan(index.lessons.map((lesson) => ({ ...lesson, reading: Boolean(lesson.reading) })));
  const lessons = values.lesson
    ? allLessons.filter((lesson) => values.lesson!.includes(lesson.id))
    : values.surface || values['no-lessons']
      ? []
      : allLessons;
  const chosen = values.surface ? surfaces.filter((surface) => values.surface!.includes(surface.id)) : values.lesson ? [] : surfaces;
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
  const seen = new Set<string>();
  let conditions = chosen
    .flatMap((surface) => conditionsFor(surface))
    .filter((condition) => !seen.has(conditionName(condition)) && seen.add(conditionName(condition)));
  // only lessons: just the conditions a lesson is captured in
  if (reached.length === 0) {
    const wanted = new Map(
      ([...lessonConditions('reading'), ...lessonConditions('exercise')] as Condition[]).map((c) => [conditionName(c), c]),
    );
    conditions = [...wanted.values()];
  }
  if (values.condition) conditions = conditions.filter((condition) => values.condition!.includes(conditionName(condition)));
  // one Vite server for the whole run, as run-journeys.ts has; every condition launches its own Electron against it
  const { startHarness } = await import('../journeyApp');
  const { harness, scratch, stop } = await startHarness();
  let run: RunResult;
  try {
    run = await runConditions(conditions, (condition) =>
      captureCondition(condition, reached, surfaces, project, out, { harness, scratch }, lessons),
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
  const lessonCaptures = captures.filter((capture) => capture.surface.startsWith('lesson.'));
  if (lessonCaptures.length > 0) writeFileSync(join(out, 'sheet-lessons.html'), sheet('Lessons', lessonCaptures));
  for (const condition of conditions) {
    const name = conditionName(condition);
    const planned =
      reached.filter((entry) => conditionsFor(entry.surface).some((c) => conditionName(c) === name)).length +
      lessons.flatMap((lesson) => lesson.kinds).filter((kind) => lessonConditions(kind).some((c) => conditionName(c) === name)).length;
    const got = captures.filter((capture) => capture.condition === name).length;
    const missed = failed.filter((entry) => entry.reason.startsWith(`${name}: `));
    console.log(`  ${name}: ${got} of ${planned} planned captured, ${missed.length} failed`);
    for (const entry of missed) console.log(`    failed: ${entry.surface}: ${entry.reason.slice(name.length + 2)}`);
  }
  const defects = captures.reduce((total, capture) => total + capture.defects.length, 0);
  const summary = defectSummary(captures);
  console.log(`uxv: ${captures.length} captures, ${defects} measured defects, ${notReached.length} surfaces not reached; ${out}`);
  console.log(`  one per condition, selector and kind: ${summary.defects}`);
  for (const [kind, count] of Object.entries(summary.byKind)) console.log(`    ${kind}: ${count}`);
  for (const note of notes) console.log(`  note: ${note}`);
  for (const { condition, error } of failedConditions) console.log(`  condition ${condition} failed: ${error.split('\n')[0]}`);
  // a planned surface that did not show is a failure of the run, whatever the defects say
  process.exit(defects === 0 && failedConditions.length === 0 && failed.length === 0 ? 0 : 1);
}

if (import.meta.main) await main();
