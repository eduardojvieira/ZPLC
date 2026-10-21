// The docs site has full-text search, offline, in English and in Spanish (DOC-018). The index is built by the site build
// from the pages themselves, so nothing is sent to a service. The pure check lives in check-docs-search.ts and runs after
// `bun run docs:build` in `bun run check:docs`; here its rules are tested on fixtures, and the configuration of this repository is held to
// them.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';

import { searchBuildProblems, searchConfigProblems } from './check-docs-search';

const ROOT = new URL('../../', import.meta.url).pathname;
const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});

function site(files: Record<string, string>): string {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'search-'));
  made.push(dir);
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

const index = (terms: string) => JSON.stringify([{ documents: [{ i: 1, t: 'Page', u: '/docs/x/', b: [] }], index: { terms } }]);

describe('docs site: full-text search, offline, in English and Spanish (DOC-018)', () => {
  it('asks the search theme for both languages of the site and no external service', async () => {
    const { default: config } = (await import(join(ROOT, 'docs/docusaurus.config.js'))) as { default: Record<string, unknown> };
    expect(searchConfigProblems(config)).toEqual([]);
  });

  it('fails a configuration without the theme, with one language, or with a hosted search', () => {
    expect(searchConfigProblems({ themes: [] })).toEqual([expect.stringContaining('search theme')]);
    expect(searchConfigProblems({ themes: [['@easyops-cn/docusaurus-search-local', { language: ['en'] }]] })).toEqual([
      expect.stringContaining('"es"'),
    ]);
    expect(
      searchConfigProblems({
        themes: [['@easyops-cn/docusaurus-search-local', { language: ['en', 'es'] }]],
        themeConfig: { algolia: { appId: 'x' } },
      }),
    ).toEqual([expect.stringContaining('hosted search')]);
  });

  it('accepts a build that has an index for each locale, and names the locale whose index is missing or empty', () => {
    const ok = site({ 'search-index.json': index('a'), 'es/search-index.json': index('b') });
    expect(searchBuildProblems(ok, ['en', 'es'])).toEqual([]);
    const noEs = site({ 'search-index.json': index('a') });
    expect(searchBuildProblems(noEs, ['en', 'es'])).toEqual([expect.stringContaining('es: no search index')]);
    const empty = site({ 'search-index.json': index('a'), 'es/search-index.json': '[]' });
    expect(searchBuildProblems(empty, ['en', 'es'])).toEqual([expect.stringContaining('es: the search index has no document')]);
  });

  it('reads a hashed index file name too', () => {
    const hashed = site({ 'search-index-ab12cd34.json': index('a'), 'es/search-index-ef56ab78.json': index('b') });
    expect(searchBuildProblems(hashed, ['en', 'es'])).toEqual([]);
  });
});
