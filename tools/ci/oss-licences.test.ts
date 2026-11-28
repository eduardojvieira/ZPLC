import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkOssLicences, EN_LICENCE_DOC, ES_LICENCE_DOC } from './oss-licences';

const dirs: string[] = [];

function write(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function makeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'zplc-oss-licences-'));
  dirs.push(dir);
  write(dir, 'LICENSE', 'MIT License\n');
  write(dir, 'NOTICE.md', '# Notices\n');
  write(dir, 'README.md', `See [LICENSE](LICENSE), [NOTICE.md](NOTICE.md) and [Licences](${EN_LICENCE_DOC}).\n`);
  write(dir, 'firmware/README.md', '# fw\n');
  write(dir, 'packages/zplc-ide/lessons/course.json', '{}');
  write(dir, 'packages/zplc-ide/src/plant/assets/textures/steel/basecolor.png', 'png');
  write(
    dir,
    'packages/zplc-ide/src/plant/assets/textures/steel/provenance.json',
    JSON.stringify({
      tool: 'agy',
      model: 'img-model',
      prompt: 'brushed steel',
      date: '2026-11-23',
      postProcessing: 'converted to png',
      licence: 'MIT',
    }),
  );
  write(dir, 'packages/zplc-ide/src/assets/fonts/Inter-Variable-latin.woff2', 'font');
  write(
    dir,
    'scripts/release/font-licences.json',
    JSON.stringify({ schema: 1, fonts: [{ pattern: '^Inter-Variable-latin\\.woff2$', licence: 'OFL-1.1' }] }),
  );
  write(dir, 'docs/static/img/generated/hero.avif', 'avif');
  write(
    dir,
    'docs/static/img/generated/provenance.json',
    JSON.stringify({
      schema: 1,
      assets: {
        'hero.avif': {
          tool: 'agy',
          model: 'img-model',
          prompt: 'docs/design/prompts/hero.txt',
          date: '2026-10-24',
          postProcessing: 'magick',
          licence: 'MIT',
        },
      },
    }),
  );
  const table = [
    '| Component | Location | Licence | Notes |',
    '| --- | --- | --- | --- |',
    '| Code | `firmware/` | MIT | ok |',
    '| Course | `packages/zplc-ide/lessons/` | MIT | ok |',
    '| Textures | `packages/zplc-ide/src/plant/assets/textures/` | MIT | ok |',
    '| Fonts | `packages/zplc-ide/src/assets/fonts/` | OFL-1.1 | ok |',
    '| Generated | `docs/static/img/generated/` | MIT | ok |',
  ].join('\n');
  write(dir, EN_LICENCE_DOC, table);
  write(dir, ES_LICENCE_DOC, table);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('OSS-002 licence and origin-record guard', () => {
  test('passes on the real repository', () => {
    expect(checkOssLicences()).toEqual([]);
  });

  test('passes on a complete fixture', () => {
    expect(checkOssLicences(makeFixture())).toEqual([]);
  });

  test('fails when a bundled generated asset has no origin record', () => {
    const dir = makeFixture();
    write(dir, 'docs/static/img/generated/extra.avif', 'avif');
    const findings = checkOssLicences(dir);
    expect(findings.some((f) => f.rule === 'origin-record' && f.file.includes('extra.avif'))).toBe(true);
  });

  test('fails when a texture folder lacks provenance.json', () => {
    const dir = makeFixture();
    write(dir, 'packages/zplc-ide/src/plant/assets/textures/wood/basecolor.png', 'png');
    const findings = checkOssLicences(dir);
    expect(findings.some((f) => f.rule === 'origin-record' && f.file.includes('wood/provenance.json'))).toBe(true);
  });

  test('fails when a bundled asset family has no stated licence', () => {
    const dir = makeFixture();
    write(dir, 'tools/brand/mark.svg', '<svg/>');
    const findings = checkOssLicences(dir);
    expect(findings.some((f) => f.rule === 'asset-family' && f.message.includes('brand-marks'))).toBe(true);
  });

  test('fails when a bundled font is missing from font-licences.json', () => {
    const dir = makeFixture();
    write(dir, 'packages/zplc-ide/src/assets/fonts/Unknown.woff2', 'font');
    const findings = checkOssLicences(dir);
    expect(findings.some((f) => f.rule === 'font-licence' && f.file.includes('Unknown.woff2'))).toBe(true);
  });
});
