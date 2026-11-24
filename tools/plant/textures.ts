// The textures of the 3D plant (VIS-019): how a generated image becomes a seamless base colour, and how its normal,
// roughness and metalness maps are derived from it. The derivation is deterministic (float arithmetic limited to +, -,
// *, / and sqrt, which IEEE 754 rounds exactly, and a numeric sort), so the CI guard (tools/ci/plant-asset-guard.ts)
// derives every map again and compares the pixels.
//
//   bun tools/plant/textures.ts prepare <material> <source.png>   write <material>/basecolor.png from a generated image
//   bun tools/plant/textures.ts derive                             write the normal, roughness and metalness maps again
//
// `prepare` reads an 8-bit PNG; the image generator writes JPEG, which is converted once with a system tool, and the
// material's provenance.json records that step. `derive` rewrites a map only when its pixels change, so a second run
// leaves the tree as it is even under another zlib.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { decodePng, encodePng, type Image } from './png';

export const TEXTURE_ROOT = resolve(import.meta.dir, '../../packages/zplc-ide/src/plant/assets/textures');
/** Side of a bundled map in pixels: six materials stay under about 6 MB together (VIS-013 installer budget). */
export const BUNDLED_SIZE = 512;
export const DERIVED_MAPS = ['normal.png', 'roughness.png', 'metalness.png'] as const;
export type DerivedMap = (typeof DERIVED_MAPS)[number];

export interface Material {
  /** A grey base colour that the renderer tints, because the light, dark and high-contrast modes change colours. */
  tinted: boolean;
  /** Box-blur radius (pixels) of the height field before its slopes are taken, and the gain of those slopes. */
  heightBlur: number;
  normalStrength: number;
  /** Roughness at the darkest and at the brightest detail of the base colour. */
  roughness: readonly [dark: number, bright: number];
  /** A uniform metalness, or 'mask': metal where the base colour is bright, dielectric grime where it is dark. */
  metalness: number | 'mask';
}

// Painted steel, brushed metal, plastic and the epoxy floor are smooth, satin surfaces (the owner's review of the pilot, 2026-11-24): a
// faint relief blurred over a few pixels; the parts' roughness is a narrow band near 1 that the renderer's own roughness scales.
export const MATERIALS: Readonly<Record<string, Material>> = {
  'painted-steel': { tinted: true, heightBlur: 4, normalStrength: 0.08, roughness: [0.95, 0.88], metalness: 0 },
  'brushed-metal': { tinted: false, heightBlur: 0, normalStrength: 0.06, roughness: [0.9, 0.7], metalness: 'mask' },
  'rubber-belt': { tinted: false, heightBlur: 2, normalStrength: 0.6, roughness: [0.95, 0.8], metalness: 0 },
  plastic: { tinted: true, heightBlur: 3, normalStrength: 0.08, roughness: [0.95, 0.88], metalness: 0 },
  cardboard: { tinted: false, heightBlur: 1, normalStrength: 0.6, roughness: [0.95, 0.85], metalness: 0 },
  floor: { tinted: false, heightBlur: 3, normalStrength: 0.06, roughness: [0.75, 0.55], metalness: 0 },
};

/** A float image, 0 to 1, row-major, `channels` per pixel. */
interface Field {
  width: number;
  height: number;
  channels: number;
  data: Float64Array;
}

const toField = ({ width, height, channels, data }: Image): Field => {
  const keep = channels === 2 || channels === 4 ? channels - 1 : channels; // drop alpha
  const out = new Float64Array(width * height * keep);
  for (let p = 0; p < width * height; p++) for (let c = 0; c < keep; c++) out[p * keep + c] = data[p * channels + c] / 255;
  return { width, height, channels: keep, data: out };
};

const toImage = ({ width, height, channels, data }: Field): Image => {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = Math.min(255, Math.max(0, Math.round(data[i] * 255)));
  return { width, height, channels, data: out };
};

/** Rec. 709 luminance of each pixel. */
const luminance = (field: Field): Field => {
  const { width, height, channels, data } = field;
  if (channels === 1) return field;
  const out = new Float64Array(width * height);
  for (let p = 0; p < out.length; p++) out[p] = 0.2126 * data[p * 3] + 0.7152 * data[p * 3 + 1] + 0.0722 * data[p * 3 + 2];
  return { width, height, channels: 1, data: out };
};

