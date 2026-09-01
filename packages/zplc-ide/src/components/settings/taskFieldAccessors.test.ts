import { describe, expect, it } from 'bun:test';

import { getTaskIntervalMs } from './taskFieldAccessors';

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
});
