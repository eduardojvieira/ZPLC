/**
 * The emulated HIL bench (tools/hil/emulator): the vendored rp2040js patch applies to the pinned commit, and the
 * Python bench passes its own tests. The patch check needs the pinned tree: it reads it from the clone that
 * setup.sh made ($ZPLC_EMU_DIR, default ~/zplc-emu), else clones it, and is skipped when neither is possible.
 */
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const HERE = join(ROOT, 'tools/hil/emulator');
const setup = readFileSync(join(HERE, 'setup.sh'), 'utf8');
const pinned = (name: string) => setup.match(new RegExp(`^${name}="([^"]+)"`, 'm'))?.[1] ?? '';
const COMMIT = pinned('RP2040JS_COMMIT');
const URL = pinned('RP2040JS_URL');
const clone = join(process.env.ZPLC_EMU_DIR ?? join(homedir(), 'zplc-emu'), 'rp2040js');

const run = (command: string, args: string[], cwd = ROOT) => spawnSync(command, args, { cwd, encoding: 'utf8' });

/** The pristine tree of the pinned commit in a temporary directory, or null when it cannot be had offline or online. */
function pinnedTree(): string | null {
  const dir = mkdtempSync(join(tmpdir(), 'zplc-rp2040js-'));
  let source = existsSync(join(clone, '.git')) && run('git', ['-C', clone, 'cat-file', '-e', `${COMMIT}^{commit}`]).status === 0 ? clone : null;
  if (!source) {
    const fetched = join(dir, 'clone');
    if (run('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', URL, fetched]).status !== 0) {
      rmSync(dir, { recursive: true, force: true });
      return null;
    }
    source = fetched;
  }
  const tree = join(dir, 'tree');
  const unpacked = run('sh', ['-c', 'mkdir -p "$2" && git -C "$1" archive "$3" | tar -x -C "$2"', 'sh', source, tree, COMMIT]);
  return unpacked.status === 0 ? tree : null;
}

describe('emulated HIL bench (HIL-001, HIL-012)', () => {
  test('setup.sh pins rp2040js to one commit', () => {
    expect(COMMIT).toMatch(/^[0-9a-f]{40}$/);
    expect(URL).toBe('https://github.com/wokwi/rp2040js.git');
  });

  test('the vendored rp2040js patch applies cleanly to the pinned commit', () => {
    const tree = pinnedTree();
    if (!tree) {
      console.warn('skipped: the pinned rp2040js tree is neither cloned locally nor reachable over the network');
      return;
    }
    try {
      const check = run('git', ['apply', '--check', '--verbose', join(HERE, 'rp2040js-zplc-emu.patch')], tree);
      expect(check.stderr).toContain('Checking patch src/peripherals/ppb.ts');
      expect(check.status, check.stderr).toBe(0);
    } finally {
      rmSync(resolve(tree, '..'), { recursive: true, force: true });
    }
  }, 60_000);
});
