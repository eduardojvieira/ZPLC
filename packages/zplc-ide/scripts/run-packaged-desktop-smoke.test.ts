import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { discoverPackagedExecutable } from './run-packaged-desktop-smoke';

function unpacked(root: string, platform: NodeJS.Platform, name: string): string {
  const directory = platform === 'darwin'
    ? join(root, name, 'ZPLC IDE.app')
    : join(root, name);
  mkdirSync(directory, { recursive: true });
  const executable = platform === 'darwin'
    ? join(directory, 'Contents', 'MacOS', 'zplc-ide')
    : join(directory, platform === 'win32' ? 'zplc-ide.exe' : 'zplc-ide');
  mkdirSync(join(executable, '..'), { recursive: true });
  writeFileSync(executable, 'binary');
  if (platform !== 'win32') chmodSync(executable, 0o755);
  return directory;
}

test('discovers exactly one real platform executable and rejects unsafe candidates', () => {
  for (const [platform, name] of [['linux', 'linux-unpacked'], ['win32', 'win-unpacked'], ['darwin', 'mac']] as const) {
    const root = mkdtempSync(join(tmpdir(), 'zplc-packaged-smoke-'));
    try {
      expect(() => discoverPackagedExecutable(root, platform)).toThrow('exactly one');
      const app = unpacked(root, platform, name);
      const executable = platform === 'darwin'
        ? join(app, 'Contents', 'MacOS', 'zplc-ide')
        : join(app, platform === 'win32' ? 'zplc-ide.exe' : 'zplc-ide');
      expect(discoverPackagedExecutable(root, platform)).toBe(executable);
      if (platform !== 'win32') {
        chmodSync(executable, 0o644);
        expect(() => discoverPackagedExecutable(root, platform)).toThrow('not executable');
        chmodSync(executable, 0o755);
      }
      unpacked(root, platform, platform === 'darwin' ? 'other' : 'other-unpacked');
      expect(() => discoverPackagedExecutable(root, platform)).toThrow('exactly one');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const symlinkRoot = mkdtempSync(join(tmpdir(), 'zplc-packaged-smoke-'));
  try {
    const source = unpacked(symlinkRoot, 'linux', 'source');
    symlinkSync(source, join(symlinkRoot, 'linux-unpacked'));
    expect(() => discoverPackagedExecutable(symlinkRoot, 'linux')).toThrow('symlink');
  } finally {
    rmSync(symlinkRoot, { recursive: true, force: true });
  }
});

test('release runs the packaged launch smoke in every native matrix lane', () => {
  const workflow = readFileSync(join(import.meta.dir, '../../../.github/workflows/release.yml'), 'utf8');
  const packageJson = JSON.parse(readFileSync(join(import.meta.dir, '../package.json'), 'utf8')) as { scripts?: Record<string, string> };
  const releaseJob = (name: string) => workflow.match(new RegExp(` {2}${name}:\\n[\\s\\S]*?(?=\\n {2}[a-z-]+:|$)`))?.[0] ?? '';
  const linux = releaseJob('build-linux');
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

  for (const [jobName, platform] of [['build-macos', 'macOS'], ['build-windows', 'Windows'], ['build-linux', 'Linux']] as const) {
    const job = releaseJob(jobName);
    const validation = `- name: Validate ${platform} build artifacts`;
    const launchName = `- name: Launch packaged ${platform} app`;
    expect(job.indexOf(validation)).toBeGreaterThanOrEqual(0);
    expect(job.indexOf(launchName)).toBeGreaterThan(job.indexOf(validation));
    const launchStep = job.slice(job.indexOf(launchName), job.indexOf('\n      - name:', job.indexOf(launchName) + 1));
    expect(launchStep).toContain('bun run smoke:desktop-packaged');
    expect(launchStep).not.toContain('if:');
  }
});

test('desktop smoke exercises real renderer accessibility and packaged isolation', () => {
  const developmentSmoke = readFileSync(join(import.meta.dir, 'run-desktop-smoke.ts'), 'utf8');
  const packagedSmoke = readFileSync(join(import.meta.dir, 'run-packaged-desktop-smoke.ts'), 'utf8');

  expect(developmentSmoke).toContain("Emulation.setEmulatedMedia");
  expect(developmentSmoke).toContain("prefers-reduced-motion");
  expect(developmentSmoke).toContain("forced-colors");
  expect(developmentSmoke).toContain("Toggle high contrast theme");
  expect(developmentSmoke).toContain("Learn keyboard selection");
  expect(developmentSmoke).not.toContain('nativeVirtualKeyCode');
  expect(packagedSmoke).toContain("Node globals leaked into packaged renderer");
  expect(packagedSmoke).toContain("Unexpected packaged preload surface");
  expect(packagedSmoke).toContain("'isElectron', 'learnProgress', 'nativeSimulation'");
  expect(packagedSmoke).toContain("Packaged renderer opened a new window");
  expect(packagedSmoke).toContain("Toggle high contrast theme");
  expect(packagedSmoke).not.toContain('nativeVirtualKeyCode');
  expect(packagedSmoke).toContain("await waitFor('packaged high-contrast keyboard activation'");
});
