import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXPECTED_ARTIFACTS = {
  macos: ['.dmg', '.zip'],
  windows: ['-Setup.exe', '-Portable.exe'],
  linux: ['.AppImage', '.deb', '.rpm'],
} as const;

type DesktopPlatform = keyof typeof EXPECTED_ARTIFACTS;
type DesktopArch = 'x64' | 'arm64';

export const REQUIRED_TOOL_API_EXPORTS = [
  'projectInspect',
  'projectMigrationPreview',
  'projectValidate',
  'compilerCheck',
  'compilerCompile',
  'testsRun',
  'toolchainInspect',
  'firmwareBuild',
] as const;

function detectPlatform(input = process.argv[2]?.toLowerCase()): DesktopPlatform {
  if (input === 'macos' || input === 'windows' || input === 'linux') {
    return input;
  }
  if (input) throw new Error(`Expected desktop platform 'macos', 'windows', or 'linux', got '${input}'`);

  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    default:
      return 'linux';
  }
}

function detectArch(input = process.argv[3]?.toLowerCase()): DesktopArch {
  if (input === 'x64' || input === 'arm64') return input;
  if (input) throw new Error(`Expected desktop architecture 'x64' or 'arm64', got '${input}'`);
  if (process.arch === 'x64' || process.arch === 'arm64') return process.arch;
  throw new Error(`Cannot infer a supported desktop architecture from host '${process.arch}'`);
}

function directoriesAt(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => join(directory, entry.name));
}

/** Finds every packaged app resource directory rather than selecting a stale unpacked build. */
export function discoverUnpackedResources(distDir: string): string[] {
  if (!existsSync(distDir)) return [];

  const resources = new Set<string>();
  const pending = [resolve(distDir)];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const child of directoriesAt(directory)) {
      const name = basename(child);
      if (name.endsWith('.app')) {
        const macResources = join(child, 'Contents', 'Resources');
        if (existsSync(macResources) && lstatSync(macResources).isDirectory()) resources.add(macResources);
        continue;
      }
      if (name.endsWith('-unpacked')) {
        const unpackedResources = join(child, 'resources');
        if (existsSync(unpackedResources) && lstatSync(unpackedResources).isDirectory()) resources.add(unpackedResources);
        continue;
      }
      pending.push(child);
    }
  }

  return [...resources].sort();
}

export function assertPackagedAppAsar(resourcesPath: string): string {
  const appAsar = join(resourcesPath, 'app.asar');
  if (!existsSync(appAsar) || !lstatSync(appAsar).isFile()) {
    throw new Error(`Desktop smoke build check failed: missing packaged app.asar in ${resourcesPath}`);
  }
  return appAsar;
}

function readRuntimeHeader(runtime: string): Uint8Array {
  const file = openSync(runtime, 'r');
  try {
    const header = new Uint8Array(4096);
    return header.subarray(0, readSync(file, header, 0, header.length, 0));
  } finally {
    closeSync(file);
  }
}

function readU16LE(header: Uint8Array, offset: number): number {
  return new DataView(header.buffer, header.byteOffset, header.byteLength).getUint16(offset, true);
}

function readU32LE(header: Uint8Array, offset: number): number {
  return new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(offset, true);
}

function assertRuntimeFormat(runtime: string, platform: DesktopPlatform, arch: DesktopArch): void {
  const header = readRuntimeHeader(runtime);
  let actualPlatform: DesktopPlatform;
  let actualArch: DesktopArch;
  if (header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46) {
    if (header.length < 20) throw new Error(`Desktop smoke build check failed: truncated ELF runtime ${runtime}`);
    if (header[4] !== 2 || header[5] !== 1) throw new Error(`Desktop smoke build check failed: unsupported ELF runtime ${runtime}`);
    actualPlatform = 'linux';
    actualArch = readU16LE(header, 18) === 0x3e ? 'x64' : readU16LE(header, 18) === 0xb7 ? 'arm64' : (() => { throw new Error(`Desktop smoke build check failed: unsupported ELF architecture in ${runtime}`); })();
  } else if (header[0] === 0x4d && header[1] === 0x5a) {
    if (header.length < 64) throw new Error(`Desktop smoke build check failed: truncated PE runtime ${runtime}`);
    const peOffset = readU32LE(header, 0x3c);
    if (peOffset > header.length - 6) throw new Error(`Desktop smoke build check failed: truncated PE runtime ${runtime}`);
    if (header[peOffset] !== 0x50 || header[peOffset + 1] !== 0x45 || header[peOffset + 2] !== 0 || header[peOffset + 3] !== 0) {
      throw new Error(`Desktop smoke build check failed: invalid PE runtime ${runtime}`);
    }
    actualPlatform = 'windows';
    actualArch = readU16LE(header, peOffset + 4) === 0x8664 ? 'x64' : readU16LE(header, peOffset + 4) === 0xaa64 ? 'arm64' : (() => { throw new Error(`Desktop smoke build check failed: unsupported PE architecture in ${runtime}`); })();
  } else if (header.length >= 8 && readU32LE(header, 0) === 0xfeedfacf) {
    actualPlatform = 'macos';
    actualArch = readU32LE(header, 4) === 0x01000007 ? 'x64' : readU32LE(header, 4) === 0x0100000c ? 'arm64' : (() => { throw new Error(`Desktop smoke build check failed: unsupported Mach-O architecture in ${runtime}`); })();
  } else {
    throw new Error(`Desktop smoke build check failed: unknown binary format for packaged native runtime ${runtime}`);
  }
  if (actualPlatform !== platform || actualArch !== arch) {
    throw new Error(`Desktop smoke build check failed: packaged native runtime architecture mismatch; expected ${platform}/${arch}, got ${actualPlatform}/${actualArch}`);
  }
}

