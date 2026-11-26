/**
 * What the capture tool records of a page (UXV-004), as plain data: the detectors of `detectors.ts` judge it with no browser,
 * so each of them has a test on a hand-built fixture. `collectMeasurement` is the half that runs in the page; it uses only DOM
 * globals because it is injected as source: `(${collectMeasurement.toString()})(${JSON.stringify(options)})`.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Red, green, blue (0 to 255) and alpha (0 to 1). */
export type Rgba = [number, number, number, number];

export interface ElementMeasure {
  /** A short path that names the element in a report: up to three tags with id, aria-label and data attributes. */
  name: string;
  /** The index of the nearest measured ancestor, or null. */
  parent: number | null;
  rect: Rect;
  scroll: { width: number; height: number };
  client: { width: number; height: number };
  overflowX: string;
  overflowY: string;
  textOverflow: string;
  /** `-webkit-line-clamp` is set. */
  lineClamp: boolean;
  /** The text of the element's own text nodes, spaces collapsed, at most 200 characters. */
  text: string;
  /** The whole text can be read another way: a title, an aria-label, aria-describedby or a tooltip on the element or an ancestor. */
  readable: boolean;
  /** The text colour with the opacity of the element and its ancestors applied, or null when there is no text. */
  color: Rgba | null;
  /** What the text is drawn on, ancestors composited; null when one of them is an image or a gradient. */
  background: Rgba | null;
  fontSize: number;
  fontWeight: number;
  /** A button, link, field, tab, menu item or any element with an interactive role. */
  control: boolean;
  disabled: boolean;
  /** For a control that Tab reaches: true when focusing it changes how it looks, false when not, null when not checked. */
  focusRing: boolean | null;
  /** Inside an ancestor that scrolls: being partly out of view there is by design. */
  inScroller: boolean;
  /**
   * Why a person cannot reach the element on screen, or null when they can: `covered` when another element (a modal, an
   * overlay, a scroller's edge) is on top at every point sampled in its visible part, `inert` when it is inside an `inert` or
   * `aria-hidden="true"` subtree. An element wholly outside the window is not covered: it is offscreen.
   */
  blocked: 'covered' | 'inert' | null;
}

export interface Measurement {
  viewport: { width: number; height: number };
  locale: 'en' | 'es';
  elements: ElementMeasure[];
  /** The lines of `textFit.findTextOutOfBox` for the same page: clip, spill, word, control and scroll. */
  textOutOfBox: string[];
  /**
   * The 3D view, when the capture shows it: the canvas, and the box the opening camera draws the whole scene in. Null when the
   * capture has no 3D view, `unmeasured` when it has one but the page does not say where the scene is drawn.
   */
  scene: { canvas: Rect; bounds: Rect } | null | 'unmeasured';
}

export interface CollectOptions {
  locale: 'en' | 'es';
  /** Run the focus pass: every control Tab reaches is focused in turn, then the focus is put back. */
  focus: boolean;
}

