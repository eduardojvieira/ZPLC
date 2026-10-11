// REL-031, REL-038: the records that a release is cut from: one version source, a changelog of tagged versions,
// the identity of the product, and the state of the Windows channels.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkChangelog, compareVersions } from './changelog';

const root = join(import.meta.dir, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const json = <T>(path: string) => JSON.parse(read(path)) as T;
const productVersion = json<{ version: string }>('package.json').version;

describe('compareVersions (REL-031)', () => {
  test('orders by semantic versioning, a prerelease below its release and rc numbers as numbers', () => {
    const sorted = ['2.0.0', '2.0.0-rc.10', '2.0.0-rc.2', '1.5.0', '2.0.0-rc.1'].sort(compareVersions);
    expect(sorted).toEqual(['1.5.0', '2.0.0-rc.1', '2.0.0-rc.2', '2.0.0-rc.10', '2.0.0']);
    // the reason for the rc rule: an alpha, beta or preview name sorts below rc.3
    expect(compareVersions('2.0.0-beta.1', '2.0.0-rc.3')).toBeLessThan(0);
    expect(compareVersions('2.0.0-preview.1', '2.0.0-rc.3')).toBeLessThan(0);
  });
});

describe('the changelog holds only tagged versions (REL-031)', () => {
  const text = '# Changelog\n\n## Unreleased\n\n- Soon.\n\n## 2.0.0-rc.4 - 2026-10-20\n\n- New.\n\n## 2.0.0-rc.3 - 2026-09-01\n\n- Old.\n';
  const tags = ['v2.0.0-rc.3', 'v2.0.0-rc.1'];

  test('passes for an Unreleased section, the version being cut, and tagged older versions', () => {
    expect(checkChangelog({ text, tags, productVersion: '2.0.0-rc.4', untagged: {} })).toEqual([]);
  });

  test('names an older version heading that has no tag', () => {
    const problems = checkChangelog({ text, tags: ['v2.0.0-rc.1'], productVersion: '2.0.0-rc.4', untagged: {} });
    expect(problems).toEqual(['## 2.0.0-rc.3 has no tag v2.0.0-rc.3']);
  });

  test('accepts a recorded exception with its reason, and refuses a stale one', () => {
    expect(checkChangelog({ text, tags: [], productVersion: '2.0.0-rc.4', untagged: { '2.0.0-rc.3': 'never tagged' } })).toEqual([]);
    expect(checkChangelog({ text, tags, productVersion: '2.0.0-rc.4', untagged: { '2.0.0-rc.3': 'never tagged' } })).toEqual([
      'changelog-untagged.json lists 2.0.0-rc.3, which has a tag now: remove it',
    ]);
  });

  test('refuses a heading for a version above the one of package.json, which no tag can exist for yet', () => {
    expect(checkChangelog({ text, tags, productVersion: '2.0.0-rc.3', untagged: {} })).toEqual(['## 2.0.0-rc.4 is above the product version 2.0.0-rc.3 of package.json']);
  });

  test('refuses headings that are not Unreleased or a dated version, and versions out of order', () => {
    const odd = '## Next\n\n## 2.0.0-rc.1 - 2026-08-31\n\n## 2.0.0-rc.3 - 2026-09-01\n\n## 2.0.0-rc.2 - soon\n';
    const problems = checkChangelog({ text: odd, tags: [], productVersion: '2.0.0-rc.3', untagged: { '2.0.0-rc.1': 'x', '2.0.0-rc.2': 'x' } });
    expect(problems).toContain('"## Next" is neither "## Unreleased" nor "## <version> - <date>"');
    expect(problems).toContain('"## 2.0.0-rc.2 - soon" is neither "## Unreleased" nor "## <version> - <date>"');
    expect(problems).toContain('## 2.0.0-rc.3 is newer than the heading before it: versions go from newest to oldest');
  });

  test('is checked on the changelog of this repository, with the tags of this clone when it has any', () => {
    const listed = spawnSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
    const untagged = json<Record<string, string>>('scripts/release/changelog-untagged.json');
    expect(checkChangelog({ text: read('CHANGELOG.md'), tags: listed, productVersion, untagged })).toEqual([]);
    for (const reason of Object.values(untagged)) expect(reason.length).toBeGreaterThan(20);
  });
});

describe('the product identity is fixed (REL-031)', () => {
  test('electron-builder.yml and the package carry the recorded product name and appId', () => {
    const identity = json<{ productName: string; appId: string; executableName: string; desktopName: string }>('scripts/release/identity.json');
    const builder = Bun.YAML.parse(read('packages/zplc-ide/electron-builder.yml')) as { productName: string; appId: string; executableName: string };
    const manifest = json<{ desktopName: string }>('packages/zplc-ide/package.json');
    expect({ productName: builder.productName, appId: builder.appId, executableName: builder.executableName, desktopName: manifest.desktopName }).toEqual({
      productName: identity.productName,
      appId: identity.appId,
      executableName: identity.executableName,
      desktopName: identity.desktopName,
    });
  });
});

describe('what a version bump edits (REL-031, REL-038)', () => {
  test('a prerelease has a statement of how complete it is, which becomes its title', () => {
    const status = json<{ versions: Record<string, { completeness?: string }> }>('scripts/release/release-status.json').versions;
    if (productVersion.includes('-')) expect(status[productVersion]?.completeness?.length ?? 0).toBeGreaterThan(10);
  });

  test('the channels of the Windows installers are in one of the four states', () => {
    const channels = json<Array<{ channel: string; state: string }>>('scripts/release/channels.json');
    expect(channels.length).toBeGreaterThan(0);
    for (const { channel, state } of channels) {
      expect(channel.length).toBeGreaterThan(0);
      expect(['live', 'submitted', 'refused', 'not yet submittable']).toContain(state);
    }
  });
});
