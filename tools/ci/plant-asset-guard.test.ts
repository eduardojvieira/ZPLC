import { afterEach, describe, expect, it } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { decodePng, encodePng } from '../plant/png';
import { DERIVED_MAPS, deriveMaps, MATERIALS, TEXTURE_ROOT } from '../plant/textures';
import { checkTextures, type Finding } from './plant-asset-guard';

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A copy of the bundled plastic material, the one fixture every rule breaks in its own way. */
function fixture(): { root: string; folder: string } {
  const root = mkdtempSync(join(tmpdir(), 'plant-asset-guard-'));
  temporary.push(root);
  cpSync(join(TEXTURE_ROOT, 'plastic'), join(root, 'plastic'), { recursive: true });
  return { root, folder: join(root, 'plastic') };
}

const rulesOf = (findings: Finding[]): string[] => [...new Set(findings.map((finding) => finding.rule))];

describe('the bundled plant textures keep their provenance and properties (VIS-019)', () => {
  it('VIS-019 the bundled tree passes', () => {
    expect(checkTextures()).toEqual([]);
  });

  it('VIS-019 the fixture passes before it is broken', () => {
    expect(checkTextures(fixture().root)).toEqual([]);
  });

  it('VIS-019 finds a missing provenance record and a record without a field', () => {
    const missing = fixture();
    rmSync(join(missing.folder, 'provenance.json'));
    expect(checkTextures(missing.root).map((finding) => finding.message)).toEqual(['the provenance record is missing']);

    const partial = fixture();
    const path = join(partial.folder, 'provenance.json');
    const { licence: _, ...record } = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify(record));
    expect(checkTextures(partial.root).map((finding) => finding.message)).toEqual(['the provenance record has no licence']);
  });

  it('VIS-019 finds a map whose real format does not match its extension', () => {
    const { root, folder } = fixture();
    writeFileSync(join(folder, 'detail.png'), Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46));
    writeFileSync(join(folder, 'detail.jpg'), readFileSync(join(folder, 'roughness.png')));
    expect(checkTextures(root).map((finding) => [finding.rule, finding.file.split('/').pop()])).toEqual([
      ['format', 'detail.jpg'],
      ['format', 'detail.png'],
    ]);
  });

  it('VIS-019 finds a map over 2048 pixels on a side', () => {
    const { root, folder } = fixture();
    writeFileSync(join(folder, 'wide.png'), encodePng({ width: 2049, height: 1, channels: 1, data: new Uint8Array(2049) }));
    expect(rulesOf(checkTextures(root))).toEqual(['size']);
  });

  it('VIS-019 finds a base colour whose edges do not tile, even with maps derived from it', () => {
    const { root, folder } = fixture();
    const base = decodePng(readFileSync(join(folder, 'basecolor.png')));
    // A left-to-right ramp of 48 levels: the first and the last column then differ by a step the texture does not have.
    const ramped = {
      ...base,
      data: base.data.map((value, i) => Math.max(0, value - 48 + Math.floor((48 * (i % base.width)) / base.width))),
    };
    writeFileSync(join(folder, 'basecolor.png'), encodePng(ramped));
    const maps = deriveMaps(MATERIALS.plastic, ramped);
    for (const map of DERIVED_MAPS) writeFileSync(join(folder, map), encodePng(maps[map]));
    const findings = checkTextures(root);
    expect(rulesOf(findings)).toEqual(['seam']);
    expect(findings.map((finding) => finding.file.split('/').pop())).toContain('basecolor.png');
    expect(findings.every((finding) => finding.message.startsWith('the left/right edges do not tile'))).toBe(true);
  });

  it('VIS-019 finds a derived map that the script does not derive again to the same pixels', () => {
    const { root, folder } = fixture();
    const path = join(folder, 'roughness.png');
    const roughness = decodePng(readFileSync(path));
    roughness.data[0] ^= 1;
    writeFileSync(path, encodePng(roughness));
    expect(checkTextures(root).map((finding) => [finding.rule, finding.file.split('/').pop()])).toEqual([['derived', 'roughness.png']]);
  });
});
