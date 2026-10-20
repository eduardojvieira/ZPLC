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

describe('the title of a release says how complete a prerelease is (REL-031)', () => {
  test('names the version and the completeness of a release candidate', () => {
    expect(releaseTitle(fixture())).toBe('ZPLC v2.0.0-rc.4: release candidate, the Windows channels are not live and no board has a hardware record yet');
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

describe('the signing state of every asset comes from the checks of the run (REL-027, REL-015)', () => {
  const notes = renderReleaseNotes(fixture());

  test('lists each asset with the job that built it and its signing state', () => {
    expect(notes).toContain('| zplc-2.0.0-rc.4-mac-arm64.dmg |');
    expect(notes).toMatch(/\| zplc-2\.0\.0-rc\.4-mac-arm64\.dmg \| \[build-macos \(arm64\)\]\(https:\/\/github\.com\/example\/zplc\/actions\/runs\/1\/job\/10\) \| Signed ad hoc and sealed; signature verified in this run\. Not notarized/);
    expect(notes).toMatch(/\| zplc-2\.0\.0-rc\.4-win-x64-setup-unsigned\.exe \|[^\n]*\| Unsigned\./);
    expect(notes).toMatch(/\| zplc-2\.0\.0-rc\.4-linux-x64\.deb \|[^\n]*\| Unsigned\.[^\n]*installed and launched in clean containers: passed/);
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
    results.assets.push({ name: 'zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2', platform: 'firmware', job: 'build-firmware', signing: 'unsigned', evidenceLevel: 'cross-build', checks: { signature: 'not-run', launch: 'not-run', install: 'not-run' } });
    results.assets.push({ name: 'zplc-runtime-2.0.0-rc.4-nucleo-h743zi.bin', platform: 'firmware', job: 'build-firmware', signing: 'unsigned', checks: { signature: 'not-run', launch: 'not-run', install: 'not-run' } });
    const text = renderReleaseNotes(results);
    const row = (name: string) => text.split('\n').find((line) => line.startsWith(`| ${name} |`))!;
    expect(row('zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2')).toContain('Evidence level of the board: cross-build');
    expect(row('zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2')).toContain('has not been flashed or run on it');
    expect(row('zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2')).not.toContain('launched on its own system');
    expect(row('zplc-runtime-2.0.0-rc.4-nucleo-h743zi.bin')).toContain('evidence level of the board is not recorded in this run');
    results.assets.push({ name: 'zplc-runtime-2.0.0-rc.4.manifest.json', platform: 'firmware', job: 'build-firmware', signing: 'unsigned', checks: { signature: 'not-run', launch: 'not-run', install: 'not-run' } });
    expect(renderReleaseNotes(results).split('\n').find((line) => line.startsWith('| zplc-runtime-2.0.0-rc.4.manifest.json |'))).toContain('lists the firmware images of this release');
  });

  test('says which firmware job to read when the run published no firmware image (REL-022)', () => {
    const results = fixture();
    results.jobs.push({ job: 'build-firmware', result: 'failure' }, { job: 'assemble-firmware', result: 'skipped' });
    expect(renderReleaseNotes(results)).toContain('No firmware image was published: build-firmware ended in failure, assemble-firmware ended in skipped.');
    results.assets.push({ name: 'zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2', platform: 'firmware', job: 'build-firmware', signing: 'unsigned', checks: { signature: 'not-run', launch: 'not-run', install: 'not-run' } });
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
    const changelog = '# Changelog\n\n## Unreleased\n\n- Not yet.\n\n## 2.0.0-rc.4 - 2026-10-20\n\n- First change.\n  continued here.\n- Second change.\n\n## 2.0.0-rc.3 - 2026-09-01\n\n- Old.\n';
    expect(changelogSection(changelog, '2.0.0-rc.4')).toEqual(['First change. continued here.', 'Second change.']);
    expect(changelogSection(changelog, '9.9.9')).toEqual([]);
  });
});

describe('what changed for a user, what breaks, how to migrate and what is limited (DOC-030)', () => {
  const changelog = [
    '# Changelog', '', '## Unreleased', '', '- Not yet.', '',
    '## 2.0.0-rc.4 - 2026-10-20', '',
    '### What changed for you', '', '- The simulator runs tasks of different intervals.', '  Each is released on its own.', '- Archives export and import.', '',
    '### Breaking changes', '', '- Programs built before contract draft 4 are refused.', '',
    '### Migration', '', '1. Rebuild every program and reflash every board together.', '2. Name the broker of every controller.', '',
    '### Known limits', '', '- No board has a hardware record.', '',
    '### Details for contributors', '', '- `tools/contract/contract.json` carries the counter (CMP-052).', '',
    '## 2.0.0-rc.3 - 2026-09-01', '', '- Old.', '',
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

  test('takes every bullet of an older section as a change, and says nothing is recorded under "None."', () => {
    expect(changelogParts(changelog, '2.0.0-rc.3')).toEqual({ structured: false, changes: ['Old.'], breaking: [], migration: [], limits: [] });
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
    const run = spawnSync('bun', ['scripts/release/release-notes.ts', '--results', resultsPath, '--out', join(directory, 'notes.md'), '--changelog', log], { cwd: root, encoding: 'utf8' });
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
    const result = spawnSync('bun', ['scripts/release/release-notes.ts', '--results', join(import.meta.dir, 'fixtures', 'run-results.json'), '--out', join(directory, 'notes.md'), '--title-out', join(directory, 'title.txt')], { cwd: root, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(directory, 'title.txt'), 'utf8')).toBe('ZPLC v2.0.0-rc.4: release candidate, the Windows channels are not live and no board has a hardware record yet');
    expect(readFileSync(join(directory, 'notes.md'), 'utf8')).toContain('### Signing state and checks of every asset');
  });

  test('exits 1 on a results file that is not for the schema', () => {
    const directory = mkdtempSync(join(tmpdir(), 'zplc-notes-'));
    const bad = join(directory, 'bad.json');
    writeFileSync(bad, JSON.stringify({ schemaVersion: 2 }));
    const result = spawnSync('bun', ['scripts/release/release-notes.ts', '--results', bad, '--out', join(directory, 'notes.md')], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/schemaVersion/);
  });
});
