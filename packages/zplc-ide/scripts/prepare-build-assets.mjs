import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
  });
}

function createMacIcon(sourceIcon, buildDir) {
  if (process.platform !== 'darwin') {
    return;
  }

  const iconsetDir = path.join(buildDir, 'icon.iconset');
  const icnsPath = path.join(buildDir, 'icon.icns');
  const sizes = [16, 32, 64, 128, 256, 512];

  rmSync(iconsetDir, { recursive: true, force: true });
  mkdirSync(iconsetDir, { recursive: true });

  for (const size of sizes) {
    run(
      'sips',
      ['-s', 'format', 'png', '-z', String(size), String(size), sourceIcon, '--out', path.join(iconsetDir, `icon_${size}x${size}.png`)],
      buildDir,
    );
    run(
      'sips',
      ['-s', 'format', 'png', '-z', String(size * 2), String(size * 2), sourceIcon, '--out', path.join(iconsetDir, `icon_${size}x${size}@2x.png`)],
      buildDir,
    );
  }

  run('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsPath], buildDir);
}

function main() {
  const packageDir = process.cwd();
  const sourceIcon = path.join(packageDir, 'public', 'icon.png');
  const buildDir = path.join(packageDir, 'build');
  const targetIcon = path.join(buildDir, 'icon.png');

  if (!existsSync(sourceIcon)) {
    throw new Error(`Missing source app icon at ${sourceIcon}`);
  }

  mkdirSync(buildDir, { recursive: true });
  copyFileSync(sourceIcon, targetIcon);
  createMacIcon(sourceIcon, buildDir);

  console.log(`Prepared Electron build icons in ${buildDir}`);
}

main();
