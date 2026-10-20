// The Homebrew cask and the AUR package of a release, rendered from the checksum file that the release published (REL-004,
// REL-014):
//
//   bun tools/ci/release/render-channels.ts --version 2.0.0-rc.4 --sums SHA256SUMS --cask Casks/zplc.rb --pkgbuild PKGBUILD
//
// The templates are packaging/homebrew/zplc.rb.in and packaging/aur/PKGBUILD.in. Every file name that a template needs
// is the one that installerName() gives, and every checksum is read from the line of that file in SHA256SUMS: a release
// that lacks a file, or lists it twice, renders nothing.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { installerName } from './verify-installers';

export const REPOSITORY = 'eduardojvieira/ZPLC';
/** The tap is github.com/eduardojvieira/homebrew-zplc (the owner creates it, OA-10); brew spells it without `homebrew-`. */
export const TAP = 'eduardojvieira/zplc';
export const CASK_TOKEN = 'zplc';
/** The one fully qualified command of the install page: it works before and after the tap has been added. */
export const INSTALL_COMMAND = `brew install --cask ${TAP}/${CASK_TOKEN}`;

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const SUM_LINE = /^([a-f0-9]{64}) [ *](.+)$/;

/** `<sha256>  <name>` lines, as sha256sum writes them; a name listed twice with different checksums is refused. */
export function parseSums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split('\n').filter((candidate) => candidate !== '')) {
    const match = SUM_LINE.exec(line);
    if (!match) throw new Error(`SHA256SUMS holds a line that is not "<sha256>  <name>": ${line}`);
    if (sums.has(match[2]!) && sums.get(match[2]!) !== match[1]) throw new Error(`SHA256SUMS lists ${match[2]} with two checksums`);
    sums.set(match[2]!, match[1]!);
  }
  return sums;
}

function fill(template: string, values: Record<string, string>): string {
  const out = template.replace(/@([A-Z0-9_]+)@/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`the template holds the placeholder @${key}@, which nothing fills`);
    return values[key]!;
  });
  return out;
}

const sumOf = (sums: Map<string, string>, name: string): string => {
  const sum = sums.get(name);
  if (sum === undefined) throw new Error(`SHA256SUMS has no line for ${name}`);
  return sum;
};

/** The cask of a version: the ZIP of each macOS architecture, pinned by checksum. */
export function renderCask(template: string, version: string, sums: Map<string, string>): string {
  return fill(template, {
    VERSION: version,
    SHA256_ARM64: sumOf(sums, installerName(version, 'zip', 'arm64')),
    SHA256_X64: sumOf(sums, installerName(version, 'zip', 'x64')),
  });
}

/** pacman refuses a hyphen in a version, and an underscore sorts a prerelease before its release as 2.0.0-rc.4 does. */
export const pkgver = (version: string): string => version.replace(/-/g, '_');

/** The PKGBUILD of a version: the .deb of each architecture, from `baseUrl` (the download address of the release by default). */
export function renderPkgbuild(template: string, version: string, sums: Map<string, string>, baseUrl = `https://github.com/${REPOSITORY}/releases/download/v${version}`): string {
  return fill(template, {
    VERSION: version,
    PKGVER: pkgver(version),
    BASE_URL: baseUrl,
    SHA256_AMD64: sumOf(sums, installerName(version, 'deb', 'x64')),
    SHA256_ARM64: sumOf(sums, installerName(version, 'deb', 'arm64')),
  });
}

if (import.meta.main) {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { version: { type: 'string' }, sums: { type: 'string' }, cask: { type: 'string' }, pkgbuild: { type: 'string' }, 'base-url': { type: 'string' } } });
  if (!values.version || !values.sums || (!values.cask && !values.pkgbuild)) {
    console.error('usage: render-channels.ts --version <v> --sums <SHA256SUMS> [--cask <file>] [--pkgbuild <file>] [--base-url <address>]');
    process.exit(2);
  }
  const sums = parseSums(readFileSync(values.sums, 'utf8'));
  if (values.cask) writeFileSync(values.cask, renderCask(readFileSync(join(ROOT, 'packaging/homebrew/zplc.rb.in'), 'utf8'), values.version, sums));
  if (values.pkgbuild) writeFileSync(values.pkgbuild, renderPkgbuild(readFileSync(join(ROOT, 'packaging/aur/PKGBUILD.in'), 'utf8'), values.version, sums, values['base-url']));
}
