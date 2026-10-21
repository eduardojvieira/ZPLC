// REL-027: the results file that the notes are rendered from is written from the job results, the evidence of the
// platform bundles and the JUnit reports of the run, never from what the pipeline is supposed to have done.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyAsset, collectRunResults, countJunit } from './run-results';

const JUNIT = `<?xml version="1.0"?>
<testsuites name="bun test" tests="4" failures="1" skipped="1">
  <testsuite name="src/a.test.ts" file="src/a.test.ts" tests="4">
    <testsuite name="outer" file="src/a.test.ts" tests="3">
      <testcase name="passes" classname="outer" file="src/a.test.ts" />
      <testcase name="fails" classname="outer" file="src/a.test.ts"><failure type="AssertionError" /></testcase>
      <testcase name="skipped" classname="outer" file="src/a.test.ts"><skipped /></testcase>
    </testsuite>
    <testcase name="top level" classname="" file="src/a.test.ts" />
  </testsuite>
</testsuites>
`;

function evidence(directory: string, platform: string, names: string[]): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `release-evidence-${platform}.json`),
    JSON.stringify({
      schemaVersion: 1,
      version: '2.0.0-rc.4',
      tag: 'v2.0.0-rc.4',
      commitSha: 'a'.repeat(40),
      artifacts: names.map((name) => ({ name, byteLength: 1, sha256: 'b'.repeat(64) })),
    }),
  );
}

describe('classifyAsset (REL-027)', () => {
  test.each([
    ['zplc-2.0.0-rc.4-mac-arm64.dmg', 'macos', 'adhoc'],
    ['zplc-2.0.0-rc.4-mac-x64.zip', 'macos', 'adhoc'],
    ['zplc-2.0.0-rc.4-win-x64-setup-unsigned.exe', 'windows', 'unsigned'],
    ['zplc-2.0.0-rc.4-win-x64-portable-unsigned.exe', 'windows', 'unsigned'],
    ['zplc-2.0.0-rc.4-win-x64-setup.exe', 'windows', 'signed'],
    ['zplc-2.0.0-rc.4-linux-x64.AppImage', 'linux', 'unsigned'],
    ['zplc-2.0.0-rc.4-linux-arm64.deb', 'linux', 'unsigned'],
    ['zplc-cli-2.0.0-rc.4-win-arm64.exe', 'cli', 'unsigned'],
    ['zplc-mcp-2.0.0-rc.4-linux-x64', 'cli', 'unsigned'],
    ['zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2', 'firmware', 'unsigned'],
    ['ZPLC-2.0.0-rc.4.cdx.json', 'metadata', 'unsigned'],
  ])('%s is %s and %s', (name, platform, signing) => {
    expect(classifyAsset(name)).toMatchObject({ platform, signing });
  });
});

describe('countJunit (REL-027)', () => {
  test('counts the executed, failed and skipped tests of a report', () => {
    expect(countJunit(JUNIT)).toEqual({ executed: 3, failed: 1, skipped: 1 });
  });
});

