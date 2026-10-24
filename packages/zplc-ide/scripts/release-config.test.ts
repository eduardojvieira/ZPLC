// Structural checks on the release configuration. The files are parsed, never matched as text.
// A hosted run of the release workflow is the only proof that electron-builder honours them.
import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { RULE_FILE_NAME, RULE_TARGET } from '../../../scripts/release/udev-rules';
import { EXPECTED_ARTIFACTS } from './smoke-desktop-builds';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

type Builder = {
  productName: string;
  extraMetadata?: { productName?: string };
  executableName?: string;
  beforePack?: string;
  extraResources: Array<{ from: string; to: string; filter?: string[] }>;
  mac: {
    executableName?: string;
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
  deb: Record<string, unknown> & { fpm?: string[]; depends?: string[] };
  rpm: Record<string, unknown> & { fpm?: string[]; depends?: string[] };
  nsis: { artifactName: string };
  portable: { artifactName: string };
};

type Step = {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  'working-directory'?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
};
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

// 7-Zip picks its ARM64 filter for arm64 executables, which the extractor inside the NSIS setup does not know: the arm64
// setup exited 0 and installed no executable (rehearsals 40109115910, 40118359942 and 40125534053).
describe('the Windows arm64 setup installs its executables', () => {
  it('packs the arm64 application with BCJ, a filter the setup can extract, and leaves x64 as it was', () => {
    const job = workflow.jobs['build-windows']!;
    const step = job.steps[indexOfStep(job, 'electron-builder --win')]!;
    expect(step.env?.ELECTRON_BUILDER_7Z_FILTER).toBe("${{ matrix.arch == 'arm64' && 'BCJ' || '' }}");
  });
});

describe('the macOS bundle is named ZPLC.app (REL-016)', () => {
  // electron-builder names the bundle, and the executable inside it, after the platform's executableName, then the global
  // one, then the product name (app-builder-lib AppInfo.productFilename). The install page, the Homebrew cask and the
  // signature check all say ZPLC.app, while the Linux executable must stay `zplc` (rpmbuild chokes on spaces and the
  // package name is zplc).
  it('names the bundle ZPLC.app and keeps the Linux executable zplc', () => {
    expect(`${builder.mac.executableName ?? builder.executableName ?? builder.productName}.app`).toBe('ZPLC.app');
    expect(builder.executableName).toBe('zplc');
  });
});

describe('the packaged application keeps its data in a folder named ZPLC (REL-016)', () => {
  // Electron names the user-data folder after the productName of the packaged package.json, else its name (@zplc/ide, a
  // folder with that scope). electron-builder does not copy its own productName there, so extraMetadata must. Found by the
  // simulated first-run check, which launched the packaged application and listed the folder it created.
  it('writes the product name into the packaged package.json', () => {
    expect(builder.extraMetadata?.productName).toBe(builder.productName);
    expect(builder.productName).toBe('ZPLC');
  });
});

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

describe('the DMG and the ZIP are published for each macOS architecture (REL-005)', () => {
  const job = workflow.jobs['build-macos']!;
  const uploads = job.steps
    .find((step) => step.uses?.startsWith('actions/upload-artifact@'))!
    .with!.path!.split('\n')
    .map((line) => line.trim());
  const attested = workflow.jobs['prepare-release-evidence-macos']!.steps.filter((step) =>
    step.uses?.startsWith('actions/attest@'),
  ).flatMap((step) => step.with!['subject-path']!.split('\n').map((line) => line.trim()));

  it('builds both formats on a runner of each architecture', () => {
    expect([...builder.mac.target].sort()).toEqual(['dmg', 'zip']);
    expect(job.strategy!.matrix.include.map((entry) => entry.arch).sort()).toEqual(['arm64', 'x64']);
  });

  it('uploads, checksums and attests both file types of both architectures', () => {
    expect(uploads).toEqual(expect.arrayContaining(['packages/zplc-ide/dist-electron/*.dmg', 'packages/zplc-ide/dist-electron/*.zip']));
    expect(attested).toEqual(expect.arrayContaining(['release/*.dmg', 'release/*.zip']));
    // one artifact per architecture, so a build of one does not replace the files of the other
    const upload = job.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'))!;
    expect(upload.with!.name).toBe('macos-${{ matrix.arch }}');
  });
});

describe('the AppImage stays published beside the .deb and the .rpm (REL-012)', () => {
  const lines = (value: string) => value.split('\n').map((line) => line.trim());
  const upload = workflow.jobs['build-linux']!.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'))!;
  const attested = workflow.jobs['prepare-release-evidence-linux']!.steps.filter((step) =>
    step.uses?.startsWith('actions/attest@'),
  ).flatMap((step) => lines(step.with!['subject-path']!));

  it('builds all three formats, and uploads, checksums and attests the AppImage with the packages', () => {
    expect([...(builder as unknown as { linux: { target: string[] } }).linux.target].sort()).toEqual(['AppImage', 'deb', 'rpm']);
    expect(lines(upload.with!.path!)).toEqual(
      expect.arrayContaining([
        'packages/zplc-ide/dist-electron/*.AppImage',
        'packages/zplc-ide/dist-electron/*.deb',
        'packages/zplc-ide/dist-electron/*.rpm',
      ]),
    );
    expect(attested).toEqual(expect.arrayContaining(['release/*.AppImage', 'release/*.deb', 'release/*.rpm']));
  });
});

describe('Linux packages declare what Electron needs and are installed in clean containers (REL-011)', () => {
  const job = workflow.jobs['build-linux']!;
  const script = new URL('./check-linux-package.sh', import.meta.url).pathname;

  // electron-builder's defaults (getDefaultDepends of app-builder-lib 26) leave out ALSA, which Electron links: a clean
  // Debian 13 or Ubuntu 24.04 has no libasound.so.2 (release rehearsal 40109115910). Since t64 the Debian package is
  // libasound2t64, and libasound2 before it.
  it('declares the dependencies electron-builder would, and the ALSA library that Electron links', () => {
    expect(builder.deb.depends).toEqual([
      'libgtk-3-0',
      'libnotify4',
      'libnss3',
      'libxss1',
      'libxtst6',
      'xdg-utils',
      'libatspi2.0-0',
      'libuuid1',
      'libsecret-1-0',
      'libasound2t64 | libasound2',
    ]);
    expect(builder.rpm.depends).toEqual([
      'gtk3',
      'libnotify',
      'nss',
      'libXScrnSaver',
      '(libXtst or libXtst6)',
      'xdg-utils',
      'at-spi2-core',
      '(libuuid or libuuid1)',
      'alsa-lib',
    ]);
  });

  it('gives the AppImage, in its Ubuntu 24.04 container, the libraries that the .deb declares', () => {
    const install = readFileSync(script, 'utf8')
      .split('\n')
      .find((line) => line.includes('apt-get install -y libgtk-3-0'));
    expect(install?.trim().split(/\s+/).slice(3)).toEqual(builder.deb.depends!.map((name) => name.split(' | ')[0]));
  });

  it('installs the .deb on Debian 13 and Ubuntu 24.04 and the .rpm on Fedora, after the build and before the upload', () => {
    const build = indexOfStep(job, 'electron-builder --linux');
    const upload = indexOfStep(job, 'actions/upload-artifact@');
    for (const [image, extension] of [
      ['debian:13', 'deb'],
      ['ubuntu:24.04', 'deb'],
      ['fedora:latest', 'rpm'],
    ] as const) {
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

  // The AppImage is extracted as root, and the unprivileged user that starts it got "/tmp/squashfs-root/zplc: Permission
  // denied" (release rehearsal 40125534053): the extracted tree must be readable and its folders searchable by that user.
  it('lets the unprivileged user reach the extracted AppImage', () => {
    const text = readFileSync(script, 'utf8');
    const extract = text.indexOf('--appimage-extract');
    const reach = text.indexOf('chmod -R a+rX /tmp/squashfs-root');
    expect(reach).toBeGreaterThan(extract);
    expect(extract).toBeGreaterThan(-1);
  });

  // Electron 43's debugging server answers HTTP/1.0 with nothing ("Cannot handle request with protocol: HTTP/1.0",
  // release rehearsal 40118359942), so the window check never saw the page of the application it had started.
  it('asks the debugging port for the window with HTTP/1.1 and a read that cannot hang', () => {
    const text = readFileSync(script, 'utf8');
    expect(text).toContain("printf 'GET /json/list HTTP/1.1\\r\\nHost: 127.0.0.1\\r\\nConnection: close\\r\\n\\r\\n'");
    expect(text).not.toContain('HTTP/1.0');
    expect(text).toMatch(/read -r -t \d+ line/);
  });
});

describe('the release builds the firmware of every board and ships it in its own chain (REL-022, REL-025)', () => {
  const jobs = workflow.jobs;
  const needsOf = (name: string) => [jobs[name]?.needs ?? []].flat().sort();
  const run = (name: string) => (jobs[name]!.steps ?? []).map((step) => step.run ?? '').join('\n');
  const manifest = JSON.parse(read('../../../firmware/app/boards/boards.json')) as Array<{ ide_id: string; zephyr_board: string }>;

  it('builds every board of the manifest, once, with the Zephyr target that the manifest names', () => {
    const job = jobs['build-firmware'] as unknown as { strategy: { matrix: { include: Array<{ ide_id: string; board: string }> } } };
    const matrix = job.strategy.matrix.include;
    expect(matrix.map((entry) => [entry.ide_id, entry.board]).sort()).toEqual(
      manifest.map((entry) => [entry.ide_id, entry.zephyr_board]).sort(),
    );
  });

  it('collects each board with the checks, from the exact SHA, and uploads the images under a name per board', () => {
    const steps = jobs['build-firmware']!.steps;
    const build = steps.findIndex((step) => step.run?.includes('west build'));
    const collect = steps.findIndex((step) => step.run?.includes('firmware-images.ts collect'));
    const upload = steps.findIndex((step) => step.uses?.startsWith('actions/upload-artifact@'));
    expect(build).toBeGreaterThan(-1);
    expect(collect).toBeGreaterThan(build);
    expect(upload).toBeGreaterThan(collect);
    expect(steps[collect]!.run).toContain('--commit "${{ github.sha }}"');
    expect(steps[collect]!.if).toBeUndefined();
    expect(steps[upload]!.with!.name).toBe('release-firmware-board-${{ matrix.ide_id }}');
    expect(steps[upload]!.with!['if-no-files-found']).toBe('error');
    // the HIL overlay is never added to a release build
    expect(run('build-firmware')).not.toMatch(/EXTRA_CONF_FILE|hil_debug/);
  });

  it('joins the boards in one job that fails when a board is missing, then attests and uploads the set in a chain of its own', () => {
    expect(needsOf('assemble-firmware')).toEqual(['build-firmware', 'validate-version']);
    expect(run('assemble-firmware')).toContain('firmware-images.ts assemble');
    expect(needsOf('prepare-release-evidence-firmware')).toEqual(['assemble-firmware', 'validate-version']);
    expect(needsOf('upload-release-firmware')).toEqual(['create-draft-release', 'prepare-release-evidence-firmware', 'validate-version']);
    expect(jobs['upload-release-firmware']!.if).toContain("needs.validate-version.outputs.publishing == 'true'");
    expect(run('prepare-release-evidence-firmware')).toContain('mv release/SHA256SUMS release/SHA256SUMS-firmware');
    const attestations = jobs['prepare-release-evidence-firmware']!.steps.filter((step) => step.uses?.startsWith('actions/attest@'));
    expect(attestations).toHaveLength(2);
    for (const step of attestations) expect(step.with!['subject-path']).toContain('release/zplc-runtime-*');
  });

  it.each(['macos', 'windows', 'linux'])(
    'stages the learner-board images in the %s build before electron-builder packs, and checks that the package holds them',
    (platform) => {
      const job = jobs[`build-${platform}`]!;
      const download = job.steps.findIndex((step) => step.with?.name === 'release-firmware-set');
      const stage = indexOfStep(job, 'firmware-images.ts stage');
      const pack = job.steps.findIndex((step) => /electron-builder|package-mac-release/.test(step.run ?? ''));
      const content = indexOfStep(job, 'smoke:packaged-content');
      expect(download).toBeGreaterThan(-1);
      expect(stage).toBeGreaterThan(download);
      expect(pack).toBeGreaterThan(stage);
      expect(content).toBeGreaterThan(pack);
      expect(job.steps[stage]!.run).toContain('--out packages/zplc-ide/dist-firmware');
      expect(job.steps[download]!.id).toBe('firmware');
      expect((job.steps[download] as unknown as { 'continue-on-error'?: boolean })['continue-on-error']).toBe(true);
      expect(job.steps[stage]!.if).toContain("steps.firmware.outcome == 'success'");
      expect((job.steps[content] as unknown as { env: Record<string, string> }).env.ZPLC_REQUIRE_FIRMWARE).toContain(
        "steps.firmware.outcome == 'success'",
      );
    },
  );

  it('ships the staged folder as the resources folder that Studio reads', () => {
    expect(builder.extraResources).toContainEqual({ from: 'dist-firmware', to: 'firmware', filter: ['**/*'] });
  });
});

describe('every published installer format is installed or mounted and launched on its own system before the draft (REL-036)', () => {
  const jobs = workflow.jobs;
  const create = 'create-draft-release';
  const stepNamed = (job: string, text: string) => jobs[job]!.steps.findIndex((step) => step.name?.includes(text));
  const upload = (job: string) => indexOfStep(jobs[job]!, 'actions/upload-artifact@');

  it('launches the AppImage in a clean container, with the sandbox on, before the Linux files are uploaded', () => {
    const step = stepNamed('build-linux', 'AppImage');
    expect(step).toBeGreaterThan(-1);
    expect(step).toBeLessThan(upload('build-linux'));
    const run = jobs['build-linux']!.steps[step]!.run!;
    expect(run).toContain('dist-electron/*.AppImage');
    expect(run).toContain('check-linux-package.sh');
    expect(run).not.toContain('--no-sandbox');
    expect(jobs['build-linux']!.steps[step]!.if).toBeUndefined();
  });

  it('mounts the DMG and unpacks the ZIP on the architecture they were built for, and launches the application each holds', () => {
    for (const [name, extension] of [
      ['DMG', 'dmg'],
      ['ZIP', 'zip'],
    ] as const) {
      const step = stepNamed('build-macos', name);
      expect(step, name).toBeGreaterThan(stepNamed('build-macos', 'Launch packaged macOS app'));
      expect(step, name).toBeLessThan(upload('build-macos'));
      const text = jobs['build-macos']!.steps[step]!;
      expect(text.run).toContain(`dist-electron/*.${extension}`);
      expect(text.run).toContain('smoke:desktop-packaged');
      expect(text.if).toBeUndefined();
    }
    expect(jobs['build-macos']!.steps[stepNamed('build-macos', 'DMG')]!.run).toContain('hdiutil attach');
  });

  it('installs the Windows setup silently, launches the installed application, and launches the portable executable', () => {
    const setup = stepNamed('build-windows', 'setup');
    const portable = stepNamed('build-windows', 'portable');
    for (const step of [setup, portable]) {
      expect(step).toBeGreaterThan(stepNamed('build-windows', 'Launch packaged Windows app'));
      expect(step).toBeLessThan(upload('build-windows'));
      expect(jobs['build-windows']!.steps[step]!.if).toBeUndefined();
      expect(jobs['build-windows']!.steps[step]!.run).toContain('smoke:desktop-packaged');
    }
    expect(jobs['build-windows']!.steps[setup]!.run).toContain('/S');
    expect(jobs['build-windows']!.steps[setup]!.run).toContain('ZPLC_PACKAGED_EXECUTABLE');
  });

  it('is done in the build jobs, and the draft waits for all three of them to finish, whatever they did (REL-036, REL-015)', () => {
    expect(needsOf(create)).toEqual(['build-linux', 'build-macos', 'build-windows', 'validate-version', 'verify-release-candidate']);
    const condition = String(jobs[create]!.if);
    // it runs when a platform failed, as long as one platform has files to publish: the failed one simply has no upload
    expect(condition).toContain('!cancelled()');
    for (const platform of ['macos', 'windows', 'linux']) expect(condition).toContain(`needs.build-${platform}.result == 'success'`);
    expect(condition).toContain(' || ');
    for (const platform of ['macos', 'windows', 'linux']) {
      expect([jobs[`prepare-release-evidence-${platform}`]!.needs].flat()).toContain(`build-${platform}`);
    }
  });

  function needsOf(name: string): string[] {
    return [jobs[name]?.needs ?? []].flat().sort();
  }
});

describe('the .deb and the .rpm install the udev rule of the boards (REL-013)', () => {
  // fpm takes `source=destination` pairs. The source is relative to the Studio package: the file that beforePack writes.
  const mapping = (fpm: string[] | undefined) => (fpm ?? []).filter((argument) => argument.includes('=') && !argument.startsWith('-'));
  // a variable path: the hook is plain JavaScript with no declaration file
  const hookPath = './before-pack.mjs';
  const udevRulesCommand = async (projectDir: string) =>
    ((await import(hookPath)) as { udevRulesCommand(dir: string): { command: string; args: string[] } }).udevRulesCommand(projectDir);

  it.each(['deb', 'rpm'] as const)('maps the generated rule into the vendor rules folder of the %s', async (target) => {
    const { args } = await udevRulesCommand('/repo/packages/zplc-ide');
    const written = args[args.indexOf('--out') + 1]!.replace('/repo/packages/zplc-ide/', '');
    expect(mapping(builder[target].fpm)).toEqual([`${written}=${RULE_TARGET}`]);
    expect(RULE_TARGET).toBe(`/usr/lib/udev/rules.d/${RULE_FILE_NAME}`);
  });

  it('writes the rule for a Linux package only, so that the macOS staging copy needs no identifier file', async () => {
    const hook = (await import(hookPath)) as {
      packCommands(context: { packager: { projectDir: string }; electronPlatformName?: string }): Array<{ args: string[] }>;
    };
    const scripts = (platform: string) =>
      hook
        .packCommands({ packager: { projectDir: '/repo/packages/zplc-ide' }, electronPlatformName: platform })
        .map((command) => command.args[0]!.split('/').at(-1));
    expect(scripts('linux')).toEqual(['licenses.ts', 'udev-rules.ts']);
    expect(scripts('darwin')).toEqual(['licenses.ts']);
    expect(scripts('win32')).toEqual(['licenses.ts']);
  });

  it('reads the rule out of the packages that were made, before they are installed or uploaded', () => {
    const job = workflow.jobs['build-linux']!;
    const build = indexOfStep(job, 'electron-builder --linux');
    const check = indexOfStep(job, 'scripts/linux-package-files.ts');
    const install = indexOfStep(job, 'debian:13');
    expect(check).toBeGreaterThan(build);
    expect(check).toBeLessThan(install);
    expect(job.steps[check]!.if).toBeUndefined();
  });

  it('generates the rule from the identifier files, before the packages are made', async () => {
    const { command, args } = await udevRulesCommand('/repo/packages/zplc-ide');
    expect({ command, script: args[0] }).toEqual({ command: 'bun', script: '/repo/scripts/release/udev-rules.ts' });
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

  // The draft is created once every platform has installed and launched its formats (REL-036), so it and the uploads that
  // follow it wait for the builds of all three; none of them needs a build to succeed (the draft's condition), so a
  // failed platform does not stop the others (REL-015).
  const AFTER_DRAFT = ['create-draft-release', ...platforms.map((platform) => `upload-release-${platform}`), 'upload-release-firmware'];

  it(
    'lets no job depend on the builds of two platforms, except the notes and the draft with its uploads, which run whatever the ' +
      'platforms did',
    () => {
      // the firmware is built once for every platform (the installers carry the learner-board images): it is not a platform
      for (const name of Object.keys(jobs).filter((job) => !FAN_IN.includes(job) && !AFTER_DRAFT.includes(job))) {
        const builds = [...ancestors(name)].filter((job) => job.startsWith('build-') && job !== 'build-firmware');
        expect(builds.length, `${name} waits for ${builds.join(', ')}`).toBeLessThanOrEqual(1);
      }
      for (const name of FAN_IN) expect(jobs[name]!.if, name).toContain('always()');
    },
  );

  it.each(platforms)('chains the %s evidence and upload on that platform alone', (platform) => {
    expect(needsOf(`prepare-release-evidence-${platform}`)).toEqual(expect.arrayContaining(['validate-version', `build-${platform}`]));
    expect([...needsOf(`upload-release-${platform}`)].sort()).toEqual([
      'create-draft-release',
      `prepare-release-evidence-${platform}`,
      'validate-version',
    ]);
    expect(jobs[`upload-release-${platform}`]!.if).toContain("needs.validate-version.outputs.publishing == 'true'");
  });

  it('keeps the reproducibility check, reads its result in the notes, and lets nothing else wait for it (REL-032)', () => {
    const name = 'verify-linux-x64-payload-reproducibility';
    const check = jobs[name] as unknown as { 'continue-on-error'?: unknown; outputs?: Record<string, string> };
    expect(check['continue-on-error']).toBe(true);
    expect(jobs[name]!.steps.some((step) => step.run?.includes('verify-reproducible-linux-payload.ts'))).toBe(true);
    // its verdict is an output of the job, because a job that continues on error reports success to the jobs that read it
    expect(check.outputs?.reproducible).toContain('steps.record.outputs.reproducible');
    // the notes read it and run whatever it did; no other job has it among its ancestors
    expect(needsOf('render-release-notes')).toContain(name);
    expect(jobs['render-release-notes']!.if).toContain('always()');
    const render = jobs['render-release-notes']!.steps.find((step) => step.name?.includes('Render the notes'))!;
    expect(String((render as unknown as { env: Record<string, string> }).env.REPRODUCIBLE)).toContain(
      'needs.verify-linux-x64-payload-reproducibility.outputs.reproducible',
    );
    expect(run('render-release-notes')).toContain('>> release-notes/notes.md');
    for (const other of Object.keys(jobs).filter((job) => job !== name && !FAN_IN.includes(job))) {
      expect(ancestors(other).has(name), `${other} waits for the reproducibility check`).toBe(false);
    }
    expect(ancestors('publish-release-notes').has(name), 'the notes of the draft wait for the check, but never fail on it').toBe(true);
  });

  it.each(platforms)('gives the %s checksum and evidence files a platform-specific name', (platform) => {
    expect(run(`prepare-release-evidence-${platform}`)).toContain(`mv release/SHA256SUMS release/SHA256SUMS-${platform}`);
    expect(run(`prepare-release-evidence-${platform}`)).toContain(
      `mv release/release-evidence.json release/release-evidence-${platform}.json`,
    );
  });

  it('creates the release only as a draft, from the run of its own tag', () => {
    const create = run('create-draft-release');
    expect(create).toMatch(/gh release create "\$RELEASE_TAG" --draft --verify-tag /);
    expect(create).toMatch(/gh release edit "\$RELEASE_TAG" --draft /);
    expect(create).toContain('--json isDraft');
    expect(jobs['create-draft-release']!.if).toContain("needs.validate-version.outputs.publishing == 'true'");
    const everything =
      Object.keys(jobs).map(run).join('\n') + readFileSync(new URL('../../../.github/workflows/release.yml', import.meta.url), 'utf8');
    expect(everything).not.toMatch(/gh release (?:publish|delete)|--draft=false|draft:\s*false|softprops/);
    for (const call of everything.match(/gh release (?:create|edit)[^\n]*/g) ?? []) expect(call).toContain('--draft');
  });

  it.each(platforms)('uploads %s assets only to a release that is still a draft', (platform) => {
    expect(run(`upload-release-${platform}`)).toMatch(/\[ "\$\(gh release view "\$RELEASE_TAG" --json isDraft --jq \.isDraft\)" = true \]/);
    expect(run(`upload-release-${platform}`)).toContain('gh release upload "$RELEASE_TAG" release/* --clobber');
  });

  it('writes to the repository only in the draft and upload jobs, and uses no protected environment', () => {
    const writers = Object.keys(jobs)
      .filter((name) => jobs[name]!.permissions?.contents === 'write')
      .sort();
    expect(writers).toEqual(
      [
        'create-draft-release',
        'publish-release-notes',
        'upload-release-firmware',
        ...platforms.map((platform) => `upload-release-${platform}`),
      ].sort(),
    );
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
    const paths = upload
      .with!.path!.split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    // the installers, and the standalone CLI and MCP server built on the same runner (REL-026)
    expect(paths).toEqual([
      'packages/zplc-ide/dist-electron/*-setup-unsigned.exe',
      'packages/zplc-ide/dist-electron/*-portable-unsigned.exe',
      'dist-bin/*',
    ]);
  });
});

describe('third-party notices are generated at packaging time and ship in every installer (REL-019)', () => {
  it('generates them from a hook that runs before electron-builder packs, for every platform and format', async () => {
    expect(builder.beforePack).toBe('scripts/before-pack.mjs');
    // a variable path: the hook is plain JavaScript with no declaration file
    const hookPath = './before-pack.mjs';
    const hook = (await import(hookPath)) as { noticesCommand(projectDir: string): { command: string; args: string[] } };
    const command = hook.noticesCommand('/repo/packages/zplc-ide');
    expect(command).toEqual({
      command: 'bun',
      args: [
        '/repo/scripts/release/licenses.ts',
        '--package',
        'packages/zplc-ide',
        '--out',
        '/repo/packages/zplc-ide/build/THIRD-PARTY-NOTICES.txt',
      ],
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
    ['prepare-release-evidence-macos', 'bundle', 'verify-bundle.ts'],
    ['prepare-release-evidence-windows', 'bundle', 'verify-bundle.ts'],
    ['prepare-release-evidence-linux', 'bundle', 'verify-bundle.ts'],
    ['prepare-release-evidence-firmware', 'bundle', 'verify-bundle.ts'],
  ];

  it.each(CLAIMS)('%s runs the %s check unconditionally', (job, _check, command) => {
    const step = stepRunning(job, command);
    expect(step, `${job} has no step that runs ${command}`).toBeDefined();
    expect(step!.if).toBeUndefined();
  });

  it('smokes each standalone executable on the architecture it was built for', () => {
    for (const [job, os] of [
      ['build-macos', 'mac'],
      ['build-windows', 'win'],
      ['build-linux', 'linux'],
    ] as const) {
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
      'assemble-firmware',
      'build-firmware',
      'build-linux',
      'build-macos',
      'build-windows',
      'prepare-release-evidence-firmware',
      'prepare-release-evidence-linux',
      'prepare-release-evidence-macos',
      'prepare-release-evidence-windows',
      'validate-version',
      'verify-linux-x64-payload-reproducibility',
      'verify-release-candidate',
    ]);
    expect(stepRunning('render-release-notes', 'scripts/release/run-results.ts')).toBeDefined();
    expect(stepRunning('render-release-notes', 'scripts/release/release-notes.ts')).toBeDefined();
  });
});

// The tests that matched regular expressions against the workflow (scripts/release-artifacts.test.mjs) are replaced by
// these, which read the parsed workflow, and by the checks that read what was produced: packaged-content.ts for the
// package and scripts/release/verify-bundle.ts for the bundle (VF-021).
describe('every release build waits for the full CI and for the evidence of its own platform (REL-016)', () => {
  const jobs = workflow.jobs;
  const needsOf = (name: string) => [jobs[name]?.needs ?? []].flat().sort();

  it('calls the CI workflow for the release SHA, before any build', () => {
    const candidate = jobs['verify-release-candidate'] as unknown as { uses?: string; needs?: string | string[] };
    expect(candidate.uses).toBe('./.github/workflows/ci.yml');
    expect([candidate.needs ?? []].flat()).toEqual(['validate-version']);
  });

  it.each(['build-macos', 'build-windows', 'build-linux'])(
    '%s waits for the version check, for that CI and for the firmware set, but not for its success',
    (name) => {
      expect(needsOf(name)).toEqual(['assemble-firmware', 'validate-version', 'verify-release-candidate']);
      const condition = (jobs[name] as unknown as { if?: string }).if ?? '';
      expect(condition).toContain('!cancelled()');
      expect(condition).toContain("needs.verify-release-candidate.result == 'success'");
      expect(condition).not.toContain('assemble-firmware');
    },
  );

  it('builds two clean Linux x64 payloads of the exact SHA and compares them, after the same CI', () => {
    expect(needsOf('verify-linux-x64-payload-reproducibility')).toEqual(['validate-version', 'verify-release-candidate']);
    expect(
      jobs['verify-linux-x64-payload-reproducibility']!.steps.some((step) => step.run?.includes('verify-reproducible-linux-payload.ts')),
    ).toBe(true);
    expect(needsOf('prepare-release-evidence-linux')).toEqual(['build-linux', 'validate-version']);
  });
});

describe('the workflow reads no secret but the job token, and every platform verifies the bundle it made (REL-003)', () => {
  const strings = (value: unknown): string[] =>
    typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? value.flatMap(strings)
        : value !== null && typeof value === 'object'
          ? Object.values(value).flatMap(strings)
          : [];

  it('names no secret other than GITHUB_TOKEN', () => {
    const names = strings(workflow).flatMap((text) => [...text.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)/g)].map((match) => match[1]!));
    expect([...new Set(names)]).toEqual(['GITHUB_TOKEN']);
  });

  it.each(['macos', 'windows', 'linux'])('verifies the %s bundle after it is created and before it is attested or uploaded', (platform) => {
    const job = workflow.jobs[`prepare-release-evidence-${platform}`]!;
    const create = indexOfStep(job, 'scripts/release-artifacts.mjs');
    const verify = indexOfStep(job, 'scripts/release/verify-bundle.ts');
    const upload = indexOfStep(job, 'actions/upload-artifact@');
    expect(verify).toBeGreaterThan(create);
    expect(verify).toBeLessThan(upload);
    expect(job.steps[verify]!.if).toBeUndefined();
    expect(job.steps[verify]!.run).toContain('--commit-sha "$RELEASE_COMMIT_SHA"');
  });
});

describe('the Linux desktop identity of the package is the one of decision D-03 (REL-011)', () => {
  it('names the desktop entry, its StartupWMClass and the window by the desktop name of the identity, which the manifest sets', () => {
    const manifest = JSON.parse(read('../package.json')) as { desktopName?: string };
    expect(manifest.desktopName).toBe('com.zenithindustrialcloud.zplc');
    expect((builder as unknown as { linux: { syncDesktopName?: boolean } }).linux.syncDesktopName).toBe(true);
  });

  it('has an icon of at least 512 pixels, square, as a PNG file', () => {
    const icon = readFileSync(new URL('../public/icon.png', import.meta.url));
    expect([...icon.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(icon.readUInt32BE(16)).toBe(icon.readUInt32BE(20));
    expect(icon.readUInt32BE(16)).toBeGreaterThanOrEqual(512);
  });
});
