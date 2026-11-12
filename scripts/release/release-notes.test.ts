// REL-027, REL-031, REL-038, REL-017, DOC-030: the notes of a release are rendered from what the run recorded, and make no
// claim that a check of that run does not support.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changelogParts, changelogSection, releaseTitle, renderReleaseNotes, type RunResults } from './release-notes';

const root = join(import.meta.dir, '..', '..');
const fixture = (): RunResults => JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'run-results.json'), 'utf8')) as RunResults;
const withAsset = (patch: Partial<RunResults['assets'][number]>, index = 0): RunResults => {
  const results = fixture();
  results.assets[index] = { ...results.assets[index]!, ...patch };
  return results;
};
/** The address of a file on the release of the fixture. */
const BASE = 'https://github.com/example/zplc/releases/download/v2.0.0-rc.4/';
const rowOf = (text: string, first: string) => text.split('\n').find((line) => line.startsWith(`| ${first} |`));
/** Whether the first occurrence of `text` sits inside a collapsed `<details>` block. */
const insideDetails = (notes: string, text: string): boolean => {
  const at = notes.indexOf(text);
  const open = notes.lastIndexOf('<details>', at);
  return at >= 0 && open >= 0 && notes.lastIndexOf('</details>', at) < open;
};
const asset = (name: string, platform: RunResults['assets'][number]['platform']): RunResults['assets'][number] => ({
  name,
  platform,
  job: 'build',
  signing: 'unsigned',
  checks: { signature: 'not-run', launch: 'passed', install: 'not-run' },
});

describe('the title of a release says how complete a prerelease is (REL-031)', () => {
  test('names the version and the completeness of a release candidate', () => {
    expect(releaseTitle(fixture())).toBe(
      'ZPLC v2.0.0-rc.4: release candidate, the Windows channels are not live and no board has a hardware record yet',
    );
  });

  test('refuses a prerelease with no statement of its completeness', () => {
    const results = fixture();
    delete results.completeness;
    expect(() => releaseTitle(results)).toThrow(/completeness/);
  });

  test('a final release needs none', () => {
    const results = fixture();
    results.version = '2.0.0';
    results.tag = 'v2.0.0';
    delete results.completeness;
    expect(releaseTitle(results)).toBe('ZPLC v2.0.0');
  });
});

