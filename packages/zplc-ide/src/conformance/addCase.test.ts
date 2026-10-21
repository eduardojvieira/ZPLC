import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';

// VF-002: adding a conformance case needs a source file and an expected-values file, and no change to test code.
// The proof is the real runner (conformance.test.ts) started on a folder that holds nothing but such pairs: it finds
// them, compiles them, loads them into the VM and judges them, and a pair that says something false fails.
const packageRoot = join(import.meta.dir, '../..');
const runnerFile = 'src/conformance/conformance.test.ts';

const program = (value: number) => `PROGRAM Added
VAR
  Result AT %QW0 : INT;
END_VAR
Result := 2 + ${value};
END_PROGRAM
`;

async function run(root: string, env: Record<string, string>) {
  const report = join(root, 'report.xml');
  const child = Bun.spawn([process.execPath, 'test', runnerFile, '--reporter=junit', `--reporter-outfile=${report}`], {
    cwd: packageRoot,
    env: { ...process.env, CI: 'true', ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary, ZPLC_CONFORMANCE_ROOT: join(root, 'cases'), ...env },
    stdout: 'ignore',
    stderr: 'pipe',
  });
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  const xml = await readFile(report, 'utf8').catch(() => '');
  const outcome = (name: string) => {
    const found = new RegExp(`<testcase name="${name}"[^>]*?(?:/>|>([\\s\\S]*?)</testcase>)`).exec(xml);
    return found === null ? 'missing' : found[1]?.includes('<failure') ? 'fail' : 'pass';
  };
  return { exitCode, stderr, outcome };
}

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-add-case-'));
  for (const [name, text] of Object.entries(files)) {
    await mkdir(join(root, 'cases', name.split('/').slice(0, -1).join('/')), { recursive: true });
    await writeFile(join(root, 'cases', name), text);
  }
  return root;
}

const expectation = (title: string, value: number, extra: object = {}) =>
  JSON.stringify({
    requirement: 'VF-002',
    title,
    scans: 1,
    scanMs: 10,
    expect: [{ at: '%QW0', type: 'INT', value }],
    ...extra,
  });

describe('adding a conformance case (VF-002)', () => {
  itNative(
    'VF-002 a source file and an expected-values file are a new case: the runner runs it, passes it, and fails a wrong one',
    async () => {
      const root = await fixture({
        'added/right.st': program(3),
        'added/right.expect.json': expectation('the value is right', 5),
        'added/wrong.st': program(3),
        'added/wrong.expect.json': expectation('the value is wrong', 6),
        'added/rejected.st': 'PROGRAM Broken\nVAR END_VAR\n  Undeclared := 1;\nEND_PROGRAM\n',
        'added/rejected.expect.json': JSON.stringify({
          requirement: 'VF-002',
          title: 'a program that must not build',
          build: 'fails',
          lines: [3],
        }),
      });
      try {
        const { exitCode, outcome } = await run(root, {});
        expect(outcome('VF-002 the value is right')).toBe('pass');
        expect(outcome('VF-002 a program that must not build')).toBe('pass');
        expect(outcome('VF-002 the value is wrong')).toBe('fail');
        expect(exitCode).not.toBe(0);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it(
    'VF-002 a source file without its expected values is refused loudly, so a half-written case cannot assert less than it ' + 'says',
    async () => {
      const root = await fixture({ 'added/orphan.st': program(1) });
      try {
        const { exitCode, stderr } = await run(root, {});
        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('orphan.st');
        expect(stderr).toContain('asserts nothing');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
