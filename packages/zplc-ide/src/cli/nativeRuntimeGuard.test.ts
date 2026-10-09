import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { itNative, nativeRuntimeBinary } from './nativeRuntimeGuard';

// Runs the three test files that need the native runtime binary in a child bun, the way CI runs them.
const guardedFiles = ['nativeScenarioRuntime', 'toolApi', 'blinkyVisualPosix'].map((name) => join(import.meta.dir, `${name}.test.ts`));
// One native test of each file, by a fragment of its name.
const nativeTests = [
  'handshakes with the POSIX runtime',
  'runs one selected scenario reproducibly',
  'executes the canonical checked-in Ladder project',
];

async function runGuardedFiles(env: { CI?: string; ZPLC_NATIVE_SIM_BIN: string }) {
  const dir = await mkdtemp(join(tmpdir(), 'zplc-native-guard-'));
  try {
    const childEnv = { ...process.env, ...env };
    if (env.CI === undefined) delete childEnv.CI;
    const child = Bun.spawn([process.execPath, 'test', '--reporter=junit', `--reporter-outfile=${join(dir, 'report.xml')}`, ...guardedFiles], {
      cwd: join(import.meta.dir, '../..'),
      env: childEnv,
      stdout: 'ignore',
      stderr: 'pipe',
    });
    // The message is read from stderr: Bun 1.3.14 writes no text into the JUnit <failure/> element.
    const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    const report = await readFile(join(dir, 'report.xml'), 'utf8');
    const outcome = (fragment: string) => {
      const found = new RegExp(`<testcase name="[^"]*${fragment}[^"]*"[^>]*?(?:/>|>([\\s\\S]*?)</testcase>)`).exec(report);
      if (!found) return 'missing';
      return found[1]?.includes('<failure') ? 'fail' : found[1]?.includes('<skipped') ? 'skip' : 'pass';
    };
    return { exitCode, outcome, stderr };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const missingBinary = join(import.meta.dir, 'no-such-zplc-runtime');

describe('tests that need the native runtime binary', () => {
  it('fail in CI when the binary is missing', async () => {
    const { exitCode, outcome, stderr } = await runGuardedFiles({ CI: 'true', ZPLC_NATIVE_SIM_BIN: missingBinary });
    expect(exitCode).not.toBe(0);
    expect(nativeTests.map(outcome)).toEqual(['fail', 'fail', 'fail']);
    expect(stderr).toContain(`native runtime binary not found: ${missingBinary}`);
  }, 120_000);

  it('are skipped outside CI when the binary is missing', async () => {
    const { outcome } = await runGuardedFiles({ ZPLC_NATIVE_SIM_BIN: missingBinary });
    expect(nativeTests.map(outcome)).toEqual(['skip', 'skip', 'skip']);
  }, 120_000);

  // Needs the binary itself, so it is also the proof that a CI run with the binary built executes them.
  itNative('run and pass in CI when the binary is present', async () => {
    const { outcome } = await runGuardedFiles({ CI: 'true', ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary });
    expect(nativeTests.map(outcome)).toEqual(['pass', 'pass', 'pass']);
  }, 120_000);
});