describe('the notes open with the downloads, one row per system, linked by their address on the release (S4)', () => {
  const notes = renderReleaseNotes(fixture());

  test('starts with the Download section, before what changed', () => {
    expect(notes.startsWith('### Download\n')).toBe(true);
    expect(notes.indexOf('### Download')).toBeLessThan(notes.indexOf('### What changed'));
  });

  test('links the recommended file of each system that the run produced, labelled for a person', () => {
    expect(rowOf(notes, 'Windows, Intel or AMD (x64)')).toBe(
      `| Windows, Intel or AMD (x64) | **[Installer](${BASE}zplc-2.0.0-rc.4-win-x64-setup-unsigned.exe)** |  |`,
    );
    expect(rowOf(notes, 'macOS, Apple silicon (M1 and later)')).toContain(`**[Disk image](${BASE}zplc-2.0.0-rc.4-mac-arm64.dmg)**`);
    expect(rowOf(notes, 'Linux, Intel or AMD (x86_64)')).toContain(`**[Debian, Ubuntu (.deb)](${BASE}zplc-2.0.0-rc.4-linux-x64.deb)**`);
  });

  test('gives the other formats of a system as smaller links', () => {
    const results = fixture();
    results.assets.push(
      asset('zplc-2.0.0-rc.4-mac-arm64.zip', 'macos'),
      asset('zplc-2.0.0-rc.4-win-arm64-setup-unsigned.exe', 'windows'),
      asset('zplc-2.0.0-rc.4-win-arm64-portable-unsigned.exe', 'windows'),
      asset('zplc-2.0.0-rc.4-linux-aarch64.rpm', 'linux'),
      asset('zplc-2.0.0-rc.4-linux-arm64.AppImage', 'linux'),
    );
    const text = renderReleaseNotes(results);
    expect(rowOf(text, 'macOS, Apple silicon (M1 and later)')).toContain(`<sub>[Zip](${BASE}zplc-2.0.0-rc.4-mac-arm64.zip)</sub>`);
    expect(rowOf(text, 'Windows on ARM (arm64)')).toBe(
      `| Windows on ARM (arm64) | **[Installer](${BASE}zplc-2.0.0-rc.4-win-arm64-setup-unsigned.exe)** | ` +
        `<sub>[Portable](${BASE}zplc-2.0.0-rc.4-win-arm64-portable-unsigned.exe)</sub> |`,
    );
    // with no .deb for ARM, the .rpm is the first format of the row
    expect(rowOf(text, 'Linux on ARM (arm64, aarch64)')).toBe(
      `| Linux on ARM (arm64, aarch64) | **[Fedora (.rpm)](${BASE}zplc-2.0.0-rc.4-linux-aarch64.rpm)** | ` +
        `<sub>[Other distributions (AppImage)](${BASE}zplc-2.0.0-rc.4-linux-arm64.AppImage)</sub> |`,
    );
  });

  test('links no file that the run did not produce', () => {
    expect(rowOf(notes, 'macOS, Intel')).toBe('| macOS, Intel | Not in this release |  |');
    expect(rowOf(notes, 'Windows on ARM (arm64)')).toBe('| Windows on ARM (arm64) | Not in this release |  |');
    const linked = (text: string) =>
      [...text.matchAll(/\]\(https:\/\/github\.com\/example\/zplc\/releases\/download\/v2\.0\.0-rc\.4\/([^)]+)\)/g)].map((match) =>
        decodeURIComponent(match[1]!),
      );
    const names = new Set(fixture().assets.map((entry) => entry.name));
    expect(linked(notes).length).toBeGreaterThan(0);
    expect(linked(notes).filter((name) => !names.has(name))).toEqual([]);
    const none = fixture();
    none.assets = [];
    expect(linked(renderReleaseNotes(none))).toEqual([]);
  });

  test('says how to tell which system you have, and where the first launch is explained', () => {
    const download = notes.slice(0, notes.indexOf('### What changed'));
    expect(download).toContain('**About This Mac**');
    expect(download).toContain('`uname -m`');
    expect(download).toContain('(https://eduardojvieira.github.io/ZPLC/docs/getting-started/install#first-launch)');
  });

  test('puts the command line tool, the MCP server and the firmware images in collapsed blocks', () => {
    const results = fixture();
    results.assets.push(
      asset('zplc-mcp-2.0.0-rc.4-linux-x64', 'cli'),
      asset('zplc-cli-2.0.0-rc.4-win-arm64.exe', 'cli'),
      { ...asset('zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2', 'firmware'), evidenceLevel: 'cross-build' },
      { ...asset('zplc-runtime-2.0.0-rc.4-nucleo-h743zi.bin', 'firmware'), evidenceLevel: 'cross-build' },
      { ...asset('zplc-runtime-2.0.0-rc.4-nucleo-h743zi.elf', 'firmware'), evidenceLevel: 'cross-build' },
      asset('zplc-runtime-2.0.0-rc.4.manifest.json', 'firmware'),
    );
    const text = renderReleaseNotes(results);
    expect(text).toContain('<summary>Command line tool and MCP server</summary>');
    expect(rowOf(text, 'Linux, Intel or AMD (x86_64)')).toBeDefined();
    const tools = text.split('\n').filter((line) => line.startsWith('| Linux, Intel or AMD (x86_64) |'))[1];
    expect(tools).toBe(
      `| Linux, Intel or AMD (x86_64) | [Download](${BASE}zplc-cli-2.0.0-rc.4-linux-x64) | ` +
        `[Download](${BASE}zplc-mcp-2.0.0-rc.4-linux-x64) |`,
    );
    expect(insideDetails(text, `[Download](${BASE}zplc-cli-2.0.0-rc.4-linux-x64)`)).toBe(true);
    expect(insideDetails(text, `[Download](${BASE}zplc-cli-2.0.0-rc.4-win-arm64.exe)`)).toBe(true);
    // the firmware images, by the name of the board in firmware/app/boards/boards.json
    expect(text).toContain('<summary>Runtime firmware for the boards</summary>');
    expect(rowOf(text, 'Raspberry Pi Pico (RP2040)')).toBe(
      `| Raspberry Pi Pico (RP2040) | **[Flash image (.uf2)](${BASE}zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2)** | cross-build |`,
    );
    expect(rowOf(text, 'STM32 Nucleo-H743ZI')).toBe(
      `| STM32 Nucleo-H743ZI | **[Flash image (.bin)](${BASE}zplc-runtime-2.0.0-rc.4-nucleo-h743zi.bin)** · ` +
        `<sub>[Debug image (.elf)](${BASE}zplc-runtime-2.0.0-rc.4-nucleo-h743zi.elf)</sub> | cross-build |`,
    );
    expect(insideDetails(text, `(${BASE}zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2)`)).toBe(true);
    expect(insideDetails(text, `[Firmware manifest](${BASE}zplc-runtime-2.0.0-rc.4.manifest.json)`)).toBe(true);
    expect(insideDetails(text, 'has not been flashed or run on it')).toBe(true);
    // the blocks stay above what changed, and a run with no tool or image has neither block
    expect(text.indexOf('<summary>Runtime firmware for the boards</summary>')).toBeLessThan(text.indexOf('### What changed'));
    const bare = fixture();
    bare.assets = bare.assets.filter((entry) => entry.platform !== 'cli');
    expect(renderReleaseNotes(bare)).not.toContain('<summary>Command line tool and MCP server</summary>');
    expect(renderReleaseNotes(bare)).not.toContain('<summary>Runtime firmware for the boards</summary>');
  });

  test('links SHA256SUMS and the verify section of the install guide on one line, when the run has the checksums', () => {
    const results = fixture();
    results.sha256sums = true;
    const line = renderReleaseNotes(results)
      .split('\n')
      .find((candidate) => candidate.startsWith('**Check the file:**'))!;
    expect(line).toContain(`[SHA256SUMS](${BASE}SHA256SUMS)`);
    expect(line).toContain('(https://eduardojvieira.github.io/ZPLC/docs/getting-started/install#verify-the-download)');
    expect(renderReleaseNotes(results).indexOf('**Check the file:**')).toBeLessThan(
      renderReleaseNotes(results).indexOf('### What changed'),
    );
    // no checksum file in the run, no link to it
    expect(notes).not.toContain(`(${BASE}SHA256SUMS)`);
  });

  test('refuses a run address that names no repository, since it could not link the files', () => {
    const results = fixture();
    results.runUrl = 'https://example.test/run/1';
    expect(() => renderReleaseNotes(results)).toThrow(/repository/);
  });
});

