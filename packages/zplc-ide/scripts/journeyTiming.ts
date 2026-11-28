/**
 * The one place where the waits of the journeys scale with the system they run on. A journey writes its waits as it needs them
 * on Linux (the system of the pull-request job, ci.yml) and every wait goes through `scaleWait`, `pause` or `waitFor`; no wait is
 * raised by hand for one system. A source scan in run-journeys.test.ts fails on a wait that bypasses this module.
 *
 * Measurement (nightly-quality run 46028935149 against ci.yml run 46028930594, the same commit on the same night): the wall time
 * "(<example>, N s)" of every journey that PASSED on both Linux and the system, 107 journeys for macOS and 119 for Windows.
 *
 *                      median ratio   p90 ratio   max ratio   total (all pairs)
 *   macOS arm64 (15)       1.88          2.34        3.85         1.74
 *   Windows x64 (2025)     3.18          3.96        4.84         2.69
 *
 * A wait is a hang guard that must hold for the slowest step of a journey, not the median one, so each factor is the p90 ratio
 * rounded up to the next 0.5. The ratios of passing journeys understate the slowest steps (the journeys that timed
 * out are not in the pairs), so a wait that still fails at these factors is a failure to list, not a number to raise by hand:
 * measure again on the next nightly and replace the numbers in src/test/platformTime.ts, the one table (the unit tests
 * and cdpHarness.ts read it too), with the run ids above.
 */
import { TIME_FACTOR } from '../src/test/platformTime';

export const JOURNEY_TIME_FACTOR = TIME_FACTOR;

/** The description of the wait the running journey is in (set by `until`), so a journey cut at its cap names its step. */
export const waiting = { what: '' };

/** The factor of `platform`; a system without an entry waits as on Linux. */
export const journeyFactor = (platform: string = process.platform): number =>
  (JOURNEY_TIME_FACTOR as Record<string, number | undefined>)[platform] ?? 1;

/** A wait or bound of `ms` on Linux, as long as it must be on `platform`. */
export const scaleWait = (ms: number, platform: string = process.platform): number => Math.round(ms * journeyFactor(platform));

/** A fixed pause (a layout or an animation to settle) of `ms` on Linux. */
export const pause = (ms: number): Promise<void> => Bun.sleep(scaleWait(ms));

/** The `waitFor` of run-desktop-smoke.ts (90 s on Linux by default) with its bound scaled. */
export async function waitFor<T>(description: string, check: () => Promise<T | undefined> | T | undefined, timeoutMs = 90_000): Promise<T> {
  const started = Date.now();
  const deadline = started + scaleWait(timeoutMs);
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value !== undefined) {
        // as in run-desktop-smoke.ts: a slow step names itself in the log
        const seconds = (Date.now() - started) / 1000;
        const at = (performance.now() / 1000).toFixed(1);
        if (seconds > 1) console.log(`Slow step: ${description} took ${seconds.toFixed(1)} s (at ${at} s)`);
        return value;
      }
    } catch (error) {
      last = error;
    }
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}${last instanceof Error ? `: ${last.message}` : ''}`);
}
