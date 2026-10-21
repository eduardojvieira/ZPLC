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
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

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
    expect(udevRuleProblems(fakeDeb('an older rule\n'), 'the generated rule\n')[0]).toContain(
      'not the rule that scripts/release/udev-rules.ts generates',
    );
  });

  it('refuses a file that is not a package', () => {
    expect(() => fileOfPackage('/tmp/x.tar', RULE_TARGET)).toThrow('neither a .deb nor an .rpm');
  });
});

/** A one-file .rpm made by rpmbuild, which the Fedora family and the runners that build the .rpm have. */
function fakeRpm(content: string): string {
  const root = mkdtempSync(join(tmpdir(), 'zplc-fake-rpm-'));
  roots.push(root);
  for (const folder of ['BUILD', 'RPMS', 'SOURCES', 'SPECS', 'SRPMS', 'BUILDROOT']) mkdirSync(join(root, folder));
  writeFileSync(join(root, 'SOURCES/rule'), content);
  const spec = [
    'Name: zplc-fake',
    'Version: 1',
    'Release: 1',
    'Summary: a package that holds one rule',
    'License: MIT',
    'BuildArch: noarch',
    'Source0: rule',
    '%description',
    'x',
    '%install',
    `mkdir -p %{buildroot}${RULE_TARGET.slice(0, RULE_TARGET.lastIndexOf('/'))}`,
    `cp %{SOURCE0} %{buildroot}${RULE_TARGET}`,
    '%files',
    RULE_TARGET,
  ].join('\n');
  writeFileSync(join(root, 'SPECS/fake.spec'), `${spec}\n`);
  const built = Bun.spawnSync(['rpmbuild', '--define', `_topdir ${root}`, '-bb', join(root, 'SPECS/fake.spec')], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (built.exitCode !== 0) throw new Error(built.stderr.toString());
  return join(root, 'RPMS/noarch/zplc-fake-1-1.noarch.rpm');
}

describe.skipIf(!have('rpmbuild') || !have('rpm2cpio') || !have('cpio'))('the udev rule inside an .rpm (REL-013)', () => {
  it('reads the file at its installed path, and nothing for a path the package does not hold', () => {
    const rpm = fakeRpm('TAG+="uaccess"\n');
    expect(fileOfPackage(rpm, RULE_TARGET)?.toString()).toBe('TAG+="uaccess"\n');
    expect(fileOfPackage(rpm, '/usr/lib/udev/rules.d/other.rules')).toBeNull();
    expect(udevRuleProblems(rpm, 'TAG+="uaccess"\n')).toEqual([]);
    expect(udevRuleProblems(rpm, 'another\n')[0]).toContain('not the rule that scripts/release/udev-rules.ts generates');
  });
});
