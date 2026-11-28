/**
 * Runs the journeys of VF-008 against the real Electron development host (see journeys.ts and journeyApp.ts). Each journey
 * passes, fails with evidence, or is not possible with a reason. The run prints a table and exits non-zero on a failure
 * that is not in KNOWN_GAPS, and on a listed gap that now passes, so the list can only shrink.
 *
 *   bun run smoke:journeys                      all journeys
 *   ZPLC_JOURNEY_ONLY=breakpoint bun run ...    the journeys whose name contains the text (no exit judgement)
 *   ZPLC_JOURNEY_SHARD=k/n bun run ...          shard k of n: journey i of the list runs in shard (i mod n) + 1; the shards together
 *                                               run every journey once, each shard is judged like a full run, and it lists what it ran
 *   ZPLC_JOURNEY_SHOTS=<dir> bun run ...        also save a screenshot of the screen where a journey failed
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, packageRoot } from './run-desktop-smoke';
import { journeyFactor, waiting } from './journeyTiming';
import { NotPossible, launchApp, startHarness, type Harness } from './journeyApp';
import { JOURNEYS, runPackagedSecurityProbes, type Journey } from './journeys';
import { journeysPlant } from './journeys/plantJourneys';
import { journeysPlantFraming, withGlWindow } from './journeys013/plantFraming';
import { journeysPlantLook } from './journeys013/plantLook';
import { discoverPackagedExecutable } from './run-packaged-desktop-smoke';

/**
 * Journeys that fail (or are not possible) today because of a defect that a later package fixes. Each entry names the
 * requirement that will fix it. A journey in this list that now passes fails the run, so remove its entry then.
 */
export const KNOWN_GAPS: Record<string, string> = {};

const PROC = 'the process tree of the app is read from /proc, which only Linux has';
const NO_WEBGL = 'the hosted macOS runner has no WebGL 2; the 3D view on macOS is checked by hand in the Mac rehearsal';
const XDOTOOL = 'the real key press is made with xdotool on an X display, which only the Linux host has';
/**
 * Journeys that cannot run on a platform, with the reason (owner, L868). There a not-possible result is a visible skip, printed as not
 * measured, and a failure still fails the run. What they cover has no evidence on that platform.
 */
export const PLATFORM_NOT_POSSIBLE: Partial<Record<NodeJS.Platform, Record<string, string>>> = {
  win32: {
    '35 A long test run can be cancelled and leaves no process behind': PROC,
    '53 Ctrl+R in the development host asks before it discards unsaved work, through a real key press': XDOTOOL,
  },
  darwin: {
    '35 A long test run can be cancelled and leaves no process behind': PROC,
    '53 Ctrl+R in the development host asks before it discards unsaved work, through a real key press': XDOTOOL,
    'VIS-002 the first view fits the 21 scenes at four panel sizes and no box is drawn twice (real window, software GL)': NO_WEBGL,
    'VIS-016 the state of belt-to-sensor parts is drawn, the look follows the quality level and item colours match (real window)': NO_WEBGL,
  },
};

/**
 * `detail` is the evidence of a failure or the reason a journey is not possible; `notes` are steps the journey needed that a user should
 * not.
 */
export type Outcome = { status: 'pass' | 'fail' | 'not-possible'; detail: string; notes: string[] };

/** The exit decision, kept apart from the runner so that it can be checked without launching anything. */
export function judge(
  results: Array<{ name: string; outcome: Pick<Outcome, 'status'> }>,
  knownGaps: Record<string, string>,
  platformLimits: Record<string, string> = {},
): string[] {
  const problems: string[] = [];
  for (const { name, outcome } of results) {
    if (outcome.status === 'not-possible' && platformLimits[name]) continue;
    const known = knownGaps[name];
    if (outcome.status === 'pass' && known) problems.push(`"${name}" passes now: remove its entry (${known}) from KNOWN_GAPS`);
    if (outcome.status !== 'pass' && !known)
      problems.push(`"${name}" ${outcome.status === 'fail' ? 'failed' : 'is not possible'} and is not a known gap`);
  }
  return problems;
}

/** The journeys of the run, in their fixed order: the shards are positions in this list. */
export const allJourneys = (): Journey[] => [...JOURNEYS, ...journeysPlant, ...journeysPlantFraming, ...journeysPlantLook];

