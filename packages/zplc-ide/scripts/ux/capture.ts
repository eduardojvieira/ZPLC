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
import { findTextOutOfBox } from '../textFit';
import {
  captureName,
  captureRecord,
  conditionName,
  conditionsFor,
  manifestText,
  parseScreens,
  type CaptureRecord,
  type Condition,
  type Surface,
} from './manifest';
import { collectMeasurement, type Measurement } from './measurement';

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
const STILL = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }';

interface Plan {
  surface: Surface;
  state: string;
  command: string | null;
}

/** Which surfaces this tool reaches, how, and in which state; the others with the reason. */
export function plan(surfaces: Surface[]): { reached: Plan[]; unreached: Array<{ surface: string; reason: string }> } {
  const reached: Plan[] = [];
  const unreached: Array<{ surface: string; reason: string }> = [];
  for (const surface of surfaces) {
    if (surface.id === 'shell.welcome') {
      reached.push({ surface, state: 'normal', command: null });
      continue;
    }
    const open = ON_OPEN.find(([id]) => id === surface.id);
    if (open) {
      reached.push({ surface, state: open[1], command: null });
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

async function captureCondition(
  condition: Condition,
  plans: Plan[],
  surfaces: Surface[],
  project: string,
  out: string,
): Promise<{ captures: CaptureRecord[]; failed: Array<{ surface: string; reason: string }> }> {
  const { launchApp, startHarness, button, css } = await import('../journeyApp');
  const ui = (key: Parameters<typeof translate>[1]) => translate(condition.locale, key);
  const { harness, scratch, stop } = await startHarness();
  const launched = await launchApp(harness, mkdtempSync(join(scratch, 'uxv-')));
  const app = launched.app;
  const captures: CaptureRecord[] = [];
  const failed: Array<{ surface: string; reason: string }> = [];
  const strips = [`[role="tablist"][aria-label=${JSON.stringify(ui('workbench.editor.views'))}]`, '[data-ld-rung-id] .overflow-x-auto'];

  const still = async () => {
    await app.eval(
      `(() => { let s = document.getElementById('uxv-still'); if (!s) { s = document.createElement('style'); s.id = 'uxv-still'; ` +
        `document.head.append(s); } s.textContent = ${JSON.stringify(STILL)}; })()`,
    );
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
    const page = await app.eval<Omit<Measurement, 'textOutOfBox'>>(
      `(${collectMeasurement.toString()})(${JSON.stringify({ locale: condition.locale, focus: false })})`,
    );
    const textOutOfBox = await app.eval<string[]>(`(${findTextOutOfBox.toString()})(${JSON.stringify(strips)})`);
    // the focus pass last, after the picture: focusing can open a tooltip. A key first (Shift, which closes nothing), so that
    // programmatic focus counts as keyboard focus for :focus-visible.
    for (const type of ['keyDown', 'keyUp'])
      await app.cdp.command('Input.dispatchKeyEvent', { type, key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    const focused = await app.eval<Omit<Measurement, 'textOutOfBox'>>(
      `(${collectMeasurement.toString()})(${JSON.stringify({ locale: condition.locale, focus: true })})`,
    );
    const rings = new Map(focused.elements.map((element) => [`${element.name}@${element.rect.x},${element.rect.y}`, element.focusRing]));
    for (const element of page.elements) element.focusRing = rings.get(`${element.name}@${element.rect.x},${element.rect.y}`) ?? null;
    captures.push(captureRecord(name, plan.surface.id, plan.state, condition, { ...page, textOutOfBox }));
  };
  const reset = async () => {
    for (let i = 0; i < 2; i++) await app.press('Escape');
    await app.eval(`import('/src/commands/bus.ts').then(({ runCommand }) => { runCommand('view.showProject'); return true; })`);
  };

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
    if (welcome) await take(welcome);

    app.answer(project);
    await app.click(button(ui('welcome.open.title'), 'contains'), 'the Open project button');
    await app.until('the project workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
    await still();
    for (const plan of plans.filter((candidate) => candidate.command === null && candidate.surface.id !== 'shell.welcome'))
      await take(plan);

    for (const plan of plans.filter((candidate) => candidate.command !== null)) {
      try {
        const outcome = await app.eval<string>(
          `import('/src/commands/bus.ts').then(({ runCommand }) => runCommand(${JSON.stringify(plan.command)}, { respectEnabled: true }))`,
        );
        if (outcome !== 'ran') {
          failed.push({ surface: plan.surface.id, reason: `${plan.command} is ${outcome} with the fixture project open` });
          continue;
        }
        await still();
        await take(plan);
      } catch (error) {
        failed.push({
          surface: plan.surface.id,
          reason: `${plan.command}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        });
      } finally {
        await reset();
      }
    }
  } finally {
    await launched.stop();
    await stop();
  }
  return { captures, failed };
}

export interface ConditionRun {
  captures: CaptureRecord[];
  failed: Array<{ surface: string; reason: string }>;
}

export interface RunResult {
  captures: CaptureRecord[];
  /** Surfaces a command did not open, each with the condition it failed in. */
  failed: Array<{ surface: string; reason: string }>;
  /** Conditions that stopped before their last capture, with the error. */
  failedConditions: Array<{ condition: string; error: string }>;
}

/** Every condition in turn. */
export async function runConditions(
  conditions: Condition[],
  captureOne: (condition: Condition) => Promise<ConditionRun>,
  log: (line: string) => void = console.log,
): Promise<RunResult> {
  const result: RunResult = { captures: [], failed: [], failedConditions: [] };
  for (const condition of conditions) {
    const started = Date.now();
    const run = await captureOne(condition);
    result.captures.push(...run.captures);
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

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  // every Studio surface has the same covering set; one launch per condition holds every surface in it
  let conditions = conditionsFor({ id: '', area: '', states: [], reachedBy: [] });
  if (values.condition) conditions = conditions.filter((condition) => values.condition!.includes(conditionName(condition)));
  const { captures, failed } = await runConditions(conditions, (condition) => captureCondition(condition, reached, surfaces, project, out));
  const notReached = [...unreached, ...failed];
  writeFileSync(join(out, 'manifest.json'), manifestText(captures, notReached));
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
  const byKind = new Map<string, number>();
  for (const capture of captures) for (const defect of capture.defects) byKind.set(defect.kind, (byKind.get(defect.kind) ?? 0) + 1);
  console.log(`uxv: ${captures.length} captures, ${defects} measured defects, ${notReached.length} surfaces not reached; ${out}`);
  for (const [kind, count] of [...byKind].sort()) console.log(`  ${kind}: ${count}`);
  process.exit(defects === 0 ? 0 : 1);
}

if (import.meta.main) await main();
