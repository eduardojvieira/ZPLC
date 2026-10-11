// REL-013: the check that reads a package. The packages here are small stand-ins that `ar`, `tar` and `cpio` make, with
// the layout fpm gives a .deb and an .rpm; a real package is read by the same code in the release workflow.
import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RULE_TARGET } from '../../../scripts/release/udev-rules';
import { fileOfPackage, udevRuleProblems } from './linux-package-files';

const have = (tool: string) => Bun.spawnSync(['sh', '-c', `command -v ${tool}`]).exitCode === 0;
const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function fakeDeb(content: string | null): string {
  const root = mkdtempSync(join(tmpdir(), 'zplc-fake-deb-'));
  roots.push(root);
  const data = join(root, 'data');
  mkdirSync(join(data, 'usr/lib/udev/rules.d'), { recursive: true });
  mkdirSync(join(data, 'opt'), { recursive: true });
  writeFileSync(join(data, 'opt/app'), 'app');
  if (content !== null) writeFileSync(join(data, `.${RULE_TARGET}`), content);
  writeFileSync(join(root, 'debian-binary'), '2.0\n');
  writeFileSync(join(root, 'control'), 'Package: zplc-ide\n');
  Bun.spawnSync(['tar', '-C', root, '-czf', join(root, 'control.tar.gz'), 'control']);
  Bun.spawnSync(['tar', '-C', data, '-czf', join(root, 'data.tar.gz'), '.']);
  const deb = join(root, 'zplc-ide.deb');
  Bun.spawnSync(['ar', 'rc', deb, 'debian-binary', 'control.tar.gz', 'data.tar.gz'], { cwd: root });
  return deb;
}

describe.skipIf(!have('ar') || !have('tar'))('the udev rule inside a .deb (REL-013)', () => {
  it('reads the file at its installed path, and nothing for a path the package does not hold', () => {
    const deb = fakeDeb('TAG+="uaccess"\n');
    expect(fileOfPackage(deb, RULE_TARGET)?.toString()).toBe('TAG+="uaccess"\n');
    expect(fileOfPackage(deb, '/usr/lib/udev/rules.d/other.rules')).toBeNull();
  });

  it('has no problem when the package holds the rule that was generated, and names the problem when it does not', () => {
    expect(udevRuleProblems(fakeDeb('the generated rule\n'), 'the generated rule\n')).toEqual([]);
    expect(udevRuleProblems(fakeDeb(null), 'the generated rule\n')[0]).toContain('does not hold');
    expect(udevRuleProblems(fakeDeb('an older rule\n'), 'the generated rule\n')[0]).toContain('not the rule that scripts/release/udev-rules.ts generates');
  });

  it('refuses a file that is not a package', () => {
    expect(() => fileOfPackage('/tmp/x.tar', RULE_TARGET)).toThrow('neither a .deb nor an .rpm');
  });
});
