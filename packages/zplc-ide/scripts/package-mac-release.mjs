import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function run(command, args, cwd, env = process.env) {
  execFileSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  });
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
  const hasExplicitMacSigningIdentity = Boolean(
    process.env.CSC_LINK
    || process.env.CSC_NAME
    || process.env.APPLE_ID
    || process.env.APPLE_TEAM_ID
    || process.env.APPLE_API_KEY
    || process.env.APPLE_API_KEY_ID
    || process.env.APPLE_API_ISSUER,
  );
  const shouldDisableHardenedRuntimeForPreview =
    process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false' && !hasExplicitMacSigningIdentity;

  const copyTargets = [
    { path: 'package.json', directory: false },
    { path: 'bun.lock', directory: false },
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
    run('bun', ['install'], stagedRepo);

    run('bun', ['run', 'build'], path.join(stagedRepo, 'packages/zplc-compiler'));
    run('cmake', ['-S', 'firmware/lib/zplc_core', '-B', 'firmware/lib/zplc_core/build'], stagedRepo);
    run('cmake', ['--build', 'firmware/lib/zplc_core/build', '--target', 'zplc_runtime'], stagedRepo);
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
    if (shouldDisableHardenedRuntimeForPreview) {
      console.warn(
        `[mac-release] No explicit Apple signing identity detected for ${arch}; disabling hardened runtime for preview artifact compatibility.`,
      );
      electronBuilderArgs.push('-c.mac.hardenedRuntime=false');
    }

    run(
      'bun',
      electronBuilderArgs,
      path.join(stagedRepo, 'packages/zplc-ide'),
      {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      },
    );

    const stagedAppCandidates = [
      path.join(stagedDistElectron, `mac-${arch}`, 'zplc-ide.app'),
      path.join(stagedDistElectron, 'mac', 'zplc-ide.app'),
    ];
    const stagedAppPath = stagedAppCandidates.find((candidate) => existsSync(candidate));
    if (!stagedAppPath) {
      throw new Error(`Missing staged mac app bundle in any expected path: ${stagedAppCandidates.join(', ')}`);
    }

    run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', stagedAppPath], stagedIde);
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