/** Runs in the page. Returns everything of `Measurement` except `textOutOfBox`, which the runner adds from `textFit`. */
export function collectMeasurement(options: CollectOptions): Omit<Measurement, 'textOutOfBox'> {
  const SKIP = '.monaco-editor, .react-flow, svg, canvas, script, style, noscript, template, option, optgroup';
  const CONTROL =
    'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], ' +
    '[role="menuitemradio"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [role="treeitem"], [role="link"], ' +
    '[role="slider"], [role="combobox"], [tabindex]:not([tabindex="-1"])';
  const round = (value: number) => Math.round(value * 100) / 100;
  const styles = new Map<Element, CSSStyleDeclaration>();
  const style = (element: Element): CSSStyleDeclaration => {
    let found = styles.get(element);
    if (!found) styles.set(element, (found = getComputedStyle(element)));
    return found;
  };
  const name = (element: Element): string => {
    const parts: string[] = [];
    for (let at: Element | null = element; at && at !== document.body && parts.length < 3; at = at.parentElement) {
      let part = at.tagName.toLowerCase() + (at.id ? `#${at.id}` : '');
      const label = at.getAttribute('aria-label');
      if (label) part += `[aria-label="${label.slice(0, 40)}"]`;
      for (const attribute of at.attributes)
        if (attribute.name.startsWith('data-') && !attribute.name.startsWith('data-radix') && attribute.name !== 'data-state')
          part += `[${attribute.name}]`;
      parts.unshift(part);
    }
    return parts.join(' > ');
  };

  // colour, the way domAudit.ts reads it: any notation the browser gives is rasterised into sRGB on a one-pixel canvas
  type Colour = [number, number, number, number];
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const pen = canvas.getContext('2d', { willReadFrequently: true });
  const parse = (value: string): Colour | null => {
    const legacy = /^rgba?\(([^)]+)\)$/.exec(value);
    if (legacy) {
      const p = legacy[1]!
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return p.some(Number.isNaN) ? null : [p[0]!, p[1]!, p[2]!, p.length > 3 ? p[3]! : 1];
    }
    if (!pen || value === '' || value === 'none') return null;
    pen.clearRect(0, 0, 1, 1);
    pen.fillStyle = '#010203';
    pen.fillStyle = value;
    pen.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pen.getImageData(0, 0, 1, 1).data as unknown as Colour;
    return a === 0 ? [0, 0, 0, 0] : [Math.min(255, (r * 255) / a), Math.min(255, (g * 255) / a), Math.min(255, (b * 255) / a), a / 255];
  };
  const over = (top: Colour, bottom: Colour): Colour => {
    const a = top[3] + bottom[3] * (1 - top[3]);
    const mix = (i: 0 | 1 | 2) => (a === 0 ? 0 : (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a);
    return [mix(0), mix(1), mix(2), a];
  };
  const backdrop = (element: Element): Colour | null => {
    const layers: Colour[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const s = style(node);
      if (s.backgroundImage !== 'none') return null;
      const colour = parse(s.backgroundColor);
      if (colour && colour[3] > 0) {
        layers.push(colour);
        if (colour[3] >= 1) break;
      }
    }
    return layers.reduceRight<Colour>((below, layer) => over(layer, below), [255, 255, 255, 1]);
  };
  const opacityOf = (element: Element): number => {
    let value = 1;
    for (let node: Element | null = element; node; node = node.parentElement) value *= Number(style(node).opacity);
    return value;
  };
  const roundColour = (colour: Colour | null): Colour | null =>
    colour ? [Math.round(colour[0]), Math.round(colour[1]), Math.round(colour[2]), round(colour[3])] : null;

  const shown = (element: Element): boolean => {
    const box = element.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) return false;
    const s = style(element);
    if (s.visibility !== 'visible' || s.display === 'none') return false;
    return opacityOf(element) > 0;
  };
  const ownText = (element: Element): string =>
    [...element.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
  const scrolls = (value: string) => value === 'auto' || value === 'scroll';
  const readable = (element: Element): boolean => {
    for (let at: Element | null = element; at && at !== document.body; at = at.parentElement)
      if (at.hasAttribute('title') || at.hasAttribute('aria-describedby') || at.hasAttribute('data-tooltip')) return true;
    const label = element.getAttribute('aria-label');
    return label !== null && label.length >= ownText(element).length;
  };

  /** Why a person cannot reach the element: inert, or covered at every sampled point of the part inside the window. */
  const blocked = (element: Element, box: DOMRect): ElementMeasure['blocked'] => {
    if (element.closest('[inert], [aria-hidden="true"]')) return 'inert';
    const left = Math.max(box.left, 0);
    const right = Math.min(box.right, innerWidth);
    const top = Math.max(box.top, 0);
    const bottom = Math.min(box.bottom, innerHeight);
    if (right - left < 1 || bottom - top < 1) return null; // wholly outside the window: the offscreen detector judges it
    // an element that lets the pointer through (pointer-events: none) is hit as the ancestor under it
    const through = style(element).pointerEvents === 'none';
    for (const [fx, fy] of [
      [0.5, 0.5],
      [0.2, 0.2],
      [0.8, 0.2],
      [0.2, 0.8],
      [0.8, 0.8],
    ] as const) {
      const hit = document.elementFromPoint(left + (right - left) * fx, top + (bottom - top) * fy);
      if (hit && (hit === element || element.contains(hit) || (through && hit.contains(element)))) return null;
    }
    return 'covered';
  };

  const measured: Element[] = [];
  const index = new Map<Element, number>();
  const elements: ElementMeasure[] = [];
  for (const element of document.body.querySelectorAll('*')) {
    if (element.closest(SKIP) || !shown(element)) continue;
    const s = style(element);
    const text = ownText(element);
    const control = element.matches(CONTROL);
    if (!text && !control && s.overflowX === 'visible' && s.overflowY === 'visible') continue;
    let parent: number | null = null;
    let inScroller = false;
    for (let at = element.parentElement; at && at !== document.documentElement; at = at.parentElement) {
      if (parent === null && index.has(at)) parent = index.get(at)!;
      const its = style(at);
      if (scrolls(its.overflowX) || scrolls(its.overflowY)) inScroller = true;
    }
    const box = element.getBoundingClientRect();
    const colour = text ? parse(s.color) : null;
    index.set(element, elements.length);
    measured.push(element);
    elements.push({
      name: name(element),
      parent,
      rect: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) },
      scroll: { width: element.scrollWidth, height: element.scrollHeight },
      client: { width: element.clientWidth, height: element.clientHeight },
      overflowX: s.overflowX,
      overflowY: s.overflowY,
      textOverflow: s.textOverflow,
      lineClamp: (s.getPropertyValue('-webkit-line-clamp') || 'none') !== 'none',
      text,
      readable: readable(element),
      color: colour ? roundColour([colour[0], colour[1], colour[2], colour[3] * opacityOf(element)]) : null,
      background: text ? roundColour(backdrop(element)) : null,
      fontSize: Number.parseFloat(s.fontSize),
      fontWeight: Number(s.fontWeight) || 400,
      control,
      disabled: element.closest('[disabled], [aria-disabled="true"], fieldset:disabled') !== null,
      focusRing: null,
      inScroller,
      blocked: blocked(element, box),
    });
  }

  if (options.focus) {
    const before = document.activeElement as HTMLElement | null;
    const look = (element: Element) => {
      const s = getComputedStyle(element);
      return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.textDecorationLine].join(
        '|',
      );
    };
    measured.forEach((element, at) => {
      const entry = elements[at]!;
      if (!entry.control || entry.disabled || !(element instanceof HTMLElement) || element.tabIndex < 0) return;
      const resting = look(element);
      element.focus({ preventScroll: true });
      if (document.activeElement !== element || !element.matches(':focus-visible')) return;
      entry.focusRing = look(element) !== resting;
    });
    if (before && typeof before.focus === 'function') before.focus({ preventScroll: true });
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  // ponytail: the 3D view does not say where it draws the scene yet; a product hook (a data attribute with the projected box)
  // turns `unmeasured` into the measure the framing detector judges.
  const plant = document.querySelector('[data-plant-canvas]');
  let scene: Measurement['scene'] = null;
  if (plant && shown(plant)) {
    const bounds = plant.getAttribute('data-plant-scene-bounds');
    const box = plant.getBoundingClientRect();
    const parsed = bounds ? (JSON.parse(bounds) as Rect) : null;
    scene = parsed
      ? { canvas: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) }, bounds: parsed }
      : 'unmeasured';
  }

  return { viewport: { width: innerWidth, height: innerHeight }, locale: options.locale, elements, scene };
}
