// Formatter entry point (VF-017): `bun run format` writes, `bun run format:check` checks.
//
//   bun tools/ci/format.ts --write     Prettier (TypeScript, JavaScript, CSS, JSON, Markdown) and clang-format (C)
//   bun tools/ci/format.ts --check     the same without writing, then the line-length guard
//
// The tool versions are pinned because their output changes between versions: Prettier is an exact devDependency in
// package.json, clang-format is the PyPI wheel `clang-format==CLANG_FORMAT_VERSION` (CI installs it with pipx; a
// contributor runs `pipx install clang-format==<version>`). This script refuses another clang-format version.
//
// A file is formatted to a fixed point: Prettier lays the code out, tools/ci/wrap-long-lines.ts cuts the strings and
// comments that Prettier cannot, and Prettier lays the cuts out again, until nothing changes. The generated blocks of
// a Markdown page (between `>>> GENERATED` and `<<< END GENERATED`) are the generator's text and are never reformatted:
// `protect` swaps each for a token while Prettier runs. A C header protects them with clang-format off/on comments.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as prettier from 'prettier';

import { CLANG_FILE, PRETTIER_FILE, ROOT, formattableFiles } from './format-files';
import { LIMIT, offenders } from './line-length-guard';
import { wrapFile } from './wrap-long-lines';

export const CLANG_FORMAT_VERSION = '23.1.3';

const CODE_FILE = /\.(?:ts|tsx|js|mjs|cjs)$/;
const GENERATED_BLOCK = /^[^\n]*>>> GENERATED[^\n]*\n[\s\S]*?^[^\n]*<<< END GENERATED[^\n]*$/gm;

/** Swaps the generated blocks of a Markdown page for tokens; `restore` puts them back. */
export function protect(text: string): { text: string; restore: (formatted: string) => string } {
  const blocks: string[] = [];
  const protectedText = text.replace(GENERATED_BLOCK, (block) => {
    blocks.push(block);
    return `ZPLCGENERATEDBLOCK${blocks.length - 1}END`;
  });
  return {
    text: protectedText,
    restore: (formatted) =>
      blocks.reduce((result, block, index) => {
        const token = `ZPLCGENERATEDBLOCK${index}END`;
        if (result.split(token).length !== 2) throw new Error(`the generated block ${index} was lost by the formatter`);
        return result.replace(token, () => block);
      }, formatted),
  };
}

async function layOut(file: string, text: string): Promise<string> {
  const path = resolve(ROOT, file);
  const options = (await prettier.resolveConfig(path)) ?? {};
  if (!file.endsWith('.md')) return prettier.format(text, { ...options, filepath: path });
  const guarded = protect(text);
  return guarded.restore(await prettier.format(guarded.text, { ...options, filepath: path }));
}

/**
 * The fixed point of Prettier and the wrapper for one file: the text that both leave as it is. Prettier can lay out its own
 * output differently (a member chain follows the line breaks it finds), so the loop runs until a whole round changes nothing.
 */
export async function normalize(file: string, text: string): Promise<string> {
  // Prettier first: the wrapper judges the lines of Prettier's layout, not of the hand-written one
  let current = await layOut(file, text);
  for (let round = 0; round < 8; round += 1) {
    const next = await layOut(file, CODE_FILE.test(file) ? wrapFile(file, current) : current);
    if (next === current) return current;
    current = next;
  }
  return current;
}

export function clangFormatVersion(binary: string = process.env.CLANG_FORMAT ?? 'clang-format'): string | undefined {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  return /version (\d+\.\d+\.\d+)/.exec(result.stdout ?? '')?.[1];
}

function runClang(binary: string, args: string[], files: string[]): number {
  let failed = 0;
  for (let start = 0; start < files.length; start += 400) {
    const result = spawnSync(binary, [...args, ...files.slice(start, start + 400)], { cwd: ROOT, stdio: 'inherit' });
    if (result.status !== 0) failed = result.status ?? 1;
  }
  return failed;
}

if (import.meta.main) {
  const write = process.argv.includes('--write');
  if (!write && !process.argv.includes('--check')) {
    console.error('usage: bun tools/ci/format.ts --write | --check');
    process.exit(2);
  }
  const binary = process.env.CLANG_FORMAT ?? 'clang-format';
  const version = clangFormatVersion(binary);
  if (version !== CLANG_FORMAT_VERSION) {
    console.error(
      `format: clang-format ${CLANG_FORMAT_VERSION} is required, found ${version ?? 'none'}. ` +
        `Install it with: pipx install clang-format==${CLANG_FORMAT_VERSION}`,
    );
    process.exit(2);
  }
  const files = await formattableFiles();
  let status = 0;
  const changed: string[] = [];
  for (const file of files.filter((candidate) => PRETTIER_FILE.test(candidate))) {
    const path = resolve(ROOT, file);
    const before = readFileSync(path, 'utf8');
    const after = await normalize(file, before);
    if (after === before) continue;
    changed.push(file);
    if (write) writeFileSync(path, after);
  }
  if (!write && changed.length > 0) {
    console.error(`format: ${changed.length} files are not formatted (run: bun run format)\n${changed.slice(0, 40).join('\n')}`);
    status = 1;
  }
  const clang = files.filter((file) => CLANG_FILE.test(file));
  status |= write ? runClang(binary, ['-i', '--style=file'], clang) : runClang(binary, ['--dry-run', '-Werror', '--style=file'], clang);
  if (!write) {
    const found = await offenders();
    for (const { file, line, length } of found) console.error(`${file}:${line}: ${length} columns (limit ${LIMIT})`);
    if (found.length > 0) status |= 1;
  }
  console.log(`format: ${write ? `${changed.length} files rewritten` : status === 0 ? 'clean' : 'not clean'}`);
  process.exit(status === 0 ? 0 : 1);
}
