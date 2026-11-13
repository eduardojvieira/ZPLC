// The download page of the site (docs/src/pages/download.js): it offers the installer of the visitor's system with the
// file names the release pipeline writes, and the landing page sends its download button there.
import { describe, expect, mock, test } from 'bun:test';
import { installerName } from '../ci/release/verify-installers';
import { SYSTEMS, detectSystem, featuredSystems, fileName } from '../../docs/src/components/DownloadPage/downloads.js';

// content.js imports a hook that only the Docusaurus bundler resolves; the text itself needs none of it
mock.module('@docusaurus/useDocusaurusContext', () => ({ default: () => ({ i18n: { currentLocale: 'en' } }) }));
const { getLandingPageContent } = await import('../../docs/src/components/LandingPage/content.js');

const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';
const LINUX_ARM = 'Mozilla/5.0 (X11; Linux aarch64; rv:132.0) Gecko/20100101 Firefox/132.0';

describe('the files the download page offers', () => {
  test('are named as the release pipeline names them, for every system and format', () => {
    const offered = SYSTEMS.flatMap((system) => system.formats.map((format) => ({ format, arch: system.arch })));
    expect(offered).toHaveLength(14);
    for (const { format, arch } of offered) expect(fileName('2.0.0', format, arch)).toBe(installerName('2.0.0', format, arch));
  });
});

describe('detectSystem', () => {
  test('reads Windows on an Intel or AMD processor, and Windows on ARM when the browser reports the architecture', () => {
    expect(detectSystem({ userAgent: WINDOWS })).toEqual({ os: 'windows', arch: 'x64' });
    expect(detectSystem({ userAgent: WINDOWS, architecture: 'arm' })).toEqual({ os: 'windows', arch: 'arm64' });
  });

  test('leaves the Mac architecture unknown unless the browser reports it, because every Mac browser says "Intel"', () => {
    expect(detectSystem({ userAgent: MAC_SAFARI })).toEqual({ os: 'macos', arch: null });
    expect(detectSystem({ userAgent: MAC_CHROME, architecture: 'arm' })).toEqual({ os: 'macos', arch: 'arm64' });
    expect(detectSystem({ userAgent: MAC_CHROME, architecture: 'x86' })).toEqual({ os: 'macos', arch: 'x64' });
  });

  test('reads Linux on both architectures', () => {
    expect(detectSystem({ userAgent: LINUX })).toEqual({ os: 'linux', arch: 'x64' });
    expect(detectSystem({ userAgent: LINUX_ARM })).toEqual({ os: 'linux', arch: 'arm64' });
  });

  test('offers nothing to a phone, a tablet or a Chromebook, where ZPLC does not install', () => {
    expect(detectSystem({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile' })).toBeNull();
    expect(detectSystem({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15' })).toBeNull();
    expect(detectSystem({ userAgent: MAC_SAFARI, maxTouchPoints: 5 })).toBeNull();
    expect(detectSystem({ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/131.0' })).toBeNull();
    expect(detectSystem({ userAgent: '' })).toBeNull();
  });
});

describe('featuredSystems', () => {
  test('features the one system it detected, and both Macs when the architecture is unknown', () => {
    expect(featuredSystems({ os: 'linux', arch: 'x64' }).map((system) => system.key)).toEqual(['linux-x64']);
    expect(featuredSystems({ os: 'windows', arch: 'arm64' }).map((system) => system.key)).toEqual(['win-arm64']);
    expect(featuredSystems({ os: 'macos', arch: null }).map((system) => system.key)).toEqual(['mac-arm64', 'mac-x64']);
    expect(featuredSystems(null)).toEqual([]);
  });
});

describe('the text of the download page', () => {
  const keys = (value: unknown, prefix = ''): string[] =>
    value !== null && typeof value === 'object'
      ? Object.entries(value).flatMap(([key, inner]) => keys(inner, `${prefix}${key}.`))
      : [prefix.slice(0, -1)];

  test('has the same entries in English and in Spanish, and a label for every system and format', () => {
    const english = getLandingPageContent('en').download;
    const spanish = getLandingPageContent('es').download;
    expect(keys(spanish)).toEqual(keys(english));
    for (const system of SYSTEMS) {
      expect(english.systems[system.key]).toBeTruthy();
      for (const format of system.formats) expect(english.formats[format]).toBeTruthy();
    }
  });

  test('is where the download button of the landing page leads, in both languages', () => {
    for (const locale of ['en', 'es']) {
      const build = getLandingPageContent(locale).paths.build;
      expect({ locale, to: build.to, href: build.href }).toEqual({ locale, to: '/download', href: undefined });
    }
  });
});
