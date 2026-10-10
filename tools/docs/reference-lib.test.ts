import { describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { code, fence, markerBegin, markerEnd, prose, renderPage, staleOutputs, table, type ReferencePage } from './reference-lib';

const PAGE: ReferencePage = {
  path: 'reference/x.md',
  title: { en: 'X reference', es: 'Referencia de X' },
  label: { en: 'X', es: 'X' },
  description: { en: 'A page.', es: 'Una página.' },
  body: () => 'Body text.',
};

describe('generated reference pages: the markup is safe for the site (DOC-008)', () => {
  it('escapes what MDX would read as markup, outside code spans only', () => {
    expect(prose('a < b and {c} | d')).toBe('a &lt; b and &#123;c&#125; \\| d');
    expect(prose('write `a < b` here')).toBe('write `a < b` here');
  });

  it('keeps a pipe of a code span inside its table cell', () => {
    expect(code('A | B')).toBe('`A \\| B`');
    expect(code('a`b')).toBe('``a`b``');
  });

  it('refuses a table row of the wrong width', () => {
    expect(() => table(['A', 'B'], [['1']])).toThrow(/1 cells, the head has 2/);
    expect(table(['A', 'B'], [['1', '2']])).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });

  it('writes a fence whose info string is the one given', () => {
    expect(fence('pascal runnable expect="A=1"', 'x := 1;\n')).toBe('```pascal runnable expect="A=1"\nx := 1;\n```');
  });
});

describe('generated reference pages: the page as a whole (DOC-008)', () => {
  it('carries the GENERATED markers, a title in each language and ends with a complete sentence', () => {
    for (const lang of ['en', 'es'] as const) {
      const text = renderPage('tools/docs/generate_x.ts', PAGE, lang);
      expect(text).toContain(markerBegin('tools/docs/generate_x.ts', 'reference/x'));
      expect(text).toContain(markerEnd('reference/x'));
      expect(text).toContain(`# ${PAGE.title[lang]}`);
      expect(text.trimEnd().endsWith('.')).toBe(true);
    }
  });

  it('reports a missing page and a stale page, and nothing for a fresh one', () => {
    const root = mkdtempSync(join(tmpdir(), 'zplc-reflib-'));
    mkdirSync(join(root, 'docs/docs/reference'), { recursive: true });
    const file = 'docs/docs/reference/x.md';
    const content = renderPage('g', PAGE, 'en');
    expect(staleOutputs([{ file, content }], root)).toEqual([`missing generated page: ${file}`]);
    writeFileSync(join(root, file), `${content}edited\n`);
    expect(staleOutputs([{ file, content }], root)).toEqual([`stale generated page: ${file}`]);
    writeFileSync(join(root, file), content);
    expect(staleOutputs([{ file, content }], root)).toEqual([]);
  });
});
