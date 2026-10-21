// Formatter entry point (VF-017): `bun run format` writes, `bun run format:check` checks.
//
//   bun tools/ci/format.ts --write     Prettier (TypeScript, JavaScript, CSS, JSON, Markdown) and clang-format (C)
//   bun tools/ci/format.ts --check     the same without writing, then the line-length guard
//
// The tool versions are pinned because their output changes between versions: Prettier is an exact devDependency in
// package.json, clang-format is the PyPI wheel `clang-format==CLANG_FORMAT_VERSION` (CI installs it with pipx; a
// contributor runs `pipx install clang-format==<version>`). This script refuses another clang-format version.
import { spawnSync } from 'node:child_process';

import { CLANG_FILE, PRETTIER_FILE, ROOT, formattableFiles } from './format-files';
import { LIMIT, offenders } from './line-length-guard';

export const CLANG_FORMAT_VERSION = '23.1.3';

const CHUNK = 400;

function run(command: string[], files: string[]): number {
  let failed = 0;
  for (let start = 0; start < files.length; start += CHUNK) {
    const result = spawnSync(command[0]!, [...command.slice(1), ...files.slice(start, start + CHUNK)], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (result.status !== 0) failed = result.status ?? 1;
  }
  return failed;
}

export function clangFormatVersion(binary: string = process.env.CLANG_FORMAT ?? 'clang-format'): string | undefined {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  return /version (\d+\.\d+\.\d+)/.exec(result.stdout ?? '')?.[1];
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
  const files = formattableFiles();
  const prettier = files.filter((file) => PRETTIER_FILE.test(file));
  const clang = files.filter((file) => CLANG_FILE.test(file));
  let status = 0;
  status |= run(['bunx', 'prettier', write ? '--write' : '--check', '--log-level', 'warn'], prettier);
  status |= run(write ? [binary, '-i', '--style=file'] : [binary, '--dry-run', '-Werror', '--style=file'], clang);
  if (!write) {
    const found = offenders();
    for (const { file, line, length } of found) console.error(`${file}:${line}: ${length} columns (limit ${LIMIT})`);
    if (found.length > 0) status |= 1;
  }
  process.exit(status === 0 ? 0 : 1);
}
