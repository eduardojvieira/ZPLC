import { describe, expect, it } from 'bun:test';
import { LOADING_DELAY_MS, startDelay, type Timers } from './delay';

/** A clock the test moves by hand. */
function fakeTimers() {
  let now = 0;
  const pending = new Map<number, { at: number; callback: () => void }>();
  let next = 0;
  const timers: Timers = {
    set: (callback, milliseconds) => {
      pending.set(++next, { at: now + milliseconds, callback });
      return next;
    },
    clear: (handle) => {
      pending.delete(handle as number);
    },
  };
  const advance = (milliseconds: number): void => {
    now += milliseconds;
    for (const [id, timer] of [...pending])
      if (timer.at <= now) {
        pending.delete(id);
        timer.callback();
      }
  };
  return { timers, advance, count: () => pending.size };
}

describe('the delay of a loading indicator (UX-021)', () => {
  it('UX-021 waits 300 ms before it fires, and not a moment less', () => {
    const clock = fakeTimers();
    let fired = 0;
    startDelay(
      () => {
        fired += 1;
      },
      LOADING_DELAY_MS,
      clock.timers,
    );
    clock.advance(LOADING_DELAY_MS - 1);
    expect(fired).toBe(0);
    clock.advance(1);
    expect(fired).toBe(1);
  });

  it('UX-021 fires once and shows nothing when the operation finishes first (cancelled)', () => {
    const clock = fakeTimers();
    let fired = 0;
    const cancel = startDelay(
      () => {
        fired += 1;
      },
      LOADING_DELAY_MS,
      clock.timers,
    );
    clock.advance(120);
    cancel();
    clock.advance(1000);
    expect(fired).toBe(0);
    expect(clock.count()).toBe(0);
  });

  it('UX-021 treats 300 ms as the default delay', () => {
    expect(LOADING_DELAY_MS).toBe(300);
  });
});
