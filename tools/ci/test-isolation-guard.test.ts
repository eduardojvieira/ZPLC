import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Bun runs every test file in one process, so a `mock.module` outlives the file that made it: a stub that misses an export
// of the real module breaks the next file that imports that export (the cascade that failed the whole IDE suite).
const SRC = join(import.meta.dir, '..', '..', 'packages', 'zplc-ide', 'src');

const testFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? testFiles(join(dir, entry.name)) : /\.test\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
  );

describe('test isolation guards', () => {
  test('no test file writes its own partial projectLoader mock', () => {
    const own = testFiles(SRC)
      .filter((file) => /mock\.module\(['"][^'"]*projectLoader['"], \(\) => \(\{/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(own, 'use projectLoaderStub() from src/test/projectLoaderStub.ts').toEqual([]);
  });
});
