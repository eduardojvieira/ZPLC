import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import {
  REQUIRED_TOOL_API_EXPORTS,
  assertPackagedAppAsar,
  assertPackagedRuntime,
  discoverUnpackedResources,
} from './smoke-desktop-builds';

const script = join(import.meta.dir, 'smoke-desktop-builds.ts');

function binaryHeader(platform: 'linux' | 'windows' | 'macos', arch: 'x64' | 'arm64'): Uint8Array {
  const machine = arch === 'x64' ? 0x3e : 0xb7;
  if (platform === 'linux') {
    const header = new Uint8Array(20);
    header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
    new DataView(header.buffer).setUint16(18, machine, true);
    return header;
  }
  if (platform === 'windows') {
    const header = new Uint8Array(72);
    header.set([0x4d, 0x5a]);
    const view = new DataView(header.buffer);
    view.setUint32(0x3c, 0x40, true);
    header.set([0x50, 0x45, 0, 0], 0x40);
    view.setUint16(0x44, arch === 'x64' ? 0x8664 : 0xaa64, true);
    return header;
  }
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0xfeedfacf, true);
  view.setUint32(4, arch === 'x64' ? 0x01000007 : 0x0100000c, true);
  return header;
}

function writeRuntime(resources: string, platform: 'linux' | 'windows' | 'macos', arch: 'x64' | 'arm64') {
  const runtime = join(resources, 'native-runtime', platform === 'windows' ? 'zplc_runtime.exe' : 'zplc_runtime');
  mkdirSync(join(resources, 'native-runtime'), { recursive: true });
  writeFileSync(runtime, binaryHeader(platform, arch));
  if (platform !== 'windows') chmodSync(runtime, 0o755);
  return runtime;
}

test('requires firmwareBuild from the packaged Tool API', () => {
  expect(REQUIRED_TOOL_API_EXPORTS).toContain('firmwareBuild');
});

test('release builds use native runners and pass the selected architecture to smoke checks', () => {
  const workflow = readFileSync(join(import.meta.dir, '../../../.github/workflows/release.yml'), 'utf8');
  for (const [job, x64Runner, arm64Runner, platform] of [
    ['build-macos', 'macos-15-intel', 'macos-15', 'macos'],
    ['build-windows', 'windows-2025', 'windows-11-vs2026-arm', 'windows'],
    ['build-linux', 'ubuntu-24.04', 'ubuntu-24.04-arm', 'linux'],
  ]) {
    const section = workflow.match(new RegExp(`  ${job}:\\n[\\s\\S]*?(?=\\n  [a-z-]+:|$)`))?.[0] ?? '';
    expect(section).toContain('runs-on: ${{ matrix.runner }}');
    expect(section).toContain(`runner: ${x64Runner}\n`);
    expect(section).toContain(`runner: ${arm64Runner}\n`);
    expect(section).toContain(`bun run smoke:desktop-builds ${platform} \${{ matrix.arch }}`);
  }
  const windows = workflow.match(/ {2}build-windows:\n[\s\S]*?(?=\n {2}[a-z-]+:|$)/)?.[0] ?? '';
  expect(windows).toContain('arch: x64\n            runner: windows-2025\n            cmake_arch: x64');
  expect(windows).toContain('arch: arm64\n            runner: windows-11-vs2026-arm\n            cmake_arch: ARM64');
  expect(windows).toContain('-A ${{ matrix.cmake_arch }}');
});