/** Swaps the axes, so that one routine works on columns and rows alike. */
const transpose = ({ width, height, channels, data }: Field): Field => {
  const out = new Float64Array(data.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < channels; c++) out[(x * height + y) * channels + c] = data[(y * width + x) * channels + c];
  return { width: height, height: width, channels, data: out };
};

const channelMeans = ({ channels, data }: Field): number[] => {
  const sums = new Array<number>(channels).fill(0);
  for (let i = 0; i < data.length; i++) sums[i % channels] += data[i];
  return sums.map((sum) => (sum * channels) / data.length);
};

/**
 * Makes the left and right edges continuous: the last `overlap` columns are cross-faded into the first ones and then
 * dropped, so the wrap-around neighbour of the last column is its original neighbour. The fade keeps the mean and the
 * variance of uncorrelated detail (weights sqrt(1 - t) and sqrt(t) around the mean), so the band does not go soft.
 */
const crossfadeColumns = (field: Field, overlap: number): Field => {
  const { width, height, channels, data } = field;
  const kept = width - overlap;
  const means = channelMeans(field);
  const out = new Float64Array(kept * height * channels);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < kept; x++)
      for (let c = 0; c < channels; c++) {
        const own = data[(y * width + x) * channels + c];
        if (x >= overlap) {
          out[(y * kept + x) * channels + c] = own;
          continue;
        }
        const t = (x + 0.5) / overlap;
        const wrapped = data[(y * width + x + kept) * channels + c];
        out[(y * kept + x) * channels + c] = means[c] + Math.sqrt(1 - t) * (wrapped - means[c]) + Math.sqrt(t) * (own - means[c]);
      }
  return { width: kept, height, channels, data: out };
};

/** Box blur along the rows, wrapping around the edges (the textures tile). */
const blurRows = ({ width, height, channels, data }: Field, radius: number): Field => {
  const out = new Float64Array(data.length);
  const span = 2 * radius + 1;
  for (let y = 0; y < height; y++)
    for (let c = 0; c < channels; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += data[(y * width + ((k + width) % width)) * channels + c];
      for (let x = 0; x < width; x++) {
        out[(y * width + x) * channels + c] = sum / span;
        sum += data[(y * width + ((x + radius + 1) % width)) * channels + c];
        sum -= data[(y * width + ((x - radius + width) % width)) * channels + c];
      }
    }
  return { width, height, channels, data: out };
};

const blur = (field: Field, radius: number): Field =>
  radius === 0 ? field : transpose(blurRows(transpose(blurRows(field, radius)), radius));

/** Removes the broad light and shade of the generated image, which repeats visibly once the texture tiles. */
const flatten = (field: Field): Field => {
  const broad = blur(field, Math.floor(Math.min(field.width, field.height) / 8));
  const means = channelMeans(field);
  const out = field.data.map((value, i) => value - broad.data[i] + means[i % field.channels]);
  return { ...field, data: out };
};

/** Area-average resampling of the rows to `size` columns: each output pixel is the mean of the source span it covers. */
const resampleRows = ({ width, height, channels, data }: Field, size: number): Field => {
  const scale = width / size;
  const out = new Float64Array(size * height * channels);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < size; x++) {
      const start = x * scale;
      const end = start + scale;
      for (let c = 0; c < channels; c++) {
        let sum = 0;
        for (let j = Math.floor(start); j < end; j++)
          sum += (Math.min(end, j + 1) - Math.max(start, j)) * data[(y * width + j) * channels + c];
        out[(y * size + x) * channels + c] = sum / scale;
      }
    }
  return { width: size, height, channels, data: out };
};

/** A generated image becomes a seamless, flattened base colour of BUNDLED_SIZE pixels; a tinted one becomes grey. */
export function prepareBaseColour(material: Material, source: Image): Image {
  let field = toField(source);
  const overlap = Math.floor(Math.min(field.width, field.height) / 8);
  field = transpose(crossfadeColumns(transpose(crossfadeColumns(field, overlap)), overlap));
  field = flatten(field);
  field = transpose(resampleRows(transpose(resampleRows(field, BUNDLED_SIZE)), BUNDLED_SIZE));
  if (material.tinted) {
    // Grey with a light mean, so that the tint the renderer multiplies in is close to the colour it asks for.
    const grey = luminance(field);
    const shift = 224 / 255 - channelMeans(grey)[0];
    field = { ...grey, data: grey.data.map((value) => value + shift) };
  }
  return toImage(field);
}

