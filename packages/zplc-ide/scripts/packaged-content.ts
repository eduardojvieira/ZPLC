// What the installed application holds (REL-034, REL-019), checked on the unpacked package electron-builder made:
//
//   bun run scripts/packaged-content.ts [--dist <folder with the unpacked package>]
//
// The example projects and the Learn lessons are compiled into the renderer bundle inside app.asar (Vite's glob
// imports), so the check reads the archive and looks for the exact text of each project file in its scripts. The
// lessons are found by pattern, so a lesson package that is added is checked with no edit here: the ids of the
// content files (src/components/learnContent*.ts) and the folders `lessons/*/lesson.json`. The bytecode examples
// are copied beside the archive and compared byte for byte. The licence notices must name every package and font
// that the archive holds.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { discoverUnpackedResources } from './smoke-desktop-builds';
import { listAsarFiles } from './run-packaged-desktop-smoke';

interface AsarNode { files?: Record<string, AsarNode>; size?: number; offset?: string }

function asarHeader(asar: Uint8Array): { root: AsarNode; dataStart: number } {
  const view = new DataView(asar.buffer, asar.byteOffset, asar.byteLength);
  const jsonLength = view.getUint32(12, true);
  const root = JSON.parse(new TextDecoder().decode(asar.subarray(16, 16 + jsonLength))) as AsarNode;
  // the first pickle holds the size of the header pickle at byte 4; the file data follows both
  return { root, dataStart: 8 + view.getUint32(4, true) };
}

/** The bytes of one file of an asar archive. Unpacked files (`unpacked: true`) live beside the archive and are not read here. */
export function readAsarFile(asar: Uint8Array, path: string): Uint8Array {
  const { root, dataStart } = asarHeader(asar);
  let node: AsarNode | undefined = root;
  for (const part of path.split('/')) node = node?.files?.[part];
  if (node?.offset === undefined || node.size === undefined) throw new Error(`${path} is not in the asar archive`);
  const start = dataStart + Number(node.offset);
  return asar.subarray(start, start + node.size);
}

function quote(text: string, mark: '"' | "'" | '`'): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (char === '\\') out += '\\\\';
    else if (char === mark) out += `\\${mark}`;
    else if (char === '\n') out += mark === '`' ? '\n' : '\\n';
    else if (char === '\r') out += '\\r';
    else if (code < 0x20 && char !== '\t') out += `\\x${code.toString(16).padStart(2, '0')}`;
    else if (code === 0x2028 || code === 0x2029) out += `\\u${code.toString(16)}`;
    else out += char;
  }
  return mark === '`' ? `\`${out.replaceAll('${', '\\${')}\`` : `${mark}${out}${mark}`;
}

/**
 * The ways a string literal of this text can appear in a minified bundle: the minifier picks the quote that needs the
 * fewest escapes, so the three are tried. Non-ASCII text is kept as it is (Vite minifies with the utf8 charset).
 */
export function encodings(text: string): string[] {
  return [quote(text, '"'), quote(text, "'"), quote(text, '`')];
}

function walk(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(path));
    else if (entry.isFile()) found.push(path);
  }
  return found.sort();
}

const posix = (path: string): string => path.split(sep).join('/');

/** The ids of the lessons the repository has: the content files of Learn and the lesson package folders. */
export function lessonIds(packageRoot: string): string[] {
  const ids = new Set<string>();
  const components = join(packageRoot, 'src', 'components');
  if (existsSync(components)) {
    for (const file of readdirSync(components).filter((name) => /^learnContent.*\.ts$/.test(name))) {
      for (const match of readFileSync(join(components, file), 'utf8').matchAll(/\bid:\s*'([a-z0-9][a-z0-9-]*)'/g)) ids.add(match[1]!);
    }
  }
  const lessons = join(packageRoot, 'lessons');
  if (existsSync(lessons)) {
    for (const entry of readdirSync(lessons, { withFileTypes: true })) {
      const manifest = join(lessons, entry.name, 'lesson.json');
      if (!entry.isDirectory() || !existsSync(manifest)) continue;
      const id = (JSON.parse(readFileSync(manifest, 'utf8')) as { id?: unknown }).id;
      ids.add(typeof id === 'string' && id !== '' ? id : entry.name);
    }
  }
  return [...ids].sort();
}

export interface PackagedContentOptions {
  /** The `resources` folder of the unpacked package (`Contents/Resources` of a macOS bundle). */
  resources: string;
  repoRoot: string;
}

