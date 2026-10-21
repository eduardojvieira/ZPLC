// VF-021, REL-020: the installers are checked as the files that were produced: their names against the one scheme and
// their first bytes against the format their extension claims. Nothing here reads a workflow or electron-builder.yml.
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sample } from './fixtures';
import { installerName, installerNames, verifyInstallers } from './verify-installers';

const VERSION = '2.0.0-rc.4';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function produce(os?: 'mac' | 'win' | 'linux'): string {
  const root = mkdtempSync(join(tmpdir(), 'zplc-installers-'));
  roots.push(root);
  for (const { name, os: owner, format, arch } of installerNames(VERSION)) {
    if (os !== undefined && owner !== os) continue;
    // the build jobs upload into one folder each, as download-artifact lays them out
    mkdirSync(join(root, `${owner}-${arch}`), { recursive: true });
    writeFileSync(join(root, `${owner}-${arch}`, name), sample(format, arch));
  }
  return root;
}

describe('the fourteen installer files', () => {
  it('are fourteen distinct names under one scheme, in lower case with no spaces', () => {
    const names = installerNames(VERSION).map((installer) => installer.name);
    expect(new Set(names).size).toBe(14);
    for (const name of names)
      expect(name).toMatch(/^zplc-2\.0\.0-rc\.4-(mac|win|linux)-[a-z0-9_]+(-(setup|portable)-unsigned)?\.(dmg|zip|exe|AppImage|deb|rpm)$/);
    expect(names).toContain('zplc-2.0.0-rc.4-win-x64-setup-unsigned.exe');
    expect(names).toContain('zplc-2.0.0-rc.4-mac-arm64.dmg');
  });

  it('spell the architecture as the format of the Linux package does, which is what electron-builder writes', () => {
    expect(installerName(VERSION, 'deb', 'x64')).toBe('zplc-2.0.0-rc.4-linux-amd64.deb');
    expect(installerName(VERSION, 'rpm', 'x64')).toBe('zplc-2.0.0-rc.4-linux-x86_64.rpm');
    expect(installerName(VERSION, 'rpm', 'arm64')).toBe('zplc-2.0.0-rc.4-linux-aarch64.rpm');
    expect(installerName(VERSION, 'appimage', 'arm64')).toBe('zplc-2.0.0-rc.4-linux-arm64.AppImage');
  });

  it('drop unsigned from the Windows names once a signed channel exists (REL-038)', () => {
    expect(installerName(VERSION, 'setup', 'arm64', { windowsSigned: true })).toBe('zplc-2.0.0-rc.4-win-arm64-setup.exe');
  });
});

describe('the installers that were produced', () => {
  it('accept the complete set of the three systems', () => {
    expect(verifyInstallers(produce(), VERSION)).toEqual([]);
  });

  it('accept the files of one system when only that system is checked', () => {
    expect(verifyInstallers(produce('mac'), VERSION, { os: 'mac' })).toEqual([]);
  });

  it('name the installers that a build did not produce', () => {
    const problems = verifyInstallers(produce('mac'), VERSION);
    expect(problems).toContain('zplc-2.0.0-rc.4-win-x64-setup-unsigned.exe was not produced');
    expect(problems).toContain('zplc-2.0.0-rc.4-linux-amd64.deb was not produced');
  });

  it('refuse the names electron-builder wrote before the scheme: spaces, capitals, the default zip name', () => {
    const root = produce('mac');
    const folder = join(root, 'mac-arm64');
    writeFileSync(join(folder, 'ZPLC IDE-2.0.0-rc.4-mac-arm64.dmg'), sample('dmg', 'arm64'));
    writeFileSync(join(folder, 'zplc-2.0.0-rc.4-arm64-mac.zip'), sample('zip', 'arm64'));
    const problems = verifyInstallers(root, VERSION, { os: 'mac' });
    expect(problems).toContain('ZPLC IDE-2.0.0-rc.4-mac-arm64.dmg is not named by <product>-<version>-<os>-<arch>[-<variant>].<ext>');
    expect(problems).toContain('zplc-2.0.0-rc.4-arm64-mac.zip is not named by <product>-<version>-<os>-<arch>[-<variant>].<ext>');
  });

  it('refuse a file that is not the container its extension claims', () => {
    const root = produce('mac');
    writeFileSync(join(root, 'mac-x64', 'zplc-2.0.0-rc.4-mac-x64.dmg'), sample('zip', 'x64'));
    expect(verifyInstallers(root, VERSION, { os: 'mac' })).toEqual(['zplc-2.0.0-rc.4-mac-x64.dmg is not a disk image (no UDIF trailer)']);
  });

  it('refuse an AppImage whose program is for the other architecture than its name says', () => {
    const root = produce('linux');
    writeFileSync(join(root, 'linux-arm64', 'zplc-2.0.0-rc.4-linux-arm64.AppImage'), sample('appimage', 'x64'));
    expect(verifyInstallers(root, VERSION, { os: 'linux' })).toEqual([
      'zplc-2.0.0-rc.4-linux-arm64.AppImage holds a x64 program, its name says arm64',
    ]);
  });

  it('refuse the same name twice, which the release would merge into one file', () => {
    const root = produce('win');
    mkdirSync(join(root, 'again'));
    writeFileSync(join(root, 'again', 'zplc-2.0.0-rc.4-win-x64-portable-unsigned.exe'), sample('portable', 'x64'));
    expect(verifyInstallers(root, VERSION, { os: 'win' })).toEqual(['zplc-2.0.0-rc.4-win-x64-portable-unsigned.exe is produced twice']);
  });

  it('ignore the files that are not installers: the standalone tools and the bill of materials', () => {
    const root = produce('linux');
    writeFileSync(join(root, 'linux-x64', 'zplc-cli-2.0.0-rc.4-linux-x64'), 'tool');
    writeFileSync(join(root, 'linux-x64', 'ZPLC-2.0.0-rc.4-linux.cdx.json'), '{}');
    expect(verifyInstallers(root, VERSION, { os: 'linux' })).toEqual([]);
  });

  it('ignore the standalone tools of Windows, which are executables that are not installers', () => {
    const root = produce('win');
    writeFileSync(join(root, 'win-x64', 'zplc-cli-2.0.0-rc.4-win-x64.exe'), 'MZ tool');
    writeFileSync(join(root, 'win-arm64', 'zplc-mcp-2.0.0-rc.4-win-arm64.exe'), 'MZ tool');
    expect(verifyInstallers(root, VERSION, { os: 'win' })).toEqual([]);
  });
});
