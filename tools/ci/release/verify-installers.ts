// The installers of a release, read as the files that were produced (VF-021, REL-020):
//
//   bun tools/ci/release/verify-installers.ts <folder> --version <v> [--os mac|win|linux]
//
// REL-020 fixes fourteen installer files under one scheme, `<product>-<version>-<os>-<arch>[-<variant>].<ext>`, in lower
// case with no spaces. This looks for those names in the folder that holds what a build uploaded (at any depth), and then
// opens each file to see that its first bytes are the container its extension claims, and that an AppImage is a program
// for the architecture in its name. It reads no workflow and no electron-builder configuration: whatever the builder
// wrote is what is checked.
import { closeSync, fstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

export type InstallerOs = 'mac' | 'win' | 'linux';
export type InstallerArch = 'x64' | 'arm64';
export type InstallerFormat = 'dmg' | 'zip' | 'setup' | 'portable' | 'appimage' | 'deb' | 'rpm';

/** The product part of every name: the executable name of decision D-03 (scripts/release/identity.json). */
export const INSTALLER_PRODUCT = 'zplc';
export const SCHEME = '<product>-<version>-<os>-<arch>[-<variant>].<ext>';

const FORMATS: Record<InstallerFormat, { os: InstallerOs; ext: string; variant?: 'setup' | 'portable' }> = {
  dmg: { os: 'mac', ext: 'dmg' },
  zip: { os: 'mac', ext: 'zip' },
  setup: { os: 'win', ext: 'exe', variant: 'setup' },
  portable: { os: 'win', ext: 'exe', variant: 'portable' },
  appimage: { os: 'linux', ext: 'AppImage' },
  deb: { os: 'linux', ext: 'deb' },
  rpm: { os: 'linux', ext: 'rpm' },
};

/**
 * The architecture as the format spells it: electron-builder (builder-util getArtifactArchName) writes x64 and arm64 for the
 * macOS and Windows files, and the name each Linux package system uses for the same machine.
 */
const ARCH_NAME: Record<InstallerFormat, Record<InstallerArch, string>> = {
  dmg: { x64: 'x64', arm64: 'arm64' },
  zip: { x64: 'x64', arm64: 'arm64' },
  setup: { x64: 'x64', arm64: 'arm64' },
  portable: { x64: 'x64', arm64: 'arm64' },
  appimage: { x64: 'x86_64', arm64: 'arm64' },
  deb: { x64: 'amd64', arm64: 'arm64' },
  rpm: { x64: 'x86_64', arm64: 'aarch64' },
};

export interface NameOptions {
  /** `unsigned` is part of the Windows variant while REL-038 applies; a signed channel drops it. */
  windowsSigned?: boolean;
}

export function installerName(version: string, format: InstallerFormat, arch: InstallerArch, options: NameOptions = {}): string {
  const { os, ext, variant } = FORMATS[format];
  const suffix = variant === undefined ? '' : `-${variant}${options.windowsSigned ? '' : '-unsigned'}`;
  return `${INSTALLER_PRODUCT}-${version}-${os}-${ARCH_NAME[format][arch]}${suffix}.${ext}`;
}

export interface Installer { name: string; os: InstallerOs; format: InstallerFormat; arch: InstallerArch }

/** The fourteen installers of a version: seven formats, two architectures. */
export function installerNames(version: string, options: NameOptions = {}): Installer[] {
  return (Object.keys(FORMATS) as InstallerFormat[]).flatMap((format) =>
    (['x64', 'arm64'] as const).map((arch) => ({ name: installerName(version, format, arch, options), os: FORMATS[format].os, format, arch })));
}

const INSTALLER_EXTENSION = /\.(dmg|zip|exe|appimage|deb|rpm)$/i;
/** The standalone command line and MCP server (REL-026) are executables too, and installers of nothing. */
const STANDALONE_TOOL = /^zplc-(?:cli|mcp)-/;

function walk(directory: string): Array<{ name: string; path: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : entry.isFile() ? [{ name: entry.name, path: join(directory, entry.name) }] : []);
}