describe('the long technical sections are collapsed, and what a user must read stays open (S4)', () => {
  const results = fixture();
  results.breaking = ['Programs built before contract draft 4 are refused.'];
  results.migration = ['Rebuild every program.'];
  const notes = renderReleaseNotes(results);

  test.each([
    '<summary>Signing state and checks of every asset (4 files)</summary>',
    '<summary>Tests executed in this run: 1530 executed, 0 failed, 2 skipped</summary>',
    '<summary>Windows channels</summary>',
    '<summary>Verify what you downloaded: checksums and build provenance</summary>',
    '<summary>Evidence boundary: what this release does not establish</summary>',
    '| zplc-2.0.0-rc.4-mac-arm64.dmg |',
    '1530 tests executed, 0 failed, 2 skipped',
    'gh attestation verify',
    'do not establish HIL',
    '0123456789abcdef0123456789abcdef01234567',
  ])('%s is inside a <details> block', (text) => {
    expect(insideDetails(notes, text)).toBe(true);
  });

  test.each([
    '### What changed',
    '### Breaking changes',
    '### Migration',
    '### Known issues',
    '### Windows: unsigned installers',
    '### Documentation',
  ])('%s stays visible', (heading) => {
    expect(notes).toContain(`${heading}\n`);
    expect(insideDetails(notes, heading)).toBe(false);
  });

  test('closes every block it opens', () => {
    expect(notes.match(/<details>/g)?.length).toBe(notes.match(/<\/details>/g)?.length);
    expect(notes.trimEnd().endsWith('</details>')).toBe(false);
  });
});

