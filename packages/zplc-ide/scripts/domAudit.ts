/**
 * The rendered-DOM accessibility check of the main screens (UX-024, UX-026), without a dependency. `auditPage` is run in
 * the page of the real application by the journeys (`domAuditExpression` is its source, so it must not use anything outside
 * its own body) and reports what a computed style and the DOM can decide:
 *
 *   contrast         the colour of every visible text against the colour it is drawn on: 4.5:1, or 3:1 for large text
 *   name             an interactive element with no accessible name (label, aria-label, aria-labelledby, its content)
 *   focus            an interactive element that shows nothing when it takes the keyboard focus
 *   duplicate-id     an id used twice
 *   aria-reference   an aria-labelledby, aria-describedby or label `for` that points at nothing
 *   landmark         no main landmark, or two landmarks of one kind that cannot be told apart, or a dialog with no name
 *   hidden-focusable a focusable element inside an aria-hidden subtree
 *
 * It is a structural and computed check. It is not a screen-reader test and it does not replace one: UX-028 is a manual
 * task on Windows and on macOS. The contrast of the code editor tokens and of the visual editors' wires is checked by
 * journey 46, the Monaco subtree is skipped here.
 *
 * ponytail: backgrounds that are an image or a gradient are skipped (reported as `unchecked`), and the focus check trusts
 * the global :focus-visible rule; an axe-core run would replace both, and adding a dependency is a decision for the owner.
 */
export interface DomFinding { rule: string; where: string; detail: string }
export interface DomAuditResult { findings: DomFinding[]; checked: { text: number; interactive: number; focus: number }; unchecked: { background: number; focus: number } }