function head(path: string, length: number, position = 0): Buffer {
  const file = openSync(path, 'r');
  try {
    const bytes = Buffer.alloc(length);
    const read = readSync(file, bytes, 0, length, position);
    return bytes.subarray(0, read);
  } finally { closeSync(file); }
}

/** What is wrong with the contents of one installer; undefined when its bytes are the format it claims. */
function containerProblem(installer: Installer, path: string): string | undefined {
  const size = (() => { const file = openSync(path, 'r'); try { return fstatSync(file).size; } finally { closeSync(file); } })();
  const first = head(path, 64);
  switch (installer.format) {
    case 'dmg': return size >= 512 && head(path, 4, size - 512).toString('latin1') === 'koly' ? undefined : 'is not a disk image (no UDIF trailer)';
    case 'zip': return first.subarray(0, 4).equals(Buffer.from('PK\x03\x04', 'latin1')) ? undefined : 'is not a ZIP archive';
    case 'setup':
    case 'portable': return first.subarray(0, 2).toString('latin1') === 'MZ' ? undefined : 'is not a Windows executable';
    case 'deb': return first.toString('latin1').startsWith('!<arch>\ndebian-binary') ? undefined : 'is not a Debian package';
    case 'rpm': return first.subarray(0, 4).equals(Buffer.from([0xed, 0xab, 0xee, 0xdb])) ? undefined : 'is not an RPM package';
    case 'appimage': {
      if (first.subarray(0, 4).toString('latin1') !== '\x7fELF') return 'is not an ELF program';
      const machine = first.readUInt16LE(18);
      const program = machine === 0x3e ? 'x64' : machine === 0xb7 ? 'arm64' : `machine ${machine}`;
      return program === installer.arch ? undefined : `holds a ${program} program, its name says ${installer.arch}`;
    }
  }
}

/** What is wrong with the installers under `directory`; an empty list means the fourteen (or the system's share) are there and are what they say. */
export function verifyInstallers(directory: string, version: string, options: NameOptions & { os?: InstallerOs } = {}): string[] {
  const expected = installerNames(version, options).filter((installer) => options.os === undefined || installer.os === options.os);
  const byName = new Map(expected.map((installer) => [installer.name, installer]));
  const found = walk(directory).filter((file) => INSTALLER_EXTENSION.test(file.name) && !STANDALONE_TOOL.test(file.name));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const file of found.sort((a, b) => a.path.localeCompare(b.path))) {
    const installer = byName.get(file.name);
    if (installer === undefined) {
      // another system's file in a folder of one system is not this check's concern
      if (options.os === undefined || !installerNames(version, options).some((other) => other.name === file.name)) problems.push(`${file.name} is not named by ${SCHEME}`);
      continue;
    }
    if (seen.has(file.name)) { problems.push(`${file.name} is produced twice`); continue; }
    seen.add(file.name);
    const wrong = containerProblem(installer, file.path);
    if (wrong !== undefined) problems.push(`${file.name} ${wrong}`);
  }
  for (const installer of expected) if (!seen.has(installer.name)) problems.push(`${installer.name} was not produced`);
  return problems;
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({ args: Bun.argv.slice(2), allowPositionals: true, options: { version: { type: 'string' }, os: { type: 'string' }, 'windows-signed': { type: 'boolean' } } });
  const os = values.os as InstallerOs | undefined;
  if (!positionals[0] || !values.version || (os !== undefined && !['mac', 'win', 'linux'].includes(os))) {
    console.error('usage: verify-installers.ts <folder> --version <v> [--os mac|win|linux] [--windows-signed]');
    process.exit(2);
  }
  const problems = verifyInstallers(resolve(positionals[0]), values.version, { os, windowsSigned: values['windows-signed'] });
  if (problems.length > 0) {
    console.error(problems.map((problem) => `verify-installers: ${problem}`).join('\n'));
    process.exit(1);
  }
  console.log(`verify-installers: ${os ?? 'all three systems'} hold the installers named ${SCHEME}, each the format it claims`);
}
