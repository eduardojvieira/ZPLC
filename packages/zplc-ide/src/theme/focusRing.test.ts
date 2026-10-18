import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio } from './color';
import { THEME_IDS, resolveTokens } from './tokens';
import { renderTokensCss } from './tokensCss';

const raw = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const SURFACES = ['--color-surface-900', '--color-surface-800', '--color-surface-700'] as const;

/** Innermost `selector { body }` pairs, whether or not they sit inside an @media block. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));

/** UX-005: one focus indicator, defined once, visible in every theme and never removed without a replacement. */
// The title is the name the evidence record of UX-005 holds (tools/ci/requirement-evidence.json); the stopgap it names is lifted.
describe('focus ring (UX-005 stopgap: the visual editors still carry their own classes)', () => {
  it('is defined as three tokens', () => {
    const light = resolveTokens('light');
    expect(light['--focus-ring-color']).toBeDefined();
    expect(light['--focus-ring-width']).toBe('2px');
    expect(light['--focus-ring-offset']).toBe('2px');
  });

  it('is applied by one global :focus-visible rule built from those tokens', () => {
    const outlines = rules.filter(({ selector, body }) => selector.includes(':focus-visible') && /outline/.test(body));
    // one rule; its selector list also names the nodes and edges of the diagrams, whose library style removes the outline
    expect(outlines).toHaveLength(1);
    expect(outlines[0].selector.split(',').map((part) => part.trim())[0]).toBe(':focus-visible');
    expect(outlines[0].body).toMatch(/outline:\s*var\(--focus-ring-width\)\s+solid\s+var\(--focus-ring-color\)/);
    expect(outlines[0].body).toMatch(/outline-offset:\s*var\(--focus-ring-offset\)/);
  });

  it('is never switched off by a rule of the stylesheet', () => {
    expect(css).not.toMatch(/outline(-style)?\s*:\s*(none|0)\b/);
    expect(css).not.toMatch(/@apply[^;]*outline-(none|hidden)/);
  });

  it('keeps no second focus system in the stylesheet', () => {
    const boxShadowFocus = rules.filter(({ selector, body }) => /:focus(-visible)?/.test(selector) && /box-shadow/.test(body));
    expect(boxShadowFocus).toEqual([]);
  });

  it('is thicker in the high-contrast theme and follows the system colour in forced-colors mode', () => {
    expect(resolveTokens('high-contrast')['--focus-ring-width']).toBe('3px');
    expect(renderTokensCss()).toMatch(/@media \(forced-colors: active\) \{\s*:root \{\s*--focus-ring-color:\s*Highlight/);
  });

  for (const theme of THEME_IDS) {
    it(`has at least 3:1 contrast against the canvas, panel and node surfaces of the ${theme} theme`, () => {
      const tokens = resolveTokens(theme);
      for (const surface of SURFACES) expect({ surface, ratio: contrastRatio(tokens['--focus-ring-color'], tokens[surface]) >= 3 }).toEqual({ surface, ratio: true });
    });
  }
});

/** UX-005 (visual editors): a node, an edge and a control of Ladder, FBD and SFC show the same ring as the rest of the shell. */
describe('focus ring in the visual editors (UX-005)', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  const editorsDir = new URL('../editors', import.meta.url).pathname;
  const sources = walk(editorsDir).filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path));
  // a class that removes the ring or draws a second one
  const OWN_FOCUS = /(?<![\w-])(?:outline-none|outline-hidden|(?:focus|focus-visible|focus-within):(?:outline|ring|border|shadow)[\w-]*)(?![\w-])/;

  it('re-applies the shared ring to the nodes and edges that the diagram library switches off', () => {
    const rule = rules.find(({ selector, body }) => selector.includes(':focus-visible') && /outline/.test(body));
    const selectors = rule!.selector.split(',').map((part) => part.trim());
    expect(selectors).toContain('.zplc-visual-editor .react-flow__node.selectable:focus-visible');
    expect(selectors).toContain('.zplc-visual-editor .react-flow__edge:focus-visible');
    expect(rule!.body).toMatch(/outline:\s*var\(--focus-ring-width\)\s+solid\s+var\(--focus-ring-color\)/);
  });

  it('pinned source: no visual-editor source removes the ring or draws a focus style of its own', () => {
    const offenders = sources.filter((path) => OWN_FOCUS.test(readFileSync(path, 'utf8'))).map((path) => path.slice(editorsDir.length + 1));
    expect(offenders).toEqual([]);
  });

  it('keeps no visual-editor source on the list of focus overrides of the kit guard', () => {
    const listed = JSON.parse(readFileSync(new URL('../../../../tools/ci/ui-kit-offenders.json', import.meta.url), 'utf8')) as Array<{ file: string; rule: string }>;
    expect(listed.filter(({ file, rule }) => rule === 'focus-override' && file.includes('/src/editors/'))).toEqual([]);
  });
});
