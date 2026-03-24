import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const EXPECTED_ARTIFACTS = {
  macos: ['.dmg', '.zip'],
  windows: ['-Setup.exe', '-Portable.exe'],
  linux: ['.AppImage', '.deb', '.rpm'],
} as const;

type DesktopPlatform = keyof typeof EXPECTED_ARTIFACTS;

function detectPlatform(): DesktopPlatform {
  const input = process.argv[2]?.toLowerCase();
  if (input === 'macos' || input === 'windows' || input === 'linux') {
    return input;
  }

  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    default:
      return 'linux';
  }
}

function main(): void {
  const platform = detectPlatform();
  const distDir = join(process.cwd(), 'dist-electron');
  if (!existsSync(distDir)) {
    throw new Error(`Desktop smoke build check failed: missing ${distDir}`);
  }

  const files = readdirSync(distDir);
  const missing = EXPECTED_ARTIFACTS[platform].filter(
    (suffix) => !files.some((file) => file.endsWith(suffix))
  );

  if (missing.length > 0) {
    throw new Error(
      `Desktop smoke build check failed for ${platform}: missing ${missing.join(', ')}`
    );
  }

  const nativeRuntimeDir = join(process.cwd(), 'dist-native');
  if (!existsSync(nativeRuntimeDir)) {
    throw new Error(`Desktop smoke build check failed: missing bundled native runtime directory ${nativeRuntimeDir}`);
  }

  const nativeRuntimeFiles = readdirSync(nativeRuntimeDir);
  const expectedRuntimeFile = platform === 'windows' ? 'zplc_runtime.exe' : 'zplc_runtime';
  if (!nativeRuntimeFiles.includes(expectedRuntimeFile)) {
    throw new Error(
      `Desktop smoke build check failed for ${platform}: missing bundled native runtime ${expectedRuntimeFile}`
    );
  }

  console.log(`Desktop smoke build check passed for ${platform}`);
}

main();
