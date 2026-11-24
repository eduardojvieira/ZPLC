// A small PNG reader and writer for the plant textures (VIS-019), on node:zlib alone: no image library is a dependency
// of the repository, and CI has none of the system tools. It reads 8-bit, non-interlaced grey, grey+alpha, RGB and RGBA
// images and writes grey, RGB and RGBA. The writer is deterministic: the same pixels give the same bytes with the same zlib.
import { crc32, deflateSync, inflateSync } from 'node:zlib';

export interface Image {
  width: number;
  height: number;
  /** 1 grey, 2 grey and alpha, 3 RGB, 4 RGBA. */
  channels: number;
  /** Row-major samples, `channels` per pixel. */
  data: Uint8Array;
}

export const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const CHANNELS_OF_TYPE: Record<number, number> = { 0: 1, 4: 2, 2: 3, 6: 4 };
const TYPE_OF_CHANNELS: Record<number, number> = { 1: 0, 2: 4, 3: 2, 4: 6 };

export const isPng = (bytes: Uint8Array): boolean => PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);

/** The width and height that the IHDR chunk declares, without decoding the pixels. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (!isPng(bytes)) throw new Error('not a PNG file (no PNG signature)');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** The predictor of a PNG filter type from the left (a), upper (b) and upper-left (c) samples; -1 for an unknown filter. */
function predict(filter: number, a: number, b: number, c: number): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return a;
    case 2:
      return b;
    case 3:
      return (a + b) >> 1;
    case 4:
      return paeth(a, b, c);
    default:
      return -1;
  }
}

export function decodePng(bytes: Uint8Array): Image {
  if (!isPng(bytes)) throw new Error('not a PNG file (no PNG signature)');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      channels = CHANNELS_OF_TYPE[colour] ?? 0;
      if (depth !== 8 || channels === 0 || interlace !== 0) {
        throw new Error(`unsupported PNG: bit depth ${depth}, colour type ${colour}, interlace ${interlace}`);
      }
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (channels === 0) throw new Error('PNG without an IHDR chunk');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length !== height * (stride + 1)) throw new Error('PNG image data has the wrong length');
  const data = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= channels ? data[row + i - channels] : 0;
      const b = y > 0 ? data[row - stride + i] : 0;
      const c = i >= channels && y > 0 ? data[row - stride + i - channels] : 0;
      const predictor = predict(filter, a, b, c);
      if (predictor < 0) throw new Error(`PNG row ${y} has an unknown filter ${filter}`);
      data[row + i] = (x + predictor) & 0xff;
    }
  }
  return { width, height, channels, data };
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** Each row takes the filter with the smallest sum of absolute residuals (the heuristic of the PNG specification). */
export function encodePng(image: Image): Uint8Array {
  const { width, height, channels, data } = image;
  const colour = TYPE_OF_CHANNELS[channels];
  if (colour === undefined || data.length !== width * height * channels) throw new Error('bad image for the PNG writer');
  const stride = width * channels;
  const raw = new Uint8Array(height * (stride + 1));
  const candidate = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    let best = Number.POSITIVE_INFINITY;
    for (let filter = 0; filter < 5; filter++) {
      let cost = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? data[row + i - channels] : 0;
        const b = y > 0 ? data[row - stride + i] : 0;
        const c = i >= channels && y > 0 ? data[row - stride + i - channels] : 0;
        const residual = (data[row + i] - predict(filter, a, b, c)) & 0xff;
        candidate[i] = residual;
        cost += residual < 128 ? residual : 256 - residual;
      }
      if (cost < best) {
        best = cost;
        raw[y * (stride + 1)] = filter;
        raw.set(candidate, y * (stride + 1) + 1);
      }
    }
  }
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header.set([8, colour, 0, 0, 0], 8);
  const parts = [PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())];
  return Buffer.concat(parts);
}
