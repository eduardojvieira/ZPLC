// Structural checks on the release configuration. The files are parsed, never matched as text.
// A hosted run of the release workflow is the only proof that electron-builder honours them.
import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { EXPECTED_ARTIFACTS } from './smoke-desktop-builds';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

type Builder = {
  beforePack?: string;
  extraResources: Array<{ from: string; to: string; filter?: string[] }>;
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
  nsis: { artifactName: string };
  portable: { artifactName: string };
};

type Step = { name?: string; uses?: string; run?: string; if?: string; 'working-directory'?: string; with?: Record<string, string> };
type Job = {
  needs?: string | string[];
  if?: string;
  environment?: unknown;
  permissions?: Record<string, string>;
  steps: Step[];
  strategy?: { matrix: { include: Array<{ arch: string; runner: string }> } };
};
type Workflow = { on: { workflow_dispatch: { inputs: Record<string, unknown> } }; jobs: Record<string, Job> };

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

describe('release.yml publishes each platform independently and only as a draft (REL-015, REL-016)', () => {
  const platforms = ['macos', 'windows', 'linux'];
  const jobs = workflow.jobs;
  const needsOf = (name: string) => [jobs[name]?.needs ?? []].flat();
  const ancestors = (name: string, seen = new Set<string>()): Set<string> => {
    for (const need of needsOf(name)) if (!seen.has(need)) ancestors(need, seen.add(need));
    return seen;
  };
  const run = (name: string) => (jobs[name]!.steps ?? []).map((step) => step.run ?? '').join('\n');

  // The two jobs that gather what every platform did: they run whatever the platforms did (`always()`), so that a
  // failed platform shows up in the notes instead of blocking them.
  const FAN_IN = ['render-release-notes', 'publish-release-notes'];

  it('lets no job depend on the builds of two platforms, except the notes, which run whatever the platforms did', () => {
    for (const name of Object.keys(jobs).filter((job) => !FAN_IN.includes(job))) {
      const builds = [...ancestors(name)].filter((job) => job.startsWith('build-'));
      expect(builds.length, `${name} waits for ${builds.join(', ')}`).toBeLessThanOrEqual(1);
    }
    for (const name of FAN_IN) expect(jobs[name]!.if, name).toContain('always()');
  });

  it.each(platforms)('chains the %s evidence and upload on that platform alone', (platform) => {
    expect(needsOf(`prepare-release-evidence-${platform}`)).toEqual(expect.arrayContaining(['validate-version', `build-${platform}`]));
    expect([...needsOf(`upload-release-${platform}`)].sort()).toEqual(['create-draft-release', `prepare-release-evidence-${platform}`, 'validate-version']);
    expect(jobs[`upload-release-${platform}`]!.if).toContain("needs.validate-version.outputs.publishing == 'true'");
  });

  it('keeps the Linux payload reproducibility gate on the Linux chain only', () => {
    expect(needsOf('prepare-release-evidence-linux')).toContain('verify-linux-x64-payload-reproducibility');
    for (const platform of ['macos', 'windows']) expect(ancestors(`upload-release-${platform}`).has('verify-linux-x64-payload-reproducibility')).toBe(false);
  });

  it.each(platforms)('gives the %s checksum and evidence files a platform-specific name', (platform) => {
    expect(run(`prepare-release-evidence-${platform}`)).toContain(`mv release/SHA256SUMS release/SHA256SUMS-${platform}`);
    expect(run(`prepare-release-evidence-${platform}`)).toContain(`mv release/release-evidence.json release/release-evidence-${platform}.json`);
  });

  it('creates the release only as a draft, from the run of its own tag', () => {
    const create = run('create-draft-release');
    expect(create).toMatch(/gh release create "\$RELEASE_TAG" --draft --verify-tag /);
    expect(create).toMatch(/gh release edit "\$RELEASE_TAG" --draft /);
    expect(create).toContain('--json isDraft');
    expect(jobs['create-draft-release']!.if).toContain("needs.validate-version.outputs.publishing == 'true'");
    const everything = Object.keys(jobs).map(run).join('\n') + readFileSync(new URL('../../../.github/workflows/release.yml', import.meta.url), 'utf8');
    expect(everything).not.toMatch(/gh release (?:publish|delete)|--draft=false|draft:\s*false|softprops/);
    for (const call of everything.match(/gh release (?:create|edit)[^\n]*/g) ?? []) expect(call).toContain('--draft');
  });

  it.each(platforms)('uploads %s assets only to a release that is still a draft', (platform) => {
    expect(run(`upload-release-${platform}`)).toMatch(/\[ "\$\(gh release view "\$RELEASE_TAG" --json isDraft --jq \.isDraft\)" = true \]/);
    expect(run(`upload-release-${platform}`)).toContain('gh release upload "$RELEASE_TAG" release/* --clobber');
  });

  it('writes to the repository only in the draft and upload jobs, and uses no protected environment', () => {
    const writers = Object.keys(jobs).filter((name) => jobs[name]!.permissions?.contents === 'write').sort();
    expect(writers).toEqual(['create-draft-release', 'publish-release-notes', ...platforms.map((platform) => `upload-release-${platform}`)].sort());
    for (const job of Object.values(jobs)) expect(job.environment).toBeUndefined();
  });

  it('offers no input that selects what to upload, and a rehearsal that is on unless a person turns it off (REL-030)', () => {
    const inputs = workflow.on.workflow_dispatch.inputs as Record<string, { type: string; default?: unknown }>;
    expect(Object.keys(inputs).sort()).toEqual(['rehearsal', 'version']);
    expect(inputs.rehearsal).toMatchObject({ type: 'boolean', default: true });
  });
});

