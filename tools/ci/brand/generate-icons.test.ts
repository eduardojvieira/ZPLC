// DOC-017: one vector mark in one palette, and every icon and the social card come from it. These tests read the files that
// were generated; they need none of the raster tools that regenerate them.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { declaredTokens } from '../../../packages/zplc-ide/src/theme/tokens';
import { MARK, OUTPUTS, pngSize, staleOutputs } from './generate-icons';

const ROOT = join(import.meta.dir, '..', '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path));

describe('the one vector mark', () => {
  const mark = read(MARK).toString('utf8');

  it('holds no text, so it cannot carry the product name that decision D-03 still has open', () => {
    expect(mark).not.toMatch(/<text|<tspan|font-family|ZPLC|Studio/i);
  });

  it('uses only colours of the Studio palette', () => {
    const palette = new Set((['light', 'dark', 'high-contrast'] as const).flatMap((theme) => Object.values(declaredTokens(theme)).flatMap((value) => value.match(/#[0-9a-f]{6}\b/gi) ?? [])).map((colour) => colour.toLowerCase()));
    const used = [...new Set(mark.match(/#[0-9a-f]{6}\b/gi)!.map((colour) => colour.toLowerCase()))];
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((colour) => !palette.has(colour))).toEqual([]);
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

  it('is the favicon that the renderer page names, so Studio shows the mark and not a stale picture', () => {
    const html = readFileSync(join(ROOT, 'packages/zplc-ide/index.html'), 'utf8');
    expect(html).toContain('<link rel="icon" type="image/png" href="/icon.png" />');
    expect(OUTPUTS.map((output) => output.path)).toContain('packages/zplc-ide/public/icon.png');
  });

  it('is what the site and the installers name: the favicon, the social card and the application icons', async () => {
    // a variable path: the site configuration is plain JavaScript with no declaration file
    const configPath = '../../../docs/docusaurus.config.js';
    const config = (await import(configPath)).default as { favicon: string; themeConfig: { image: string; navbar: { logo: { src: string } } } };
    expect([config.favicon, config.themeConfig.image, config.themeConfig.navbar.logo.src]).toEqual(['img/favicon.png', 'img/social-card.png', 'img/logo.svg']);
    const builder = Bun.YAML.parse(readFileSync(join(ROOT, 'packages/zplc-ide/electron-builder.yml'), 'utf8')) as { mac: { icon: string }; win: { icon: string }; linux: { icon: string } };
    expect([builder.mac.icon, builder.win.icon, builder.linux.icon]).toEqual(['../../tools/brand/icon.icns', '../../tools/brand/icon.png', '../../tools/brand/icon.png']);
  });
});
