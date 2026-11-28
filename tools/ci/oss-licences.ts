// OSS-002: the licence of the code, of the course and of every bundled asset family MUST be stated, and every bundled
// generated asset MUST carry its VIS-019 record of origin next to it.
//
//   bun tools/ci/oss-licences.ts [--root <dir>]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface LicenceFinding {
  file: string;
  rule: 'licence-doc' | 'asset-family' | 'origin-record' | 'font-licence';
  message: string;
}

export const ORIGIN_FIELDS = ['tool', 'model', 'prompt', 'date', 'postProcessing', 'licence'] as const;

const IMAGE_EXT = /\.(png|jpe?g|webp|avif|gif)$/i;
const FONT_EXT = /\.(woff2?|ttf|otf)$/i;

export const EN_LICENCE_DOC = 'docs/docs/reference/licences.md';
export const ES_LICENCE_DOC = 'docs/i18n/es/docusaurus-plugin-content-docs/current/reference/licences.md';

/** Every bundled asset family (and the course) that must carry a stated licence in both licence pages. */
export const BUNDLED_FAMILIES: ReadonlyArray<{ id: string; checkPath: string; docToken: string }> = [
  { id: 'source-code', checkPath: 'firmware', docToken: 'firmware/' },
  { id: 'course-content', checkPath: 'packages/zplc-ide/lessons', docToken: 'packages/zplc-ide/lessons/' },
  {
    id: 'plant-textures',
    checkPath: 'packages/zplc-ide/src/plant/assets/textures',
    docToken: 'packages/zplc-ide/src/plant/assets/textures/',
  },
  { id: 'studio-fonts', checkPath: 'packages/zplc-ide/src/assets/fonts', docToken: 'packages/zplc-ide/src/assets/fonts/' },
  { id: 'docs-fonts', checkPath: 'docs/static/fonts', docToken: 'docs/static/fonts/' },
  { id: 'brand-marks', checkPath: 'tools/brand', docToken: 'tools/brand/' },
  { id: 'docs-generated-images', checkPath: 'docs/static/img/generated', docToken: 'docs/static/img/generated/' },
  { id: 'docs-screenshots', checkPath: 'docs/static/img/editors', docToken: 'docs/static/img/editors/' },
  { id: 'public-template-icon', checkPath: 'packages/zplc-ide/public/vite.svg', docToken: 'packages/zplc-ide/public/vite.svg' },
];

function checkOriginFields(file: string, subject: string, record: Record<string, unknown>): LicenceFinding[] {
  const findings: LicenceFinding[] = [];
  for (const field of ORIGIN_FIELDS) {
    const value = record[field];
    if (typeof value !== 'string' || value.trim() === '') {
      findings.push({ file, rule: 'origin-record', message: `${subject}: missing or empty "${field}" in origin record` });
    }
  }
  return findings;
}

/** Check that a markdown table row mentioning `token` has a non-empty Licence cell (3rd column). */
function hasStatedLicence(markdown: string, token: string): boolean {
  for (const line of markdown.split('\n')) {
    if (!line.trim().startsWith('|') || !line.includes(token)) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length >= 3 && cells[2] !== '' && !/^[-:]+$/.test(cells[2]!)) return true;
  }
  return false;
}

function checkPlantTextureProvenance(root: string): LicenceFinding[] {
  const findings: LicenceFinding[] = [];
  const texturesDir = join(root, 'packages/zplc-ide/src/plant/assets/textures');
  if (!existsSync(texturesDir)) return findings;
  for (const entry of readdirSync(texturesDir).sort()) {
    const full = join(texturesDir, entry);
    const rel = `packages/zplc-ide/src/plant/assets/textures/${entry}`;
    if (!statSync(full).isDirectory()) {
      if (IMAGE_EXT.test(entry)) {
        findings.push({ file: rel, rule: 'origin-record', message: 'bundled texture outside a material folder has no origin record' });
      }
      continue;
    }
    const provPath = join(full, 'provenance.json');
    const provRel = `${rel}/provenance.json`;
    if (!existsSync(provPath)) {
      findings.push({ file: provRel, rule: 'origin-record', message: 'missing provenance.json next to generated texture maps' });
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(provPath, 'utf8')) as Record<string, unknown>;
      findings.push(...checkOriginFields(provRel, entry, parsed));
    } catch (error) {
      findings.push({ file: provRel, rule: 'origin-record', message: `invalid JSON: ${(error as Error).message}` });
    }
  }
  return findings;
}

