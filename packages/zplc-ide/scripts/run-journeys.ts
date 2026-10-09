/**
 * Runs the journeys of VF-008 against the real Electron development host (see journeys.ts and journeyApp.ts). Each journey
 * passes, fails with evidence, or is not possible with a reason. The run prints a table and exits non-zero on a failure
 * that is not in KNOWN_GAPS, and on a listed gap that now passes, so the list can only shrink.
 *
 *   bun run smoke:journeys                      all journeys
 *   ZPLC_JOURNEY_ONLY=breakpoint bun run ...    the journeys whose name contains the text (no exit judgement)
 *   ZPLC_JOURNEY_SHOTS=<dir> bun run ...        also save a screenshot of the screen where a journey failed
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert, packageRoot } from './run-desktop-smoke';
import { NotPossible, launchApp, startHarness, type Harness } from './journeyApp';
import { JOURNEYS, type Journey } from './journeys';

/**
 * Journeys that fail (or are not possible) today because of a defect that a later package fixes. Each entry names the
 * requirement that will fix it. A journey in this list that now passes fails the run, so remove its entry then.
 */
export const KNOWN_GAPS: Record<string, string> = {
  '4b Problems say what is wrong': 'CMP-010',
  '5 Build successfully': 'IDE-001',
  '7 Breakpoint stops execution': 'LNG-005',
  '11 Learn with no project open': 'LRN-001',
  '12 Restore the session': 'IDE-008',
};

/** `detail` is the evidence of a failure or the reason a journey is not possible; `notes` are steps the journey needed that a user should not. */
export type Outcome = { status: 'pass' | 'fail' | 'not-possible'; detail: string; notes: string[] };

/** The exit decision, kept apart from the runner so that it can be checked without launching anything. */
export function judge(results: Array<{ name: string; outcome: Pick<Outcome, 'status'> }>, knownGaps: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const { name, outcome } of results) {
    const known = knownGaps[name];
    if (outcome.status === 'pass' && known) problems.push(`"${name}" passes now: remove its entry (${known}) from KNOWN_GAPS`);
    if (outcome.status !== 'pass' && !known) problems.push(`"${name}" ${outcome.status === 'fail' ? 'failed' : 'is not possible'} and is not a known gap`);
  }
  return problems;
}

async function runJourney(harness: Harness, journey: Journey, scratch: string): Promise<Outcome> {
  const root = mkdtempSync(join(scratch, 'journey-'));
  const project = join(root, 'project');
  if (journey.example !== 'none') cpSync(join(packageRoot, 'projects', journey.example), project, { recursive: true });
  let launched: Awaited<ReturnType<typeof launchApp>> | undefined;
  try {
    launched = await launchApp(harness, root);
    const notes: string[] = [];
    const relaunch = async () => { notes.push(...launched!.notes); await launched!.stop(); launched = await launchApp(harness, root); return launched.app; };
    await journey.run(launched.app, { root, project, relaunch });
    notes.push(...launched.notes);
    return { status: 'pass', detail: '', notes };
  } catch (error) {
    const notes = launched?.notes ?? [];
    if (error instanceof NotPossible) return { status: 'not-possible', detail: error.message, notes };
    const shots = process.env.ZPLC_JOURNEY_SHOTS;
    if (shots && launched) {
      const shot = await launched.app.cdp.command('Page.captureScreenshot', { format: 'png' }).catch(() => undefined) as { data?: string } | undefined;
      if (shot?.data) { mkdirSync(shots, { recursive: true }); writeFileSync(join(shots, `${journey.name.replace(/\W+/g, '-')}.png`), Buffer.from(shot.data, 'base64')); }
    }
    return { status: 'fail', detail: `${error instanceof Error ? `${error.message}\n${error.stack?.split('\n').filter((line) => line.includes('/journeys.ts')).slice(0, 3).join('\n') ?? ''}` : String(error)}\n--- app output ---\n${launched?.app.log().slice(-1_500) ?? ''}`, notes };
  } finally {
    await launched?.stop();
    rmSync(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const only = process.env.ZPLC_JOURNEY_ONLY;
  const selected = JOURNEYS.filter((journey) => !only || journey.name.toLowerCase().includes(only.toLowerCase()));
  assert(selected.length > 0, `No journey matches ZPLC_JOURNEY_ONLY=${only}`);
  const { harness, scratch, stop } = await startHarness();
  const results: Array<{ name: string; example: string; outcome: Outcome }> = [];
  try {
    for (const journey of selected) {
      const started = Date.now();
      const outcome = await runJourney(harness, journey, scratch);
      results.push({ name: journey.name, example: journey.example, outcome });
      console.log(`${outcome.status.toUpperCase().padEnd(12)} ${journey.name} (${journey.example}, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
    }
  } finally { await stop(); }

  console.log(`\n${'Journey'.padEnd(50)}${'Example'.padEnd(18)}${'Result'.padEnd(14)}Known gap / notes`);
  for (const { name, example, outcome } of results) console.log(`${name.padEnd(50)}${example.padEnd(18)}${outcome.status.padEnd(14)}${[KNOWN_GAPS[name] && `gap ${KNOWN_GAPS[name]}`, ...outcome.notes].filter(Boolean).join('; ')}`);
  for (const { name, outcome } of results) if (outcome.status !== 'pass') console.log(`\n--- ${name}: ${outcome.status === 'fail' ? 'FAILED' : 'NOT POSSIBLE'}${KNOWN_GAPS[name] ? ` (known gap ${KNOWN_GAPS[name]})` : ''}\n${outcome.detail}`);
  const problems = only ? [] : judge(results, KNOWN_GAPS);
  if (problems.length > 0) { console.error(`\n${problems.join('\n')}`); process.exit(1); }
  console.log('\nThe development host on Linux and native POSIX only: no packaged-artifact, macOS, Windows, HIL, timing or hardware evidence.');
}

if (import.meta.main) await main();
