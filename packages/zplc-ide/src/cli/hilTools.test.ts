import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

import { itNative, nativeRuntimeBinary } from './nativeRuntimeGuard';

// The Python side of tools/hil is tested by Python unit tests that no CI job ran by themselves. They run here, under the
// Studio suite that CI does run, so that a device script that stops failing when a check fails (HIL-004), a port path
// that comes back (HIL-007) or a CRC check that compares a library with itself (HIL-017) turns the build red.
// ponytail: the tests are Python's and are run as a subprocess; a CI job of their own (python3 -m unittest discover -s
// tools/hil) is the better home once the workflow can be edited, and this file then goes.

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const python = Bun.which('python3');
const inCi = !['', '0', 'false'].includes(process.env.CI ?? '');
const withPython = python || !inCi ? test.skipIf(!python) : ((name: string) => test(name, () => { throw new Error('python3 is not on PATH (CI is set)'); })) as unknown as typeof test;

function run(args: string[], env: Record<string, string | undefined> = {}) {
  const done = Bun.spawnSync([python!, '-B', ...args], { cwd: ROOT, env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' });
  return { code: done.exitCode, out: `${done.stdout.toString()}${done.stderr.toString()}` };
}

describe('the Python HIL tools (HIL-004, HIL-007, HIL-017)', () => {
  withPython('tools/test_crc32_cross.py compares the C implementation with the TypeScript one and the Python library (HIL-017)', () => {
    const done = run(['tools/test_crc32_cross.py']);
    expect(done.out.slice(-400)).toContain('All CRC32 implementations agree');
    expect(done.code).toBe(0);
  }, 120_000);

  withPython('the CRC cross check fails when the implementations differ (HIL-017)', () => {
    const done = run(['-m', 'unittest', 'discover', '-s', 'tools/hil', '-p', 'test_hil_crc.py']);
    expect(done.out.slice(-300)).toContain('OK');
    expect(done.code).toBe(0);
  }, 120_000);

  (python ? itNative : test.skip)('every device script exits non-zero when a check fails and none names a port (HIL-004, HIL-007)', () => {
    const done = run(['-m', 'unittest', 'discover', '-s', 'tools/hil', '-p', 'test_hil_*.py'], { ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary });
    expect(done.out.slice(-400)).toMatch(/OK/);
    expect(done.code).toBe(0);
  }, 600_000);
});
