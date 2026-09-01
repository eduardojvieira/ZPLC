import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { requireAcceptedNotaryResponse, requireMacReleaseSigning } from './mac-release-signing.mjs';

function run(command, args, cwd, env = process.env) {
  execFileSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  });
}

function submitNotaryDmg(args, cwd) {
  try {
    const response = execFileSync('xcrun', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    requireAcceptedNotaryResponse(response);
  } catch {
    throw new Error('macOS DMG notarization failed');
  }
}

function copyFileArtifacts(sourceDir, destinationDir) {
  mkdirSync(destinationDir, { recursive: true });

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    copyFileSync(path.join(sourceDir, entry.name), path.join(destinationDir, entry.name));
  }
}

function copyPath(source, destination, cwd, isDirectory = false) {
  mkdirSync(path.dirname(destination), { recursive: true });

  if (isDirectory) {
    run(
      'rsync',
      [
        '-a',
        '--delete',
        '--exclude', 'node_modules',
        '--exclude', 'dist',
        '--exclude', 'dist-electron',
        '--exclude', 'electron-dist',
        '--exclude', 'dist-native',
        '--exclude', 'build',
        '--exclude', '.DS_Store',
        '--exclude', '*.tsbuildinfo',
        `${source}/`,
        `${destination}/`,
      ],
      cwd,
    );
    return;
  }

  run('ditto', ['--noextattr', '--noqtn', source, destination], cwd);
}

