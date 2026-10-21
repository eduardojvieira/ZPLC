// Shared parts of the generated reference pages (DOC-006, DOC-007, DOC-008).
//
// A generated page is written whole, in English and in Spanish, from a source the repository already owns (the compiler
// registry, the conformance matrix, the Kconfig files...). Every page carries the GENERATED markers of
// tools/docs/generate_known_limits.py, so a reader and a reviewer see at once that an edit belongs in the source.
//
// Each generator is a small script over this library:
//
//   bun tools/docs/generate_<family>.ts           write the pages
//   bun tools/docs/generate_<family>.ts --check   exit 1 when a page is missing or stale, or when a source has no entry
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export type Lang = 'en' | 'es';
export type L10n = Record<Lang, string>;
export const LANGS: readonly Lang[] = ['en', 'es'];

export const ROOT = new URL('../../', import.meta.url).pathname;
export const LANG_DIR: Record<Lang, string> = {
  en: 'docs/docs',
  es: 'docs/i18n/es/docusaurus-plugin-content-docs/current',
};

export interface ReferencePage {
  /** Path below the language directory, for example `reference/functions.md`. */
  path: string;
  title: L10n;
  /** Short title of the sidebar. */
  label: L10n;
  description: L10n;
  /** The page without its title: sections, tables and samples. */
  body: (lang: Lang) => string;
}

const FENCE = '`'.repeat(3);

/** A fenced block. `info` is the text after the opening fence, `st runnable expect="A=1"` for example. */
export function fence(info: string, source: string): string {
  return [`${FENCE}${info}`.trimEnd(), source.replace(/\n+$/, ''), FENCE].join('\n');
}

/** A code span that survives a table cell: no markup is read inside it and a pipe does not end the cell. */
export function code(text: string): string {
  const quote = text.includes('`') ? '``' : '`';
  return `${quote}${text.replace(/\|/g, '\\|')}${quote}`;
}

/**
 * A sentence for the page: the characters that the site would read as markup or as a JSX expression (`<`, `{`, `}`),
 * a pipe, and a colon that starts a directive (`addr:len`), are escaped outside code spans. A text that was written for the site's own
 * syntax never goes through this.
 */
export function prose(text: string): string {
  return text
    .split(/(`[^`]*`)/)
    .map((part, index) =>
      index % 2 === 1
        ? part.replace(/\|/g, '\\|')
        : part
            .replace(/</g, '&lt;')
            .replace(/\{/g, '&#123;')
            .replace(/\}/g, '&#125;')
            .replace(/\|/g, '\\|')
            .replace(/:(?=[A-Za-z])/g, '\\:'),
    )
    .join('');
}

/** A table; every cell is taken as it is, so a cell that holds a sentence goes through `prose` first. */
export function table(head: string[], rows: string[][]): string {
  const width = head.length;
  for (const row of rows)
    if (row.length !== width) throw new Error(`table row has ${row.length} cells, the head has ${width}: ${row.join(' | ')}`);
  const line = (cells: string[]) => `| ${cells.map((cell) => (cell === '' ? ' ' : cell)).join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}

export const bullets = (items: string[]): string => items.map((item) => `- ${item}`).join('\n');

export function markerBegin(generator: string, name: string): string {
  return `{/* >>> GENERATED (${generator}): ${name}. Do not edit. >>> */}`;
}

export function markerEnd(name: string): string {
  return `{/* <<< END GENERATED: ${name} <<< */}`;
}

const CLOSING: L10n = {
  en: 'This page is generated: to change it, change its source and run `bun run docs:generate`.',
  es: 'Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.',
};

const quoteYaml = (text: string) => JSON.stringify(text);

/** The whole page as it must be on disk. */
export function renderPage(generator: string, page: ReferencePage, lang: Lang): string {
  const name = page.path.replace(/\.md$/, '');
  const body = page.body(lang).replace(/^\n+|\n+$/g, '');
  return [
    '---',
    `title: ${quoteYaml(page.title[lang])}`,
    `sidebar_label: ${quoteYaml(page.label[lang])}`,
    `description: ${quoteYaml(page.description[lang])}`,
    'tags: [reference, generated]',
    '---',
    '',
    `# ${page.title[lang]}`,
    '',
    markerBegin(generator, name),
    '',
    body,
    '',
    markerEnd(name),
    '',
    CLOSING[lang],
    '',
  ].join('\n');
}

export interface Output {
  file: string;
  content: string;
}

export function outputsOf(generator: string, pages: ReferencePage[]): Output[] {
  return pages.flatMap((page) =>
    LANGS.map((lang) => ({ file: join(LANG_DIR[lang], page.path), content: renderPage(generator, page, lang) })),
  );
}

/** The files that differ from what the generator would write, as messages. */
export function staleOutputs(outputs: Output[], root = ROOT): string[] {
  return outputs.flatMap(({ file, content }) => {
    const path = join(root, file);
    if (!existsSync(path)) return [`missing generated page: ${file}`];
    return readFileSync(path, 'utf8') === content ? [] : [`stale generated page: ${file}`];
  });
}

export function writeOutputs(outputs: Output[], root = ROOT): void {
  for (const { file, content } of outputs) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log(`Wrote ${relative(root, path)}`);
  }
}

/** The `main` of every generator: `--check` compares, anything else writes. Returns the exit code. */
export function runGenerator(generator: string, outputs: Output[], argv: string[], extraErrors: string[] = []): number {
  const check = argv.includes('--check');
  if (extraErrors.length > 0) {
    for (const message of extraErrors) console.error(`ERROR: ${message}`);
    return 1;
  }
  if (check) {
    const stale = staleOutputs(outputs);
    for (const message of stale) console.error(`ERROR: ${message}; run bun ${generator}`);
    if (stale.length > 0) return 1;
    console.log(`${generator}: ${outputs.length} generated pages are fresh.`);
    return 0;
  }
  writeOutputs(outputs);
  return 0;
}