/** What is wrong with the package; an empty list means it holds the examples, the lessons and the notices. */
export function checkPackagedContent({ resources, repoRoot }: PackagedContentOptions): string[] {
  const problems: string[] = [];
  const packageRoot = join(repoRoot, 'packages', 'zplc-ide');
  const archivePath = join(resources, 'app.asar');
  if (!existsSync(archivePath)) return [`${archivePath} does not exist`];
  const asar = readFileSync(archivePath);
  const files = listAsarFiles(asar);
  const bundle = files
    .filter((file) => /^dist\/.*\.js$/.test(file))
    .map((file) => Buffer.from(readAsarFile(asar, file)).toString('utf8'))
    .join('\n');
  const inBundle = (text: string): boolean => encodings(text).some((form) => bundle.includes(form));
  if (bundle === '') problems.push('app.asar holds no renderer bundle under dist/');

  // the example projects: every file of projects/, byte for byte as the loader reads it
  const projects = join(packageRoot, 'projects');
  for (const file of existsSync(projects) ? walk(projects) : []) {
    if (!inBundle(readFileSync(file, 'utf8'))) problems.push(`example project file projects/${posix(relative(projects, file))} is not in the renderer bundle`);
  }

  // the course: every lesson id the repository has
  for (const id of lessonIds(packageRoot)) {
    if (!inBundle(id)) problems.push(`lesson ${id} is not in the renderer bundle`);
  }

  // the bytecode examples, copied beside the archive by extraResources
  const examples = join(repoRoot, 'examples');
  for (const name of existsSync(examples) ? readdirSync(examples).filter((entry) => /\.(zplc|st)$/.test(entry)).sort() : []) {
    const shipped = join(resources, 'examples', name);
    if (!existsSync(shipped)) problems.push(`examples/${name} is not in the resources`);
    else if (!readFileSync(shipped).equals(readFileSync(join(examples, name)))) problems.push(`examples/${name} in the resources differs from the repository file`);
  }

  // the licence notices: shipped, and naming every package and font that the archive holds
  const noticesPath = join(resources, 'THIRD-PARTY-NOTICES.txt');
  if (!existsSync(noticesPath) || statSync(noticesPath).size === 0) {
    problems.push('THIRD-PARTY-NOTICES.txt is not in the resources');
  } else {
    const notices = readFileSync(noticesPath, 'utf8');
    const packages = new Set<string>();
    for (const file of files) {
      for (const match of file.matchAll(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)(?=\/)/g)) packages.add(match[1]!);
    }
    for (const name of [...packages].sort()) {
      if (name.startsWith('@zplc/') || name === '.bin') continue; // the product's own packages
      if (!notices.includes(`${name}@`)) problems.push(`node_modules/${name} of app.asar has no entry in THIRD-PARTY-NOTICES.txt`);
    }
    for (const file of files.filter((candidate) => /\.(ttf|otf|woff2?|eot)$/i.test(candidate))) {
      if (!notices.includes(file.slice(file.lastIndexOf('/') + 1))) problems.push(`font ${file} of app.asar has no entry in THIRD-PARTY-NOTICES.txt`);
    }
  }
  // The Linux desktop identity (REL-011): electron-builder writes the name of the desktop entry into the manifest it packs,
  // and the entry has to name the executable that the package holds, or the launcher and the taskbar do not match them.
  // A Linux unpacked package is the one with Electron's chrome-sandbox beside the resources.
  const unpacked = dirname(resources);
  if (existsSync(join(unpacked, 'chrome-sandbox'))) {
    const manifest = JSON.parse(Buffer.from(readAsarFile(asar, 'package.json')).toString('utf8')) as { desktopName?: unknown };
    const desktopName = typeof manifest.desktopName === 'string' ? manifest.desktopName.replace(/\.desktop$/, '') : '';
    if (desktopName === '') problems.push('the package.json of app.asar has no desktopName: the desktop entry names no executable');
    else if (!existsSync(join(unpacked, desktopName)) || !statSync(join(unpacked, desktopName)).isFile()) problems.push(`desktopName ${desktopName} of app.asar is not the executable of the unpacked package`);
  }
  // Electron's own notices come with its distribution, beside the executable. Where a macOS bundle keeps them is not
  // something this check has been run against (it has only been run on Linux), so a bundle is not asked for them.
  const inMacBundle = /\.app[\\/]Contents[\\/]Resources$/.test(resources);
  const electronNotices = inMacBundle || [resources, dirname(resources)].some((folder) => existsSync(join(folder, 'LICENSES.chromium.html')));
  if (!electronNotices) problems.push('LICENSES.chromium.html of Electron is not shipped with the application');
  return problems;
}

function main(argv: string[]): number {
  const packageRoot = resolve(import.meta.dir, '..');
  const repoRoot = resolve(packageRoot, '..', '..');
  const flag = argv.indexOf('--dist');
  const dist = resolve(flag >= 0 ? argv[flag + 1] ?? '' : process.env.ZPLC_PACKAGED_DIST ?? join(packageRoot, 'dist-electron'));
  const resources = discoverUnpackedResources(dist);
  if (resources.length === 0) {
    console.error(`Packaged content check: no unpacked application found under ${dist}`);
    return 1;
  }
  let failed = 0;
  for (const folder of resources) {
    const problems = checkPackagedContent({ resources: folder, repoRoot });
    for (const problem of problems) console.error(`Packaged content check (${folder}): ${problem}`);
    failed += problems.length;
  }
  if (failed === 0) console.log(`Packaged content check passed for ${resources.length} unpacked application(s): example projects, lessons, bytecode examples and licence notices are in the package.`);
  return failed === 0 ? 0 : 1;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