function checkGeneratedDocsProvenance(root: string): LicenceFinding[] {
  const findings: LicenceFinding[] = [];
  const genDir = join(root, 'docs/static/img/generated');
  if (!existsSync(genDir)) return findings;
  const images = readdirSync(genDir)
    .filter((name) => IMAGE_EXT.test(name))
    .sort();
  if (images.length === 0) return findings;
  const provRel = 'docs/static/img/generated/provenance.json';
  const provPath = join(root, provRel);
  if (!existsSync(provPath)) {
    findings.push({ file: provRel, rule: 'origin-record', message: 'missing provenance.json next to generated documentation images' });
    return findings;
  }
  let parsed: { assets?: Record<string, Record<string, unknown>> };
  try {
    parsed = JSON.parse(readFileSync(provPath, 'utf8')) as { assets?: Record<string, Record<string, unknown>> };
  } catch (error) {
    findings.push({ file: provRel, rule: 'origin-record', message: `invalid JSON: ${(error as Error).message}` });
    return findings;
  }
  const assets = parsed.assets ?? {};
  for (const image of images) {
    const entry = assets[image];
    if (!entry || typeof entry !== 'object') {
      findings.push({ file: `docs/static/img/generated/${image}`, rule: 'origin-record', message: 'no entry in provenance.json' });
      continue;
    }
    findings.push(...checkOriginFields(provRel, image, entry));
  }
  return findings;
}

function checkFontLicences(root: string): LicenceFinding[] {
  const findings: LicenceFinding[] = [];
  const fontsDir = join(root, 'packages/zplc-ide/src/assets/fonts');
  const registryPath = join(root, 'scripts/release/font-licences.json');
  if (!existsSync(fontsDir) || !existsSync(registryPath)) return findings;
  let patterns: RegExp[] = [];
  try {
    const parsed = JSON.parse(readFileSync(registryPath, 'utf8')) as { fonts?: Array<{ pattern: string; licence?: string }> };
    patterns = (parsed.fonts ?? [])
      .filter((f) => typeof f.licence === 'string' && f.licence.trim() !== '')
      .map((f) => new RegExp(f.pattern));
  } catch (error) {
    findings.push({
      file: 'scripts/release/font-licences.json',
      rule: 'font-licence',
      message: `invalid JSON: ${(error as Error).message}`,
    });
    return findings;
  }
  for (const name of readdirSync(fontsDir).sort()) {
    if (!FONT_EXT.test(name)) continue;
    if (!patterns.some((re) => re.test(name))) {
      findings.push({
        file: `packages/zplc-ide/src/assets/fonts/${name}`,
        rule: 'font-licence',
        message: 'bundled font has no licence entry in scripts/release/font-licences.json',
      });
    }
  }
  return findings;
}

export function checkOssLicences(root: string = resolve(import.meta.dir, '..', '..')): LicenceFinding[] {
  const findings: LicenceFinding[] = [];
  for (const required of ['LICENSE', 'NOTICE.md', 'README.md']) {
    const full = join(root, required);
    if (!existsSync(full) || readFileSync(full, 'utf8').trim() === '') {
      findings.push({ file: required, rule: 'licence-doc', message: `${required} is missing or empty` });
    }
  }
  const readmePath = join(root, 'README.md');
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, 'utf8');
    for (const target of ['LICENSE', 'NOTICE.md', EN_LICENCE_DOC]) {
      if (!readme.includes(target)) {
        findings.push({ file: 'README.md', rule: 'licence-doc', message: `README.md does not link to ${target}` });
      }
    }
  }
  for (const docPath of [EN_LICENCE_DOC, ES_LICENCE_DOC]) {
    const full = join(root, docPath);
    if (!existsSync(full)) {
      findings.push({ file: docPath, rule: 'licence-doc', message: 'licence inventory page is missing' });
      continue;
    }
    const text = readFileSync(full, 'utf8');
    for (const family of BUNDLED_FAMILIES) {
      if (!existsSync(join(root, family.checkPath))) continue;
      if (!hasStatedLicence(text, family.docToken)) {
        findings.push({
          file: docPath,
          rule: 'asset-family',
          message: `asset family "${family.id}" (${family.docToken}) has no stated licence in table`,
        });
      }
    }
  }
  findings.push(...checkPlantTextureProvenance(root));
  findings.push(...checkGeneratedDocsProvenance(root));
  findings.push(...checkFontLicences(root));
  return findings;
}

if (import.meta.main) {
  const idx = process.argv.indexOf('--root');
  const root = idx !== -1 && process.argv[idx + 1] ? resolve(process.argv[idx + 1]!) : resolve(import.meta.dir, '..', '..');
  const findings = checkOssLicences(root);
  for (const finding of findings) {
    console.error(`${finding.rule}: ${finding.file}: ${finding.message}`);
  }
  console.log(`oss-licences: ${findings.length} finding(s)`);
  process.exit(findings.length > 0 ? 1 : 0);
}
