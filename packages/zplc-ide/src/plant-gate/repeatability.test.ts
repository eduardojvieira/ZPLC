import { describe, expect, it } from 'bun:test';

import { loadJolt } from './jolt';
import { palletStack } from './scenes';
import { runScripted, STACK_SCRIPT } from './trace';

const EXPECTED_HASH = '5091d6e028aba6d068fdf4079149def92c8fafec4e53b6260c8a64d93f1916e0';

describe('repeatability (gate check 2)', () => {
  it('gives the same hash on three fresh runs', async () => {
    const hashes: string[] = [];
    for (let run = 0; run < 3; run += 1) hashes.push(await runScripted(await loadJolt(), palletStack(), STACK_SCRIPT));
    console.log('plant-gate repeatability', process.platform, process.arch, hashes[0]);
    expect(new Set(hashes).size).toBe(1);
  }, 120_000);

  it('gives the hash pinned on Linux', async () => {
    expect(await runScripted(await loadJolt(), palletStack(), STACK_SCRIPT)).toBe(EXPECTED_HASH);
  }, 120_000);
});
