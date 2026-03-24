import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
  });
}

function createWindowsIcon(sourceIcon, buildDir) {
  const pythonScript = [
    'from pathlib import Path',
    'from PIL import Image',
    `source = Path(r"${sourceIcon}")`,
    `target = Path(r"${path.join(buildDir, 'icon.ico')}")`,
    'img = Image.open(source).convert("RGBA")',
    'sizes = [(16,16), (24,24), (32,32), (48,48), (64,64), (128,128), (256,256)]',
    'img.save(target, format="ICO", sizes=sizes)',
  ].join('\n');

  run('python3', ['-c', pythonScript], buildDir);
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

  const pythonScript = [
    'from pathlib import Path',
    'from PIL import Image',
    `source = Path(r"${sourceIcon}")`,
    `iconset = Path(r"${iconsetDir}")`,
    'img = Image.open(source).convert("RGBA")',
    `sizes = ${JSON.stringify(sizes)}`,
    'for size in sizes:',
    '    normal = img.resize((size, size), Image.Resampling.LANCZOS)',
    '    retina = img.resize((size * 2, size * 2), Image.Resampling.LANCZOS)',
    '    normal.save(iconset / f"icon_{size}x{size}.png", format="PNG")',
    '    retina.save(iconset / f"icon_{size}x{size}@2x.png", format="PNG")',
  ].join('\n');

  run('python3', ['-c', pythonScript], buildDir);

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
  createWindowsIcon(sourceIcon, buildDir);
  createMacIcon(sourceIcon, buildDir);

  console.log(`Prepared Electron build icons in ${buildDir}`);
}

main();
