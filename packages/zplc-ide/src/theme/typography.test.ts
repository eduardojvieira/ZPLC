import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderTokensCss } from './tokensCss';
import { resolveTokens } from './tokens';

const SRC = resolve(import.meta.dir, '..');
const IDE = resolve(SRC, '..');
const REPO = resolve(IDE, '../..');

/** Every file of the application styles and sources (the kit guard checks the same under CI; this proves the behaviour of the whole). */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(css|tsx)$/.test(name) && !name.endsWith('.test.tsx') ? [path] : [];
  });
}

describe('bundled typefaces (UX-006)', () => {
  const files = readdirSync(join(SRC, 'assets/fonts')).filter((name) => name.endsWith('.woff2'));

  it(
    'UX-006 ships Inter and JetBrains Mono as valid WOFF2 files inside the application, so no operating system font decides the ' +
      'typeface',
    () => {
      expect(files.length).toBeGreaterThanOrEqual(3);
      for (const file of files) {
        const path = join(SRC, 'assets/fonts', file);
        expect({ file, exists: existsSync(path) }).toEqual({ file, exists: true });
        expect({ file, magic: readFileSync(path).subarray(0, 4).toString('latin1') }).toEqual({ file, magic: 'wOF2' });
      }
    },
  );

  it('UX-006 ships the licence text of each family with the application and names it in the third-party notices', () => {
    const notices = JSON.parse(readFileSync(join(REPO, 'scripts/release/font-licences.json'), 'utf8')) as {
      fonts: Array<{ pattern: string; licence: string }>;
    };
    for (const [family, licence] of [
      ['Inter', 'Inter-OFL.txt'],
      ['JetBrainsMono', 'JetBrainsMono-OFL.txt'],
    ] as const) {
      expect(readFileSync(join(IDE, 'public/licenses', licence), 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
      expect(
        files
          .filter((file) => file.startsWith(family))
          .every((file) => notices.fonts.some((entry) => new RegExp(entry.pattern).test(file) && entry.licence === 'OFL-1.1')),
      ).toBe(true);
    }
  });

  it('UX-006 sets no font size under 11 pixels in any style sheet or component, and keeps the scale floor at 11', () => {
    const small: string[] = [];
    for (const path of sources(SRC)) {
      const text = readFileSync(path, 'utf8');
      for (const match of text.matchAll(/(?:text-\[|font-size:\s*)(\d+(?:\.\d+)?)px/g))
        if (Number.parseFloat(match[1]!) < 11) small.push(`${path.slice(SRC.length)}: ${match[0]}`);
    }
    expect(small).toEqual([]);
    expect(resolveTokens('light')['--font-size-caption']).toBe('11px');
  });

  it('UX-006 gives values, addresses and times tabular, slashed-zero numerals through one class', () => {
    expect(readFileSync(join(SRC, 'ui/kit.css'), 'utf8')).toMatch(/\.ui-tabular,\s*\.tnum\s*\{[^}]*tabular-nums[^}]*["']tnum["'] 1/);
  });
});

describe('shape, elevation and icon tokens (UX-007)', () => {
  const kit = readFileSync(join(SRC, 'ui/kit.css'), 'utf8');
  /** The selectors of the kit rules that cast a shadow. */
  const shadowed = [...kit.matchAll(/([^{}]+)\{([^{}]*box-shadow:[^{}]*)\}/g)].map((match) => match[1]!.replace(/\s+/g, ' ').trim());

  it('UX-007 casts a shadow only from the transient overlays of the kit: dialog, menu, popover, list box, tooltip and toast', () => {
    const allowed = /^\.ui-(dialog|menu|popover|listbox|tooltip|toast)\b/;
    for (const selector of shadowed)
      for (const part of selector.split(','))
        expect({ part: part.trim(), overlay: allowed.test(part.trim()) }).toEqual({ part: part.trim(), overlay: true });
    expect(shadowed.length).toBeGreaterThanOrEqual(4);
  });

  it('UX-007 draws every shadow of the kit from an elevation token and every corner from a radius token', () => {
    for (const [, value] of kit.matchAll(/box-shadow:\s*([^;}]+)/g)) expect(value).toMatch(/^var\(--elevation-(?:overlay|tooltip)\)$/);
    for (const [, value] of kit.matchAll(/border-radius:\s*([^;}]+)/g)) expect(value!.trim()).toMatch(/^(?:0|var\(--radius-[a-z]+\))$/);
  });

  it('UX-007 keeps surfaces flat at rest and gives no shadow in high contrast, where an outline marks the overlay', () => {
    const css = renderTokensCss();
    expect(resolveTokens('dark')['--elevation-flat']).toBe('none');
    expect(css).toContain('--icon-size-md:');
    expect(resolveTokens('high-contrast')['--elevation-overlay']).toBe('none');
    expect(resolveTokens('high-contrast')['--elevation-tooltip']).toBe('none');
  });
});

describe('density applies to the whole application (UX-008)', () => {
  it('UX-008 declares the compact value of every density token in one block that the root element selects', () => {
    const css = renderTokensCss();
    const compact = css.match(/html\[data-density="compact"\] \{([^}]*)\}/)![1]!;
    for (const name of ['--spacing', '--control-height', '--control-height-sm', '--row-height', '--control-padding-x', '--gap-control'])
      expect(compact).toContain(`${name}:`);
  });

  it('UX-008 sizes the kit controls, rows and tree rows from the density tokens, with no fixed pixel height of its own', () => {
    const kit = readFileSync(join(SRC, 'ui/kit.css'), 'utf8');
    for (const selector of ['\\.ui-button', '\\.ui-input', '\\.ui-menu-item', '\\.ui-treeitem', '\\.ui-grid th,\\s*\\.ui-grid td']) {
      const rule = kit.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      expect({ selector, tokenHeight: /(?:min-)?height:\s*var\(--(?:control-height|row-height)/.test(rule) }).toEqual({
        selector,
        tokenHeight: true,
      });
    }
  });
});