/** The value below which `fraction` of the samples lie (nearest rank). */
const quantile = (data: Float64Array, fraction: number): number => {
  const sorted = Float64Array.from(data).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
};

/**
 * The normal map (OpenGL convention, green up, as three.js reads it) of the base colour's luminance taken as height,
 * from 3x3 Sobel slopes that wrap around the edges; the roughness map from the same luminance between the material's
 * dark and bright roughness; the metalness map as a mask or, for a uniform value, a 4x4 image.
 */
export function deriveMaps(material: Material, base: Image): Record<DerivedMap, Image> {
  const lum = luminance(toField(base));
  const { width, height } = lum;
  // The luminance spread between its 1st and 99th percentile, so that a gain means the same on a faint and a bold image.
  const low = quantile(lum.data, 0.01);
  const high = quantile(lum.data, 0.99);
  const spread = lum.data.map((value) => (high > low ? Math.min(1, Math.max(0, (value - low) / (high - low))) : 0.5));
  const h = blur({ ...lum, data: spread }, material.heightBlur).data;
  const at = (x: number, y: number): number => h[((y + height) % height) * width + ((x + width) % width)];
  const normal = new Float64Array(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const dy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const nx = -dx * material.normalStrength;
      const ny = dy * material.normalStrength; // image rows run down, the texture's v runs up
      const length = Math.sqrt(nx * nx + ny * ny + 1);
      const p = (y * width + x) * 3;
      normal[p] = 0.5 + (0.5 * nx) / length;
      normal[p + 1] = 0.5 + (0.5 * ny) / length;
      normal[p + 2] = 0.5 + 0.5 / length;
    }

  const [dark, bright] = material.roughness;
  const roughness = spread.map((t) => dark + (bright - dark) * t);

  let metalness: Field;
  if (material.metalness === 'mask') {
    const grime = quantile(lum.data, 0.5) / 2;
    metalness = { width, height, channels: 1, data: lum.data.map((value) => (value >= grime ? 1 : 0)) };
  } else metalness = { width: 4, height: 4, channels: 1, data: new Float64Array(16).fill(material.metalness) };

  return {
    'normal.png': toImage({ width, height, channels: 3, data: normal }),
    'roughness.png': toImage({ width, height, channels: 1, data: roughness }),
    'metalness.png': toImage(metalness),
  };
}

export const samePixels = (a: Image, b: Image): boolean =>
  a.width === b.width && a.height === b.height && a.channels === b.channels && a.data.every((value, i) => value === b.data[i]);

/** Writes the image unless the file already holds the same pixels; true when it wrote. */
function writeIfChanged(path: string, image: Image): boolean {
  if (existsSync(path) && samePixels(decodePng(readFileSync(path)), image)) return false;
  writeFileSync(path, encodePng(image));
  return true;
}

function materialOf(name: string | undefined): Material {
  const material = name === undefined ? undefined : MATERIALS[name];
  if (!material) throw new Error(`unknown material ${name}; known: ${Object.keys(MATERIALS).join(', ')}`);
  return material;
}

if (import.meta.main) {
  const [command, name, source] = process.argv.slice(2);
  if (command === 'prepare' && source) {
    const path = join(TEXTURE_ROOT, name, 'basecolor.png');
    const wrote = writeIfChanged(path, prepareBaseColour(materialOf(name), decodePng(readFileSync(source))));
    console.log(`${wrote ? 'wrote' : 'unchanged'} ${path}`);
  } else if (command === 'derive') {
    for (const [material, recipe] of Object.entries(MATERIALS)) {
      const maps = deriveMaps(recipe, decodePng(readFileSync(join(TEXTURE_ROOT, material, 'basecolor.png'))));
      for (const file of DERIVED_MAPS) {
        const wrote = writeIfChanged(join(TEXTURE_ROOT, material, file), maps[file]);
        console.log(`${wrote ? 'wrote' : 'unchanged'} ${material}/${file}`);
      }
    }
  } else {
    console.error('usage: bun tools/plant/textures.ts prepare <material> <source.png> | derive');
    process.exit(2);
  }
}
