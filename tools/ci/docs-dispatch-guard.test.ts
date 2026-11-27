// PUB-005: a docs-only dispatch is accepted only for a ref that descends from the published tag and changes nothing but docs/.
import { afterAll, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkDocsDispatch } from './docs-dispatch-guard';

const base = join(process.env.TMPDIR ?? join(homedir(), '.cache', 'zplc-tmp'), 'docs-guard-');
mkdirSync(dirname(base), { recursive: true });
const root = mkdtempSync(base);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const identity = ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false'];
const git = (cwd: string, ...args: string[]) => execFileSync('git', [...identity, ...args], { cwd, stdio: 'pipe' }).toString();
const commit = (cwd: string, file: string, text: string) => {
  mkdirSync(dirname(join(cwd, file)), { recursive: true });
  writeFileSync(join(cwd, file), text);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', `change ${file}`);
};

/** A repository with a release tag v1.0.0, a branch that diverged before it, and one branch per case. */
function fixture() {
  const cwd = mkdtempSync(join(root, 'repo-'));
  git(cwd, 'init', '-q', '-b', 'main');
  commit(cwd, 'docs/a.md', 'a');
  git(cwd, 'branch', 'before-tag');
  commit(cwd, 'packages/x.ts', 'x');
  git(cwd, 'tag', 'v1.0.0');
  git(cwd, 'checkout', '-q', '-b', 'docs-only');
  commit(cwd, 'docs/b.md', 'b');
  git(cwd, 'checkout', '-q', '-b', 'touches-packages', 'v1.0.0');
  commit(cwd, 'docs/c.md', 'c');
  commit(cwd, 'packages/y.ts', 'y');
  git(cwd, 'checkout', '-q', '-b', 'moves-outside-docs', 'v1.0.0');
  git(cwd, 'mv', 'docs/a.md', 'a.md');
  git(cwd, 'commit', '-q', '-m', 'move out of docs');
  return cwd;
}
const cwd = fixture();

describe('checkDocsDispatch', () => {
  it('accepts a ref that descends from the tag and touches only docs/', () => {
    expect(checkDocsDispatch(cwd, 'v1.0.0', 'docs-only')).toEqual({ ok: true, sha: git(cwd, 'rev-parse', 'docs-only').trim() });
  });
  it('accepts the tag itself (nothing changed)', () => {
    expect(checkDocsDispatch(cwd, 'v1.0.0', 'v1.0.0').ok).toBe(true);
  });
  it('refuses a ref that does not descend from the tag', () => {
    const result = checkDocsDispatch(cwd, 'v1.0.0', 'before-tag');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('does not descend from');
  });
  it('refuses a ref that touches packages/', () => {
    const result = checkDocsDispatch(cwd, 'v1.0.0', 'touches-packages');
    expect(!result.ok && result.reason).toContain('packages/y.ts');
  });
  it('refuses a file moved out of docs/ (the new path counts)', () => {
    const result = checkDocsDispatch(cwd, 'v1.0.0', 'moves-outside-docs');
    expect(!result.ok && result.reason).toContain('a.md');
  });
  it('refuses an unknown tag, an unknown ref and an option-looking ref', () => {
    expect(checkDocsDispatch(cwd, 'v9.9.9', 'docs-only').ok).toBe(false);
    expect(checkDocsDispatch(cwd, 'v1.0.0', 'nope').ok).toBe(false);
    expect(checkDocsDispatch(cwd, 'v1.0.0', '--output=x').ok).toBe(false);
  });
});
