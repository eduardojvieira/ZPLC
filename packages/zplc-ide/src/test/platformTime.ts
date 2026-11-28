/**
 * The one place where the time bounds of the unit tests scale with the system they run on. A test or a wait is written as it
 * needs to be on Linux (the system of the pull-request job) and goes through `scaleTime`; the preload applyPlatformTime.ts does
 * the same for bun's default timeout of 5 s, and scripts/cdpHarness.ts scales its waits.
 *
 * The table is declared here and only here: scripts/journeyTiming.ts reads it as JOURNEY_TIME_FACTOR (measured on nightly-quality
 * run 46028935149 against ci.yml run 46028930594: the p90 ratio of macOS arm64 and Windows x64 journeys to Linux, rounded up to the
 * next 0.5). Change the numbers here.
 */
export const TIME_FACTOR: Record<'linux' | 'darwin' | 'win32', number> = { linux: 1, darwin: 2.5, win32: 4 };

/** The factor of `platform`; a system without an entry waits as on Linux. */
export const timeFactor = (platform: string = process.platform): number =>
  (TIME_FACTOR as Record<string, number | undefined>)[platform] ?? 1;

/** A bound of `ms` on Linux, as long as it must be on `platform`. */
export const scaleTime = (ms: number, platform: string = process.platform): number => Math.round(ms * timeFactor(platform));