export function auditPage(): DomAuditResult {
  const findings: DomFinding[] = [];
  const checked = { text: 0, interactive: 0, focus: 0 };
  const unchecked = { background: 0, focus: 0 };
  const style = (element: Element) => getComputedStyle(element);
  const describe = (element: Element): string => {
    const id = element.id ? `#${element.id}` : '';
    const raw = element.getAttribute('class');
    const classes = raw ? `.${raw.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    const label = element.getAttribute('aria-label');
    return `${element.tagName.toLowerCase()}${id}${classes}${label ? `[aria-label="${label.slice(0, 40)}"]` : ''}`;
  };
  const add = (rule: string, element: Element, detail: string): void => { findings.push({ rule, where: describe(element), detail }); };
  const inMonaco = (element: Element): boolean => element.closest('.monaco-editor') !== null;
  const visible = (element: Element): boolean => {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const s = style(element);
    return s.visibility === 'visible' && s.display !== 'none';
  };

  // --- colour -----------------------------------------------------------------------------------------------------
  type Rgba = [number, number, number, number];
  // any other colour notation (color-mix in another space, oklab, lab) is rasterised by the browser into sRGB
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  const pen = canvas.getContext('2d', { willReadFrequently: true });
  const rasterise = (value: string): Rgba | null => {
    if (!pen) return null;
    pen.clearRect(0, 0, 1, 1);
    pen.fillStyle = '#010203';
    pen.fillStyle = value;
    pen.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pen.getImageData(0, 0, 1, 1).data as unknown as [number, number, number, number];
    return a === 0 ? [0, 0, 0, 0] : [Math.min(255, r * 255 / a), Math.min(255, g * 255 / a), Math.min(255, b * 255 / a), a / 255];
  };
  const parse = (value: string): Rgba | null => {
    const legacy = /^rgba?\(([^)]+)\)$/.exec(value);
    if (legacy) { const p = legacy[1]!.split(/[\s,/]+/).filter(Boolean).map(Number); return p.some(Number.isNaN) ? null : [p[0]!, p[1]!, p[2]!, p.length > 3 ? p[3]! : 1]; }
    const modern = /^color\(srgb\s+([^)]+)\)$/.exec(value);
    if (modern) { const p = modern[1]!.split(/[\s/]+/).filter(Boolean).map(Number); return p.some(Number.isNaN) ? null : [p[0]! * 255, p[1]! * 255, p[2]! * 255, p.length > 3 ? p[3]! : 1]; }
    return value === '' || value === 'none' ? null : rasterise(value);
  };
  const over = (top: Rgba, bottom: Rgba): Rgba => {
    const a = top[3] + bottom[3] * (1 - top[3]);
    const mix = (i: 0 | 1 | 2) => a === 0 ? 0 : (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
    return [mix(0), mix(1), mix(2), a];
  };
  /** What the element is drawn on: its ancestors' backgrounds composited, or null when one of them is an image. */
  const backdrop = (element: Element): Rgba | null => {
    const layers: Rgba[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const s = style(node);
      if (s.backgroundImage !== 'none') return null;
      const colour = parse(s.backgroundColor);
      if (colour && colour[3] > 0) { layers.push(colour); if (colour[3] >= 1) break; }
    }
    return layers.reduceRight<Rgba>((below, layer) => over(layer, below), [255, 255, 255, 1]);
  };
  const luminance = (colour: Rgba): number => {
    const channel = (value: number) => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * channel(colour[0]) + 0.7152 * channel(colour[1]) + 0.0722 * channel(colour[2]);
  };
  const ratio = (a: Rgba, b: Rgba): number => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
  const opacityOf = (element: Element): number => { let value = 1; for (let node: Element | null = element; node; node = node.parentElement) value *= Number(style(node).opacity); return value; };

  const hasOwnText = (element: Element): boolean => [...element.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '');
  const inactive = (element: Element): boolean => element.closest('[disabled], [aria-disabled="true"], fieldset:disabled') !== null;
  const everything = [...document.body.querySelectorAll('*')];

  for (const element of everything) {
    if (inMonaco(element) || !visible(element) || inactive(element)) continue;
    const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
    const hasValue = field && (element as HTMLInputElement).value !== '' && (element as HTMLInputElement).type !== 'checkbox' && (element as HTMLInputElement).type !== 'radio' && (element as HTMLInputElement).type !== 'range';
    if (!(hasOwnText(element) || hasValue)) continue;
    const box = element.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) continue; // visually hidden text for assistive technology
    const s = style(element);
    const isSvgText = element.namespaceURI === 'http://www.w3.org/2000/svg';
    const foreground = parse(isSvgText ? s.fill : s.color);
    const background = backdrop(element);
    if (!foreground) continue;
    if (!background) { unchecked.background += 1; continue; }
    checked.text += 1;
    const faded: Rgba = [foreground[0], foreground[1], foreground[2], foreground[3] * opacityOf(element)];
    const seen = over(faded, background);
    const size = Number.parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const needed = large ? 3 : 4.5;
    const got = ratio(seen, background);
    if (got < needed) add('contrast', element, `${got.toFixed(2)}:1 (needs ${needed}) "${(element.textContent ?? (element as HTMLInputElement).value).trim().slice(0, 40)}" ${s.color} on rgb(${background.slice(0, 3).map(Math.round).join(', ')})`);
  }

  // --- names and focus --------------------------------------------------------------------------------------------
  const BY_CONTENT = new Set(['button', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'checkbox', 'radio', 'switch', 'option', 'treeitem', 'link']);
  const text = (element: Element): string => element.getAttribute('aria-hidden') === 'true' ? '' : [...element.childNodes].map((node) => node.nodeType === 3 ? node.textContent ?? '' : node instanceof Element ? (node.getAttribute('aria-label') ?? text(node)) : '').join('');
  const nameOf = (element: Element): string => {
    const labelledby = element.getAttribute('aria-labelledby');
    if (labelledby) {
      const referenced = labelledby.split(/\s+/).map((id) => document.getElementById(id)).filter((node): node is HTMLElement => node !== null).map((node) => text(node).trim()).join(' ').trim();
      if (referenced) return referenced;
    }
    const label = element.getAttribute('aria-label')?.trim();
    if (label) return label;
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const labels = [...(element.labels ?? [])].map((node) => text(node).trim()).join(' ').trim();
      if (labels) return labels;
      if (element instanceof HTMLInputElement && (element.type === 'button' || element.type === 'submit') && element.value) return element.value;
    }
    const role = element.getAttribute('role');
    const tag = element.tagName.toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'summary' || (role !== null && BY_CONTENT.has(role))) { const content = text(element).trim(); if (content) return content; }
    if (tag === 'img') return element.getAttribute('alt')?.trim() ?? '';
    return element.getAttribute('title')?.trim() ?? '';
  };
  const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"]), [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [role="slider"], [role="textbox"], [role="treeitem"], [role="option"]';
  const interactive = [...document.querySelectorAll(INTERACTIVE)].filter((element) => !inMonaco(element) && visible(element));
  const focusRing = (element: Element): boolean => {
    const s = style(element);
    const outline = s.outlineStyle !== 'none' && Number.parseFloat(s.outlineWidth) >= 1 && (parse(s.outlineColor)?.[3] ?? 1) > 0;
    return outline || (s.boxShadow !== 'none' && s.boxShadow !== '');
  };
  for (const element of interactive) {
    checked.interactive += 1;
    if (nameOf(element) === '') add('name', element, 'no accessible name');
    if (inactive(element) || (element as HTMLElement).tabIndex < 0 || typeof (element as HTMLElement).focus !== 'function') continue;
    (element as HTMLElement).focus({ preventScroll: true });
    if (document.activeElement !== element) { unchecked.focus += 1; continue; }
    if (!element.matches(':focus-visible')) { unchecked.focus += 1; continue; }
    checked.focus += 1;
    if (!focusRing(element)) add('focus', element, 'shows nothing when it has the keyboard focus');
  }
  (document.activeElement as HTMLElement | null)?.blur?.();

  // --- structure --------------------------------------------------------------------------------------------------
  const ids = new Map<string, number>();
  for (const element of document.querySelectorAll('[id]')) ids.set(element.id, (ids.get(element.id) ?? 0) + 1);
  for (const [id, count] of ids) if (count > 1 && id !== '') findings.push({ rule: 'duplicate-id', where: `#${id}`, detail: `used ${count} times` });
  for (const element of document.querySelectorAll('[aria-labelledby], [aria-describedby]')) {
    for (const attribute of ['aria-labelledby', 'aria-describedby']) {
      for (const id of (element.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean)) if (!document.getElementById(id)) add('aria-reference', element, `${attribute} points at "${id}"`);
    }
  }
  for (const label of document.querySelectorAll('label[for]')) if (!document.getElementById(label.getAttribute('for') ?? '')) add('aria-reference', label, 'label for points at nothing');
  for (const element of document.querySelectorAll('[aria-hidden="true"]')) {
    for (const inside of element.querySelectorAll(INTERACTIVE)) if (visible(inside) && (inside as HTMLElement).tabIndex >= 0 && !inMonaco(inside)) add('hidden-focusable', inside, 'can take focus inside an aria-hidden subtree');
  }
  const mains = document.querySelectorAll('main, [role="main"]');
  if (mains.length !== 1) findings.push({ rule: 'landmark', where: 'document', detail: `${mains.length} main landmarks, expected 1` });
  const kinds = new Map<string, Element[]>();
  for (const element of document.querySelectorAll('nav, aside, header, footer, section[aria-label], section[aria-labelledby], form[aria-label], [role="navigation"], [role="complementary"], [role="banner"], [role="contentinfo"], [role="region"], [role="search"]')) {
    if (!visible(element)) continue;
    const kind = element.getAttribute('role') ?? element.tagName.toLowerCase();
    kinds.set(kind, [...(kinds.get(kind) ?? []), element]);
  }
  for (const [kind, elements] of kinds) {
    if (elements.length < 2) continue;
    const named = elements.map((element) => nameOf(element) || (element.getAttribute('aria-label') ?? ''));
    named.forEach((name, index) => { if (name === '' || named.indexOf(name) !== index) add('landmark', elements[index]!, `${elements.length} ${kind} landmarks that cannot be told apart by name`); });
  }
  for (const dialog of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) if (visible(dialog) && nameOf(dialog) === '') add('landmark', dialog, 'a dialog with no accessible name');
  for (const tab of document.querySelectorAll('[role="tab"]')) if (visible(tab) && !tab.closest('[role="tablist"]')) add('landmark', tab, 'a tab outside a tab list');
  return { findings, checked, unchecked };
}

/** The source of the audit as an expression the page evaluates. */
export const domAuditExpression = `(${auditPage.toString()})()`;
