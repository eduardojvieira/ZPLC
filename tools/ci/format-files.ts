// The files the formatter and the line-length guard own (VF-017).
//
// .prettierignore is the one list of what is NOT formatted: git reads it with gitignore semantics
// (`git -c core.excludesFile=.prettierignore check-ignore --no-index`), so a pattern means the same here, in
// Prettier, and in the guard. Every entry carries a comment with its reason. The list covers files that a tool
// writes (their bytes belong to the generator), lockfiles, and the parent-owned spec and run records.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dir, '../..');

/** Prettier formats these. Markdown under docs/ is MDX for Docusaurus and is read with the mdx parser. */
export const PRETTIER_FILE = /\.(?:ts|tsx|js|mjs|cjs|css|json|md)$/;
/** clang-format formats these. */
export const CLANG_FILE = /\.(?:c|h)$/;
/** The line-length guard reads these: hand-written source code, not data (JSON) and not prose (Markdown). */
export const GUARDED_FILE = /\.(?:ts|tsx|js|mjs|cjs|css|c|h)$/;

function git(args: string[], input?: string): string {
  const run = spawnSync('git', args, { cwd: ROOT, input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  // check-ignore exits 1 when none of the paths is ignored
  if (run.status !== 0 && run.status !== 1) throw new Error(`git ${args.join(' ')} failed: ${run.stderr}`);
  return run.stdout;
}

/** Every tracked file that .prettierignore does not exclude, in repository order. */
export function formattableFiles(root: string = ROOT): string[] {
  const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const ignored = new Set(
    git(
      ['-c', `core.excludesFile=${resolve(root, '.prettierignore')}`, 'check-ignore', '--no-index', '-z', '--stdin'],
      tracked.join('\0'),
    )
      .split('\0')
      .filter(Boolean),
  );
  return tracked.filter((file) => !ignored.has(file));
}
