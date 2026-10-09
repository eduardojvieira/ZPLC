/**
 * Reads the design tokens that src/index.css declares per theme, so tests can check
 * them (window colour, contrast) without a browser. Pure string work; no DOM.
 *
 * ponytail: a regex reader for flat `selector { --name: value; }` blocks, which is all
 * index.css uses. Nested rules or `@layer` token blocks need a real CSS parser.
 */
export type ThemeName = 'light' | 'dark' | 'high-contrast' | 'system-dark';
export type TokenMap = Record<string, string>;
export interface Rgba { r: number; g: number; b: number; a: number }

/** The selector that carries each theme's overrides; `light` is the `:root` default every theme starts from. */
const THEME_SELECTOR: Record<ThemeName, string> = {
  light: ':root',
  dark: ':root.dark',
  'high-contrast': ':root.high-contrast',
  'system-dark': ':root:not(.light):not(.dark)',
};

/** Drops the forced-colors blocks: the operating system, not the tokens, picks those colours. */
function withoutForcedColors(css: string): string {
  let out = css;
  for (let start = out.indexOf('@media (forced-colors: active)'); start !== -1; start = out.indexOf('@media (forced-colors: active)')) {
    let depth = 0;
    let end = out.indexOf('{', start);
    for (; end < out.length; end++) {
      if (out[end] === '{') depth++;
      else if (out[end] === '}' && --depth === 0) break;
    }
    out = out.slice(0, start) + out.slice(end + 1);
  }
  return out;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');

function declaredTokens(css: string, selector: string): TokenMap {
  const tokens: TokenMap = {};
  const block = new RegExp(`^[ \\t]*${escapeRegExp(selector)}[ \\t]*\\{([^}]*)\\}`, 'gm');
  for (const [, body] of css.matchAll(block)) {
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[name] = value.trim();
  }
  return tokens;
}

/** Declared tokens per theme: the `:root` defaults overlaid with the theme's own block. Values may still hold var(). */
export function readThemeTokens(source: string): Record<ThemeName, TokenMap> {
  const css = withoutForcedColors(source.replace(/\/\*[\s\S]*?\*\//g, ''));
  const base = declaredTokens(css, THEME_SELECTOR.light);
  const themed = (name: ThemeName): TokenMap => ({ ...base, ...(name === 'light' ? {} : declaredTokens(css, THEME_SELECTOR[name])) });
  return { light: themed('light'), dark: themed('dark'), 'high-contrast': themed('high-contrast'), 'system-dark': themed('system-dark') };
}

/** Tokens of one theme with every var() replaced by the value the cascade gives that theme. */
export function resolveThemeTokens(source: string, theme: ThemeName): TokenMap {
  const declared = readThemeTokens(source)[theme];
  const resolve = (value: string, depth = 0): string => {
    if (depth > 8) throw new Error(`var() chain is too deep or cyclic: ${value}`);
    return value.replace(/var\((--[\w-]+)\)/g, (_match, name: string) => {
      const target = declared[name];
      if (target === undefined) throw new Error(`Undefined token ${name} in theme ${theme}`);
      return resolve(target, depth + 1);
    });
  };
  return Object.fromEntries(Object.entries(declared).map(([name, value]) => [name, resolve(value)]));
}

/** Parses #rgb, #rrggbb, rgb(r g b / a) and rgba(r, g, b, a); anything else (system colours, color-mix) throws. */
export function parseColor(value: string): Rgba {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1];
    const n = Number.parseInt(digits, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(text);
  if (fn) {
    const alpha = fn[4] === undefined ? 1 : fn[4].endsWith('%') ? Number.parseFloat(fn[4]) / 100 : Number.parseFloat(fn[4]);
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a: alpha };
  }
  throw new Error(`Unsupported colour: ${value}`);
}

/** `fg` laid over an opaque `bg`, as the browser paints a translucent fill. */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const mix = (top: number, bottom: number): number => top * fg.a + bottom * (1 - fg.a);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 };
}

/** WCAG 2.2 relative luminance of an opaque colour. */
function luminance({ r, g, b }: Rgba): number {
  const linear = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.2 contrast ratio (1 to 21). A translucent `fg` is composited over `bg`, which must be opaque. */
export function contrastRatio(fg: string | Rgba, bg: string | Rgba): number {
  const back = typeof bg === 'string' ? parseColor(bg) : bg;
  const parsed = typeof fg === 'string' ? parseColor(fg) : fg;
  const front = parsed.a < 1 ? composite(parsed, back) : parsed;
  const [light, dark] = [luminance(front), luminance(back)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