describe('the signing state of every asset comes from the checks of the run (REL-027, REL-015)', () => {
  const notes = renderReleaseNotes(fixture());

  test('lists each asset with the job that built it and its signing state', () => {
    expect(notes).toContain('| zplc-2.0.0-rc.4-mac-arm64.dmg |');
    expect(notes).toMatch(
      new RegExp(
        String.raw`\| zplc-2\.0\.0-rc\.4-mac-arm64\.dmg \| \[build-macos \(arm64\)\]\(https:\/\/github\.com\/` +
          String.raw`example\/zplc\/actions\/runs\/1\/job\/10\) \| Signed ad hoc and sealed; ` +
          String.raw`signature verified in this run\. Not notarized`,
      ),
    );
    expect(notes).toMatch(/\| zplc-2\.0\.0-rc\.4-win-x64-setup-unsigned\.exe \|[^\n]*\| Unsigned\./);
    expect(notes).toMatch(
      /\| zplc-2\.0\.0-rc\.4-linux-x64\.deb \|[^\n]*\| Unsigned\.[^\n]*installed and launched in clean containers: passed/,
    );
  });

  test('does not call an asset signed when the signature check did not pass in the run', () => {
    for (const state of ['not-run', 'failed'] as const) {
      const text = renderReleaseNotes(withAsset({ checks: { signature: state, launch: 'passed', install: 'not-run' } }));
      expect(text).toMatch(/mac-arm64\.dmg \|[^\n]*Intended to be signed ad hoc; the signature check did not pass in this run/);
      expect(text).not.toMatch(/mac-arm64\.dmg \|[^\n]*Signed ad hoc and sealed/);
    }
  });

  test('labels a firmware image with the evidence level of its board and claims no launch (REL-022)', () => {
    const results = fixture();
    results.assets.push({
      name: 'zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2',
      platform: 'firmware',
      job: 'build-firmware',
      signing: 'unsigned',
      evidenceLevel: 'cross-build',
      checks: { signature: 'not-run', launch: 'not-run', install: 'not-run' },
    });
    results.assets.push({
      name: 'zplc-runtime-2.0.0-rc.4-nucleo-h743zi.bin',
      platform: 'firmware',
      job: 'build-firmware',
      signing: 'unsigned',
      checks: { signature: 'not-run', launch: 'not-run', install: 'not-run' },
    });
    const text = renderReleaseNotes(results);
    const row = (name: string) => text.split('\n').find((line) => line.startsWith(`| ${name} |`))!;
    expect(row('zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2')).toContain('Evidence level of the board: cross-build');
    expect(row('zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2')).toContain('has not been flashed or run on it');
    expect(row('zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2')).not.toContain('launched on its own system');
    expect(row('zplc-runtime-2.0.0-rc.4-nucleo-h743zi.bin')).toContain('evidence level of the board is not recorded in this run');
    results.assets.push({
      name: 'zplc-runtime-2.0.0-rc.4.manifest.json',
      platform: 'firmware',
      job: 'build-firmware',
      signing: 'unsigned',
      checks: { signature: 'not-run', launch: 'not-run', install: 'not-run' },
    });
    expect(
      renderReleaseNotes(results)
        .split('\n')
        .find((line) => line.startsWith('| zplc-runtime-2.0.0-rc.4.manifest.json |')),
    ).toContain('lists the firmware images of this release');
  });

  test('says which firmware job to read when the run published no firmware image (REL-022)', () => {
    const results = fixture();
    results.jobs.push({ job: 'build-firmware', result: 'failure' }, { job: 'assemble-firmware', result: 'skipped' });
    expect(renderReleaseNotes(results)).toContain(
      'No firmware image was published: build-firmware ended in failure, assemble-firmware ended in skipped.',
    );
    results.assets.push({
      name: 'zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2',
      platform: 'firmware',
      job: 'build-firmware',
      signing: 'unsigned',
      checks: { signature: 'not-run', launch: 'not-run', install: 'not-run' },
    });
    expect(renderReleaseNotes(results)).not.toContain('No firmware image was published');
  });

  test('reports a launch check that failed or did not run as such, never as passed', () => {
    const text = renderReleaseNotes(withAsset({ checks: { signature: 'passed', launch: 'not-run', install: 'not-run' } }));
    expect(text).toMatch(/mac-arm64\.dmg \|[^\n]*launched on its own system: not run/);
  });

  test('makes no claim of a certificate or of notarization', () => {
    expect(notes).not.toMatch(/Developer ID|stapl|(?<!not )(?<!Not )notariz/i);
  });

  test('says that a platform has no files when its job did not succeed', () => {
    const results = fixture();
    results.assets = results.assets.filter((asset) => asset.platform !== 'macos');
    results.jobs = results.jobs.map((job) => (job.job === 'build-macos' ? { ...job, result: 'failure' } : job));
    const text = renderReleaseNotes(results);
    expect(text).toMatch(/No files were published for macOS: its build job ended in failure\./);
    expect(text).not.toMatch(/No files were published for Linux/);
  });
});