/** `k/n` of ZPLC_JOURNEY_SHARD; anything else is an error, never a run of everything or of nothing. */
export function parseShard(spec: string): { index: number; count: number } {
  const match = /^(\d+)\/(\d+)$/.exec(spec);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  if (!match || index < 1 || count < 1 || index > count)
    throw new Error(`ZPLC_JOURNEY_SHARD=${spec} must be k/n with 1 <= k <= n, for example 2/4`);
  return { index, count };
}

/** The journeys of shard `spec` (k/n): the 1st, (n+1)th... of the list for shard 1, and so on. Without a shard, all of them. */
export function shardJourneys<T>(journeys: readonly T[], spec: string | undefined): T[] {
  if (spec === undefined) return [...journeys];
  const { index, count } = parseShard(spec);
  const own = journeys.filter((_, position) => position % count === index - 1);
  if (own.length === 0) throw new Error(`ZPLC_JOURNEY_SHARD=${spec} has no journey: the list holds ${journeys.length}`);
  return own;
}

/**
 * The longest one journey may take, so that one hang cannot eat the budget of a shard: the factor of the system times 75 s,
 * rounded up to 50 s (200 s on macOS, 300 s on Windows). Linux, whose factor is 1, has none.
 */
export function journeyCapSeconds(platform: string = process.platform): number | undefined {
  const factor = journeyFactor(platform);
  return factor === 1 ? undefined : Math.ceil((factor * 75) / 50) * 50;
}

const capMessage = (name: string, capMs: number) =>
  `TIME: "${name}" ran past its cap of ${capMs / 1000} s while waiting for ${waiting.what || 'nothing named'}`;

/**
 * `capMs` with a TIME failure that names the wait it was in. runJourney cuts its own journey at the cap, which stops its
 * application; this outer cut, given a grace to do that, is the backstop when a journey does not end even then.
 */
export function capJourney(name: string, run: Promise<Outcome>, capMs: number | undefined): Promise<Outcome> {
  if (capMs === undefined) return run;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cut = new Promise<Outcome>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          status: 'fail',
          detail: capMessage(name, capMs),
          notes: [],
        }),
      capMs,
    );
  });
  return Promise.race([run, cut]).finally(() => clearTimeout(timer));
}

/** The line a journey that did not pass leaves in the log the moment it ends: a shard that is cancelled still shows what failed. */
export function failureLine(name: string, outcome: Outcome): string | undefined {
  if (outcome.status === 'pass') return undefined;
  return `  ${outcome.status === 'fail' ? 'FAILED' : 'NOT POSSIBLE'} ${name}: ${outcome.detail.split('\n')[0]}`;
}

/**
 * Read-only probe of the shell layout, run in the page of a journey that failed: the size the page was laid out at, and what the
 * panels and the sidebars (rendered only while their visibility flag is up) look like, so a hosted macOS or Windows run shows them.
 */
export const LAYOUT_PROBE =
  `(() => { const w = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null); const q = (s) => document.querySelector(s); ` +
  `return { inner: [window.innerWidth, window.innerHeight], dpr: window.devicePixelRatio, ` +
  `primaryVisible: q('[data-sidebar-kind="primary"]') !== null, secondaryVisible: q('[data-sidebar-kind="secondary"]') !== null, ` +
  `primary: w(document.getElementById('primary')), secondary: w(document.getElementById('secondary')), group: w(q('[data-group]')) }; })()`;

/** The one line the probe leaves in the log, e.g. `layout 1440x900@1 primary(visible)=280 secondary(hidden)=0 group=1100`. */
export function layoutLine(state: {
  inner: number[];
  dpr: number;
  primaryVisible: boolean;
  secondaryVisible: boolean;
  primary: number | null;
  secondary: number | null;
  group: number | null;
}): string {
  const visible = (on: boolean) => (on ? 'visible' : 'hidden');
  return (
    `  layout ${state.inner[0]}x${state.inner[1]}@${state.dpr} primary(${visible(state.primaryVisible)})=${state.primary} ` +
    `secondary(${visible(state.secondaryVisible)})=${state.secondary} group=${state.group}`
  );
}

