// DOC-017: one vector mark in one palette, and every icon and the social card come from it. These tests read the files that
// were generated; they need none of the raster tools that regenerate them.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { declaredTokens } from '../../../packages/zplc-ide/src/theme/tokens';
import { MARK, OUTPUTS, VARIANTS, pngSize, staleOutputs } from './generate-icons';

const ROOT = join(import.meta.dir, '..', '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path));

describe('the one vector mark and its one-colour variants', () => {
  const marks = [MARK, ...VARIANTS].map((path) => ({ path, text: read(path).toString('utf8') }));

  it('hold no text and name no font, so no font can change them', () => {
    for (const { path, text } of marks) expect({ path, text: /<text|<tspan|font-family/i.test(text) }).toEqual({ path, text: false });
  });

  it('use only colours of the Studio palette', () => {
    const palette = new Set(
      (['light', 'dark', 'high-contrast'] as const)
        .flatMap((theme) => Object.values(declaredTokens(theme)).flatMap((value) => value.match(/#[0-9a-f]{6}\b/gi) ?? []))
        .map((colour) => colour.toLowerCase()),
    );
    for (const { path, text } of marks) {
      const used = [...new Set((text.match(/#[0-9a-f]{6}\b/gi) ?? []).map((colour) => colour.toLowerCase()))];
      expect({ path, outside: used.filter((colour) => !palette.has(colour)) }).toEqual({ path, outside: [] });
    }
    expect(
      read(MARK)
        .toString('utf8')
        .match(/#[0-9a-f]{6}\b/gi)!.length,
    ).toBeGreaterThan(0);
  });

  it('draws each variant as one compound path in one colour: dark, light, and the colour of the text around it', () => {
    const fills = VARIANTS.map((path) =>
      [
        ...read(path)
          .toString('utf8')
          .matchAll(/<path [^>]*fill="([^"]+)"/g),
      ].map((match) => match[1]),
    );
    expect(fills).toEqual([['#172127'], ['#E5EDEB'], ['currentColor']]);
  });
});

describe('what is made from the mark', () => {
  it('is current: the checksum of the mark and of each output is the recorded one', () => {
    expect(staleOutputs()).toEqual([]);
  });

  it.each(OUTPUTS.filter((output) => output.kind === 'png'))('$path is a PNG of $width by $height', (output) => {
    expect(pngSize(read(output.path))).toEqual({ width: output.width!, height: output.height! });
  });

  it('makes the application icon a real icns file and the site logo the mark itself', () => {
    expect(read('tools/brand/icon.icns').subarray(0, 4).toString('latin1')).toBe('icns');
    expect(read('docs/static/img/logo.svg').equals(read(MARK))).toBe(true);
  });

  it('is the favicon that the renderer page names, so ZPLC shows the mark and not a stale picture', () => {
    const html = readFileSync(join(ROOT, 'packages/zplc-ide/index.html'), 'utf8');
    expect(html).toContain('<link rel="icon" type="image/png" href="/icon.png" />');
    expect(OUTPUTS.map((output) => output.path)).toContain('packages/zplc-ide/public/icon.png');
  });

  it('is what the site and the installers name: the favicon, the social card and the application icons', async () => {
    // a variable path: the site configuration is plain JavaScript with no declaration file
    const configPath = '../../../docs/docusaurus.config.js';
    const config = (await import(configPath)).default as {
      favicon: string;
      themeConfig: { image: string; navbar: { logo: { src: string } } };
    };
    expect([config.favicon, config.themeConfig.image, config.themeConfig.navbar.logo.src]).toEqual([
      'img/favicon.png',
      'img/social-card.png',
      'img/logo.svg',
    ]);
    const builder = Bun.YAML.parse(readFileSync(join(ROOT, 'packages/zplc-ide/electron-builder.yml'), 'utf8')) as {
      mac: { icon: string };
      win: { icon: string };
      linux: { icon: string };
    };
    expect([builder.mac.icon, builder.win.icon, builder.linux.icon]).toEqual([
      '../../tools/brand/icon.icns',
      '../../tools/brand/icon.png',
      '../../tools/brand/icon.png',
    ]);
  });
});