describe('tests, known failures and changes (REL-027)', () => {
  const notes = renderReleaseNotes(fixture());

  test('lists the suites the run executed, with their counts and the total', () => {
    expect(notes).toMatch(/\| compiler \| typescript \| 330 \| 0 \| 2 \|/);
    expect(notes).toMatch(/\| studio \| typescript \| 1200 \| 0 \| 0 \|/);
    expect(notes).toContain('1530 tests executed, 0 failed, 2 skipped');
  });

  test('says so when the run recorded no test result', () => {
    const results = fixture();
    results.suites = [];
    expect(renderReleaseNotes(results)).toContain('The run recorded no test results, so these notes make no claim about tests.');
  });

  test('lists the known failures and the known issues, and says when there are none', () => {
    expect(notes).toContain('an Instruction List jump to a label past a call lands one instruction late');
    expect(notes).toContain('ZPLC cannot open a project folder whose path holds a newline.');
    const results = fixture();
    results.knownFailures = [];
    results.knownIssues = [];
    expect(renderReleaseNotes(results)).toContain('No known issue is recorded for this release.');
  });

  test('lists the user-facing changes, and says so when none is recorded', () => {
    expect(notes).toContain('- ZPLC shows the compiler message, line and column of a build error.');
    const results = fixture();
    results.changes = [];
    expect(renderReleaseNotes(results)).toContain('No user-facing change is recorded for this version.');
  });

  test('takes the changes of a version from its section of the changelog', () => {
    const changelog =
      '# Changelog\n\n## Unreleased\n\n- Not yet.\n\n## 2.0.0-rc.4 - 2026-10-20\n\n- First change.\n  continued here.\n- Second ' +
      'change.\n\n## 2.0.0-rc.3 - 2026-09-01\n\n- Old.\n';
    expect(changelogSection(changelog, '2.0.0-rc.4')).toEqual(['First change. continued here.', 'Second change.']);
    expect(changelogSection(changelog, '9.9.9')).toEqual([]);
  });
});

