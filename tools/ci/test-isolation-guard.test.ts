import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { projectLoaderStub } from '../../packages/zplc-ide/src/test/projectLoaderStub';

// Bun runs every test file in one process, so a `mock.module` outlives the file that made it: a stub that misses an export
// of the real module breaks the next file that imports that export (the cascade that failed the whole IDE suite).
const SRC = join(import.meta.dir, '..', '..', 'packages', 'zplc-ide', 'src');

const testFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? testFiles(join(dir, entry.name)) : /\.test\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
  );

describe('test isolation guards', () => {
  test('the projectLoader stub has every value export of the real module', () => {
    const source = readFileSync(join(SRC, 'utils', 'projectLoader.ts'), 'utf8');
    const direct = [...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((match) => match[1]!);
    const listed = [...source.matchAll(/^export \{([^}]*)\};?$/gm)].flatMap((match) => match[1]!.split(',').map((name) => name.trim()));
    const missing = [...direct, ...listed].filter((name) => name && !(name in projectLoaderStub()));
    expect(missing, 'add these exports to src/test/projectLoaderStub.ts: a later test file would fail to import them').toEqual([]);
  });

  test('no test file writes its own partial projectLoader mock', () => {
    const own = testFiles(SRC)
      .filter((file) => /mock\.module\(['"][^'"]*projectLoader['"], \(\) => \(\{/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(own, 'use projectLoaderStub() from src/test/projectLoaderStub.ts').toEqual([]);
  });
});
