// VF-010: the type-check cannot silently cover less than it did.
//
// Every TypeScript file of the repository must be matched by the `include` of a project that
// `bun run typecheck` (tools/ci/typecheck.ts) runs, and every tsconfig must be one of those projects.
// A file that a project cannot check yet is listed below with its reason; the list must stay exact, so a
// fixed file has to leave it and a new unchecked file cannot join it without a decision in review.
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import { PROGRAMS, parseProgram } from './typecheck';

const root = resolve(import.meta.dir, '../..');

/** Tracked files that no project checks, and why. */
const UNCHECKED: Record<string, string> = {
  'packages/zplc-compiler/src/compiler/arrays.test.ts': 'reads `.name` of an Expression that may be a BoolLiteral (2 errors); owned by the compiler work',
  'packages/zplc-compiler/src/compiler/compiler.test.ts': 'imports ../types/index.ts, which does not exist, and passes `language` to ProgramSource, which has none (15 errors); owned by the compiler work',
  'packages/zplc-compiler/src/compiler/stdlib/communication.test.ts': 'passes a string where an Expression is expected (2 errors); owned by the compiler work',
  'packages/zplc-hil/tests/examples/hello.ts': 'imports ../src/index, which does not exist (it is ../../src/index); the HIL package is outside the type-check work',
};

/** Projects that only point at other projects (`tsc -b`) and select no file themselves. */
const SOLUTIONS = ['packages/zplc-ide/tsconfig.json'];

function tracked(pattern: string[]): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...pattern], { cwd: root, encoding: 'utf8' });
  return out.split('\0').filter(Boolean).sort();
}

const checked = new Set<string>();
for (const program of PROGRAMS) {
  for (const file of parseProgram(root, program).fileNames) checked.add(file);
}
const absolute = (path: string) => join(root, path).replaceAll('\\', '/');

describe('type-check coverage (VF-010)', () => {
  test('every tracked TypeScript file belongs to a project that is checked, except the listed ones', () => {
    const files = tracked(['*.ts', '*.tsx', '*.mts', '*.cts']);
    expect(files.length).toBeGreaterThan(400);
    const unchecked = files.filter((file) => !checked.has(absolute(file)));
    expect(unchecked).toEqual(Object.keys(UNCHECKED).sort());
  });

  test('each listed file still exists and is still unchecked, so the list cannot go stale', () => {
    const files = new Set(tracked(['*.ts', '*.tsx']));
    for (const file of Object.keys(UNCHECKED)) {
      expect(files.has(file)).toBe(true);
      expect(checked.has(absolute(file))).toBe(false);
    }
  });

  test('every tsconfig of the repository is a checked project or a solution file', () => {
    const configs = tracked(['tsconfig*.json', '**/tsconfig*.json']);
    const known = new Set([...PROGRAMS.map((program) => join(program.cwd, program.project).replaceAll('\\', '/')).map((path) => path.replace(/^\.\//, '')), ...SOLUTIONS]);
    expect(configs.filter((config) => !known.has(config))).toEqual([]);
    for (const config of known) expect(configs).toContain(config);
  });

  test('the project list names the application, Electron, preload, tools and package tests', () => {
    const covered = (needle: string) => [...checked].some((file) => file.endsWith(needle));
    for (const needle of [
      'packages/zplc-ide/src/main.tsx',
      'packages/zplc-ide/src/cli/toolApi.ts',
      'packages/zplc-ide/src/mcp/server.ts',
      'packages/zplc-ide/src/cli/toolApi.test.ts',
      'packages/zplc-ide/electron/main.ts',
      'packages/zplc-ide/electron/preload.ts',
      'packages/zplc-ide/scripts/run-journeys.ts',
      'packages/zplc-ide/vite.config.ts',
      'packages/zplc-compiler/build.ts',
      'packages/zplc-compiler/src/assembler/assembler.test.ts',
      'packages/zplc-hil/tests/opcodes/stack.test.ts',
      'tools/ci/typecheck.ts',
      'tools/contract/snapshot_ts.ts',
      'tools/fuzz/seed-corpus.ts',
      'scripts/release-version.ts',
    ]) expect(covered(needle)).toBe(true);
  });
});
