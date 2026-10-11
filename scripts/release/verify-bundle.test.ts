// VF-021: the release bundle is checked as the files that were produced, not as the workflow that produced them.
import { afterAll, describe, expect, test } from 'bun:test';
import { appendFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error the integrity bundle script is plain JavaScript
import { createReleaseIntegrityBundle } from '../release-artifacts.mjs';
import { verifyBundle } from './verify-bundle';

const identity = { version: '2.0.0-rc.4', tag: 'v2.0.0-rc.4', commitSha: 'a'.repeat(40) };
const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

/** A bundle made by the script that makes them, named per platform as the workflow names it. */
async function bundle(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'zplc-bundle-'));
  roots.push(root);
  const input = join(root, 'input');
  mkdirSync(input);
  writeFileSync(join(input, 'ZPLC-2.0.0-rc.4-linux-x64.AppImage'), 'appimage');
  writeFileSync(join(input, 'ZPLC-2.0.0-rc.4-linux-x64.deb'), 'deb');
  writeFileSync(join(input, 'ZPLC-2.0.0-rc.4-linux.cdx.json'), JSON.stringify({ bomFormat: 'CycloneDX', components: [{ name: 'a', version: '1', purl: 'pkg:npm/a@1' }] }));
  const output = join(root, 'release');
  await createReleaseIntegrityBundle({ inputDir: input, outputDir: output, ...identity });
  renameSync(join(output, 'SHA256SUMS'), join(output, 'SHA256SUMS-linux'));
  renameSync(join(output, 'release-evidence.json'), join(output, 'release-evidence-linux.json'));
  return output;
}

describe('the release bundle that was produced (VF-021)', () => {
  test('holds what its checksum and evidence files say, for the identity of the run', async () => {
    expect(verifyBundle(await bundle(), identity)).toEqual([]);
  });

  test('names an asset whose bytes are not the ones that were checksummed', async () => {
    const directory = await bundle();
    appendFileSync(join(directory, 'ZPLC-2.0.0-rc.4-linux-x64.deb'), 'x');
    const problems = verifyBundle(directory, identity);
    expect(problems).toContain('ZPLC-2.0.0-rc.4-linux-x64.deb does not have the checksum that SHA256SUMS-linux states');
    expect(problems.some((problem) => problem.includes('describes ZPLC-2.0.0-rc.4-linux-x64.deb differently'))).toBe(true);
  });

  test('names an asset that no checksum line covers, and a line for a file that is gone', async () => {
    const directory = await bundle();
    writeFileSync(join(directory, 'ZPLC-2.0.0-rc.4-linux-arm64.deb'), 'extra');
    rmSync(join(directory, 'ZPLC-2.0.0-rc.4-linux-x64.AppImage'));
    const problems = verifyBundle(directory, identity);
    expect(problems).toContain('ZPLC-2.0.0-rc.4-linux-arm64.deb is in the bundle and in no checksum line');
    expect(problems).toContain('SHA256SUMS-linux names ZPLC-2.0.0-rc.4-linux-x64.AppImage, which the bundle does not hold');
  });

  test('refuses the evidence of another version, tag or commit', async () => {
    const problems = verifyBundle(await bundle(), { ...identity, version: '2.0.0-rc.5', commitSha: 'b'.repeat(40) });
    expect(problems.filter((problem) => problem.includes('this run is'))).toHaveLength(2);
  });

  test('refuses a bill of materials that is not CycloneDX or holds no component', async () => {
    const directory = await bundle();
    writeFileSync(join(directory, 'ZPLC-2.0.0-rc.4-linux.cdx.json'), JSON.stringify({ bomFormat: 'SPDX', components: [] }));
    const problems = verifyBundle(directory, identity);
    expect(problems).toContain('ZPLC-2.0.0-rc.4-linux.cdx.json is not a CycloneDX document');
    expect(problems).toContain('ZPLC-2.0.0-rc.4-linux.cdx.json holds no component');
  });

  test('refuses a folder with two checksum files, or with none', async () => {
    const directory = await bundle();
    writeFileSync(join(directory, 'SHA256SUMS-macos'), '');
    expect(verifyBundle(directory, identity)).toEqual(['the bundle holds 2 checksum files, not one']);
    rmSync(join(directory, 'SHA256SUMS-macos'));
    rmSync(join(directory, 'SHA256SUMS-linux'));
    expect(verifyBundle(directory, identity)).toEqual(['the bundle holds 0 checksum files, not one']);
  });
});
