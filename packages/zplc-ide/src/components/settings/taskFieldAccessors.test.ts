import { describe, expect, it } from 'bun:test';

import { getTaskIntervalMs, getTaskWatchdogMs } from './taskFieldAccessors';

describe('taskFieldAccessors', () => {
  it('prefers unified interval_ms over deprecated interval', () => {
    expect(getTaskIntervalMs({
      name: 'MainTask',
      trigger: 'cyclic',
      interval_ms: 13,
      interval: 100,
      priority: 1,
      programs: ['main.st'],
    })).toBe(13);
  });

  it('prefers unified watchdog_ms over deprecated watchdog', () => {
    expect(getTaskWatchdogMs({
      name: 'MainTask',
      trigger: 'cyclic',
      priority: 1,
      watchdog_ms: 250,
      watchdog: 100,
      programs: ['main.st'],
    })).toBe(250);
  });
});