export function assertPackagedRuntime(resourcesPath: string, platform: DesktopPlatform, arch = detectArch()): string {
  const runtime = join(resourcesPath, 'native-runtime', platform === 'windows' ? 'zplc_runtime.exe' : 'zplc_runtime');
  const runtimeStat = existsSync(runtime) ? lstatSync(runtime) : null;
  if (!runtimeStat?.isFile()) {
    throw new Error(`Desktop smoke build check failed for ${platform}: missing packaged native runtime ${runtime}`);
  }
  if (platform !== 'windows' && (runtimeStat.mode & 0o111) === 0) {
    throw new Error(`Desktop smoke build check failed for ${platform}: packaged native runtime is not executable ${runtime}`);
  }
  assertRuntimeFormat(runtime, platform, arch);
  return runtime;
}

export function assertPackagedToolApi(appAsar: string): void {
  const electron = createRequire(import.meta.url)('electron') as string;
  const toolApiUrl = pathToFileURL(join(appAsar, 'electron-dist', 'toolApi.js')).href;
  const probe = [
    `const required = ${JSON.stringify(REQUIRED_TOOL_API_EXPORTS)};`,
    'import(process.argv[1]).then((module) => {',
    '  const missing = required.filter((name) => typeof module[name] !== "function");',
    '  if (missing.length > 0) throw new Error(`missing callable exports: ${missing.join(", ")}`);',
    '}).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });',
  ].join('\n');
  const result = spawnSync(electron, ['-e', probe, toolApiUrl], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 30_000,
  });

  if (result.status !== 0) {
    const detail = [
      result.error?.message,
      result.signal && `terminated by signal ${result.signal}`,
      result.stderr.trim(),
      result.stdout.trim(),
    ].filter(Boolean).join('; ') || 'unknown Electron module load error';
    throw new Error(
      `Desktop smoke build check failed: packaged electron-dist/toolApi.js is missing or not loadable in ${appAsar}: ${detail}`,
    );
  }
}

export function verifyPackagedResources(resourcesPaths: readonly string[], platform: DesktopPlatform, arch: DesktopArch): void {
  if (resourcesPaths.length === 0) {
    throw new Error('Desktop smoke build check failed: no unpacked Electron app resources found under dist-electron');
  }

  for (const resourcesPath of resourcesPaths) {
    const appAsar = assertPackagedAppAsar(resourcesPath);
    assertPackagedToolApi(appAsar);
    assertPackagedRuntime(resourcesPath, platform, arch);
  }
}

export function verifyDesktopBuilds(cwd = process.cwd(), platform = detectPlatform(), arch = detectArch()): void {
  const distDir = join(cwd, 'dist-electron');
  if (!existsSync(distDir)) throw new Error(`Desktop smoke build check failed: missing ${distDir}`);

  const files = readdirSync(distDir);
  const missing = EXPECTED_ARTIFACTS[platform].filter(
    (suffix) => !files.some((file) => file.endsWith(suffix))
  );

  if (missing.length > 0) {
    throw new Error(
      `Desktop smoke build check failed for ${platform}: missing ${missing.join(', ')}`
    );
  }

  verifyPackagedResources(discoverUnpackedResources(distDir), platform, arch);
  console.log(`Desktop smoke build check passed for ${platform}/${arch}`);
}

if (import.meta.main) verifyDesktopBuilds();
