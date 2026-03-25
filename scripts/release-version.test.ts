// @ts-nocheck

import { describe, expect, it } from 'bun:test';

import {
  isPrereleaseVersion,
  isValidReleaseVersion,
  updatePackageJsonVersion,
} from './release-version';

describe('release version helpers', () => {
  it('accepts stable and prerelease semver strings', () => {
    expect(isValidReleaseVersion('1.5.0')).toBe(true);
    expect(isValidReleaseVersion('1.5.1-rc.1')).toBe(true);
    expect(isValidReleaseVersion('1.5')).toBe(false);
    expect(isValidReleaseVersion('preview')).toBe(false);
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
});
