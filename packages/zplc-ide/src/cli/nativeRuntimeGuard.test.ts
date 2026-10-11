import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
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

async function runGuardedFiles(env: { CI?: string; ZPLC_NATIVE_SIM_BIN: string }, files = guardedFiles) {
  const dir = await mkdtemp(join(tmpdir(), 'zplc-native-guard-'));
  try {
    const childEnv = { ...process.env, ...env };
    if (env.CI === undefined) delete childEnv.CI;
    const child = Bun.spawn([process.execPath, 'test', '--reporter=junit', `--reporter-outfile=${join(dir, 'report.xml')}`, ...files], {
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
    const skipped = [...report.matchAll(/<testcase name="([^"]*)"[^>]*?(?:\/>|>([\s\S]*?)<\/testcase>)/g)].filter(([, , body]) => body?.includes('<skipped')).map(([, name]) => name);
    return { exitCode, outcome, stderr, skipped, report };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const missingBinary = join(import.meta.dir, 'no-such-zplc-runtime');

// Every test file of this package that reaches the native runtime: it names the variable that points at it, or imports the guard.
// ponytail: found by its text, so a test that finds the binary by another route is missed; the guard is the one route this repository uses.
function filesThatReachTheRuntime(): string[] {
  const packageRoot = join(import.meta.dir, '../..');
  const listed = Bun.spawnSync(['git', 'ls-files', '--', 'src', 'electron', 'scripts'], { cwd: packageRoot });
  expect(listed.exitCode).toBe(0);
  return listed.stdout.toString().split('\n')
    .filter((file) => /\.test\.tsx?$/.test(file) && !file.endsWith('nativeRuntimeGuard.test.ts'))
    .filter((file) => /ZPLC_NATIVE_SIM_BIN|nativeRuntimeGuard/.test(readFileSync(join(packageRoot, file), 'utf8')))
    .map((file) => join(packageRoot, file));
}

describe('tests that need the native runtime binary', () => {
  it('VF-023 fail in CI when the binary is missing', async () => {
    const { exitCode, outcome, stderr } = await runGuardedFiles({ CI: 'true', ZPLC_NATIVE_SIM_BIN: missingBinary });
    expect(exitCode).not.toBe(0);
    expect(nativeTests.map(outcome)).toEqual(['fail', 'fail', 'fail']);
    expect(stderr).toContain(`native runtime binary not found: ${missingBinary}`);
  }, 120_000);

  it('VF-023 are never skipped in CI when the binary is missing, in any test file that reaches the runtime', async () => {
    const files = filesThatReachTheRuntime();
    expect(files.length).toBeGreaterThan(15);
    const { skipped, exitCode } = await runGuardedFiles({ CI: 'true', ZPLC_NATIVE_SIM_BIN: missingBinary }, files);
    expect(exitCode).not.toBe(0);
    expect(skipped).toEqual([]);
  }, 240_000);

  it('VF-023 are skipped outside CI when the binary is missing, and say how to run them', async () => {
    const { outcome, stderr } = await runGuardedFiles({ ZPLC_NATIVE_SIM_BIN: missingBinary });
    expect(nativeTests.map(outcome)).toEqual(['skip', 'skip', 'skip']);
    expect(stderr).toContain(`native runtime binary not found: ${missingBinary}`);
    expect(stderr).toContain('bun run build:runtime');
  }, 120_000);

  // Needs the binary itself, so it is also the proof that a CI run with the binary built executes them.
  itNative('run and pass in CI when the binary is present', async () => {
    const { outcome } = await runGuardedFiles({ CI: 'true', ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary });
    expect(nativeTests.map(outcome)).toEqual(['pass', 'pass', 'pass']);
  }, 120_000);
});
