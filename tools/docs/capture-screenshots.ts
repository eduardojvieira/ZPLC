// The screenshots of the documentation (DOC-013): real pictures of the application, captured by automation from the
// version in this checkout, and a manifest that says which commit they come from.
//
//   bun run docs:screenshots            run the tutorial journey in the real application and write docs/static/img/tutorials
//                                       and docs/static/img/manifest.json (needs a display, the built runtime and the built
//                                       application, as `bun run test:journeys` does)
//   bun run docs:screenshots -- --editors
//                                       headless Chromium against the Vite renderer (no display, no Electron): one picture of each language
//                                       editor in English and in Spanish, for the language reference pages (DOC-006), into
//                                       docs/static/img/editors; the manifest keeps the tutorial pictures and records the commit of these
//   bun tools/docs/capture-screenshots.ts --check
//                                       exit 1 when a page shows an image that the manifest does not list, a listed image is
//                                       missing or changed, or a picture of the folder is not in the manifest
//
// The pictures are taken by the journey `56 Blink without hardware (the tutorial)` of
// packages/zplc-ide/scripts/journeys.ts, at the steps of docs/docs/tutorials/blink-without-hardware.md, so a page cannot
// show a screen that its steps do not reach. No other image of the product is published: a page that refers to an image
// outside the manifest fails the check, whatever the image is.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { markdownFiles } from './check_doc_claims';

const ROOT = new URL('../../', import.meta.url).pathname;
export const IMAGE_DIR = 'docs/static/img';
export const PICTURE_DIR = `${IMAGE_DIR}/tutorials`;
/** The editor pictures of the language reference (DOC-006): `<language>-<locale>.png`, taken by packages/zplc-ide/scripts/capture-editor-shots.ts. */
export const EDITOR_DIR = `${IMAGE_DIR}/editors`;
export const EDITOR_LANGUAGES = ['st', 'il', 'ld', 'fbd', 'sfc'] as const;
export const EDITOR_LOCALES = ['en', 'es'] as const;
export const EDITOR_COMMAND = 'bun run docs:screenshots -- --editors';
export const MANIFEST = `${IMAGE_DIR}/manifest.json`;
/**
 * The wiring diagrams of the hardware lessons (LRN-014): drawings that tools/docs/generate_hardware_pages.ts writes from
 * the lesson data and keeps in step with it, not pictures of the product, so they need no capture and no manifest entry.
 */
export const DIAGRAM_DIR = `${IMAGE_DIR}/wiring`;
/**
 * The recorded screen-reader check (UX-028): pictures that packages/zplc-ide/scripts/screen-reader-capture.ts takes of the
 * application, one dated folder per run, each with a results.json that lists its pictures with their hash and size. They are
 * captured by automation like the tutorial pictures, with their own record instead of the manifest of the tutorial.
 */
export const RECORDED_DIR = `${IMAGE_DIR}/screen-reader-check`;
/** A picture of a recorded run, as its results.json lists it, with the path below the repository. */
export interface RecordedImage { path: string; sha256: string; width: number; height: number }
const PAGE_DIRS = ['docs/docs', 'docs/i18n/es/docusaurus-plugin-content-docs/current'];

/** The pictures the journey takes, in the order of the steps. The journey and this list are checked against each other by a capture. */
export const PICTURES = [
  { file: 'blink-1-welcome.png', step: 'The Welcome screen with the example list' },
  { file: 'blink-2-program.png', step: 'The program open in the editor' },
  { file: 'blink-3-built.png', step: 'The build succeeded' },
  { file: 'blink-4-output-true.png', step: 'The simulator runs and the output is TRUE' },
  { file: 'blink-5-output-false.png', step: 'The output is FALSE half a second later' },
  { file: 'blink-6-scenario.png', step: 'The scenario test passed' },
] as const;
export const JOURNEY = '56 Blink without hardware (the tutorial)';

export interface ManifestImage { file: string; step: string; sha256: string; bytes: number; width: number; height: number; /** The commit of an image that was not captured with the rest (the editor pictures). */ commit?: string }
export interface Manifest {
  schemaVersion: 1;
  command: string;
  journey: string;
  /** The commit the application was built from. */
  commit: string;
  /** False when tracked files differed from the commit while the pictures were taken. */
  worktreeClean: boolean;
  productVersion: string;
  images: ManifestImage[];
}

