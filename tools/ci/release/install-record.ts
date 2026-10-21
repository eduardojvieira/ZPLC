// The proof that an installer was opened (REL-036, VF-021):
//
//   bun tools/ci/release/install-record.ts write  --version <v> --out <folder> <installer>...
//   bun tools/ci/release/install-record.ts verify --installers <folder> --records <folder> --version <v> --os mac|win|linux
//
// A platform job writes one record after the step that mounted the disk image, unpacked the archive, ran the setup silently
// or installed the package in a clean container, and launched the application: the step fails first when that did not
// work, so a record exists only for a launch that happened. The record names the file by its checksum, the way it was
// opened and the system and architecture of the runner. The evidence job of the platform then checks the records against
// the installers that it is about to bundle, so an installer that no run opened, or that is not the file that was opened,
// cannot reach the draft release. It reads no workflow.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { SCHEME, installerNames, type Installer, type InstallerFormat, type InstallerOs } from './verify-installers';

export type InstallMethod = 'mounted' | 'unpacked' | 'installed' | 'run-in-place' | 'run-in-container' | 'installed-in-container';

/** How each format is opened on its own system; a launch in any other way proves nothing about that format. */
export const INSTALL_METHOD: Record<InstallerFormat, InstallMethod> = {
  dmg: 'mounted',
  zip: 'unpacked',
  setup: 'installed',
  portable: 'run-in-place',
  appimage: 'run-in-container',
  deb: 'installed-in-container',
  rpm: 'installed-in-container',
};

const RUNNER_OS: Record<InstallerOs, string> = { mac: 'macOS', win: 'Windows', linux: 'Linux' };
const RUNNER_ARCH = { x64: 'X64', arm64: 'ARM64' } as const;

export interface RunnerEnv {
  RUNNER_OS?: string;
  RUNNER_ARCH?: string;
}

export interface InstallRecord {
  schemaVersion: 1;
  installer: string;
  sha256: string;
  method: InstallMethod;
  runnerOs: string;
  runnerArch: string;
}

const recordName = (installer: string) => `install-record-${installer}.json`;
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Writes the record of an installer that the calling step has just opened; the file name must be one of the fourteen. */
export function writeInstallRecord(
  installerPath: string,
  version: string,
  outDirectory: string,
  env: RunnerEnv = process.env as RunnerEnv,
): InstallRecord {
  const name = basename(installerPath);
  const installer = installerNames(version).find((candidate) => candidate.name === name);
  if (installer === undefined) throw new Error(`${name} is not one of the installers named by ${SCHEME} for ${version}`);
  const record: InstallRecord = {
    schemaVersion: 1,
    installer: name,
    sha256: sha256(installerPath),
    method: INSTALL_METHOD[installer.format],
    runnerOs: env.RUNNER_OS ?? '',
    runnerArch: env.RUNNER_ARCH ?? '',
  };
  mkdirSync(outDirectory, { recursive: true });
  writeFileSync(join(outDirectory, recordName(name)), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function files(directory: string): Array<{ name: string; path: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [{ name: entry.name, path: join(directory, entry.name) }],
  );
}

/**
 * What is wrong with the records for the installers of one system; an empty list means each was opened as its format is, on its own system.
 */
export function verifyInstallRecords(installersDirectory: string, recordsDirectory: string, version: string, os: InstallerOs): string[] {
  const problems: string[] = [];
  const installers = new Map<string, Installer>(
    installerNames(version)
      .filter((installer) => installer.os === os)
      .map((installer) => [installer.name, installer]),
  );
  const produced = new Map(
    files(installersDirectory)
      .filter((file) => installers.has(file.name))
      .map((file) => [file.name, file.path]),
  );
  const records = new Map(
    files(recordsDirectory)
      .filter((file) => /^install-record-.+\.json$/.test(file.name))
      .map((file) => [file.name, file.path]),
  );
  for (const [name, installer] of installers) {
    const path = produced.get(name);
    const recordPath = records.get(recordName(name));
    if (path === undefined) continue; // a missing installer is verify-installers' finding, not a second one here
    if (recordPath === undefined) {
      problems.push(`${name} has no record of being mounted or installed and launched`);
      continue;
    }
    const record = JSON.parse(readFileSync(recordPath, 'utf8')) as Partial<InstallRecord>;
    if (record.sha256 !== sha256(path)) problems.push(`${name} is not the file that was launched (checksum differs from its record)`);
    if (record.method !== INSTALL_METHOD[installer.format])
      problems.push(
        `${name} was opened by ${record.method}, a .${
          installer.format === 'setup' || installer.format === 'portable'
            ? 'exe'
            : installer.format === 'appimage'
              ? 'AppImage'
              : installer.format
        } is ${INSTALL_METHOD[installer.format]}`,
      );
    if (record.runnerOs !== RUNNER_OS[os])
      problems.push(`${name} was opened on ${record.runnerOs || 'an unknown system'}, not on ${RUNNER_OS[os]}`);
    if (record.runnerArch !== RUNNER_ARCH[installer.arch])
      problems.push(`${name} was opened on ${record.runnerArch || 'an unknown architecture'}, its name says ${installer.arch}`);
  }
  for (const recordName of [...records.keys()].sort()) {
    const name = recordName.slice('install-record-'.length, -'.json'.length);
    if (!installers.has(name)) problems.push(`${recordName} is the record of no installer of this system`);
  }
  return problems.sort((a, b) => a.localeCompare(b));
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      version: { type: 'string' },
      out: { type: 'string' },
      installers: { type: 'string' },
      records: { type: 'string' },
      os: { type: 'string' },
    },
  });
  const [command, ...paths] = positionals;
  if (command === 'write' && values.version && values.out && paths.length > 0) {
    for (const path of paths)
      console.log(
        `install-record: ${writeInstallRecord(resolve(path), values.version, resolve(values.out)).installer} was opened by ${
          INSTALL_METHOD[installerNames(values.version).find((i) => i.name === basename(path))!.format]
        }`,
      );
  } else if (
    command === 'verify' &&
    values.version &&
    values.installers &&
    values.records &&
    ['mac', 'win', 'linux'].includes(values.os ?? '')
  ) {
    const problems = verifyInstallRecords(resolve(values.installers), resolve(values.records), values.version, values.os as InstallerOs);
    if (problems.length > 0) {
      console.error(problems.map((problem) => `install-record: ${problem}`).join('\n'));
      process.exit(1);
    }
    console.log(`install-record: every ${values.os} installer has the record of a launch on its own system`);
  } else {
    console.error(
      'usage: install-record.ts write --version <v> --out <folder> <installer>... | verify --installers <folder> --records <folder> ' +
        '--version <v> --os mac|win|linux',
    );
    process.exit(2);
  }
}
