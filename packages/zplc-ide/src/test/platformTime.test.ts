import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { JOURNEY_TIME_FACTOR, journeyFactor, scaleWait } from '../../scripts/journeyTiming';
import { scaleTime, TIME_FACTOR, timeFactor } from './platformTime';

describe('the platform time factor of the unit tests', () => {
  it('keeps every Linux bound as written', () => {
    expect(timeFactor('linux')).toBe(1);
    for (const ms of [1, 400, 5_000, 120_000]) expect(scaleTime(ms, 'linux')).toBe(ms);
  });

  it('stretches the bounds on macOS and Windows and treats an unknown system as Linux', () => {
    expect(scaleTime(5_000, 'darwin')).toBe(12_500);
    expect(scaleTime(5_000, 'win32')).toBe(20_000);
    expect(scaleTime(5_000, 'freebsd')).toBe(5_000);
  });

  it('is the one table: the journeys read the same object', () => {
    expect(JOURNEY_TIME_FACTOR).toBe(TIME_FACTOR);
    expect(journeyFactor('darwin')).toBe(timeFactor('darwin'));
    expect(scaleWait(1_000, 'win32')).toBe(scaleTime(1_000, 'win32'));
  });

  it('is applied to the default timeout by the preload of bunfig.toml, once for every test file', () => {
    expect(readFileSync(join(import.meta.dir, '..', '..', 'bunfig.toml'), 'utf8')).toContain('./src/test/applyPlatformTime.ts');
  });
});
