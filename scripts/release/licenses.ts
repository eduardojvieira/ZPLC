// Third-party licence notices (REL-019), generated at packaging time and shipped inside every installer.
//
//   bun scripts/release/licenses.ts --out packages/zplc-ide/build/THIRD-PARTY-NOTICES.txt
//
// What the installer holds is what electron-builder copies: the production closure of the IDE package (its
// node_modules go into app.asar), the packages that Vite bundles into the renderer although they are declared as
// development dependencies (the renderer sources import them), and the font files of the build. The closure comes
// from bun.lock, the licence text from the installed package, and a package that is locked but not installed, one
// with no licence field and a font with no entry in font-licences.json each fail the run: a notice that quietly
// leaves a component out is worse than none.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { closureFrom, locateInstalled, parseLockfile, productionClosure, type LockPackage, type Lockfile } from './lockfile';

export interface PackageNotice {
  name: string;
  version: string;
  license: string;
  homepage?: string;
  repository?: string;
  /** The text of the package's licence and notice files, when it has them. */
  text?: string;
  /** Where the package is installed; not written to the notices. */
  directory: string;
}

export interface FontRecord {
  pattern: string;
  name: string;
  licence: string;
  source: string;
  copyright?: string;
}
export interface FontRegistry {
  schema: 1;
  fonts: FontRecord[];
}
export interface FontNotice {
  file: string;
  name: string;
  licence: string;
  source: string;
  copyright?: string;
}

const LICENCE_FILE = /^(licen[sc]e|copying|notice)(\..*)?$/i;
const FONT_FILE = /\.(ttf|otf|woff2?|eot)$/i;

function licenceOf(manifest: { license?: unknown; licenses?: unknown }): string {
  const one = (value: unknown): string | undefined => {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string')
      return (value as { type: string }).type;
    return undefined;
  };
  const direct = one(manifest.license);
  if (direct) return direct;
  if (Array.isArray(manifest.licenses)) {
    const all = manifest.licenses.map(one).filter((value): value is string => value !== undefined);
    if (all.length > 0) return all.join(' OR ');
  }
  return 'UNKNOWN';
}

function repositoryOf(value: unknown): string | undefined {
  const raw = typeof value === 'string' ? value : value && typeof value === 'object' ? (value as { url?: unknown }).url : undefined;
  if (typeof raw !== 'string' || raw === '') return undefined;
  return raw
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '');
}

export function readNotice(directory: string): PackageNotice {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Record<string, unknown>;
  const texts = readdirSync(directory)
    .filter((file) => LICENCE_FILE.test(file) && statSync(join(directory, file)).isFile())
    .sort()
    .map((file) => readFileSync(join(directory, file), 'utf8').trim())
    .filter((text) => text !== '');
  const repository = repositoryOf(manifest.repository);
  return {
    name: String(manifest.name),
    version: String(manifest.version),
    license: licenceOf(manifest),
    ...(typeof manifest.homepage === 'string' ? { homepage: manifest.homepage } : {}),
    ...(repository === undefined ? {} : { repository }),
    ...(texts.length === 0 ? {} : { text: texts.join('\n\n') }),
    directory,
  };
}

export interface CollectOptions {
  repoRoot: string;
  lock: Lockfile;
  workspacePath: string;
  /** Development dependencies of the workspace package that the renderer bundles. */
  bundled: readonly string[];
}

export function collectNotices({ repoRoot, lock, workspacePath, bundled }: CollectOptions): {
  notices: PackageNotice[];
  missing: string[];
} {
  const workspace = lock.workspaces.get(workspacePath);
  if (!workspace) throw new Error(`bun.lock has no workspace "${workspacePath}"`);
  const entries = new Map<string, LockPackage>();
  const missing: string[] = [];
  const closures = [productionClosure(lock, workspacePath), closureFrom(lock, [workspace.name], bundled)];
  for (const closure of closures) {
    for (const entry of closure.packages) entries.set(entry.key, entry);
    missing.push(...closure.unresolved.map((edge) => `${edge} is not in bun.lock`));
  }
  const notices = new Map<string, PackageNotice>();
  for (const entry of entries.values()) {
    if (entry.workspacePath !== undefined) continue; // this repository's own packages are the product, not a third party
    const directory = locateInstalled(repoRoot, lock, entry);
    if (directory === undefined) {
      missing.push(`${entry.id} is locked but not installed`);
      continue;
    }
    notices.set(entry.id, readNotice(directory));
  }
  const sorted = [...notices.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return { notices: sorted, missing: [...new Set(missing)].sort() };
}

/** The package name an import specifier means, or undefined for a relative or absolute path. */
function packageOf(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return undefined;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** The development dependencies that `sources` import, which Vite therefore bundles into the renderer. */
export function bundledDevDependencies(sources: readonly string[], devDependencies: readonly string[]): string[] {
  const imported = new Set<string>();
  const specifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  for (const source of sources) {
    for (const match of source.matchAll(specifier)) {
      const name = packageOf(match[1]!);
      if (name !== undefined) imported.add(name);
    }
  }
  return devDependencies.filter((name) => imported.has(name)).sort();
}

export function findFonts(directory: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (FONT_FILE.test(entry.name)) found.push(relative(directory, path).split(sep).join('/'));
    }
  };
  if (existsSync(directory)) walk(directory);
  return found.sort();
}

