// @ts-nocheck

import { describe, expect, it } from 'bun:test';

import {
  findPackageVersionDrift,
  isPrereleaseVersion,
  isValidReleaseVersion,
  updatePackageJsonVersion,
} from './release-version';

describe('release version helpers', () => {
  it('accepts stable and prerelease semver strings', () => {
    expect(isValidReleaseVersion('1.5.0')).toBe(true);
    expect(isValidReleaseVersion('1.5.1-rc.1')).toBe(true);
    expect(isValidReleaseVersion('2.0.0-rc.1')).toBe(true);
    expect(isValidReleaseVersion('1.5')).toBe(false);
    expect(isValidReleaseVersion('preview')).toBe(false);
  });

  it('rejects non-canonical semver forms and build metadata', () => {
    for (const version of ['01.2.3', '1.02.3', '1.2.03', '1.2.3-rc.', '1.2.3-a..b', '1.2.3-01', '1.2.3+build.1']) {
      expect(isValidReleaseVersion(version)).toBe(false);
    }
  });

  it('detects prerelease versions by hyphen', () => {
    expect(isPrereleaseVersion('1.5.0')).toBe(false);
    expect(isPrereleaseVersion('1.5.1-rc.1')).toBe(true);
  });

  it('updates only the package version field', () => {
    const updated = updatePackageJsonVersion(
      JSON.stringify({
        name: '@zplc/ide',
        version: '1.4.8',
        private: true,
      }),
      '1.5.0'
    );

    expect(JSON.parse(updated)).toEqual({
      name: '@zplc/ide',
      version: '1.5.0',
      private: true,
    });
  });

  it('reports the drifted workspace manifest path against the root version', () => {
    const drift = findPackageVersionDrift('1.5.0', {
      'package.json': JSON.stringify({ version: '1.5.0' }),
      'packages/zplc-compiler/package.json': JSON.stringify({ version: '1.4.3' }),
    });

    expect(drift).toEqual([
      'packages/zplc-compiler/package.json: expected 1.5.0, found 1.4.3',
    ]);
  });

  it('propagates a prerelease version to all package manifests', () => {
    const version = '2.0.0-rc.1';
    const manifests = [
      'package.json',
      'packages/zplc-compiler/package.json',
      'packages/zplc-hil/package.json',
      'packages/zplc-ide/package.json',
    ].map((path) => [path, updatePackageJsonVersion('{"name":"zplc","version":"1.5.0"}', version)] as const);

    expect(findPackageVersionDrift(version, Object.fromEntries(manifests))).toEqual([]);
  });
});