async function runJourney(harness: Harness, journey: Journey, scratch: string): Promise<Outcome> {
  const root = mkdtempSync(join(scratch, 'journey-'));
  const project = join(root, 'project');
  if (journey.example !== 'none') cpSync(join(packageRoot, 'projects', journey.example), project, { recursive: true });
  let launched: Awaited<ReturnType<typeof launchApp>> | undefined;
  try {
    launched = await launchApp(harness, root, journey.environment);
    const notes: string[] = [];
    const relaunch = async () => {
      notes.push(...launched!.notes);
      await launched!.stop();
      launched = await launchApp(harness, root, journey.environment);
      return launched.app;
    };
    const crash = async () => {
      notes.push(...launched!.notes);
      await launched!.crash();
      launched = await launchApp(harness, root, journey.environment);
      return launched.app;
    };
    const capMs = (journeyCapSeconds() ?? 0) * 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cut = new Promise<never>((_, reject) => {
      if (capMs > 0) timer = setTimeout(() => reject(new Error(capMessage(journey.name, capMs))), capMs);
    });
    const ran = journey.run(launched.app, { root, project, runtime: harness.runtime, relaunch, crash });
    ran.catch(() => undefined); // a journey cut at its cap fails later, when its application is gone
    await Promise.race([ran, cut]).finally(() => clearTimeout(timer));
    notes.push(...launched.notes);
    return { status: 'pass', detail: '', notes };
  } catch (error) {
    const notes = launched?.notes ?? [];
    if (error instanceof NotPossible) return { status: 'not-possible', detail: error.message, notes };
    const layout = launched
      ? ((await launched.app.cdp.evaluate(LAYOUT_PROBE).catch(() => undefined)) as Parameters<typeof layoutLine>[0] | undefined)
      : undefined;
    if (layout) console.log(layoutLine(layout));
    const shots = process.env.ZPLC_JOURNEY_SHOTS;
    if (shots && launched) {
      const shot = (await launched.app.cdp.command('Page.captureScreenshot', { format: 'png' }).catch(() => undefined)) as
        { data?: string } | undefined;
      if (shot?.data) {
        mkdirSync(shots, { recursive: true });
        writeFileSync(join(shots, `${journey.name.replace(/\W+/g, '-')}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
    return {
      status: 'fail',
      detail: `${
        error instanceof Error
          ? `${error.message}\n${
              error.stack
                ?.split('\n')
                .filter((line) => line.includes('/journeys.ts'))
                .slice(0, 3)
                .join('\n') ?? ''
            }`
          : String(error)
      }\n--- app output ---\n${launched?.app.log().slice(-1_500) ?? ''}`,
      notes,
    };
  } finally {
    await launched?.stop();
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * ZPLC_PACKAGED_DIST names the output directory of electron-builder: the security probes of IDE-016 then run against the
 * unpacked packaged application (production policy, file:// renderer) instead of the development host.
 */
async function runPackaged(distribution: string): Promise<void> {
  const executable = discoverPackagedExecutable(distribution);
  const scratch = mkdtempSync(join(tmpdir(), 'zplc-packaged-security-'));
  try {
    const started = Date.now();
    const evidence = await runPackagedSecurityProbes(executable, scratch);
    console.log(`PASS         IDE-016 security probes on the packaged application (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    for (const line of evidence) console.log(`  - ${line}`);
    console.log('\nThe packaged application on Linux only, native POSIX: no installer, macOS, Windows, HIL, timing or hardware evidence.');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * What the probe learned about WebGL 2. Only a page that loaded and returned no context is `absent`; a launch error, a timeout or a
 * crash proves nothing about the host, so it is `error` and the journeys run and pass or fail on their own.
 */
export type WebGlProbe = { status: 'available' } | { status: 'error' } | { status: 'absent'; reason: string };

/**
 * Decides which WebGL 2 plant journeys (VIS-002, VIS-016) run. A really absent context turns them into `not-possible` results, so the
 * summary lists them and `judge` fails the run unless they are in KNOWN_GAPS. Kept pure so unit tests need no Electron.
 */
export function selectJourneys(
  base: readonly Journey[],
  webgl: readonly Journey[],
  options: { only?: string; probe: WebGlProbe },
): { selected: Journey[]; notPossible: Array<{ name: string; example: string; outcome: Outcome }> } {
  const matches = (journey: Journey) => !options.only || journey.name.toLowerCase().includes(options.only.toLowerCase());
  const selectedBase = base.filter(matches);
  const matchingWebgl = webgl.filter(matches);
  const { probe } = options;
  if (probe.status !== 'absent') return { selected: [...selectedBase, ...matchingWebgl], notPossible: [] };
  return {
    selected: selectedBase,
    notPossible: matchingWebgl.map(({ name, example }) => ({
      name,
      example,
      outcome: { status: 'not-possible', detail: probe.reason, notes: [] },
    })),
  };
}

/** Probes whether headless Electron with SwiftShader can create a WebGL 2 context on this host. */
async function probeWebGL2(scratch: string, runtime: string): Promise<WebGlProbe> {
  const root = mkdtempSync(join(scratch, 'webgl-probe-'));
  try {
    const ok = await withGlWindow(root, runtime, async (page) =>
      Boolean(await page.evaluate(`Boolean(document.createElement('canvas').getContext('webgl2'))`)),
    );
    return ok
      ? { status: 'available' }
      : { status: 'absent', reason: 'WebGL 2 is not available in headless Electron with SwiftShader on this host' };
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    console.log(`WebGL 2 probe could not run (${detail}); the journeys run.`);
    return { status: 'error' };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  if (process.env.ZPLC_PACKAGED_DIST) {
    await runPackaged(process.env.ZPLC_PACKAGED_DIST);
    return;
  }
  const only = process.env.ZPLC_JOURNEY_ONLY;
  const shard = process.env.ZPLC_JOURNEY_SHARD;
  const everything = allJourneys();
  const own = new Set(shardJourneys(everything, shard));
  if (shard !== undefined)
    console.log(
      `Shard ${shard}: ${own.size} of ${everything.length} journeys:\n${[...own].map((journey) => `  ${journey.name}`).join('\n')}`,
    );
  const baseJourneys = [...JOURNEYS, ...journeysPlant].filter((journey) => own.has(journey));
  const webglJourneys = [...journeysPlantFraming, ...journeysPlantLook].filter((journey) => own.has(journey));
  const matchesOnly = (journey: Journey) => !only || journey.name.toLowerCase().includes(only.toLowerCase());
  const needsWebgl = webglJourneys.some(matchesOnly);
  assert(baseJourneys.some(matchesOnly) || needsWebgl, `No journey matches ZPLC_JOURNEY_ONLY=${only}`);
  const { harness, scratch, stop } = await startHarness();
  const results: Array<{ name: string; example: string; outcome: Outcome }> = [];
  try {
    const probe: WebGlProbe = needsWebgl ? await probeWebGL2(scratch, harness.runtime) : { status: 'available' };
    const { selected, notPossible } = selectJourneys(baseJourneys, webglJourneys, { only, probe });
    for (const skipped of notPossible) {
      results.push(skipped);
      console.log(`${skipped.outcome.status.toUpperCase().padEnd(12)} ${skipped.name} (${skipped.example}): ${skipped.outcome.detail}`);
    }
    for (const journey of selected) {
      const started = Date.now();
      waiting.what = '';
      const seconds = journeyCapSeconds();
      const outcome = await capJourney(journey.name, runJourney(harness, journey, scratch), seconds && (seconds + 30) * 1000);
      results.push({ name: journey.name, example: journey.example, outcome });
      console.log(
        `${outcome.status.toUpperCase().padEnd(12)} ${journey.name} (${journey.example}, ${((Date.now() - started) / 1000).toFixed(1)}s)`,
      );
      const line = failureLine(journey.name, outcome);
      if (line) console.log(line);
    }
  } finally {
    await stop();
  }

  console.log(`\n${'Journey'.padEnd(50)}${'Example'.padEnd(18)}${'Result'.padEnd(14)}Known gap / notes`);
  for (const { name, example, outcome } of results)
    console.log(
      `${name.padEnd(50)}${example.padEnd(18)}${outcome.status.padEnd(14)}${[
        KNOWN_GAPS[name] && `gap ${KNOWN_GAPS[name]}`,
        ...outcome.notes,
      ]
        .filter(Boolean)
        .join('; ')}`,
    );
  for (const { name, outcome } of results)
    if (outcome.status !== 'pass')
      console.log(
        `\n--- ${name}: ${outcome.status === 'fail' ? 'FAILED' : 'NOT POSSIBLE'}${
          KNOWN_GAPS[name] ? ` (known gap ${KNOWN_GAPS[name]})` : ''
        }\n${outcome.detail}`,
      );
  const limits = PLATFORM_NOT_POSSIBLE[process.platform] ?? {};
  for (const { name, outcome } of results)
    if (outcome.status === 'not-possible' && limits[name]) console.log(`\nNOT MEASURED on ${process.platform}: ${name}: ${limits[name]}`);
  const problems = only ? [] : judge(results, KNOWN_GAPS, limits);
  if (problems.length > 0) {
    console.error(`\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log(
    '\nThe development host on Linux and native POSIX only: no packaged-artifact, macOS, Windows, HIL, timing or hardware evidence.',
  );
}

if (import.meta.main) await main();