describe('Windows installers carry unsigned in their variant until a channel is live (REL-038)', () => {
  it('names the installer and the portable executable by the REL-020 variants, with unsigned appended', () => {
    expect(builder.nsis.artifactName.endsWith('-setup-unsigned.${ext}')).toBe(true);
    expect(builder.portable.artifactName.endsWith('-portable-unsigned.${ext}')).toBe(true);
  });

  it('expects and uploads exactly those names', () => {
    expect(EXPECTED_ARTIFACTS.windows).toEqual(['-setup-unsigned.exe', '-portable-unsigned.exe']);
    const upload = workflow.jobs['build-windows']!.steps!.find((step) => step.uses?.startsWith('actions/upload-artifact@'))!;
    const paths = upload.with!.path!.split('\n').map((line) => line.trim()).filter(Boolean);
    // the installers, and the standalone CLI and MCP server built on the same runner (REL-026)
    expect(paths).toEqual(['packages/zplc-ide/dist-electron/*-setup-unsigned.exe', 'packages/zplc-ide/dist-electron/*-portable-unsigned.exe', 'dist-bin/*']);
  });
});

describe('third-party notices are generated at packaging time and ship in every installer (REL-019)', () => {
  it('generates them from a hook that runs before electron-builder packs, for every platform and format', async () => {
    expect(builder.beforePack).toBe('scripts/before-pack.mjs');
    const hook = await import('./before-pack.mjs');
    const command = hook.noticesCommand('/repo/packages/zplc-ide');
    expect(command).toEqual({
      command: 'bun',
      args: ['/repo/scripts/release/licenses.ts', '--package', 'packages/zplc-ide', '--out', '/repo/packages/zplc-ide/build/THIRD-PARTY-NOTICES.txt'],
    });
  });

  it('copies the generated file next to the application resources, beside the examples and the runtime', () => {
    expect(builder.extraResources).toContainEqual({ from: 'build/THIRD-PARTY-NOTICES.txt', to: 'THIRD-PARTY-NOTICES.txt' });
  });
});

