// PUB-005: the manual docs deploy accepts a ref only if it descends from the latest published release tag and changes
// nothing outside docs/ since that tag. Usage: bun tools/ci/docs-dispatch-guard.ts --tag <tag> --ref <ref>
// or: <tags, one per line> | bun tools/ci/docs-dispatch-guard.ts --latest
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

const STABLE = /^v(\d+)\.(\d+)\.(\d+)$/;

/**
 * The highest stable semver among the tags of published releases. GitHub lists releases by creation date, so a 2.0.x
 * backport made after 2.1.0 would come first there; the order here is the version.
 */
export function latestReleaseTag(tags: string[]): string | undefined {
  const version = (tag: string) => STABLE.exec(tag)?.slice(1).map(Number);
  return tags
    .filter((tag) => version(tag))
    .sort((a, b) => {
      const [x, y] = [version(a)!, version(b)!];
      return x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]!;
    })
    .pop();
}

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
  // a link under docs/ can point at any file of the checkout: the whole tree of the ref is read, not only what changed
  const links = git(cwd, 'ls-tree', '-r', '-z', sha, '--', 'docs/')
    .split('\0')
    .filter((entry) => entry.startsWith('120000 '))
    .map((entry) => entry.slice(entry.indexOf('\t') + 1));
  if (links.length > 0) {
    const shown = links.slice(0, 10).join(', ');
    return { ok: false, reason: `refused: ${ref} holds a symbolic link under docs/ (${shown}); a link can point outside docs/.` };
  }
  return { ok: true, sha };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { tag: { type: 'string' }, ref: { type: 'string' }, latest: { type: 'boolean' } } });
  if (values.latest) {
    // the tag names of the published releases, one per line, on stdin; prints the highest stable one
    const latest = latestReleaseTag((await Bun.stdin.text()).split('\n').map((line) => line.trim()));
    if (!latest) {
      console.error('refused: no published stable release was listed.');
      process.exit(1);
    }
    console.log(latest);
    process.exit(0);
  }
  const result = checkDocsDispatch(process.cwd(), values.tag ?? '', values.ref ?? '');
  if (!result.ok) {
    console.error(result.reason);
    process.exit(1);
  }
  console.log(`sha=${result.sha}`);
}