test('requires each packaged runtime binary to match its platform and architecture', () => {
  const root = mkdtempSync(join(tmpdir(), 'zplc-desktop-smoke-'));
  try {
    for (const platform of ['linux', 'windows', 'macos'] as const) {
      for (const arch of ['x64', 'arm64'] as const) {
        const resources = join(root, `${platform}-${arch}`);
        writeRuntime(resources, platform, arch);
        expect(assertPackagedRuntime(resources, platform, arch)).toEndWith(platform === 'windows' ? 'zplc_runtime.exe' : 'zplc_runtime');
        expect(() => assertPackagedRuntime(resources, platform, arch === 'x64' ? 'arm64' : 'x64')).toThrow('architecture');
      }
    }
    const platformMismatch = join(root, 'platform-mismatch');
    mkdirSync(join(platformMismatch, 'native-runtime'), { recursive: true });
    writeFileSync(join(platformMismatch, 'native-runtime', 'zplc_runtime'), binaryHeader('windows', 'x64'));
    chmodSync(join(platformMismatch, 'native-runtime', 'zplc_runtime'), 0o755);
    expect(() => assertPackagedRuntime(platformMismatch, 'linux', 'x64')).toThrow('architecture');
    const truncated = join(root, 'truncated');
    mkdirSync(join(truncated, 'native-runtime'), { recursive: true });
    writeFileSync(join(truncated, 'native-runtime', 'zplc_runtime'), new Uint8Array([0x7f, 0x45, 0x4c, 0x46]));
    chmodSync(join(truncated, 'native-runtime', 'zplc_runtime'), 0o755);
    expect(() => assertPackagedRuntime(truncated, 'linux', 'x64')).toThrow('truncated');

    const unknown = join(root, 'unknown');
    mkdirSync(join(unknown, 'native-runtime'), { recursive: true });
    writeFileSync(join(unknown, 'native-runtime', 'zplc_runtime'), '#!/bin/sh\n');
    chmodSync(join(unknown, 'native-runtime', 'zplc_runtime'), 0o755);
    expect(() => assertPackagedRuntime(unknown, 'linux', 'x64')).toThrow('unknown binary format');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function withFixture(build: (root: string) => void): ReturnType<typeof Bun.spawnSync> {
  const root = mkdtempSync(join(tmpdir(), 'zplc-desktop-smoke-'));
  try {
    mkdirSync(join(root, 'dist-electron', 'zplc-ide-linux-x64-unpacked', 'resources'), { recursive: true });
    mkdirSync(join(root, 'dist-native'), { recursive: true });
    for (const extension of ['.AppImage', '.deb', '.rpm']) {
      writeFileSync(join(root, 'dist-electron', `ZPLC IDE-1.5.0-linux-x64${extension}`), 'artifact');
    }
    writeFileSync(join(root, 'dist-native', 'zplc_runtime'), '#!/bin/sh\n');
    chmodSync(join(root, 'dist-native', 'zplc_runtime'), 0o755);
    build(root);
    return Bun.spawnSync(['bun', script, 'linux'], { cwd: root, stderr: 'pipe', stdout: 'pipe' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('fails when the packaged Tool API is missing', () => {
  const result = withFixture((root) => {
    writeFileSync(join(root, 'dist-electron', 'zplc-ide-linux-x64-unpacked', 'resources', 'app.asar'), 'not an asar');
  });

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain('electron-dist/toolApi.js');
});

test('discovers macOS and unpacked resources without assuming a product directory name', () => {
  const root = mkdtempSync(join(tmpdir(), 'zplc-desktop-smoke-'));
  try {
    const linuxResources = join(root, 'odd-linux-unpacked', 'resources');
    const macResources = join(root, 'mac', 'Any Product.app', 'Contents', 'Resources');
    mkdirSync(linuxResources, { recursive: true });
    mkdirSync(macResources, { recursive: true });
    expect(discoverUnpackedResources(root)).toEqual([linuxResources, macResources].sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects missing app archives and packaged runtimes instead of source build inputs', () => {
  const root = mkdtempSync(join(tmpdir(), 'zplc-desktop-smoke-'));
  try {
    const resources = join(root, 'resources');
    mkdirSync(join(root, 'dist-native'), { recursive: true });
    writeFileSync(join(root, 'dist-native', 'zplc_runtime'), '#!/bin/sh\n');
    mkdirSync(resources, { recursive: true });
    expect(() => assertPackagedAppAsar(resources)).toThrow('missing packaged app.asar');
    writeFileSync(join(resources, 'app.asar'), '');
    expect(() => assertPackagedAppAsar(resources)).toThrow('missing packaged app.asar');
    writeFileSync(join(resources, 'app.asar'), 'archive');
    expect(() => assertPackagedRuntime(resources, 'linux')).toThrow('missing packaged native runtime');
    mkdirSync(join(resources, 'native-runtime'));
    writeFileSync(join(resources, 'native-runtime', 'zplc_runtime'), 'runtime');
    expect(() => assertPackagedRuntime(resources, 'linux')).toThrow('not executable');
    expect(writeRuntime(resources, 'windows', 'x64')).toEndWith('zplc_runtime.exe');
    expect(assertPackagedRuntime(resources, 'windows', 'x64')).toEndWith('zplc_runtime.exe');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects symlinked packaged resources and files when the host permits symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'zplc-desktop-smoke-'));
  try {
    const resources = join(root, 'resources');
    const archive = join(root, 'app.asar');
    const runtime = join(root, 'zplc_runtime');
    mkdirSync(join(resources, 'native-runtime'), { recursive: true });
    writeFileSync(archive, 'archive');
    writeFileSync(runtime, 'runtime');
    chmodSync(runtime, 0o755);
    try {
      symlinkSync(archive, join(resources, 'app.asar'));
      symlinkSync(runtime, join(resources, 'native-runtime', 'zplc_runtime'));
    } catch {
      return;
    }
    expect(() => assertPackagedAppAsar(resources)).toThrow('missing packaged app.asar');
    expect(() => assertPackagedRuntime(resources, 'linux')).toThrow('missing packaged native runtime');

    const linkedUnpacked = join(root, 'linked-linux-unpacked');
    mkdirSync(linkedUnpacked);
    try {
      symlinkSync(resources, join(linkedUnpacked, 'resources'));
    } catch {
      return;
    }
    expect(discoverUnpackedResources(root)).not.toContain(join(linkedUnpacked, 'resources'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
