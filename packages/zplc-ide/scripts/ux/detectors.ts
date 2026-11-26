/**
 * The defects a machine can find on a capture (UXV-004), each a pure function over a `Measurement` (measurement.ts):
 *
 *   clip, spill        an element's own text cut by its box (overflow hidden, no ellipsis) or running out of it (overflow visible)
 *   clip ... scroll    every line of textFit.findTextOutOfBox, which follows each text to the ancestor that cuts it
 *   truncated          an ellipsis or a line clamp that hides text, with no title, aria-label, description or tooltip to read it
 *   overlap            two controls whose boxes cross by more than 1 px each way, unless one is inside the other
 *   offscreen          a control not wholly inside the window (a control in a scrolling container is left to the container)
 *   message-key        a word on screen that is a key of the catalogue
 *   wrong-language     a text that is a string of the other language's catalogue and of no string of its own
 *   contrast           under 4.5 to 1, or 3 to 1 for text of 24 px, or 18.66 px and bold; a disabled control is exempt (WCAG 1.4.3)
 *   focus              a control that Tab reaches and that looks the same with the keyboard focus
 *   scene-framing      the 3D view's opening camera draws part of the scene outside the canvas
 */
import { en } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';
import type { ElementMeasure, Measurement, Rect, Rgba } from './measurement';

export type DefectKind =
  | 'clip'
  | 'spill'
  | 'word'
  | 'control'
  | 'scroll'
  | 'truncated'
  | 'overlap'
  | 'offscreen'
  | 'message-key'
  | 'wrong-language'
  | 'contrast'
  | 'focus'
  | 'scene-framing';

export interface Defect {
  kind: DefectKind;
  where: string;
  detail: string;
}

export type Catalogs = Record<'en' | 'es', Readonly<Record<string, string>>>;

type Detector = (measurement: Measurement, catalogs: Catalogs) => Defect[];

/** Pixels a box may differ by before it counts: subpixel layout rounds both ways. */
const TOLERANCE = 1;
const quote = (text: string) => JSON.stringify(text.slice(0, 60));
const cuts = (value: string) => value === 'hidden' || value === 'clip';
const shortened = (element: ElementMeasure) =>
  (element.textOverflow === 'ellipsis' && cuts(element.overflowX) && element.scroll.width > element.client.width + TOLERANCE) ||
  (element.lineClamp && cuts(element.overflowY) && element.scroll.height > element.client.height + TOLERANCE);

const cutOrSpilling: Detector = ({ elements }) =>
  elements.flatMap((element): Defect[] => {
    if (!element.text || element.textOverflow === 'ellipsis' || element.lineClamp) return [];
    const wide = element.scroll.width > element.client.width + TOLERANCE;
    const size = `${element.scroll.width} by ${element.scroll.height} px`;
    const box = `${element.client.width} by ${element.client.height}`;
    const tall = element.scroll.height > element.client.height + TOLERANCE;
    if ((wide && cuts(element.overflowX)) || (tall && cuts(element.overflowY)))
      return [
        {
          kind: 'clip',
          where: element.name,
          detail: `${quote(element.text)} needs ${size} in ${box}`,
        },
      ];
    if ((wide && element.overflowX === 'visible') || (tall && element.overflowY === 'visible'))
      return [
        {
          kind: 'spill',
          where: element.name,
          detail: `${quote(element.text)} takes ${size} of a ${box} box`,
        },
      ];
    return [];
  });

const TEXT_FIT_KINDS = new Set<DefectKind>(['clip', 'spill', 'word', 'control', 'scroll']);
const textOutOfBox: Detector = ({ textOutOfBox: lines }) =>
  lines.map((line) => {
    const kind = line.slice(0, line.indexOf(':')) as DefectKind;
    return { kind: TEXT_FIT_KINDS.has(kind) ? kind : 'clip', where: 'textFit', detail: line };
  });

const truncated: Detector = ({ elements }) =>
  elements
    .filter((element) => element.text && !element.readable && shortened(element))
    .map((element) => ({ kind: 'truncated', where: element.name, detail: `${quote(element.text)} is shortened and cannot be read whole` }));

const insideOf = (elements: ElementMeasure[], child: number, ancestor: number): boolean => {
  for (let at = elements[child]!.parent; at !== null; at = elements[at]!.parent) if (at === ancestor) return true;
  return false;
};
const overlap: Detector = ({ elements }) => {
  const controls = elements.map((element, index) => ({ element, index })).filter(({ element }) => element.control);
  const found: Defect[] = [];
  // ponytail: every pair, O(n²); a page holds a few hundred controls, sort by x if one ever holds thousands
  for (let i = 0; i < controls.length; i++)
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i]!;
      const b = controls[j]!;
      const across =
        Math.min(a.element.rect.x + a.element.rect.width, b.element.rect.x + b.element.rect.width) -
        Math.max(a.element.rect.x, b.element.rect.x);
      const down =
        Math.min(a.element.rect.y + a.element.rect.height, b.element.rect.y + b.element.rect.height) -
        Math.max(a.element.rect.y, b.element.rect.y);
      if (across <= TOLERANCE || down <= TOLERANCE) continue;
      if (insideOf(elements, b.index, a.index) || insideOf(elements, a.index, b.index)) continue;
      found.push({
        kind: 'overlap',
        where: `${a.element.name} / ${b.element.name}`,
        detail: `cross by ${Math.round(across)} by ${Math.round(down)} px`,
      });
    }
  return found;
};

