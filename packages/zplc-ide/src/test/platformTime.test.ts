import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

  // bun applies a preload's setDefaultTimeout to the first file of a process only; --timeout reaches every file (bun 1.3.14, 1.4.5)
  it('gives the SECOND test file of one run the scaled default timeout, through the package test script', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zplc-timeout-'));
    try {
      const files = ['a', 'b'].map((name) => {
        const file = join(dir, `${name}.test.ts`);
        writeFileSync(file, `import { it } from 'bun:test';\nit('${name} takes 5.5 s', async () => { await Bun.sleep(5_500); });\n`);
        return file;
      });
      const run = Bun.spawnSync(['bun', 'run', 'test', '--', ...files], {
        cwd: join(import.meta.dir, '..', '..'),
        env: { ...process.env, ZPLC_TEST_PLATFORM: 'win32' },
      });
      const out = run.stdout.toString() + run.stderr.toString();
      expect(out).toContain('a takes 5.5 s');
      expect(out).toContain('b takes 5.5 s');
      expect(out).not.toContain('timed out');
      expect(run.exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
