// REL-036: an installer counts as installed or mounted and launched on its own system when the run left a record that
// names this very file (its checksum), the way it was opened, and the system and architecture it was opened on.
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sample } from './fixtures';
import { INSTALL_METHOD, verifyInstallRecords, writeInstallRecord, type RunnerEnv } from './install-record';
import { installerNames, type InstallerOs } from './verify-installers';

const VERSION = '2.0.0-rc.4';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const RUNNER_OS: Record<InstallerOs, string> = { mac: 'macOS', win: 'Windows', linux: 'Linux' };
const runnerOf = (os: InstallerOs, arch: 'x64' | 'arm64'): RunnerEnv => ({ RUNNER_OS: RUNNER_OS[os], RUNNER_ARCH: arch === 'x64' ? 'X64' : 'ARM64' });

/** A folder of produced installers and the records that a run which opened every one of them would have written. */
function opened(os: InstallerOs): { installers: string; records: string } {
  const root = mkdtempSync(join(tmpdir(), 'zplc-records-'));
  roots.push(root);
  const installers = join(root, 'artifacts');
  const records = join(root, 'install-records');
  mkdirSync(installers);
  for (const installer of installerNames(VERSION).filter((candidate) => candidate.os === os)) {
    const path = join(installers, installer.name);
    writeFileSync(path, sample(installer.format, installer.arch));
    writeInstallRecord(path, VERSION, records, runnerOf(os, installer.arch));
  }
  return { installers, records };
}

const recordPath = (records: string, name: string) => join(records, `install-record-${name}.json`);

describe('the record that every published installer format was opened and launched on its own system', () => {
  it.each(['mac', 'win', 'linux'] as const)('accepts the %s installers when each one has its record', (os) => {
    const { installers, records } = opened(os);
    expect(verifyInstallRecords(installers, records, VERSION, os)).toEqual([]);
  });

  it('opens each format its own way: a disk image is mounted, a package is installed, an archive is unpacked', () => {
    expect(INSTALL_METHOD).toEqual({ dmg: 'mounted', zip: 'unpacked', setup: 'installed', portable: 'run-in-place', appimage: 'run-in-container', deb: 'installed-in-container', rpm: 'installed-in-container' });
  });

  it('names the installer that no run opened', () => {
    const { installers, records } = opened('mac');
    rmSync(recordPath(records, 'zplc-2.0.0-rc.4-mac-arm64.zip'));
    expect(verifyInstallRecords(installers, records, VERSION, 'mac')).toEqual(['zplc-2.0.0-rc.4-mac-arm64.zip has no record of being mounted or installed and launched']);
  });

  it('refuses a record of another file with the same name, because the checksum no longer matches', () => {
    const { installers, records } = opened('win');
    writeFileSync(join(installers, 'zplc-2.0.0-rc.4-win-x64-portable-unsigned.exe'), 'MZ replaced after the launch');
    expect(verifyInstallRecords(installers, records, VERSION, 'win')).toEqual(['zplc-2.0.0-rc.4-win-x64-portable-unsigned.exe is not the file that was launched (checksum differs from its record)']);
  });

  it('refuses an installer that was opened on the wrong system or the wrong architecture', () => {
    const { installers, records } = opened('mac');
    const path = recordPath(records, 'zplc-2.0.0-rc.4-mac-x64.dmg');
    const record = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    writeFileSync(path, JSON.stringify({ ...record, runnerOs: 'Linux' }));
    const other = recordPath(records, 'zplc-2.0.0-rc.4-mac-arm64.dmg');
    writeFileSync(other, JSON.stringify({ ...(JSON.parse(readFileSync(other, 'utf8')) as object), runnerArch: 'X64' }));
    expect(verifyInstallRecords(installers, records, VERSION, 'mac')).toEqual([
      'zplc-2.0.0-rc.4-mac-arm64.dmg was opened on X64, its name says arm64',
      'zplc-2.0.0-rc.4-mac-x64.dmg was opened on Linux, not on macOS',
    ]);
  });

  it('refuses a package that was only run in place, and a record for a file that is not there', () => {
    const { installers, records } = opened('linux');
    const path = recordPath(records, 'zplc-2.0.0-rc.4-linux-amd64.deb');
    writeFileSync(path, JSON.stringify({ ...(JSON.parse(readFileSync(path, 'utf8')) as object), method: 'run-in-place' }));
    writeFileSync(recordPath(records, 'zplc-2.0.0-rc.4-linux-riscv.deb'), '{}');
    expect(verifyInstallRecords(installers, records, VERSION, 'linux')).toEqual([
      'install-record-zplc-2.0.0-rc.4-linux-riscv.deb.json is the record of no installer of this system',
      'zplc-2.0.0-rc.4-linux-amd64.deb was opened by run-in-place, a .deb is installed-in-container',
    ]);
  });

  it('refuses to write the record of a file that is not an installer of the scheme', () => {
    const root = mkdtempSync(join(tmpdir(), 'zplc-records-'));
    roots.push(root);
    const path = join(root, 'ZPLC IDE-2.0.0-rc.4-mac-x64.dmg');
    writeFileSync(path, sample('dmg', 'x64'));
    expect(() => writeInstallRecord(path, VERSION, join(root, 'out'), runnerOf('mac', 'x64'))).toThrow('is not one of the installers named by');
  });
});
