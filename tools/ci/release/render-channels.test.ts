// The Homebrew cask and the AUR package are written from the checksums of a release, and name only files that exist.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INSTALL_COMMAND, parseSums, pkgver, renderCask, renderPkgbuild } from './render-channels';
import { installerName } from './verify-installers';

const VERSION = '2.0.0-rc.4';
const root = join(import.meta.dir, '..', '..', '..');
const cask = readFileSync(join(root, 'packaging/homebrew/zplc-ide.rb.in'), 'utf8');
const pkgbuild = readFileSync(join(root, 'packaging/aur/PKGBUILD.in'), 'utf8');
const hex = (digit: string) => digit.repeat(64);
const SUMS = [
  [hex('a'), installerName(VERSION, 'zip', 'arm64')],
  [hex('b'), installerName(VERSION, 'zip', 'x64')],
  [hex('c'), installerName(VERSION, 'deb', 'x64')],
  [hex('d'), installerName(VERSION, 'deb', 'arm64')],
  [hex('e'), installerName(VERSION, 'dmg', 'arm64')],
].map(([sum, name]) => `${sum}  ${name}`).join('\n');

describe('the Homebrew cask', () => {
  const text = renderCask(cask, VERSION, parseSums(SUMS));

  it('pins the SHA-256 of the ZIP of each macOS architecture, read from the checksum file of the release', () => {
    expect(text).toContain(`version "${VERSION}"`);
    expect(text).toContain(`sha256 arm:   "${hex('a')}",\n         intel: "${hex('b')}"`);
    expect(text).not.toMatch(/@[A-Z0-9_]+@/);
  });

  it('downloads the file that the pipeline publishes for the architecture, not another name', () => {
    const url = /url "([^"]+)"/.exec(text)![1]!;
    for (const arch of ['arm64', 'x64'] as const) {
      const expanded = url.replace('#{version}', VERSION).replace('#{version}', VERSION).replace('#{arch}', arch);
      expect(expanded).toBe(`https://github.com/eduardojvieira/ZPLC/releases/download/v${VERSION}/${installerName(VERSION, 'zip', arch)}`);
    }
    expect(text).toContain('arch arm: "arm64", intel: "x64"');
  });

  it('says openly that it removes the quarantine flag (decision D-01) and installs the application the ZIP holds', () => {
    expect(text).toContain('com.apple.quarantine');
    expect(text).toContain('Decision D-01');
    expect(text).toContain('app "ZPLC IDE.app"');
  });

  it('is installed by one fully qualified command', () => {
    expect(INSTALL_COMMAND).toBe('brew install --cask eduardojvieira/zplc/zplc-ide');
  });

  it('is not rendered for a release that lacks the ZIP of an architecture', () => {
    expect(() => renderCask(cask, VERSION, parseSums(SUMS.split('\n').slice(0, 1).join('\n')))).toThrow(`SHA256SUMS has no line for ${installerName(VERSION, 'zip', 'x64')}`);
  });
});

describe('the AUR package', () => {
  const text = renderPkgbuild(pkgbuild, VERSION, parseSums(SUMS));

  it('takes the .deb of each architecture from the release, pinned by the checksum of the release', () => {
    expect(text).toContain(`_tag=${VERSION}`);
    expect(text).toContain(`sha256sums_x86_64=('${hex('c')}')`);
    expect(text).toContain(`sha256sums_aarch64=('${hex('d')}')`);
    expect(text).toContain(`${installerName(VERSION, 'deb', 'x64').replace(VERSION, '${_tag}')}::https://github.com/eduardojvieira/ZPLC/releases/download/v${VERSION}/`);
    expect(text).not.toMatch(/@[A-Z0-9_]+@/);
  });

  it('writes a version that pacman accepts, with no hyphen', () => {
    expect(pkgver(VERSION)).toBe('2.0.0_rc.4');
    expect(text).toContain('pkgver=2.0.0_rc.4');
    expect(text).not.toMatch(/^pkgver=.*-/m);
  });

  it('can point at another address, so that the package is tried against a file on disk', () => {
    expect(renderPkgbuild(pkgbuild, VERSION, parseSums(SUMS), 'file:///tmp/release')).toContain('::file:///tmp/release/');
  });
});

describe('the checksum file', () => {
  it('refuses a line that is not a checksum and a name that has two', () => {
    expect(() => parseSums('not a checksum line')).toThrow('not "<sha256>  <name>"');
    expect(() => parseSums(`${hex('a')}  x.zip\n${hex('b')}  x.zip`)).toThrow('x.zip with two checksums');
  });
});