describe('what changed for a user, what breaks, how to migrate and what is limited (DOC-030)', () => {
  const changelog = [
    '# Changelog',
    '',
    '## Unreleased',
    '',
    '- Not yet.',
    '',
    '## 2.0.0-rc.4 - 2026-10-20',
    '',
    '### What changed for you',
    '',
    '- The simulator runs tasks of different intervals.',
    '  Each is released on its own.',
    '- Archives export and import.',
    '',
    '### Breaking changes',
    '',
    '- Programs built before contract draft 4 are refused.',
    '',
    '### Migration',
    '',
    '1. Rebuild every program and reflash every board together.',
    '2. Name the broker of every controller.',
    '',
    '### Known limits',
    '',
    '- No board has a hardware record.',
    '',
    '### Details for contributors',
    '',
    '- `tools/contract/contract.json` carries the counter (CMP-052).',
    '',
    '## 2.0.0-rc.3 - 2026-09-01',
    '',
    '- Old.',
    '',
  ].join('\n');

  test('splits a section that names its parts, and leaves the details for contributors in the changelog', () => {
    expect(changelogParts(changelog, '2.0.0-rc.4')).toEqual({
      structured: true,
      changes: ['The simulator runs tasks of different intervals. Each is released on its own.', 'Archives export and import.'],
      breaking: ['Programs built before contract draft 4 are refused.'],
      migration: ['Rebuild every program and reflash every board together.', 'Name the broker of every controller.'],
      limits: ['No board has a hardware record.'],
    });
  });

  test('the notes of the 2.0.0 entry carry the browser-build and deadline-miss breaking changes', () => {
    const { breaking } = changelogParts(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), '2.0.0');
    expect(breaking.some((item) => item.startsWith('**There is no hosted browser build.**'))).toBe(true);
    expect(breaking.some((item) => item.startsWith('**A fault latches after 3 consecutive deadline misses'))).toBe(true);
  });

  test('takes every bullet of an older section as a change, and says nothing is recorded under "None."', () => {
    expect(changelogParts(changelog, '2.0.0-rc.3')).toEqual({
      structured: false,
      changes: ['Old.'],
      breaking: [],
      migration: [],
      limits: [],
    });
    const none = '## 2.0.0 - 2026-11-01\n\n### What changed for you\n\n- A change.\n\n### Breaking changes\n\nNone.\n\n- None.\n';
    expect(changelogParts(none, '2.0.0').breaking).toEqual([]);
  });

  test('prints the breaking changes and the migration, and says when no breaking change is recorded', () => {
    const results = fixture();
    expect(renderReleaseNotes(results)).toContain('No breaking change is recorded for this version.');
    results.breaking = ['Programs built before contract draft 4 are refused.'];
    results.migration = ['Rebuild every program and reflash every board together.'];
    const notes = renderReleaseNotes(results);
    expect(notes).toContain('### Breaking changes\n\n- Programs built before contract draft 4 are refused.');
    expect(notes).toContain('### Migration\n\n- Rebuild every program and reflash every board together.');
    expect(notes.indexOf('### Breaking changes')).toBeLessThan(notes.indexOf('### Known issues'));
  });

  test('the command line adds the parts of the changelog to the notes of its version', () => {
    const directory = mkdtempSync(join(tmpdir(), 'zplc-notes-'));
    const log = join(directory, 'CHANGELOG.md');
    writeFileSync(log, changelog);
    const results = fixture();
    results.changes = [];
    const resultsPath = join(directory, 'results.json');
    writeFileSync(resultsPath, JSON.stringify(results));
    const run = spawnSync(
      'bun',
      ['scripts/release/release-notes.ts', '--results', resultsPath, '--out', join(directory, 'notes.md'), '--changelog', log],
      { cwd: root, encoding: 'utf8' },
    );
    expect(run.status, run.stderr).toBe(0);
    const notes = readFileSync(join(directory, 'notes.md'), 'utf8');
    expect(notes).toContain('- Archives export and import.');
    expect(notes).toContain('- Programs built before contract draft 4 are refused.');
    expect(notes).toContain('- No board has a hardware record.');
    expect(notes).not.toContain('tools/contract/contract.json');
  });
});

