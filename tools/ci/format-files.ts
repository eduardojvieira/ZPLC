// The files the formatter and the line-length guard own (VF-017).
//
// .prettierignore is the one list of what is NOT formatted. Prettier itself reads it (so an editor agrees with CI),
// and so do the guard and clang-format through `prettier.getFileInfo`. Every group of entries carries a comment with
// its reason: the files a tool writes (their bytes belong to the generator), lockfiles, and the parent-owned spec and
// run records.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import * as prettier from 'prettier';

export const ROOT = resolve(import.meta.dir, '../..');

/** Prettier formats these. Markdown under docs/ is MDX for Docusaurus and is read with the mdx parser. */
export const PRETTIER_FILE = /\.(?:ts|tsx|js|mjs|cjs|css|json|md)$/;
/** clang-format formats these. */
export const CLANG_FILE = /\.(?:c|h)$/;
/** The line-length guard reads these: hand-written source code, not data (JSON) and not prose (Markdown). */
export const GUARDED_FILE = /\.(?:ts|tsx|js|mjs|cjs|css|c|h)$/;

/**
 * Files that are formatted but not held to the limit, each with its reason. A message of the interface catalogs is one
 * string literal whose type the translator reads (`ParamNames` of src/i18n/translate.ts takes the `{name}` placeholders
 * from it), so cutting it in two would turn it into `string` and lose the check of every `t(key, { name })` call. Like a
 * paragraph of Markdown, a message is prose, and it is shown to a person whole.
 */
export const LINE_LENGTH_EXEMPT: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^packages\/zplc-ide\/src\/i18n\/(?:catalog\/[^/]+|en|es)\.ts$/,
    reason: 'a catalog message is a literal type that t() reads',
  },
];

export const isLengthExempt = (file: string): boolean => LINE_LENGTH_EXEMPT.some(({ pattern }) => pattern.test(file));

/** Every tracked file that .prettierignore does not exclude, in repository order. */
export async function formattableFiles(root: string = ROOT): Promise<string[]> {
  const run = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`git ls-files failed: ${run.stderr}`);
  const kept: string[] = [];
  for (const file of run.stdout.split('\0').filter(Boolean)) {
    const info = await prettier.getFileInfo(resolve(root, file), {
      ignorePath: resolve(root, '.prettierignore'),
      withNodeModules: true,
    });
    if (!info.ignored) kept.push(file);
  }
  return kept;
}
