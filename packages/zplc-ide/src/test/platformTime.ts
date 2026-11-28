import { setDefaultTimeout } from 'bun:test';

/**
 * The one place where the time bounds of the unit tests scale with the system they run on. A test or a wait is written as it
 * needs to be on Linux (the system of the pull-request job) and goes through `scaleTime`; `scaleDefaultTimeout` does the same
 * for bun's default timeout of 5 s, and scripts/cdpHarness.ts scales its waits.
 *
 * These numbers MUST equal JOURNEY_TIME_FACTOR of scripts/journeyTiming.ts (measured on nightly-quality run 46028935149 against
 * ci.yml run 46028930594: the p90 ratio of macOS arm64 and Windows x64 journeys to Linux, rounded up to the next 0.5).
 * platformTime.test.ts fails when the two tables differ.
 */
export const TIME_FACTOR: Record<'linux' | 'darwin' | 'win32', number> = { linux: 1, darwin: 2.5, win32: 4 };

/** The factor of `platform`; a system without an entry waits as on Linux. */
export const timeFactor = (platform: string = process.platform): number =>
  (TIME_FACTOR as Record<string, number | undefined>)[platform] ?? 1;

/** A bound of `ms` on Linux, as long as it must be on `platform`. */
export const scaleTime = (ms: number, platform: string = process.platform): number => Math.round(ms * timeFactor(platform));

/** bun's default timeout of a test (5 s) as long as it must be on this system; a file calls it once, at the top. */
export const scaleDefaultTimeout = (): void => setDefaultTimeout(scaleTime(5_000));