describe('collectRunResults (REL-027)', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zplc-run-results-'));
  evidence(join(directory, 'release-bundle-macos'), 'macos', ['zplc-2.0.0-rc.4-mac-arm64.dmg']);
  evidence(join(directory, 'release-bundle-linux'), 'linux', [
    'zplc-2.0.0-rc.4-linux-x64.deb',
    'zplc-cli-2.0.0-rc.4-linux-x64',
    'ZPLC-2.0.0-rc.4-linux.cdx.json',
  ]);
  writeFileSync(join(directory, 'junit-compiler.xml'), JUNIT);
  const common = {
    version: '2.0.0-rc.4',
    tag: 'v2.0.0-rc.4',
    commit: 'a'.repeat(40),
    runUrl: 'https://example.test/run/1',
    evidenceDirectory: directory,
    junit: [{ suite: 'compiler', job: 'typescript', path: join(directory, 'junit-compiler.xml') }],
    expectedFailures: [
      { test: 'packages/zplc-compiler/src/a.test.ts > x', requirement: 'CMP-012', added: '2026-10-09', reason: 'a conversion is wrong' },
    ],
    status: { '2.0.0-rc.4': { completeness: 'no hardware record yet', knownIssues: ['a known issue'] } },
    channels: [{ channel: 'Microsoft Store (MSIX package)', state: 'not yet submittable' as const }],
  };
  const needs = (result: Record<string, string>) =>
    Object.fromEntries(Object.entries(result).map(([job, value]) => [job, { result: value }]));

  test('lists the assets of every bundle with the checks that their job backs', () => {
    const results = collectRunResults({
      ...common,
      needs: needs({ 'build-macos': 'success', 'build-linux': 'success', 'build-windows': 'failure', 'build-binaries': 'success' }),
    });
    const byName = Object.fromEntries(results.assets.map((asset) => [asset.name, asset]));
    expect(byName['zplc-2.0.0-rc.4-mac-arm64.dmg']).toMatchObject({
      platform: 'macos',
      signing: 'adhoc',
      job: 'build-macos (arm64)',
      checks: { signature: 'passed', launch: 'passed', install: 'not-run' },
    });
    expect(byName['zplc-2.0.0-rc.4-linux-x64.deb']).toMatchObject({
      job: 'build-linux (x64)',
      checks: { signature: 'not-run', launch: 'passed', install: 'passed' },
    });
    expect(byName['zplc-cli-2.0.0-rc.4-linux-x64']).toMatchObject({
      platform: 'cli',
      job: 'build-binaries (linux-x64)',
      checks: { launch: 'passed' },
    });
    expect(results.assets.every((asset) => asset.runUrl === 'https://example.test/run/1')).toBe(true);
  });

  test('labels a firmware image with the evidence level of its board, from the manifest that travels with it (REL-022)', () => {
    const bundle = join(directory, 'release-bundle-firmware');
    evidence(bundle, 'firmware', [
      'zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2',
      'zplc-runtime-2.0.0-rc.4-nucleo-h743zi.bin',
      'zplc-runtime-2.0.0-rc.4.manifest.json',
    ]);
    writeFileSync(
      join(bundle, 'zplc-runtime-2.0.0-rc.4.manifest.json'),
      JSON.stringify({
        schema: 'zplc.firmware-release/1',
        images: [
          { file: 'zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2', evidenceLevel: 'cross-build' },
          { file: 'zplc-runtime-2.0.0-rc.4-nucleo-h743zi.bin', evidenceLevel: 'human-hil' },
        ],
      }),
    );
    const results = collectRunResults({ ...common, needs: needs({ 'build-firmware': 'success' }) });
    const byName = Object.fromEntries(results.assets.map((asset) => [asset.name, asset]));
    expect(byName['zplc-runtime-2.0.0-rc.4-rpi-pico-rp2040.uf2']).toMatchObject({
      platform: 'firmware',
      job: 'build-firmware',
      evidenceLevel: 'cross-build',
    });
    expect(byName['zplc-runtime-2.0.0-rc.4-nucleo-h743zi.bin']).toMatchObject({ evidenceLevel: 'human-hil' });
    // an image the manifest does not list, and a file that is not an image, carry no level
    expect(byName['zplc-runtime-2.0.0-rc.4.manifest.json']!.evidenceLevel).toBeUndefined();
    expect(byName['zplc-2.0.0-rc.4-mac-arm64.dmg']!.evidenceLevel).toBeUndefined();
  });

  test('records a failed job as a failed check, and a job that did not run as not run', () => {
    const failed = collectRunResults({
      ...common,
      needs: needs({ 'build-macos': 'failure', 'build-linux': 'skipped', 'build-windows': 'success', 'build-binaries': 'cancelled' }),
    });
    const mac = failed.assets.find((asset) => asset.platform === 'macos')!;
    expect(mac.checks).toMatchObject({ signature: 'failed', launch: 'failed' });
    const deb = failed.assets.find((asset) => asset.name.endsWith('.deb'))!;
    expect(deb.checks).toMatchObject({ launch: 'not-run', install: 'not-run' });
    expect(failed.assets.find((asset) => asset.platform === 'cli')!.checks.launch).toBe('not-run');
  });

  test('takes the suites from the JUnit reports, the failures from the expected-failure list, the rest from the status record', () => {
    const results = collectRunResults({ ...common, needs: needs({ 'build-macos': 'success' }) });
    expect(results.suites).toEqual([{ suite: 'compiler', job: 'typescript', executed: 3, failed: 1, skipped: 1 }]);
    expect(results.knownFailures).toEqual([
      { id: 'packages/zplc-compiler/src/a.test.ts > x', summary: 'a conversion is wrong', tracking: 'CMP-012' },
    ]);
    expect(results.completeness).toBe('no hardware record yet');
    expect(results.knownIssues).toEqual(['a known issue']);
    expect(results.channels).toEqual(common.channels);
    expect(results.jobs).toContainEqual({ job: 'build-macos', result: 'success' });
  });

  test('has no completeness for a version the status record does not know, so the title refuses it', () => {
    const results = collectRunResults({ ...common, status: {}, needs: needs({ 'build-macos': 'success' }) });
    expect(results.completeness).toBeUndefined();
  });
});