export function matchFonts(files: readonly string[], registry: FontRegistry): { fonts: FontNotice[]; unknown: string[] } {
  const fonts: FontNotice[] = [];
  const unknown: string[] = [];
  for (const file of files) {
    const base = file.slice(file.lastIndexOf('/') + 1);
    const record = registry.fonts.find((candidate) => new RegExp(candidate.pattern).test(base));
    if (record)
      fonts.push({
        file,
        name: record.name,
        licence: record.licence,
        source: record.source,
        ...(record.copyright === undefined ? {} : { copyright: record.copyright }),
      });
    else unknown.push(file);
  }
  return { fonts, unknown };
}

export interface RenderInput {
  product: string;
  version: string;
  notices: readonly PackageNotice[];
  fonts: readonly FontNotice[];
}

export function renderNotices({ product, version, notices, fonts }: RenderInput): string {
  const lines: string[] = [
    `${product} ${version}: third-party notices`,
    '',
    'This application contains the software listed below. Each entry gives the licence that its package declares',
    'and, where the package ships one, the text of its licence and notice files.',
    '',
    'Electron and Chromium: the licence files LICENSE.electron.txt and LICENSES.chromium.html that come with Electron',
    'are shipped beside the application executable (inside Resources on macOS).',
    '',
  ];
  if (fonts.length > 0) {
    lines.push('='.repeat(78), `Fonts (${fonts.length})`, '='.repeat(78), '');
    for (const font of fonts) {
      lines.push(`${font.name} (${font.file})`, `License: ${font.licence}`, `Source: ${font.source}`);
      if (font.copyright) lines.push(font.copyright);
      lines.push('');
    }
  }
  lines.push('='.repeat(78), `Packages (${notices.length})`, '='.repeat(78), '');
  for (const notice of notices) {
    lines.push('-'.repeat(78), `${notice.name}@${notice.version}`, `License: ${notice.license}`);
    if (notice.repository) lines.push(`Repository: ${notice.repository}`);
    else if (notice.homepage) lines.push(`Homepage: ${notice.homepage}`);
    lines.push('', notice.text ?? '(the package ships no licence file; the licence above is the one its package.json declares)', '');
  }
  return `${lines.join('\n')}\n`;
}

function sourcesOf(directory: string): string[] {
  const sources: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name))
        sources.push(readFileSync(path, 'utf8'));
    }
  };
  if (existsSync(directory)) walk(directory);
  return sources;
}

function main(argv: string[]): number {
  const options = { pkg: 'packages/zplc-ide', out: '', dist: 'dist', fonts: true };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--package') options.pkg = argv[++index] ?? '';
    else if (flag === '--out') options.out = argv[++index] ?? '';
    else if (flag === '--dist') options.dist = argv[++index] ?? '';
    else if (flag === '--no-fonts') options.fonts = false;
    else {
      console.error(`licenses: unknown argument ${flag}`);
      return 2;
    }
  }
  if (!options.out) {
    console.error('usage: licenses.ts --out <file> [--package packages/zplc-ide] [--dist dist] [--no-fonts]');
    return 2;
  }
  const root = resolve(dirname(import.meta.path), '..', '..');
  const lock = parseLockfile(readFileSync(join(root, 'bun.lock'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(root, options.pkg, 'package.json'), 'utf8')) as {
    version: string;
    devDependencies?: Record<string, string>;
  };
  const bundled = bundledDevDependencies(sourcesOf(join(root, options.pkg, 'src')), Object.keys(manifest.devDependencies ?? {}));
  const { notices, missing } = collectNotices({ repoRoot: root, lock, workspacePath: options.pkg, bundled });

  const problems = [...missing];
  for (const notice of notices) if (notice.license === 'UNKNOWN') problems.push(`${notice.name}@${notice.version} declares no licence`);

  let fonts: FontNotice[] = [];
  if (options.fonts) {
    const registry = JSON.parse(readFileSync(join(root, 'scripts/release/font-licences.json'), 'utf8')) as FontRegistry;
    const distDirectory = join(root, options.pkg, options.dist);
    if (!existsSync(distDirectory))
      problems.push(`${relative(root, distDirectory)} does not exist: build the renderer first so its fonts can be listed`);
    const files = [
      ...findFonts(distDirectory),
      // a bundled package ships through dist; the fonts of the others are copied as they are
      ...notices
        .filter((notice) => !bundled.includes(notice.name))
        .flatMap((notice) => findFonts(notice.directory).map((file) => `node_modules/${notice.name}/${file}`)),
    ];
    const matched = matchFonts(files, registry);
    fonts = matched.fonts;
    for (const file of matched.unknown) problems.push(`font ${file} has no entry in scripts/release/font-licences.json`);
  }

  for (const problem of problems) console.error(`licenses: ${problem}`);
  if (problems.length > 0) return 1;
  // the name the installer carries: electron-builder.yml is the one place that holds it
  const builder = Bun.YAML.parse(readFileSync(join(root, options.pkg, 'electron-builder.yml'), 'utf8')) as { productName?: string };
  writeFileSync(options.out, renderNotices({ product: builder.productName ?? 'ZPLC', version: manifest.version, notices, fonts }));
  const histogram = new Map<string, number>();
  for (const notice of notices) histogram.set(notice.license, (histogram.get(notice.license) ?? 0) + 1);
  console.log(
    `licenses: ${notices.length} packages (${bundled.length} bundled development dependencies: ${
      bundled.join(', ') || 'none'
    }), ${fonts.length} fonts, written to ${options.out}`,
  );
  console.log(
    `licenses: ${[...histogram]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name} ${count}`)
      .join(', ')}`,
  );
  return 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
