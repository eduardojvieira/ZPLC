/**
 * The tolerance of two runs on one build (UXV-003), and the tool that applies it:
 *
 *   bun scripts/ux/compare.ts <folder of run A> <folder of run B> [--edge-noise]
 *
 * A picture of run A is the same as the one of run B when every pixel outside the 3D canvases (`canvases` of its record in
 * manifest.json, in picture pixels) is byte-equal, and inside them no channel differs by more than 2 of 255 in more than 0.1 % of
 * the canvas area. The canvases are drawn by software GL, whose rounding can move a pixel by one level; nothing else may move.
 * It prints each picture that breaks the rule, with the counts, and exits 1 when there is one.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import type { Rect } from './measurement';

export interface Png {
  width: number;
  height: number;
  /** RGBA, row after row. */
  data: Uint8Array;
}

/** A non-interlaced 8-bit PNG of colour type 2 or 6, which is what Chromium writes. */
export function decodePng(file: Buffer): Png {
  let width = 0;
  let height = 0;
  let channels = 0;
  const parts: Buffer[] = [];
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at);
    const type = file.toString('ascii', at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0 || (body[9] !== 2 && body[9] !== 6))
        throw new Error('only 8-bit RGB or RGBA PNG without interlace');
      channels = body[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') parts.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? line[i - channels]! : 0;
      const up = previous[i]!;
      const upLeft = i >= channels ? previous[i - channels]! : 0;
      let add = 0;
      if (filter === 1) add = left;
      else if (filter === 2) add = up;
      else if (filter === 3) add = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      line[i] = (line[i]! + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) out[(y * width + x) * 4 + c] = line[x * channels + c]!;
      out[(y * width + x) * 4 + 3] = channels === 4 ? line[x * 4 + 3]! : 255;
    }
    previous = line;
  }
  return { width, height, data: out };
}

export interface PictureDiff {
  sameSize: boolean;
  /** Pixels that differ outside every canvas, and the largest channel difference among them. */
  outside: number;
  outsideMax: number;
  /** The area of the picture, in pixels. */
  area: number;
  /** Pixels that differ inside a canvas, and the largest channel difference among them. */
  inside: number;
  insideMax: number;
  /** The area of the canvases, in pixels. */
  canvasArea: number;
}

export function diffPictures(a: Png, b: Png, canvases: Rect[]): PictureDiff {
  const diff: PictureDiff = {
    sameSize: a.width === b.width && a.height === b.height,
    outside: 0,
    outsideMax: 0,
    area: a.width * a.height,
    inside: 0,
    insideMax: 0,
    canvasArea: 0,
  };
  const box = canvases.map((c) => ({
    // a canvas edge falls between pixels: the pixels it touches count as inside
    x0: Math.floor(c.x),
    y0: Math.floor(c.y),
    x1: Math.ceil(c.x + c.width),
    y1: Math.ceil(c.y + c.height),
  }));
  diff.canvasArea = box.reduce((sum, c) => sum + Math.max(0, c.x1 - c.x0) * Math.max(0, c.y1 - c.y0), 0);
  if (!diff.sameSize) return diff;
  for (let y = 0; y < a.height; y++)
    for (let x = 0; x < a.width; x++) {
      let most = 0;
      for (let c = 0; c < 4; c++) most = Math.max(most, Math.abs(a.data[(y * a.width + x) * 4 + c]! - b.data[(y * a.width + x) * 4 + c]!));
      if (most === 0) continue;
      if (box.some((c) => x >= c.x0 && x < c.x1 && y >= c.y0 && y < c.y1)) {
        diff.inside++;
        diff.insideMax = Math.max(diff.insideMax, most);
      } else {
        diff.outside++;
        diff.outsideMax = Math.max(diff.outsideMax, most);
      }
    }
  return diff;
}

/**
 * Same size, nothing different outside the canvases, and inside them at most 2 levels in at most 0.1 % of their area. With
 * `edgeNoise`, the pixels outside may also differ by up to 2 levels in at most 0.01 % of the picture: the antialiased corners of the
 * same few controls (a search box, a select) move by a level between two launches of Chromium, and nothing in the page moves them.
 */
export const withinRule = (diff: PictureDiff, options: { edgeNoise?: boolean } = {}): boolean =>
  diff.sameSize &&
  (options.edgeNoise ? diff.outsideMax <= 2 && diff.outside <= diff.area * 0.0001 : diff.outside === 0) &&
  diff.insideMax <= 2 &&
  diff.inside <= diff.canvasArea * 0.001;

if (import.meta.main) {
  const [a, b] = Bun.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (!a || !b) throw new Error('usage: bun scripts/ux/compare.ts <folder of run A> <folder of run B>');
  const manifest = JSON.parse(readFileSync(join(a, 'manifest.json'), 'utf8')) as {
    captures: Array<{ file: string; canvases?: Rect[] }>;
  };
  const edgeNoise = Bun.argv.includes('--edge-noise');
  let broken = 0;
  for (const capture of manifest.captures) {
    const other = join(b, capture.file);
    if (!existsSync(other)) {
      console.log(`missing in B: ${capture.file}`);
      broken++;
      continue;
    }
    const diff = diffPictures(decodePng(readFileSync(join(a, capture.file))), decodePng(readFileSync(other)), capture.canvases ?? []);
    if (withinRule(diff, { edgeNoise })) continue;
    broken++;
    console.log(`DIFF ${capture.file}: ${JSON.stringify(diff)}`);
  }
  console.log(`${manifest.captures.length} pictures compared, ${broken} outside the rule`);
  process.exit(broken === 0 ? 0 : 1);
}