describe('what a person is told about Windows, verification and evidence (REL-038, REL-017)', () => {
  const notes = renderReleaseNotes(fixture());

  test('gives the first-run steps and the Smart App Control statement while a Windows file is unsigned', () => {
    expect(notes).toMatch(/^### Windows: unsigned installers$/m);
    expect(notes).toContain('Windows protected your PC');
    expect(notes).toMatch(/select \*\*More info\*\*, then \*\*Run anyway\*\*/i);
    expect(notes).toContain('Smart App Control blocks unsigned apps');
  });

  test('states each channel with one of the four allowed words', () => {
    expect(notes).toMatch(/^\| Microsoft Store \(MSIX package\) \| not yet submittable \|$/m);
    expect(notes).toMatch(/^\| SignPath Foundation signing of the setup and portable executables \| submitted \|$/m);
    const results = fixture();
    results.channels = [{ channel: 'Microsoft Store (MSIX package)', state: 'pending' as never }];
    expect(() => renderReleaseNotes(results)).toThrow(/channel state/);
  });

  test('gives the commands that verify a download, and what an attestation does and does not prove', () => {
    expect(notes).toContain('sha256sum --ignore-missing -c SHA256SUMS');
    expect(notes).toContain('shasum -a 256 -c SHA256SUMS');
    expect(notes).toContain('Get-FileHash');
    expect(notes).toContain('gh attestation verify');
    expect(notes).toContain('proves where a file was built, not that it is safe');
    expect(notes).toContain('does not change the warnings of your operating system');
  });

  test('keeps the evidence boundary and the commit it was built from', () => {
    expect(notes).toContain('do not establish HIL, board qualification, timing, safety certification, or human release sign-off');
    expect(notes).toContain('0123456789abcdef0123456789abcdef01234567');
  });

  test('is generic in the version', () => {
    const results = fixture();
    results.version = '2.1.0';
    results.tag = 'v2.1.0';
    results.assets = results.assets.map((asset) => ({ ...asset, name: asset.name.replace('2.0.0-rc.4', '2.1.0') }));
    delete results.completeness;
    expect(renderReleaseNotes(results)).not.toContain('2.0.0-rc.4');
  });
});

describe('the command line (REL-027)', () => {
  test('reads a run-results file and writes the title and the notes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'zplc-notes-'));
    const result = spawnSync(
      'bun',
      [
        'scripts/release/release-notes.ts',
        '--results',
        join(import.meta.dir, 'fixtures', 'run-results.json'),
        '--out',
        join(directory, 'notes.md'),
        '--title-out',
        join(directory, 'title.txt'),
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(directory, 'title.txt'), 'utf8')).toBe(
      'ZPLC v2.0.0-rc.4: release candidate, the Windows channels are not live and no board has a hardware record yet',
    );
    expect(readFileSync(join(directory, 'notes.md'), 'utf8')).toContain('<summary>Signing state and checks of every asset');
  });

  test('exits 1 on a results file that is not for the schema', () => {
    const directory = mkdtempSync(join(tmpdir(), 'zplc-notes-'));
    const bad = join(directory, 'bad.json');
    writeFileSync(bad, JSON.stringify({ schemaVersion: 2 }));
    const result = spawnSync('bun', ['scripts/release/release-notes.ts', '--results', bad, '--out', join(directory, 'notes.md')], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/schemaVersion/);
  });
});
