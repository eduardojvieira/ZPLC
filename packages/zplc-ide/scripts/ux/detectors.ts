/**
 * The defects a machine can find on a capture (UXV-004), each a pure function over a `Measurement` (measurement.ts):
 *
 *   clip, spill        an element's own text cut by its box (overflow hidden, no ellipsis), or running out of it (overflow
 *                      visible) by a part that shows inside its clippers and the window (a quarter line, downwards)
 *   clip ... scroll    every line of textFit.findTextOutOfBox, which follows each text to the ancestor that cuts it; its
 *                      `control` lines are left to the field detector
 *   truncated          an ellipsis or a line clamp that hides text, with no title, aria-label, description or tooltip to read it
 *   control            a field's text wider than its client width less the left padding and the larger of the right padding
 *                      and the arrow, by more than 4 px
 *   overlap            the visible parts of two controls cross by more than 1 px each way, unless one is inside the other or
 *                      only one of them is in an open modal
 *   offscreen          the part of a control its clippers let show is not wholly inside the window
 *
 * overlap, offscreen, control, contrast and focus judge only what a person can see and reach: an element under a modal or another
 * element, in an inert subtree (`blocked`), or that its clippers and the window hide, is left out and listed under `unchecked` in
 * the manifest instead.
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
const intersect = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
};
const windowOf = ({ viewport }: Measurement): Rect => ({ x: 0, y: 0, width: viewport.width, height: viewport.height });
/** The part of an element a person sees: its box, cut by its clippers and by the window. */
export const visibleRect = (element: ElementMeasure, measurement: Measurement): Rect | null => {
  const clipped = intersect(element.rect, element.clip);
  return clipped && intersect(clipped, windowOf(measurement));
};
const seen = (element: ElementMeasure, measurement: Measurement) => !element.blocked && visibleRect(element, measurement) !== null;
const shortened = (element: ElementMeasure) =>
  (element.textOverflow === 'ellipsis' && cuts(element.overflowX) && element.scroll.width > element.client.width + TOLERANCE) ||
  (element.lineClamp && cuts(element.overflowY) && element.scroll.height > element.client.height + TOLERANCE);

const cutOrSpilling: Detector = (measurement) =>
  measurement.elements.flatMap((element): Defect[] => {
    if (!element.text || element.textOverflow === 'ellipsis' || element.lineClamp) return [];
    const wide = element.scroll.width > element.client.width + TOLERANCE;
    const size = `${element.scroll.width} by ${element.scroll.height} px`;
    const box = `${element.client.width} by ${element.client.height}`;
    const over = element.scroll.height - element.client.height;
    const tall = over > TOLERANCE;
    // glyphs of a display font reach a few pixels past a line box set tighter than the font: a spill is a quarter line or more
    const tallSpill = over > Math.max(TOLERANCE, element.fontSize / 4);
    if ((wide && cuts(element.overflowX)) || (tall && cuts(element.overflowY)))
      return [
        {
          kind: 'clip',
          where: element.name,
          detail: `${quote(element.text)} needs ${size} in ${box}`,
        },
      ];
    // what runs past the box, as much of it as its clippers and the window let show
    const shows = intersect(element.clip, windowOf(measurement));
    const { rect, client, scroll } = element;
    const right =
      wide && element.overflowX === 'visible' && shows
        ? intersect({ x: rect.x + client.width, y: rect.y, width: scroll.width - client.width, height: rect.height }, shows)
        : null;
    const below =
      tallSpill && element.overflowY === 'visible' && shows
        ? intersect({ x: rect.x, y: rect.y + client.height, width: rect.width, height: scroll.height - client.height }, shows)
        : null;
    const spilled = Math.max(right ? right.width : 0, below ? below.height : 0);
    const enough = (right && right.width > TOLERANCE) || (below && below.height > Math.max(TOLERANCE, element.fontSize / 4));
    if (enough)
      return [{ kind: 'spill', where: element.name, detail: `${quote(element.text)} spills ${Math.round(spilled)} px past its box` }];
    return [];
  });

const TEXT_FIT_KINDS = new Set<DefectKind>(['clip', 'spill', 'word', 'control', 'scroll']);
const textOutOfBox: Detector = ({ textOutOfBox: lines }) =>
  lines
    .filter((line) => !line.startsWith('control:'))
    .map((line) => {
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
const fieldText: Detector = (measurement) =>
  measurement.elements.flatMap((element): Defect[] => {
    if (!element.field || !seen(element, measurement)) return [];
    const { textWidth, paddingLeft, paddingRight, arrow } = element.field;
    const room = element.client.width - paddingLeft - Math.max(paddingRight, arrow);
    return textWidth > room + 4
      ? [{ kind: 'control', where: element.name, detail: `the text needs ${Math.round(textWidth)} px in ${Math.round(room)} px` }]
      : [];
  });

const overlap: Detector = (measurement) => {
  const { elements } = measurement;
  const controls = elements
    .map((element, index) => ({ element, index, shown: element.blocked ? null : visibleRect(element, measurement) }))
    .filter((entry): entry is { element: ElementMeasure; index: number; shown: Rect } => entry.element.control && entry.shown !== null);
  const found: Defect[] = [];
  // ponytail: every pair, O(n²); a page holds a few hundred controls, sort by x if one ever holds thousands
  for (let i = 0; i < controls.length; i++)
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i]!;
      const b = controls[j]!;
      // a modal hides what is outside it; the row of the modal and the control under it are not side by side
      if (a.element.modal !== b.element.modal) continue;
      const across = Math.min(a.shown.x + a.shown.width, b.shown.x + b.shown.width) - Math.max(a.shown.x, b.shown.x);
      const down = Math.min(a.shown.y + a.shown.height, b.shown.y + b.shown.height) - Math.max(a.shown.y, b.shown.y);
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
    .filter(({ control, blocked, rect, clip }) => {
      if (!control || blocked) return false;
      // a clipper as large as the window is the page's frame: past it is outside the window, which is what this judges
      const frame = clip.x <= 0 && clip.y <= 0 && clip.x + clip.width >= viewport.width && clip.y + clip.height >= viewport.height;
      const part = frame ? rect : intersect(rect, clip);
      if (!part) return false; // its scroller hides it
      return (
        part.x < -TOLERANCE ||
        part.y < -TOLERANCE ||
        part.x + part.width > viewport.width + TOLERANCE ||
        part.y + part.height > viewport.height + TOLERANCE
      );
    })
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
const contrast: Detector = (measurement) =>
  measurement.elements.flatMap((element): Defect[] => {
    if (!element.text || !element.color || !element.background || element.disabled || !seen(element, measurement)) return [];
    const large = element.fontSize >= 24 || (element.fontSize >= 18.66 && element.fontWeight >= 700);
    const needed = large ? 3 : 4.5;
    const got = contrastRatio(element.color, element.background);
    return got < needed
      ? [{ kind: 'contrast', where: element.name, detail: `${got.toFixed(2)}:1, needs ${needed}:1, ${quote(element.text)}` }]
      : [];
  });

const focus: Detector = (measurement) =>
  measurement.elements
    .filter((element) => element.control && !element.disabled && seen(element, measurement) && element.focusRing === false)
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
  fieldText,
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