function main() {
  const arch = process.argv[2];
  if (arch !== 'x64' && arch !== 'arm64') {
    throw new Error(`Expected mac arch argument 'x64' or 'arm64', got '${arch ?? ''}'`);
  }

  const packageDir = process.cwd();
  const repoRoot = packageDir.endsWith(path.join('packages', 'zplc-ide'))
    ? path.resolve(packageDir, '../..')
    : packageDir;
  const outputDir = packageDir.endsWith(path.join('packages', 'zplc-ide'))
    ? path.join(packageDir, 'dist-electron')
    : path.join(repoRoot, 'packages', 'zplc-ide', 'dist-electron');
  const stageDir = mkdtempSync(path.join(tmpdir(), 'zplc-ide-mac-stage-'));
  const stagedRepo = path.join(stageDir, 'ZPLC');
  const stagedIde = path.join(stagedRepo, 'packages/zplc-ide');
  const stagedDistElectron = path.join(stagedIde, 'dist-electron');
  const publishing = process.env.ZPLC_PUBLISHING === 'true';
  if (publishing) requireMacReleaseSigning(process.env);

  const copyTargets = [
    { path: 'package.json', directory: false },
    { path: 'bun.lock', directory: false },
    { path: 'docs/package.json', directory: false },
    { path: 'packages/zplc-hil/package.json', directory: false },
    { path: 'packages/zplc-compiler', directory: true },
    { path: 'packages/zplc-ide', directory: true },
    { path: 'packages/zplc-ide/build', directory: true },
    { path: 'firmware/app/boards', directory: true },
    { path: 'firmware/lib/zplc_core', directory: true },
    { path: 'firmware/apps/posix_host', directory: true },
    { path: 'examples', directory: true },
    { path: 'scripts/release-version.ts', directory: false },
  ];

  try {
    mkdirSync(stagedRepo, { recursive: true });

    for (const target of copyTargets) {
      const source = path.join(repoRoot, target.path);
      const destination = path.join(stagedRepo, target.path);
      copyPath(source, destination, repoRoot, target.directory);
    }

    run('xattr', ['-cr', stagedRepo], repoRoot);
    run('bun', ['install', '--frozen-lockfile'], stagedRepo);

    run('bun', ['run', 'build'], path.join(stagedRepo, 'packages/zplc-compiler'));
    const cmakeArch = arch === 'x64' ? 'x86_64' : 'arm64';
    run('cmake', [
      '-S', 'firmware/lib/zplc_core',
      '-B', 'firmware/lib/zplc_core/build',
      '-DCMAKE_BUILD_TYPE=Release',
      `-DCMAKE_OSX_ARCHITECTURES=${cmakeArch}`,
    ], stagedRepo);
    run('cmake', ['--build', 'firmware/lib/zplc_core/build', '--target', 'zplc_runtime', '--config', 'Release'], stagedRepo);
    mkdirSync(path.join(stagedIde, 'dist-native'), { recursive: true });
    run(
      'cp',
      ['firmware/lib/zplc_core/build/zplc_runtime', 'packages/zplc-ide/dist-native/'],
      stagedRepo,
    );
    run('bun', ['run', 'build:assets'], path.join(stagedRepo, 'packages/zplc-ide'));
    run('bun', ['run', 'build'], path.join(stagedRepo, 'packages/zplc-ide'));
    run('bun', ['run', 'electron:compile'], path.join(stagedRepo, 'packages/zplc-ide'));
    const electronBuilderArgs = ['x', 'electron-builder', '--mac', `--${arch}`, '--publish', 'never'];
    const builderEnv = { ...process.env };
    const apiKeyPath = publishing ? path.join(stageDir, 'apple-api-key.p8') : undefined;
    if (publishing) {
      if (!apiKeyPath) throw new Error('macOS release signing setup failed');
      writeFileSync(apiKeyPath, process.env.ZPLC_APPLE_API_KEY_P8, { mode: 0o600 });
      chmodSync(apiKeyPath, 0o600);
      builderEnv.CSC_LINK = process.env.ZPLC_MACOS_CSC_LINK;
      builderEnv.CSC_KEY_PASSWORD = process.env.ZPLC_MACOS_CSC_KEY_PASSWORD;
      builderEnv.APPLE_API_KEY = apiKeyPath;
      builderEnv.APPLE_API_KEY_ID = process.env.ZPLC_APPLE_API_KEY_ID;
      builderEnv.APPLE_API_ISSUER = process.env.ZPLC_APPLE_API_ISSUER;
      builderEnv.APPLE_TEAM_ID = process.env.ZPLC_APPLE_TEAM_ID;
      for (const key of [
        'ZPLC_MACOS_CSC_LINK', 'ZPLC_MACOS_CSC_KEY_PASSWORD', 'ZPLC_APPLE_API_KEY_P8',
        'ZPLC_APPLE_API_KEY_ID', 'ZPLC_APPLE_API_ISSUER', 'ZPLC_APPLE_TEAM_ID',
      ]) delete builderEnv[key];
      delete builderEnv.CSC_IDENTITY_AUTO_DISCOVERY;
      electronBuilderArgs.push('-c.forceCodeSigning=true');
    } else {
      // Preview artifacts are deliberately unsigned and cannot reach upload-release.
      builderEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
      for (const key of [
        'CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER', 'APPLE_TEAM_ID',
        'ZPLC_MACOS_CSC_LINK', 'ZPLC_MACOS_CSC_KEY_PASSWORD', 'ZPLC_APPLE_API_KEY_P8',
        'ZPLC_APPLE_API_KEY_ID', 'ZPLC_APPLE_API_ISSUER', 'ZPLC_APPLE_TEAM_ID',
      ]) delete builderEnv[key];
      electronBuilderArgs.push('-c.forceCodeSigning=false', '-c.mac.hardenedRuntime=false', '-c.mac.notarize=false');
    }

    run(
      'bun',
      electronBuilderArgs,
      path.join(stagedRepo, 'packages/zplc-ide'),
      builderEnv,
    );

    const stagedAppCandidates = [
      path.join(stagedDistElectron, `mac-${arch}`, 'zplc-ide.app'),
      path.join(stagedDistElectron, 'mac', 'zplc-ide.app'),
    ];
    const stagedAppPath = stagedAppCandidates.find((candidate) => existsSync(candidate));
    if (!stagedAppPath) {
      throw new Error(`Missing staged mac app bundle in any expected path: ${stagedAppCandidates.join(', ')}`);
    }

    if (publishing) {
      if (!apiKeyPath) throw new Error('macOS DMG notarization failed');
      const stagedDmgs = readdirSync(stagedDistElectron, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.dmg'))
        .map((entry) => path.join(stagedDistElectron, entry.name));
      if (stagedDmgs.length !== 1) {
        throw new Error(`Expected exactly one staged macOS DMG, found ${stagedDmgs.length}`);
      }
      const [stagedDmg] = stagedDmgs;
      submitNotaryDmg([
        'notarytool', 'submit', stagedDmg, '--key', apiKeyPath, '--key-id', process.env.ZPLC_APPLE_API_KEY_ID,
        '--issuer', process.env.ZPLC_APPLE_API_ISSUER, '--wait', '--output-format', 'json',
      ], stagedIde);
      run('xcrun', ['stapler', 'staple', stagedDmg], stagedIde);
    }

    run('test', ['-f', path.join(stagedAppPath, 'Contents/Resources/native-runtime/zplc_runtime')], stagedIde);

    run('mkdir', ['-p', outputDir], repoRoot);

    if (process.env.ZPLC_MAC_COPY_APP_BUNDLE === '1') {
      run('ditto', [stagedDistElectron, outputDir], repoRoot);
      return;
    }

    copyFileArtifacts(stagedDistElectron, outputDir);
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

main();
