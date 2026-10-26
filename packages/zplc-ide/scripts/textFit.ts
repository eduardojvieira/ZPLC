/**
 * Text that does not fit its box, found in the rendered page of a journey. The function runs in the page:
 * `app.eval(`(${findTextOutOfBox.toString()})(${JSON.stringify(scrollStrips)})`)`, so it uses only DOM globals.
 *
 * It reports, one line each:
 * - clip: text cut by an ancestor that hides its overflow, without an ellipsis on the text's own box;
 * - spill: text that runs out of its box, or out of an ancestor's box, into whatever is next to it;
 * - word: a word broken across two lines because its box is narrower than the word;
 * - control: a select, or a field's value or placeholder, wider than the control shows;
 * - scroll: a container that scrolls sideways, other than the deliberate scroll strips named by `scrollStrips` (selectors).
 *
 * Code editors and diagram canvases (Monaco, React Flow, SVG) are left out: they scroll and clip by design. Text that is
 * only for assistive technology, inside a closed <details>, or fully transparent is not shown, so it is not checked.
 */
export function findTextOutOfBox(scrollStrips: string[]): string[] {
  const SKIP = '.monaco-editor, .react-flow, svg, canvas, script, style, noscript, template, option, optgroup';
  const TOLERANCE = 1.5;
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
  const inner = (element: Element) => {
    const box = element.getBoundingClientRect();
    const own = style(element);
    return {
      left: box.left + parseFloat(own.borderLeftWidth),
      right: box.right - parseFloat(own.borderRightWidth),
    };
  };
  const hidden = (element: Element): boolean => {
    for (let at: Element | null = element; at && at !== document.documentElement; at = at.parentElement) {
      const own = style(at);
      if (parseFloat(own.opacity) === 0) return true;
      if (own.clipPath.includes('inset(50%)') || (own.clip && own.clip !== 'auto')) return true;
      const box = at.getBoundingClientRect();
      if (box.width <= 1.5 && box.height <= 1.5 && own.overflow !== 'visible') return true;
    }
    return false;
  };
  const scrolls = (value: string) => value === 'auto' || value === 'scroll';
  // The ancestors that clip a box, following containing blocks: an absolute or fixed box escapes the static ones.
  const clippers = (box: Element): Element[] => {
    const found: Element[] = [];
    const own = style(box);
    if (own.overflowX !== 'visible') found.push(box);
    let position = own.position;
    for (let at = box.parentElement; at && at !== document.documentElement; at = at.parentElement) {
      const its = style(at);
      const contains = /paint|layout|strict|content/.test(its.contain) || its.transform !== 'none' || its.filter !== 'none';
      const block = position === 'absolute' ? its.position !== 'static' || contains : position === 'fixed' ? contains : true;
      if (!block) continue;
      if (its.overflowX !== 'visible') found.push(at);
      position = its.position;
    }
    return found;
  };

  const problems: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    const parent = node.parentElement;
    if (!text || !parent || parent.closest(SKIP)) continue;
    const closed = parent.closest('details:not([open])');
    if (closed && parent.closest('summary')?.parentElement !== closed) continue;
    if (style(parent).visibility !== 'visible' || hidden(parent)) continue;
    range.selectNodeContents(node);
    const lines = [...range.getClientRects()].filter((line) => line.width > 0.5 && line.height > 0.5);
    if (lines.length === 0) continue;
    const left = Math.min(...lines.map((line) => line.left));
    const right = Math.max(...lines.map((line) => line.right));
    let box: Element | null = parent;
    while (box && ['inline', 'contents'].includes(style(box).display)) box = box.parentElement;
    if (!box) continue;
    const quoted = JSON.stringify(text.slice(0, 60));

    // The visible part of the text, after every clipper and the window.
    let shown = { left: Math.max(left, 0), right: Math.min(right, innerWidth) };
    let cutBy: Element | undefined;
    let cutByScroll = false;
    for (const clipper of clippers(box)) {
      const edge = inner(clipper);
      const before = shown;
      shown = { left: Math.max(shown.left, edge.left), right: Math.min(shown.right, edge.right) };
      if (!cutBy && (shown.left > before.left + TOLERANCE || shown.right < before.right - TOLERANCE)) {
        cutBy = clipper;
        cutByScroll = scrolls(style(clipper).overflowX);
      }
    }
    if (shown.right - shown.left <= 0) continue; // scrolled away or behind a closed region
    const ellipsis = style(box).textOverflow === 'ellipsis' && style(box).overflowX !== 'visible';
    if (right - left - (shown.right - shown.left) > TOLERANCE && !cutByScroll && !(ellipsis && cutBy === box))
      problems.push(`clip: ${quoted} in ${name(box)}, cut by ${cutBy ? name(cutBy) : 'the window'}`);

    // Spill: the shown text leaves its box, or an ancestor's box up to the first one that clips or is positioned.
    for (let at: Element | null = box; at && at !== document.body; at = at.parentElement) {
      const its = style(at);
      if (['inline', 'contents'].includes(its.display)) continue;
      const edge = inner(at);
      const out = Math.max(shown.right - edge.right, edge.left - shown.left);
      if (its.overflowX === 'visible' && out > TOLERANCE) {
        problems.push(`spill: ${quoted} runs ${Math.round(out)} px out of ${name(at)}`);
        break;
      }
      if (its.overflowX !== 'visible' || its.position === 'absolute' || its.position === 'fixed') break;
    }

    // A word broken across two lines.
    const raw = node.textContent ?? '';
    if (lines.length > 1 && raw.length < 300) {
      const letter = document.createRange();
      let top: number | undefined;
      for (let index = 0; index < raw.length; index++) {
        letter.setStart(node, index);
        letter.setEnd(node, index + 1);
        const glyph = letter.getClientRects()[0];
        if (!glyph) continue;
        if (
          top !== undefined &&
          glyph.top > top + glyph.height / 2 &&
          /[\p{L}\p{N}]/u.test(raw[index]!) &&
          /[\p{L}\p{N}]/u.test(raw[index - 1] ?? '')
        ) {
          problems.push(
            `word: ${quoted} breaks at "${raw.slice(Math.max(0, index - 10), index)}|${raw.slice(index, index + 10)}" in ${name(box)}`,
          );
          break;
        }
        top = glyph.top;
      }
    }
  }

  // Form controls whose shown text is wider than the control shows.
  const measure = document.createElement('canvas').getContext('2d')!;
  for (const control of document.querySelectorAll<HTMLSelectElement | HTMLInputElement>('select, input')) {
    if (control.closest(SKIP) || hidden(control) || control.getClientRects().length === 0) continue;
    if (control instanceof HTMLInputElement && !['text', 'search', 'number', 'email', 'url', 'tel', ''].includes(control.type)) continue;
    const own = style(control);
    if (own.visibility !== 'visible') continue;
    const arrow = control instanceof HTMLSelectElement && own.appearance !== 'none' ? 20 : 0;
    const room = control.clientWidth - parseFloat(own.paddingLeft) - parseFloat(own.paddingRight) - arrow;
    const shown = control instanceof HTMLSelectElement ? (control.selectedOptions[0]?.text ?? '') : control.value || control.placeholder;
    if (!shown) continue;
    measure.font = `${own.fontStyle} ${own.fontWeight} ${own.fontSize} ${own.fontFamily}`;
    const width = measure.measureText(shown).width;
    if (width > room + 1)
      problems.push(
        `control: ${JSON.stringify(shown.slice(0, 60))} needs ${Math.round(width)} px in ${Math.round(room)} px of ${name(control)}`,
      );
  }

  // Containers that scroll sideways: one pixel is enough for the window to draw a scrollbar.
  for (const element of document.querySelectorAll('body *')) {
    if (element.closest(SKIP) || !scrolls(style(element).overflowX)) continue;
    if (element.clientWidth === 0 || element.scrollWidth <= element.clientWidth || style(element).visibility !== 'visible') continue;
    if (scrollStrips.some((strip) => element.matches(strip))) continue;
    problems.push(`scroll: ${name(element)} is ${element.scrollWidth} px wide in ${element.clientWidth} px`);
  }
  return [...new Set(problems)];
}
