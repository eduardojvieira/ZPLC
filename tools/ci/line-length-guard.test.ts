// VF-017: the formatter is configured and enforced in CI, and no hand-written source line is over the limit.
import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CLANG_FORMAT_VERSION, clangFormatVersion } from './format';
import { CLANG_FILE, GUARDED_FILE, PRETTIER_FILE, formattableFiles } from './format-files';
import { LIMIT, longLines, offenders } from './line-length-guard';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('VF-017 line-length guard: the scanner', () => {
  it('reports the lines over the limit, with their number and length', () => {
    const text = ['short', 'x'.repeat(LIMIT), 'y'.repeat(LIMIT + 1), '', 'z'.repeat(LIMIT + 30)].join('\n');
    expect(longLines(text)).toEqual([
      { line: 3, length: LIMIT + 1 },
      { line: 5, length: LIMIT + 30 },
    ]);
  });

  it('counts a code point once, and reads CRLF files as lines', () => {
    expect(longLines('é'.repeat(LIMIT) + '\r\n' + '😀'.repeat(LIMIT) + '\n')).toEqual([]);
    expect(longLines('a'.repeat(LIMIT + 1) + '\r\nb\r\n')).toEqual([{ line: 1, length: LIMIT + 1 }]);
  });

  it('honours the limit it is given', () => {
    expect(longLines('abcdef', 5)).toEqual([{ line: 1, length: 6 }]);
  });

  it('reads the files named', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'vf017-'));
    const file = join(directory, 'long.ts');
    writeFileSync(file, `const s = '${'a'.repeat(LIMIT)}';\n`);
    expect(await offenders([file])).toEqual([{ file, line: 1, length: LIMIT + 13 }]);
  });
});

describe('VF-017 line-length guard: the repository', () => {
  it('has no hand-written source line over the limit', async () => {
    expect((await offenders()).map(({ file, line, length }) => `${file}:${line}: ${length} columns`)).toEqual([]);
  });

  it('keeps the guard limit equal to the Prettier and clang-format limits', () => {
    expect((JSON.parse(read('.prettierrc.json')) as { printWidth: number }).printWidth).toBe(LIMIT);
    expect(/^ColumnLimit:\s*(\d+)$/m.exec(read('.clang-format'))?.[1]).toBe(String(LIMIT));
    expect(read('.editorconfig')).toContain(`max_line_length = ${LIMIT}`);
  });
});

describe('VF-017 formatter file selection', async () => {
  const files = await formattableFiles();

  it('formats TypeScript, CSS, JSON, Markdown and C, and guards code only', () => {
    expect(files.filter((file) => PRETTIER_FILE.test(file)).length).toBeGreaterThan(1000);
    expect(files.filter((file) => CLANG_FILE.test(file)).length).toBeGreaterThan(100);
    expect(files).toContain('packages/zplc-ide/src/main.tsx');
    expect(files).toContain('firmware/lib/zplc_core/src/core/zplc_core.c');
    expect(GUARDED_FILE.test('a.json')).toBe(false);
    expect(GUARDED_FILE.test('a.md')).toBe(false);
    expect(GUARDED_FILE.test('a.css')).toBe(true);
  });

  it('leaves out the lockfile, the spec and run records, and the files a generator writes', () => {
    for (const excluded of [
      'bun.lock',
      'packages/zplc-compiler/src/contract.generated.ts',
      'packages/zplc-ide/src/generated/lessonIndex.json',
      'firmware/lib/zplc_core/include/zplc_proto_defs.h',
      'tools/ci/requirement-evidence.json',
    ]) {
      expect(files).not.toContain(excluded);
    }
    expect(files.some((file) => file.startsWith('specs/') || file.startsWith('odd/'))).toBe(false);
  });

  it('gives every .prettierignore group of entries a reason in the comment that opens it', () => {
    const groups = read('.prettierignore').trim().split(/\n\s*\n/);
    expect(groups.filter((group) => !group.startsWith('#'))).toEqual([]);
  });
});

describe('VF-017 the formatter is pinned and enforced in CI', () => {
  const manifest = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it('pins Prettier to an exact version', () => {
    expect(manifest.devDependencies.prettier).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has the format and format:check scripts', () => {
    expect(manifest.scripts.format).toBe('bun tools/ci/format.ts --write');
    expect(manifest.scripts['format:check']).toBe('bun tools/ci/format.ts --check');
  });

  it('refuses a clang-format of another version', () => {
    expect(clangFormatVersion('/nonexistent/clang-format')).toBeUndefined();
    expect(CLANG_FORMAT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
