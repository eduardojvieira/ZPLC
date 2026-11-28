import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

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

  it('equals the journey table once scripts/journeyTiming.ts exists', async () => {
    const journeys = join(import.meta.dir, '..', '..', 'scripts', 'journeyTiming.ts');
    if (!existsSync(journeys)) return; // the table lives on ci/nightly-journey-shards until that branch merges
    const { JOURNEY_TIME_FACTOR } = (await import(journeys)) as { JOURNEY_TIME_FACTOR: Record<string, number> };
    expect(TIME_FACTOR).toEqual(JOURNEY_TIME_FACTOR);
  });
});
