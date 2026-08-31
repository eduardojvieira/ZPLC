import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { discoverPackagedLinuxExecutable } from './run-packaged-desktop-smoke';

function unpacked(root: string, name = 'linux-unpacked'): string {
  const directory = join(root, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'zplc-ide'), 'binary');
  chmodSync(join(directory, 'zplc-ide'), 0o755);
  return directory;
}

test('discovers exactly one real executable Linux unpacked app and rejects unsafe candidates', () => {
  const root = mkdtempSync(join(tmpdir(), 'zplc-packaged-smoke-'));
  try {
    expect(() => discoverPackagedLinuxExecutable(root)).toThrow('exactly one');
    const app = unpacked(root);
    expect(discoverPackagedLinuxExecutable(root)).toBe(join(app, 'zplc-ide'));
    chmodSync(join(app, 'zplc-ide'), 0o644);
    expect(() => discoverPackagedLinuxExecutable(root)).toThrow('not executable');
    chmodSync(join(app, 'zplc-ide'), 0o755);
    unpacked(root, 'other-unpacked');
    expect(() => discoverPackagedLinuxExecutable(root)).toThrow('exactly one');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const symlinkRoot = mkdtempSync(join(tmpdir(), 'zplc-packaged-smoke-'));
  try {
    const source = unpacked(symlinkRoot, 'source');
    symlinkSync(source, join(symlinkRoot, 'linux-unpacked'));
    expect(() => discoverPackagedLinuxExecutable(symlinkRoot)).toThrow('symlink');
  } finally {
    rmSync(symlinkRoot, { recursive: true, force: true });
  }
});

test('release runs the packaged launch smoke in every Linux matrix lane', () => {
  const workflow = readFileSync(join(import.meta.dir, '../../../.github/workflows/release.yml'), 'utf8');
  const packageJson = JSON.parse(readFileSync(join(import.meta.dir, '../package.json'), 'utf8')) as { scripts?: Record<string, string> };
  const linux = workflow.match(/ {2}build-linux:\n[\s\S]*?(?=\n {2}[a-z-]+:|$)/)?.[0] ?? '';
  expect(linux).toContain('runner: ubuntu-24.04\n');
  expect(linux).toContain('runner: ubuntu-24.04-arm\n');
  const sandbox = linux.match(/ {6}- name: Prepare Linux Electron sandbox[\s\S]*?(?=\n {6}- name:|$)/)?.[0] ?? '';
  const launch = linux.match(/ {6}- name: Launch packaged Linux app[\s\S]*?(?=\n {6}- name:|$)/)?.[0] ?? '';
  expect(packageJson.scripts?.['smoke:desktop-packaged']).toBe('bun run scripts/run-packaged-desktop-smoke.ts');
  expect(sandbox).toContain('dist-electron/*-unpacked');
  expect(sandbox).toContain('find "$unpacked" -type f -name chrome-sandbox -print');
  expect(sandbox).toContain('sudo chown root:root "$sandbox"');
  expect(sandbox).toContain('sudo chmod 4755 "$sandbox"');
  expect(sandbox).toContain("stat -c '%U:%G:%a' \"$sandbox\"");
  expect(linux).toContain('sudo apt-get install -y rpm xvfb');
  expect(launch).toContain('run: xvfb-run --auto-servernum bun run smoke:desktop-packaged');
  expect(launch).not.toContain('if:');
  expect(linux).not.toContain('--no-sandbox');
});
