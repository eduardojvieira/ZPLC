// Makes every raster of the brand from the one vector mark (DOC-017):
//
//   bun tools/ci/brand/generate-icons.ts [--check]
//
// tools/brand/mark.svg is the single source. The site favicon and logo, the 1200 by 630 social card, the application icon
// of the installers (png and icns) come from it, and tools/brand/outputs.json records the checksum of the mark and of each
// output. The raster steps use rsvg-convert (librsvg) and Python with Pillow, which are not repository dependencies: they are
// needed only to regenerate, and `--check` (and the test) need neither, because they read the recorded checksums.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
export const MARK = 'tools/brand/mark.svg';
export const MANIFEST = 'tools/brand/outputs.json';

export interface Output { path: string; kind: 'svg' | 'png' | 'icns'; width?: number; height?: number }

/** What is made, where, and how large: the paths are the ones the site, electron-builder and the renderer name. */
export const OUTPUTS: Output[] = [
  { path: 'docs/static/img/logo.svg', kind: 'svg' },
  { path: 'docs/static/img/favicon.png', kind: 'png', width: 256, height: 256 },
  { path: 'docs/static/img/social-card.png', kind: 'png', width: 1200, height: 630 },
  { path: 'packages/zplc-ide/build/icon.png', kind: 'png', width: 1024, height: 1024 },
  { path: 'packages/zplc-ide/build/icon.icns', kind: 'icns' },
];

const sha256 = (path: string) => createHash('sha256').update(readFileSync(join(ROOT, path))).digest('hex');

/** The width and height that the header of a PNG states. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(12) !== 0x49484452) throw new Error('not a PNG');
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** The social card: the mark on the canvas of the dark theme, with the rails of the ladder running off both edges. */
function socialCardSvg(mark: string): string {
  const image = `data:image/svg+xml;base64,${Buffer.from(mark).toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#141e23"/>
  <g stroke="#34464d" stroke-width="12"><path d="M0 315H330M870 315H1200"/></g>
  <g stroke="#34464d" stroke-width="12"><path d="M96 0V630M1104 0V630"/></g>
  <image href="${image}" x="345" y="75" width="510" height="510"/>
</svg>`;
}

function run(command: string[]): void {
  const result = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(`${command.join(' ')} failed: ${result.stderr.toString().trim()}`);
}

function generate(): void {
  const work = mkdtempSync(join(tmpdir(), 'zplc-brand-'));
  try {
    const mark = readFileSync(join(ROOT, MARK), 'utf8');
    const png = (source: string, output: Output) => run(['rsvg-convert', '-w', String(output.width), '-h', String(output.height), source, '-o', join(ROOT, output.path)]);
    for (const output of OUTPUTS) {
      if (output.kind === 'svg') copyFileSync(join(ROOT, MARK), join(ROOT, output.path));
      else if (output.path.endsWith('social-card.png')) {
        writeFileSync(join(work, 'card.svg'), socialCardSvg(mark));
        png(join(work, 'card.svg'), output);
      } else if (output.kind === 'png') png(join(ROOT, MARK), output);
      else run(['python3', '-B', '-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2])', join(ROOT, 'packages/zplc-ide/build/icon.png'), join(ROOT, output.path)]);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const manifest = { markSha256: sha256(MARK), outputs: OUTPUTS.map((output) => ({ ...output, sha256: sha256(output.path) })) };
  writeFileSync(join(ROOT, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** What is stale: the mark changed after the outputs were made, or an output is not the file that was recorded. */
export function staleOutputs(): string[] {
  const manifest = JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8')) as { markSha256: string; outputs: Array<Output & { sha256: string }> };
  const problems: string[] = [];
  if (manifest.markSha256 !== sha256(MARK)) problems.push(`${MARK} changed after the outputs were made: run bun tools/ci/brand/generate-icons.ts`);
  for (const output of OUTPUTS) {
    const recorded = manifest.outputs.find((candidate) => candidate.path === output.path);
    if (!existsSync(join(ROOT, output.path))) problems.push(`${output.path} is missing`);
    else if (recorded?.sha256 !== sha256(output.path)) problems.push(`${output.path} is not the file that was generated from the mark`);
  }
  return problems;
}

if (import.meta.main) {
  if (process.argv.includes('--check')) {
    const problems = staleOutputs();
    if (problems.length > 0) { console.error(problems.map((problem) => `brand: ${problem}`).join('\n')); process.exit(1); }
    console.log('brand: every icon and the social card come from the current mark');
  } else {
    generate();
    console.log(`brand: wrote ${OUTPUTS.length} files from ${MARK}`);
  }
}