const offscreen: Detector = ({ elements, viewport }) =>
  elements
    .filter(
      ({ control, inScroller, rect }) =>
        control &&
        !inScroller &&
        (rect.x < -TOLERANCE ||
          rect.y < -TOLERANCE ||
          rect.x + rect.width > viewport.width + TOLERANCE ||
          rect.y + rect.height > viewport.height + TOLERANCE),
    )
    .map(({ name, rect }) => ({
      kind: 'offscreen',
      where: name,
      detail: `at ${rect.x},${rect.y} size ${rect.width} by ${rect.height} in a ${viewport.width} by ${viewport.height} window`,
    }));

const messageKey: Detector = ({ elements }, catalogs) =>
  elements.flatMap((element) =>
    element.text
      .split(/\s+/)
      .map((word) => word.replace(/^[^\w]+|[^\w]+$/g, ''))
      .filter((word) => word.includes('.') && word in catalogs.en)
      .map((word) => ({ kind: 'message-key' as const, where: element.name, detail: word })),
  );

/** The strings of the other language that this one never shows; in a template a `{marker}` stands for any text. */
interface Foreign {
  exact: Set<string>;
  templates: RegExp[];
}
const foreignCache = new WeakMap<object, Map<string, Foreign>>();
function foreign(catalogs: Catalogs, locale: 'en' | 'es'): Foreign {
  let byLocale = foreignCache.get(catalogs);
  if (!byLocale) foreignCache.set(catalogs, (byLocale = new Map()));
  const cached = byLocale.get(locale);
  if (cached) return cached;
  const own = new Set(Object.values(catalogs[locale]).map((value) => value.trim()));
  const found: Foreign = { exact: new Set(), templates: [] };
  for (const value of new Set(Object.values(catalogs[locale === 'en' ? 'es' : 'en']).map((text) => text.trim()))) {
    if (own.has(value)) continue;
    const fixed = value.replace(/\{\w+\}/g, '');
    // too little fixed text to tell a language by (a lone marker, a symbol, a unit)
    if ((fixed.match(/\p{L}/gu) ?? []).length < 4) continue;
    if (fixed === value) {
      found.exact.add(value);
      continue;
    }
    const escaped = value
      .split(/\{\w+\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
      .join('.+?');
    found.templates.push(new RegExp(`^${escaped}$`, 'u'));
  }
  byLocale.set(locale, found);
  return found;
}
const wrongLanguage: Detector = ({ elements, locale }, catalogs) => {
  const { exact, templates } = foreign(catalogs, locale);
  const own = new Set(Object.values(catalogs[locale]).map((value) => value.trim()));
  return elements
    .filter(({ text }) => text && !own.has(text) && (exact.has(text) || templates.some((pattern) => pattern.test(text))))
    .map((element) => ({
      kind: 'wrong-language',
      where: element.name,
      detail: `${quote(element.text)} is ${locale === 'en' ? 'Spanish' : 'English'}`,
    }));
};

const luminance = (colour: Rgba): number => {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(colour[0]) + 0.7152 * channel(colour[1]) + 0.0722 * channel(colour[2]);
};
const over = (top: Rgba, bottom: Rgba): Rgba => {
  const a = top[3] + bottom[3] * (1 - top[3]);
  const mix = (i: 0 | 1 | 2) => (a === 0 ? 0 : (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a);
  return [mix(0), mix(1), mix(2), a];
};
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const seen = over(foreground, background);
  const [hi, lo] = [luminance(seen), luminance(background)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
const contrast: Detector = ({ elements }) =>
  elements.flatMap((element): Defect[] => {
    if (!element.text || !element.color || !element.background || element.disabled) return [];
    const large = element.fontSize >= 24 || (element.fontSize >= 18.66 && element.fontWeight >= 700);
    const needed = large ? 3 : 4.5;
    const got = contrastRatio(element.color, element.background);
    return got < needed
      ? [{ kind: 'contrast', where: element.name, detail: `${got.toFixed(2)}:1, needs ${needed}:1, ${quote(element.text)}` }]
      : [];
  });

const focus: Detector = ({ elements }) =>
  elements
    .filter((element) => element.control && !element.disabled && element.focusRing === false)
    .map((element) => ({ kind: 'focus', where: element.name, detail: 'looks the same with the keyboard focus' }));

const holds = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - TOLERANCE &&
  inner.y >= outer.y - TOLERANCE &&
  inner.x + inner.width <= outer.x + outer.width + TOLERANCE &&
  inner.y + inner.height <= outer.y + outer.height + TOLERANCE;
const sceneFraming: Detector = ({ scene }) =>
  scene && scene !== 'unmeasured' && !holds(scene.canvas, scene.bounds)
    ? [
        {
          kind: 'scene-framing',
          where: '[data-plant-canvas]',
          detail: `the scene ${JSON.stringify(scene.bounds)} leaves the canvas ${JSON.stringify(scene.canvas)}`,
        },
      ]
    : [];

export const detectors: Record<string, Detector> = {
  cutOrSpilling,
  textOutOfBox,
  truncated,
  overlap,
  offscreen,
  messageKey,
  wrongLanguage,
  contrast,
  focus,
  sceneFraming,
};

/** Every detector over one measurement, sorted so that one page gives one list. */
export function detectDefects(measurement: Measurement, catalogs: Catalogs = { en, es }): Defect[] {
  const key = (defect: Defect) => `${defect.kind}\u0000${defect.where}\u0000${defect.detail}`;
  return Object.values(detectors)
    .flatMap((detect) => detect(measurement, catalogs))
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}
