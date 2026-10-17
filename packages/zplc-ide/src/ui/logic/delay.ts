/**
 * The delay before a loading indicator appears (UX-021): an operation that finishes within 300 ms shows nothing, so a
 * fast panel does not flash a spinner. Pure, with the timers injected, so it is tested without a clock.
 */
export const LOADING_DELAY_MS = 300;

export interface Timers {
  set(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}

const browserTimers: Timers = { set: (callback, milliseconds) => setTimeout(callback, milliseconds), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };

/** Calls `onElapsed` once after `delayMs`; the returned function cancels it, and does nothing once it has fired. */
export function startDelay(onElapsed: () => void, delayMs: number = LOADING_DELAY_MS, timers: Timers = browserTimers): () => void {
  let pending = true;
  const handle = timers.set(() => { pending = false; onElapsed(); }, delayMs);
  return () => { if (pending) { pending = false; timers.clear(handle); } };
}
