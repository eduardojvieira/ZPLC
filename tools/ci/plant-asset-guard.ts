// The bundled textures of the 3D plant keep their provenance and their properties (VIS-019, VIS-013, P17).
//
//   bun tools/ci/plant-asset-guard.ts
//
// Every material folder under packages/zplc-ide/src/plant/assets/textures has a provenance.json with every field of the
// record (tool, model, prompt, date, post-processing, source size, bundled size, licence) and holds only PNG maps whose
// bytes are PNG (the signature, not the extension), no side over 2048 pixels, edges that tile, and normal, roughness and
// metalness maps that tools/plant/textures.ts derives again to the same pixels. It prints the bytes the textures add to
// an installer, for the VIS-013 budget.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { decodePng, isPng, pngSize, type Image } from '../plant/png';
import { DERIVED_MAPS, deriveMaps, MATERIALS, samePixels, TEXTURE_ROOT } from '../plant/textures';

export const RECORD_FIELDS = ['tool', 'model', 'prompt', 'date', 'postProcessing', 'sourceSize', 'bundledSize', 'licence'] as const;
export const MAX_SIDE = 2048;
/**
 * A seam is the wrap-around pair (the last and the first column, the last and the first row) differing more than the
 * texture's own neighbouring pairs do. The difference of two columns is taken between their means over runs of
 * SEAM_RUN pixels, because a visible seam is a step in light or colour along the edge, and the grain of the pixels hides
 * that step in a per-pixel difference. The score is the difference of the wrap pair over the 99th percentile of the
 * difference of every interior neighbouring pair: a seamless tile's wrap pair is one more neighbour pair, and the
 * bundled maps score at most 0.98; the generator's raw output scores 1.34 to 4.46 on the four edges whose seam shows
 * when it is tiled (measured on 2026-11-23). The limit sits between the two.
 */
export const SEAM_LIMIT = 1.25;
export const SEAM_RUN = 16;

export interface Finding {
  file: string;
  rule: 'record' | 'format' | 'size' | 'seam' | 'derived';
  message: string;
}

/** The mean absolute difference between two columns of an image, compared as means over runs of SEAM_RUN pixels. */
function columnDifference(image: Image, a: number, b: number): number {
  const { width, height, channels, data } = image;
  let sum = 0;
  let runs = 0;
  for (let top = 0; top < height; top += SEAM_RUN) {
    const bottom = Math.min(height, top + SEAM_RUN);
    for (let c = 0; c < channels; c++) {
      let step = 0;
      for (let y = top; y < bottom; y++) step += data[(y * width + a) * channels + c] - data[(y * width + b) * channels + c];
      sum += Math.abs(step / (bottom - top));
      runs++;
    }
  }
  return sum / runs;
}

const transposed = (image: Image): Image => {
  const { width, height, channels, data } = image;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < channels; c++) out[(x * height + y) * channels + c] = data[(y * width + x) * channels + c];
  return { width: height, height: width, channels, data: out };
};

/** The seam score of the left/right edges; transpose the image for the top/bottom edges. */
export function seamScore(image: Image): number {
  const interior = Array.from({ length: image.width - 1 }, (_, x) => columnDifference(image, x, x + 1)).sort((a, b) => a - b);
  const p99 = interior[Math.floor(0.99 * interior.length)] ?? 0;
  const edge = columnDifference(image, image.width - 1, 0);
  // A flat image (a uniform metalness map) has no detail to compare with: below half a level, there is no seam.
  return edge <= 0.5 ? 0 : edge / Math.max(p99, 0.5);
}

function checkRecord(folder: string, base: Image | undefined): Finding[] {
  const file = join(folder, 'provenance.json');
  if (!existsSync(file)) return [{ file, rule: 'record', message: 'the provenance record is missing' }];
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return [{ file, rule: 'record', message: `the provenance record is not JSON: ${(error as Error).message}` }];
  }
  const findings: Finding[] = RECORD_FIELDS.filter((field) => typeof record[field] !== 'string' || record[field] === '').map((field) => ({
    file,
    rule: 'record',
    message: `the provenance record has no ${field}`,
  }));
  if (base && record.bundledSize !== `${base.width}x${base.height}`) {
    findings.push({ file, rule: 'record', message: `bundledSize is ${record.bundledSize}, basecolor.png is ${base.width}x${base.height}` });
  }
  return findings;
}

export function checkTextures(root: string = TEXTURE_ROOT): Finding[] {
  const findings: Finding[] = [];
  for (const name of readdirSync(root).sort()) {
    const folder = join(root, name);
    if (!statSync(folder).isDirectory()) {
      if (!/\.md$/.test(name))
        findings.push({ file: folder, rule: 'record', message: 'a texture outside a material folder has no record' });
      continue;
    }
    const images = new Map<string, Image>();
    for (const file of readdirSync(folder).sort()) {
      if (file === 'provenance.json') continue;
      const path = join(folder, file);
      const bytes = new Uint8Array(readFileSync(path));
      if (!/\.png$/.test(file) || !isPng(bytes)) {
        findings.push({ file: path, rule: 'format', message: 'a bundled map must be a PNG file with the .png extension' });
        continue;
      }
      const { width, height } = pngSize(bytes);
      if (width > MAX_SIDE || height > MAX_SIDE) {
        findings.push({ file: path, rule: 'size', message: `${width}x${height} exceeds ${MAX_SIDE} pixels on a side` });
        continue;
      }
      const image = decodePng(bytes);
      images.set(file, image);
      for (const [edges, score] of [
        ['left/right', seamScore(image)],
        ['top/bottom', seamScore(transposed(image))],
      ] as const) {
        if (score > SEAM_LIMIT) {
          findings.push({
            file: path,
            rule: 'seam',
            message: `the ${edges} edges do not tile (score ${score.toFixed(2)} > ${SEAM_LIMIT})`,
          });
        }
      }
    }
    const base = images.get('basecolor.png');
    findings.push(...checkRecord(folder, base));
    const material = MATERIALS[name];
    if (!material || !base) {
      const missing = material ? 'basecolor.png is missing' : 'tools/plant/textures.ts has no recipe for this material';
      findings.push({ file: folder, rule: 'derived', message: missing });
      continue;
    }
    const derived = deriveMaps(material, base);
    for (const map of DERIVED_MAPS) {
      const bundled = images.get(map);
      if (!bundled || !samePixels(bundled, derived[map])) {
        const message = `${map} is not what tools/plant/textures.ts derives from basecolor.png; run it with \`derive\``;
        findings.push({ file: join(folder, map), rule: 'derived', message });
      }
    }
  }
  return findings;
}

/** The bytes of every file under the texture root, for the VIS-013 installer budget. */
export function bundledBytes(root: string = TEXTURE_ROOT): number {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map((file) => statSync(join(root, file)))
    .filter((stat) => stat.isFile())
    .reduce((sum, stat) => sum + stat.size, 0);
}

if (import.meta.main) {
  const findings = checkTextures();
  for (const { file, rule, message } of findings) console.error(`${rule}: ${file}: ${message}`);
  const megabytes = (bundledBytes() / (1024 * 1024)).toFixed(2);
  console.log(`plant textures: ${findings.length} finding(s); ${megabytes} MiB bundled (VIS-013 installer growth)`);
  process.exit(findings.length > 0 ? 1 : 0);
}
