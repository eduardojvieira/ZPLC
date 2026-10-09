// Structural checks on the release configuration. The files are parsed, never matched as text.
// A hosted run of the release workflow is the only proof that electron-builder honours them.
import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

type Builder = {
  extraResources: Array<{ from: string; to: string }>;
  mac: {
    identity?: string | null;
    binaries?: string[];
    hardenedRuntime?: boolean;
    notarize?: boolean;
    gatekeeperAssess?: boolean;
    entitlements?: string;
    entitlementsInherit?: string;
    target: string[];
  };
  dmg: { sign?: boolean };
  win: Record<string, unknown>;
  deb: Record<string, unknown>;
  rpm: Record<string, unknown>;
};

type Step = { name?: string; uses?: string; run?: string; if?: string; 'working-directory'?: string };
type Job = { steps: Step[]; strategy?: { matrix: { include: Array<{ arch: string; runner: string }> } } };
type Workflow = { jobs: Record<string, Job> };

const builder = Bun.YAML.parse(read('../electron-builder.yml')) as Builder;
const workflow = Bun.YAML.parse(read('../../../.github/workflows/release.yml')) as Workflow;
const indexOfStep = (job: Job, text: string) => job.steps.findIndex((step) => step.run?.includes(text) || step.uses?.includes(text));

// ponytail: reads only the flat `<key>..</key><true/>` pairs of the entitlements file; a nested or typed
// value would need a real plist parser.
const entitlementKeys = (file: string) => [...read(`../${file}`).matchAll(/<key>([^<]+)<\/key>\s*<true\/>/g)].map((match) => match[1]!);

describe('electron-builder.yml macOS signing (REL-001)', () => {
  it('signs ad hoc by an explicit identity and never notarizes', () => {
    expect(builder.mac.identity).toBe('-');
    expect(builder.mac.notarize).toBe(false);
    expect(builder.mac.gatekeeperAssess).toBe(false);
    expect(builder.dmg.sign).toBe(false);
  });

  it('keeps the hardened runtime and publishes a DMG and a ZIP', () => {
    expect(builder.mac.hardenedRuntime).toBe(true);
    expect([...builder.mac.target].sort()).toEqual(['dmg', 'zip']);
  });

  it('signs the nested native runtime from the place where the packager puts it', () => {
    expect(builder.mac.binaries).toEqual(['Contents/Resources/native-runtime/zplc_runtime']);
    expect(builder.extraResources).toContainEqual({ from: 'dist-native', to: 'native-runtime', filter: ['**/*'] });
  });

  it('grants the two entitlements an ad-hoc signed Electron application needs, and no others', () => {
    expect(builder.mac.entitlements).toBe('build/entitlements.mac.plist');
    expect(builder.mac.entitlementsInherit).toBe(builder.mac.entitlements);
    expect(entitlementKeys(builder.mac.entitlements!).sort()).toEqual([
      'com.apple.security.cs.allow-jit',
      'com.apple.security.cs.disable-library-validation',
    ]);
  });
});

describe('electron-builder.yml Windows signing (REL-003, REL-038)', () => {
  it('carries no signing settings, because the installers are built unsigned', () => {
    const signing = Object.keys(builder.win).filter((key) => /sign|cert|publisher/i.test(key));
    expect(signing).toEqual([]);
  });
});

describe('release.yml macOS build jobs prove the signature on both architectures (REL-002)', () => {
  const job = workflow.jobs['build-macos']!;

  it('builds one runner per architecture', () => {
    expect(job.strategy!.matrix.include.map((entry) => entry.arch).sort()).toEqual(['arm64', 'x64']);
    expect(new Set(job.strategy!.matrix.include.map((entry) => entry.runner)).size).toBe(2);
  });

  it('verifies the built bundle, unconditionally, between the build and the launch smoke', () => {
    const build = indexOfStep(job, 'package-mac-release.mjs');
    const verify = indexOfStep(job, 'verify-mac-signature.ts ${{ matrix.arch }}');
    const launch = indexOfStep(job, 'smoke:desktop-packaged');
    const upload = indexOfStep(job, 'actions/upload-artifact@');
    expect(build).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(build);
    expect(launch).toBeGreaterThan(verify);
    expect(upload).toBeGreaterThan(launch);
    expect(job.steps[verify]!.if).toBeUndefined();
    expect(job.steps[verify]!['working-directory']).toBe('packages/zplc-ide');
  });
});

describe('Linux packages use electron-builder defaults and are installed in clean containers (REL-011)', () => {
  const job = workflow.jobs['build-linux']!;
  const script = new URL('./check-linux-package.sh', import.meta.url).pathname;

  it('overrides no package dependency, so the defaults for current distributions apply', () => {
    expect(builder.deb.depends).toBeUndefined();
    expect(builder.rpm.depends).toBeUndefined();
  });

  it('installs the .deb on Debian 13 and Ubuntu 24.04 and the .rpm on Fedora, after the build and before the upload', () => {
    const build = indexOfStep(job, 'electron-builder --linux');
    const upload = indexOfStep(job, 'actions/upload-artifact@');
    for (const [image, extension] of [['debian:13', 'deb'], ['ubuntu:24.04', 'deb'], ['fedora:latest', 'rpm']] as const) {
      const step = indexOfStep(job, image);
      expect(step).toBeGreaterThan(build);
      expect(step).toBeLessThan(upload);
      expect(job.steps[step]!.run).toContain(`dist-electron/*.${extension}`);
      expect(job.steps[step]!.run).toContain('check-linux-package.sh');
      expect(job.steps[step]!.if).toBeUndefined();
    }
  });

  it('is valid bash, refuses to install anything outside the CI container, and keeps the Electron sandbox on', () => {
    expect(spawnSync('bash', ['-n', script]).status).toBe(0);
    const refused = spawnSync('bash', [script, 'package.deb'], { env: { PATH: process.env.PATH! }, encoding: 'utf8' });
    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain('outside the CI container');
    expect(readFileSync(script, 'utf8')).not.toContain('--no-sandbox');
  });
});