/** Width and height of a PNG, from its IHDR chunk. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) throw new Error('not a PNG file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** The images that a page of the site shows, as written: `![alt](path)` outside code. */
export function imagesOf(text: string): string[] {
  const found: string[] = [];
  let fence = '';
  for (const line of text.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) { if (marker && marker[1]![0] === fence[0]) fence = ''; continue; }
    if (marker) { fence = marker[1]!; continue; }
    for (const match of line.replace(/`[^`]*`/g, ' ').matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) found.push(match[1]!);
  }
  return found;
}

/** The path of a page image below `docs/static`, or undefined when it is not a path of the site's static folder. */
export function staticPathOf(reference: string): string | undefined {
  return reference.startsWith('/img/') ? `docs/static${reference}` : undefined;
}

export interface Problem { where: string; message: string }

export function checkManifest(manifest: Manifest, pages: Array<{ page: string; text: string }>, readImage: (path: string) => Uint8Array | undefined, listed: string[], recorded: RecordedImage[] = []): Problem[] {
  const problems: Problem[] = [];
  const recordedByPath = new Map(recorded.map((image) => [image.path, image]));
  if (manifest.schemaVersion !== 1) problems.push({ where: MANIFEST, message: 'schemaVersion must be 1' });
  if (!/^[0-9a-f]{40}$/.test(manifest.commit)) problems.push({ where: MANIFEST, message: 'commit must be the 40 hexadecimal digits of the commit the application was built from' });
  const known = new Map(manifest.images.map((image) => [`${IMAGE_DIR}/${image.file}`, image]));
  for (const [path, image] of known) {
    const bytes = readImage(path);
    if (!bytes) { problems.push({ where: MANIFEST, message: `${image.file} is listed and is not in ${IMAGE_DIR}` }); continue; }
    if (sha256(bytes) !== image.sha256) problems.push({ where: path, message: 'the picture differs from the one the manifest recorded: capture it again with `bun run docs:screenshots`' });
    try {
      const size = pngSize(bytes);
      if (size.width !== image.width || size.height !== image.height) problems.push({ where: path, message: `the picture is ${size.width}x${size.height}, the manifest says ${image.width}x${image.height}` });
    } catch { problems.push({ where: path, message: 'is not a PNG file' }); }
  }
  for (const image of recorded) {
    const bytes = readImage(image.path);
    if (!bytes) { problems.push({ where: image.path, message: 'is listed by a results.json and is not in the folder' }); continue; }
    if (sha256(bytes) !== image.sha256) problems.push({ where: image.path, message: 'differs from the picture its results.json recorded: run the capture again' });
    try {
      const size = pngSize(bytes);
      if (size.width !== image.width || size.height !== image.height) problems.push({ where: image.path, message: `is ${size.width}x${size.height}, its results.json says ${image.width}x${image.height}` });
    } catch { problems.push({ where: image.path, message: 'is not a PNG file' }); }
  }
  for (const path of listed) if (path.startsWith(`${RECORDED_DIR}/`) && path.endsWith('.png') && !recordedByPath.has(path)) problems.push({ where: path, message: 'is a picture that no results.json of the recorded check lists: a published image is a captured one' });
  for (const path of listed) if ((path.startsWith(`${PICTURE_DIR}/`) || path.startsWith(`${EDITOR_DIR}/`)) && !known.has(path)) problems.push({ where: path, message: 'is a picture that the manifest does not list: a published image is a captured one' });
  for (const { page, text } of pages) {
    for (const reference of imagesOf(text)) {
      const path = staticPathOf(reference);
      if (path === undefined) { problems.push({ where: page, message: `shows ${reference}, which is not an image of ${IMAGE_DIR}: product images are captured by automation and listed in ${MANIFEST}` }); continue; }
      if (path.startsWith(`${RECORDED_DIR}/`)) {
        if (!recordedByPath.has(path)) problems.push({ where: page, message: `shows ${reference}, which no results.json of ${RECORDED_DIR} lists` });
        continue;
      }
      if (path.startsWith(`${DIAGRAM_DIR}/`)) {
        if (!readImage(path)) problems.push({ where: page, message: `shows ${reference}, a wiring diagram that is not in ${DIAGRAM_DIR}: run bun tools/docs/generate_hardware_pages.ts` });
        continue;
      }
      if (!known.has(path)) problems.push({ where: page, message: `shows ${reference}, which the manifest does not list` });
    }
  }
  return problems;
}

function git(args: string[]): string {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function capture(): void {
  const scratch = mkdtempSync(join(tmpdir(), 'zplc-docs-shots-'));
  try {
    const run = spawnSync('bun', ['run', 'scripts/run-journeys.ts'], {
      cwd: join(ROOT, 'packages/zplc-ide'),
      env: { ...process.env, ZPLC_JOURNEY_ONLY: JOURNEY, ZPLC_DOC_SHOTS: scratch },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    if (run.status !== 0 || !/^PASS\s+41 Blink/m.test(run.stdout)) {
      process.stderr.write(`${run.stdout}\n${run.stderr}\n`);
      throw new Error(`the journey "${JOURNEY}" did not pass, so no picture is written`);
    }
    const taken = readdirSync(scratch).filter((name) => name.endsWith('.png')).sort();
    const wanted = PICTURES.map((picture) => picture.file).sort();
    if (taken.join() !== wanted.join()) throw new Error(`the journey took ${taken.join(', ') || 'no picture'}; this script expects ${wanted.join(', ')}`);
    mkdirSync(join(ROOT, PICTURE_DIR), { recursive: true });
    const images: ManifestImage[] = PICTURES.map(({ file, step }) => {
      copyFileSync(join(scratch, file), join(ROOT, PICTURE_DIR, file));
      const bytes = readFileSync(join(ROOT, PICTURE_DIR, file));
      return { file: `tutorials/${file}`, step, sha256: sha256(bytes), bytes: bytes.length, ...pngSize(bytes) };
    });
    const dirty = git(['status', '--porcelain', '--untracked-files=no', '--', ':!docs/static/img']).length > 0;
    const manifest: Manifest = {
      schemaVersion: 1,
      command: 'bun run docs:screenshots',
      journey: JOURNEY,
      commit: git(['rev-parse', 'HEAD']),
      worktreeClean: !dirty,
      productVersion: (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version,
      images,
    };
    writeFileSync(join(ROOT, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`docs-screenshots: ${images.length} pictures of ${manifest.commit.slice(0, 8)}${dirty ? ' (tracked files differed from it)' : ''} written to ${PICTURE_DIR}`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

/** The editor pictures: the helper of the IDE package takes them, this script hashes them into the manifest. */
function captureEditors(): void {
  const cache = process.env.TMPDIR ?? join(process.env.HOME ?? ROOT, '.cache', 'zplc-doc-shots');
  mkdirSync(cache, { recursive: true });
  const scratch = mkdtempSync(join(cache, 'docs-editor-shots-'));
  try {
    const run = spawnSync('bun', ['run', 'scripts/capture-editor-shots.ts', scratch], {
      cwd: join(ROOT, 'packages/zplc-ide'), env: { ...process.env, TMPDIR: cache }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
    });
    if (run.status !== 0) { process.stderr.write(`${run.stdout}\n${run.stderr}\n`); throw new Error('the editor capture failed, so no picture is written'); }
    const wanted = EDITOR_LANGUAGES.flatMap((language) => EDITOR_LOCALES.map((locale) => ({ language, locale, file: `${language}-${locale}.png` })));
    const taken = readdirSync(scratch).filter((name) => name.endsWith('.png')).sort();
    if (taken.join() !== wanted.map(({ file }) => file).sort().join()) throw new Error(`the capture took ${taken.join(', ') || 'no picture'}; this script expects ${wanted.map(({ file }) => file).join(', ')}`);
    mkdirSync(join(ROOT, EDITOR_DIR), { recursive: true });
    const commit = git(['rev-parse', 'HEAD']);
    const images: ManifestImage[] = wanted.map(({ language, locale, file }) => {
      copyFileSync(join(scratch, file), join(ROOT, EDITOR_DIR, file));
      const bytes = readFileSync(join(ROOT, EDITOR_DIR, file));
      return { file: `editors/${file}`, step: `The ${language.toUpperCase()} editor with the Blinky example, interface in ${locale === 'en' ? 'English' : 'Spanish'}`, sha256: sha256(bytes), bytes: bytes.length, ...pngSize(bytes), commit };
    });
    const manifest = JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8')) as Manifest;
    manifest.images = [...manifest.images.filter((image) => !image.file.startsWith('editors/')), ...images];
    writeFileSync(join(ROOT, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`docs-screenshots: ${images.length} editor pictures of ${commit.slice(0, 8)} written to ${EDITOR_DIR}`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

/** The pictures that the dated folders of the recorded screen-reader check list in their results.json. */
function recordedImages(): { folders: string[]; images: RecordedImage[] } {
  const base = join(ROOT, RECORDED_DIR);
  if (!existsSync(base)) return { folders: [], images: [] };
  const folders: string[] = []; const images: RecordedImage[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folder = `${RECORDED_DIR}/${entry.name}`;
    folders.push(folder);
    const file = join(ROOT, folder, 'results.json');
    if (!existsSync(file)) continue;
    const listedImages = (JSON.parse(readFileSync(file, 'utf8')) as { images?: Array<{ file: string; sha256: string; width: number; height: number }> }).images ?? [];
    for (const image of listedImages) images.push({ path: `${folder}/${image.file}`, sha256: image.sha256, width: image.width, height: image.height });
  }
  return { folders, images };
}

function check(): number {
  // With no manifest nothing is published: no page may show an image and no picture may be in the folder.
  const manifest: Manifest = existsSync(join(ROOT, MANIFEST))
    ? JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8')) as Manifest
    : { schemaVersion: 1, command: '', journey: '', commit: '', worktreeClean: true, productVersion: '', images: [] };
  const hasManifest = manifest.commit !== '';
  const pages = PAGE_DIRS.flatMap((directory) => markdownFiles(ROOT, directory)).map((page) => ({ page, text: readFileSync(join(ROOT, page), 'utf8') }));
  const listed = [PICTURE_DIR, EDITOR_DIR].flatMap((directory) => (existsSync(join(ROOT, directory)) ? readdirSync(join(ROOT, directory)).map((name) => `${directory}/${name}`) : []));
  const recorded = recordedImages();
  const recordedFiles = recorded.folders.flatMap((folder) => readdirSync(join(ROOT, folder)).map((name) => `${folder}/${name}`));
  const problems = checkManifest(manifest, pages, (path) => (existsSync(join(ROOT, path)) ? new Uint8Array(readFileSync(join(ROOT, path))) : undefined), [...listed, ...recordedFiles], recorded.images)
    .filter((problem) => hasManifest || !problem.message.includes('commit must be'));
  if (hasManifest && git(['rev-parse', '--is-shallow-repository']) === 'false') {
    const known = spawnSync('git', ['cat-file', '-e', `${manifest.commit}^{commit}`], { cwd: ROOT });
    if (known.status !== 0) problems.push({ where: MANIFEST, message: `commit ${manifest.commit} is not in the history of this repository` });
    for (const image of manifest.images) {
      if (image.commit && spawnSync('git', ['cat-file', '-e', `${image.commit}^{commit}`], { cwd: ROOT }).status !== 0) problems.push({ where: MANIFEST, message: `${image.file} was captured from commit ${image.commit}, which is not in the history of this repository` });
    }
  }
  for (const problem of problems) console.error(`docs-screenshots: ${problem.where}: ${problem.message}`);
  if (problems.length === 0) {
    console.log(hasManifest
      ? `docs-screenshots: ${manifest.images.length} pictures, all captured from ${manifest.commit.slice(0, 8)}; every image of a page is listed`
      : 'docs-screenshots: no picture is published and no page shows an image');
  }
  return problems.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  if (process.argv.includes('--check')) process.exit(check());
  if (process.argv.includes('--editors')) captureEditors(); else capture();
}
