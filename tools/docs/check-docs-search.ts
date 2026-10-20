// The docs site has offline full-text search in every locale (DOC-018).
//
//   bun tools/docs/check-docs-search.ts     after `bun run docs:build`: the build holds a search index for English and Spanish
//
// The index is written by the site build from the pages, with no service and no account: the check reads the build output.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SEARCH_THEME = '@easyops-cn/docusaurus-search-local';
const ROOT = new URL('../../', import.meta.url).pathname;
const BUILD = join(ROOT, 'docs/build');
/** The locale the site publishes at the root has its index there; the other locales have it under their code. */
const DEFAULT_LOCALE = 'en';

export function searchConfigProblems(config: Record<string, unknown>): string[] {
  const found: string[] = [];
  const themes = (config.themes as unknown[] | undefined) ?? [];
  const entry = themes.find((theme) => (Array.isArray(theme) ? theme[0] : theme) === SEARCH_THEME);
  if (entry === undefined) return [`docusaurus.config.js does not list the search theme ${SEARCH_THEME}`];
  const options = (Array.isArray(entry) ? entry[1] : {}) as { language?: string[] };
  for (const locale of ['en', 'es']) if (!options.language?.includes(locale)) found.push(`the search theme does not index "${locale}"`);
  const themeConfig = (config.themeConfig ?? {}) as Record<string, unknown>;
  if (themeConfig.algolia !== undefined) found.push('themeConfig.algolia is set: the search must stay local, a hosted search sends the queries to a service');
  return found;
}

export function searchBuildProblems(buildDir: string, locales: string[]): string[] {
  const found: string[] = [];
  for (const locale of locales) {
    const dir = locale === DEFAULT_LOCALE ? buildDir : join(buildDir, locale);
    const file = existsSync(dir) ? readdirSync(dir).find((name) => /^search-index(?:-[0-9a-f]+)?\.json$/.test(name)) : undefined;
    if (file === undefined) { found.push(`${locale}: no search index in ${dir}`); continue; }
    const parts = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { documents?: unknown[] }[];
    if (!parts.some((part) => (part.documents?.length ?? 0) > 0)) found.push(`${locale}: the search index has no document (${file})`);
  }
  return found;
}

if (import.meta.main) {
  const { default: config } = await import(join(ROOT, 'docs/docusaurus.config.js')) as { default: Record<string, unknown> };
  const found = [...searchConfigProblems(config), ...searchBuildProblems(BUILD, ['en', 'es'])];
  if (found.length > 0) {
    console.error(found.map((message) => `docs search: ${message}`).join('\n'));
    process.exit(1);
  }
  console.log('docs search: an offline search index is built for en and es');
}
