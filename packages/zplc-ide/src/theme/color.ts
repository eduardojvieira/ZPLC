/**
 * Colour arithmetic for the design tokens (UX-024): parsing the value forms the token source uses, compositing a
 * translucent colour over its backdrop, and the WCAG 2.2 contrast ratio. Pure string and number work; no DOM.
 */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const hexColor = (text: string): Rgba | null => {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (!hex) return null;
  const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1];
  const n = Number.parseInt(digits, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
};

/** Splits the arguments of a function at its top-level commas. */
function topLevelArguments(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/** `<colour> [N%]` of a color-mix() argument; the percentage is null when it is not written. */
function weighted(argument: string): { colour: Rgba; percent: number | null } {
  const match = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(argument.trim());
  if (!match) throw new Error(`Unsupported colour: ${argument}`);
  return { colour: parseColor(match[1]), percent: match[2] === undefined ? null : Number.parseFloat(match[2]) };
}

/** color-mix(in srgb, A p%, B q%) with premultiplied alpha, which is what the browser computes. */
function colorMix(args: string[]): Rgba {
  if (args.length !== 3 || args[0].replace(/\s+/g, ' ') !== 'in srgb') throw new Error(`Unsupported color-mix: ${args.join(', ')}`);
  const first = weighted(args[1]);
  const second = weighted(args[2]);
  const p1 = first.percent ?? (second.percent === null ? 50 : 100 - second.percent);
  const p2 = second.percent ?? 100 - p1;
  const total = p1 + p2;
  const w1 = p1 / total;
  const w2 = p2 / total;
  const alpha = first.colour.a * w1 + second.colour.a * w2;
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const channel = (key: 'r' | 'g' | 'b') => (first.colour[key] * first.colour.a * w1 + second.colour[key] * second.colour.a * w2) / alpha;
  // The alpha of the result is scaled by the percentages that were written (the mix of 12% and transparent is 12%).
  return { r: channel('r'), g: channel('g'), b: channel('b'), a: alpha * (total / 100 > 1 ? 1 : total / 100) };
}

/** Parses #rgb, #rrggbb, rgb(r g b / a), rgba(r, g, b, a) and color-mix(in srgb, ...); anything else (system colours) throws. */
export function parseColor(value: string): Rgba {
  const text = value.trim().toLowerCase();
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = hexColor(text);
  if (hex) return hex;
  const mix = /^color-mix\((.*)\)$/.exec(text);
  if (mix) return colorMix(topLevelArguments(mix[1]));
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

/** `#rrggbb` of an opaque colour, for consumers that take hex only (the Monaco theme). */
export function toHex({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}
