// PUB-005: the manual docs deploy accepts a ref only if it descends from the latest published release tag and changes
// nothing outside docs/ since that tag. Usage: bun tools/ci/docs-dispatch-guard.ts --tag <tag> --ref <ref>
// On success it prints `sha=<commit>` (for $GITHUB_OUTPUT); on refusal it prints the reason and exits 1.
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

export type GuardResult = { ok: true; sha: string } | { ok: false; reason: string };

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();
const commitOf = (cwd: string, name: string) => {
  try {
    return git(cwd, 'rev-parse', '--verify', '--end-of-options', `${name}^{commit}`);
  } catch {
    return undefined;
  }
};

export function checkDocsDispatch(cwd: string, tag: string, ref: string): GuardResult {
  if (!tag || tag.startsWith('-')) return { ok: false, reason: `refused: "${tag}" is not a release tag.` };
  if (!ref || ref.startsWith('-')) return { ok: false, reason: `refused: "${ref}" is not a ref.` };
  const tagSha = commitOf(cwd, `refs/tags/${tag}`);
  if (!tagSha) return { ok: false, reason: `refused: the release tag ${tag} is not in this clone (fetch with tags).` };
  const sha = commitOf(cwd, ref);
  if (!sha) return { ok: false, reason: `refused: the ref "${ref}" does not exist.` };
  try {
    git(cwd, 'merge-base', '--is-ancestor', tagSha, sha);
  } catch {
    return { ok: false, reason: `refused: ${ref} (${sha.slice(0, 12)}) does not descend from the latest published release ${tag}.` };
  }
  // --no-renames lists both the old and the new path of a move, so a file moved out of docs/ is seen
  const changed = git(cwd, 'diff', '--name-only', '--no-renames', '-z', tagSha, sha).split('\0').filter(Boolean);
  const outside = changed.filter((file) => !file.startsWith('docs/'));
  if (outside.length > 0) {
    const shown = outside.slice(0, 10).join(', ') + (outside.length > 10 ? `, and ${outside.length - 10} more` : '');
    return { ok: false, reason: `refused: ${ref} changes files outside docs/ since ${tag}: ${shown}. Cut a release instead.` };
  }
  return { ok: true, sha };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { tag: { type: 'string' }, ref: { type: 'string' } } });
  const result = checkDocsDispatch(process.cwd(), values.tag ?? '', values.ref ?? '');
  if (!result.ok) {
    console.error(result.reason);
    process.exit(1);
  }
  console.log(`sha=${result.sha}`);
}
