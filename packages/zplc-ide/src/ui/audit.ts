/**
 * A structural accessibility audit of rendered markup (UX-024, UX-026), for the kit and its gallery. It reads the HTML
 * that `renderToStaticMarkup` produces and reports what can be decided from structure alone: a control with no accessible
 * name, a duplicate id, an `aria-labelledby`, `aria-describedby` or `for` that points at nothing, a positive tabindex,
 * an unnamed landmark or dialog. It is not a rendered-DOM audit such as axe-core (no DOM environment is installed): it
 * does not compute colour contrast (the token CI does) or focus order.
 *
 * ponytail: a tokenizer for the well-formed markup React renders, not an HTML parser; entities beyond the five
 * basic ones are left as written. A real DOM environment (VF-007) replaces it.
 */
export interface MarkupElement {
  tag: string;
  attrs: Record<string, string>;
  children: Array<MarkupElement | string>;
  parent: MarkupElement | null;
}

const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source', 'col', 'area', 'base', 'wbr', 'embed']);

const decode = (text: string): string =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

export function parseMarkup(html: string): MarkupElement {
  const root: MarkupElement = { tag: '#root', attrs: {}, children: [], parent: null };
  let current = root;
  const token = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  for (const match of html.matchAll(token)) {
    const [whole, closing, tag, rawAttrs, selfClosing, text] = match;
    if (whole.startsWith('<!--')) continue;
    if (text !== undefined) {
      current.children.push(decode(text));
      continue;
    }
    if (closing) {
      for (let node: MarkupElement | null = current; node; node = node.parent) {
        if (node.tag === tag.toLowerCase()) {
          current = node.parent ?? root;
          break;
        }
      }
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const [, name, quoted, single, bare] of (rawAttrs ?? '').matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[name.toLowerCase()] = decode(quoted ?? single ?? bare ?? '');
    }
    const element: MarkupElement = { tag: tag.toLowerCase(), attrs, children: [], parent: current };
    current.children.push(element);
    if (!VOID.has(element.tag) && !selfClosing) current = element;
  }
  return root;
}

function* walk(node: MarkupElement): Generator<MarkupElement> {
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    yield child;
    yield* walk(child);
  }
}

/** The text a node holds, left out where it is hidden from assistive technology. */
export function textOf(node: MarkupElement | string): string {
  if (typeof node === 'string') return node;
  if (node.attrs['aria-hidden'] === 'true') return '';
  if (node.attrs['aria-label'] !== undefined && node.tag !== 'button' && node.tag !== 'a') return node.attrs['aria-label'];
  return node.children.map(textOf).join('');
}

const NAMED_BY_CONTENT = new Set(['button', 'a', 'summary']);
const FORM_CONTROLS = new Set(['input', 'select', 'textarea']);
const ROLES_NEEDING_NAME = new Set([
  'button',
  'tab',
  'menuitem',
  'switch',
  'checkbox',
  'radio',
  'combobox',
  'textbox',
  'slider',
  'tablist',
  'menu',
  'dialog',
  'alertdialog',
  'group',
  'toolbar',
  'tree',
  'grid',
]);
const ROLES_NAMED_BY_CONTENT = new Set(['button', 'tab', 'menuitem', 'switch', 'checkbox', 'radio']);

export interface AuditProblem {
  rule: string;
  element: string;
  message: string;
}

const describe = (element: MarkupElement): string => {
  const id = element.attrs.id ? `#${element.attrs.id}` : '';
  const role = element.attrs.role ? `[role=${element.attrs.role}]` : '';
  return `<${element.tag}${id}${role}>`;
};

export function auditMarkup(html: string): AuditProblem[] {
  const root = parseMarkup(html);
  const elements = [...walk(root)];
  const problems: AuditProblem[] = [];
  const byId = new Map<string, MarkupElement>();
  for (const element of elements) {
    const id = element.attrs.id;
    if (id === undefined) continue;
    if (byId.has(id)) problems.push({ rule: 'duplicate-id', element: describe(element), message: `The id "${id}" is used twice.` });
    byId.set(id, element);
  }
  const labelFor = (element: MarkupElement): string => {
    const id = element.attrs.id;
    const explicit = id === undefined ? [] : elements.filter((candidate) => candidate.tag === 'label' && candidate.attrs.for === id);
    let wrapper: MarkupElement | null = element.parent;
    while (wrapper && wrapper.tag !== 'label') wrapper = wrapper.parent;
    return [...explicit, ...(wrapper ? [wrapper] : [])].map(textOf).join(' ').trim();
  };
  const nameOf = (element: MarkupElement): string => {
    const labelledby = element.attrs['aria-labelledby'];
    if (labelledby !== undefined) {
      const referenced = labelledby
        .split(/\s+/)
        .map((id) => byId.get(id))
        .filter((node): node is MarkupElement => node !== undefined);
      const text = referenced.map(textOf).join(' ').trim();
      if (text !== '') return text;
    }
    if (element.attrs['aria-label']?.trim()) return element.attrs['aria-label'].trim();
    if (FORM_CONTROLS.has(element.tag)) {
      const label = labelFor(element);
      if (label !== '') return label;
    }
    const role = element.attrs.role;
    if (NAMED_BY_CONTENT.has(element.tag) || (role !== undefined && ROLES_NAMED_BY_CONTENT.has(role)) || element.tag === 'label') {
      const text = element.children.map(textOf).join('').trim();
      if (text !== '') return text;
    }
    return '';
  };

  for (const element of elements) {
    const type = element.attrs.type;
    const hidden = element.tag === 'input' && type === 'hidden';
    const isControl =
      (FORM_CONTROLS.has(element.tag) && !hidden) || element.tag === 'button' || (element.tag === 'a' && element.attrs.href !== undefined);
    const role = element.attrs.role;
    const needsName = isControl || (role !== undefined && ROLES_NEEDING_NAME.has(role));
    if (needsName && element.attrs['aria-hidden'] !== 'true' && nameOf(element) === '') {
      problems.push({
        rule: 'control-without-name',
        element: describe(element),
        message: 'A control, tab, menu, group or dialog must have an accessible name (a label, aria-label or aria-labelledby).',
      });
    }
    for (const attribute of ['aria-labelledby', 'aria-describedby'] as const) {
      for (const id of (element.attrs[attribute] ?? '').split(/\s+/).filter(Boolean)) {
        if (!byId.has(id))
          problems.push({
            rule: 'dangling-reference',
            element: describe(element),
            message: `${attribute} points at "${id}", which is not in the document.`,
          });
      }
    }
    if (element.tag === 'label' && element.attrs.for !== undefined && !byId.has(element.attrs.for)) {
      problems.push({
        rule: 'dangling-reference',
        element: describe(element),
        message: `The label is for "${element.attrs.for}", which is not in the document.`,
      });
    }
    const tabindex = element.attrs.tabindex;
    if (tabindex !== undefined && Number.parseInt(tabindex, 10) > 0)
      problems.push({
        rule: 'positive-tabindex',
        element: describe(element),
        message: 'A positive tabindex breaks the natural focus order.',
      });
    if (element.attrs.title !== undefined && element.tag !== 'svg')
      problems.push({
        rule: 'title-attribute',
        element: describe(element),
        message: 'A title attribute is not an accessible tooltip; use the kit Tooltip (UX-002).',
      });
  }
  return problems;
}