describe('a rehearsal publishes nothing (REL-030)', () => {
  const publishing = "needs.validate-version.outputs.publishing == 'true'";
  const jobs = workflow.jobs;
  const everyStep = Object.entries(jobs).flatMap(([name, job]) => (job.steps ?? []).map((step) => ({ name, step })));

  it('gates every job that writes to the repository on the run being a publishing one', () => {
    for (const [name, job] of Object.entries(jobs)) {
      if (job.permissions?.contents === 'write') expect(job.if, name).toContain(publishing);
    }
  });

  it('makes no attestation, which is a permanent public record, unless the run publishes', () => {
    const attestations = everyStep.filter(({ step }) => step.uses?.startsWith('actions/attest@'));
    expect(attestations.length).toBeGreaterThanOrEqual(6);
    for (const { name, step } of attestations) expect(step.if, `${name}: ${step.name}`).toContain(publishing);
  });

  it('creates and edits releases and uploads assets only in the jobs that are gated', () => {
    for (const { name, step } of everyStep) {
      if (/gh release (?:create|edit|upload)/.test(step.run ?? '')) {
        expect(jobs[name]!.if, `${name}: ${step.name}`).toContain(publishing);
      }
    }
  });

  it('resolves what the run may do with the script that is tested, in the job every other job waits for', () => {
    const resolve = jobs['validate-version']!.steps.find((step) => step.run?.includes('scripts/release/resolve-release.ts'));
    expect(resolve).toBeDefined();
    for (const name of Object.keys(jobs).filter((job) => job.startsWith('build-'))) {
      expect([jobs[name]!.needs ?? []].flat(), name).toContain('validate-version');
    }
  });
});

describe('the notes claim only checks that their job runs (REL-027)', () => {
  const jobs = workflow.jobs;
  const stepRunning = (job: string, text: string) => jobs[job]!.steps.find((step) => step.run?.includes(text));

  // scripts/release/run-results.ts reports a check as passed when the job that runs it succeeded. Each claim it can
  // make about a build job is a step of that job, and it is never conditional.
  const CLAIMS: Array<[job: string, check: string, command: string]> = [
    ['build-macos', 'signature', 'verify-mac-signature.ts'],
    ['build-macos', 'launch', 'smoke:desktop-packaged'],
    ['build-windows', 'launch', 'smoke:desktop-packaged'],
    ['build-linux', 'launch', 'smoke:desktop-packaged'],
    ['build-linux', 'install', 'check-linux-package.sh'],
    ['build-macos', 'cli launch', 'binaries.ts --targets mac-'],
    ['build-windows', 'cli launch', 'binaries.ts --targets win-'],
    ['build-linux', 'cli launch', 'binaries.ts --targets linux-'],
    ['build-macos', 'content', 'smoke:packaged-content'],
    ['build-windows', 'content', 'smoke:packaged-content'],
    ['build-linux', 'content', 'smoke:packaged-content'],
  ];

  it.each(CLAIMS)('%s runs the %s check unconditionally', (job, _check, command) => {
    const step = stepRunning(job, command);
    expect(step, `${job} has no step that runs ${command}`).toBeDefined();
    expect(step!.if).toBeUndefined();
  });

  it('smokes each standalone executable on the architecture it was built for', () => {
    for (const [job, os] of [['build-macos', 'mac'], ['build-windows', 'win'], ['build-linux', 'linux']] as const) {
      const step = stepRunning(job, 'binaries.ts')!;
      expect(step.run).toContain(`--targets ${os}-\${{ matrix.arch }}`);
      expect(step.run).toContain('--smoke --native');
    }
  });

  it('renders the notes in a job that runs for a rehearsal too, from the results of every job it waits for', () => {
    const job = jobs['render-release-notes']!;
    expect(job.if).toContain('always()');
    expect(job.if).not.toContain('publishing');
    expect(job.permissions).toEqual({ contents: 'read' });
    expect([job.needs ?? []].flat().sort()).toEqual([
      'build-linux', 'build-macos', 'build-windows', 'prepare-release-evidence-linux', 'prepare-release-evidence-macos',
      'prepare-release-evidence-windows', 'validate-version', 'verify-linux-x64-payload-reproducibility', 'verify-release-candidate',
    ]);
    expect(stepRunning('render-release-notes', 'scripts/release/run-results.ts')).toBeDefined();
    expect(stepRunning('render-release-notes', 'scripts/release/release-notes.ts')).toBeDefined();
  });

  it('keeps the test reports of CI that the notes count', () => {
    const ci = Bun.YAML.parse(read('../../../.github/workflows/ci.yml')) as { jobs: Record<string, Job> };
    const names = ci.jobs.typescript!.steps.filter((step) => step.uses?.startsWith('actions/upload-artifact@')).map((step) => step.with!.name);
    expect(names).toEqual(expect.arrayContaining(['junit-compiler', 'junit-ide']));
  });
});
