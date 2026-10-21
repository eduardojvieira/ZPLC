// UX-030, DOC-017, REL-031: the product is called ZPLC wherever a person reads it (decision D-03).
// This module finds the retired names in the surfaces a person sees; the test pins it to the repository.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { en } from '../../packages/zplc-ide/src/i18n/en';
import { es } from '../../packages/zplc-ide/src/i18n/es';

export const ROOT = resolve(import.meta.dir, '..', '..');

export interface NameOffender {
  surface: string;
  term: string;
  excerpt: string;
}

// "ZPLC Studio" and "ZPLC IDE" are the retired product names; a bare "Studio" is the retired name of the desktop application.
const FORBIDDEN: ReadonlyArray<{ term: string; pattern: RegExp }> = [
  { term: 'ZPLC Studio', pattern: /ZPLC Studio/g },
  { term: 'ZPLC IDE', pattern: /ZPLC IDE/g },
  { term: 'Studio', pattern: /(?<!ZPLC )\bStudio\b/g },
];

// A justified exception: a surface and the exact excerpt that may keep a term, with the reason.
export interface Allowance {
  surface: string;
  excerpt: string;
  reason: string;
}

// No exception is needed today. A retired name that must be written (the user-data folder of the release candidates, for
// example) goes in a code span, which is a literal identifier and not prose. Released history is out of scope by section
// (`unreleasedSection`). An entry added here needs a reason.
export const ALLOWED: readonly Allowance[] = [];

export function scanText(surface: string, text: string, allowed: readonly Allowance[] = ALLOWED): NameOffender[] {
  const found: NameOffender[] = [];
  for (const line of text.split('\n')) {
    for (const { term, pattern } of FORBIDDEN) {
      for (const match of line.matchAll(pattern)) {
        const at = match.index ?? 0;
        const excerpt = line.slice(Math.max(0, at - 30), at + term.length + 30).trim();
        if (allowed.some((entry) => entry.surface === surface && excerpt.includes(entry.excerpt))) continue;
        found.push({ surface, term, excerpt });
      }
    }
  }
  return found;
}

// Prose of a Markdown page: fenced blocks and inline code spans hold literal identifiers, not words a person reads.
export function markdownProse(text: string): string {
  return text.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '');
}

// Release notes: only the Unreleased section reaches users as the product's current name.
export function unreleasedSection(text: string): string {
  const start = text.indexOf('\n## Unreleased');
  if (start < 0) return text;
  const next = text.indexOf('\n## ', start + 4);
  return text.slice(start, next < 0 ? text.length : next);
}

// A configuration file: comment lines are for maintainers.
export function configLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*(#|\/\/|\/\*|\*)/.test(line))
    .join('\n');
}

function walk(dir: string, accept: (path: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'build' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, accept, out);
    else if (accept(full)) out.push(full);
  }
  return out;
}

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const rel = (path: string): string => relative(ROOT, path);

export function scanRepository(): NameOffender[] {
  const found: NameOffender[] = [];
  for (const [name, catalog] of [
    ['en', en],
    ['es', es],
  ] as const) {
    for (const [key, value] of Object.entries(catalog)) found.push(...scanText(`catalog:${name}:${key}`, String(value)));
  }
  const pages = [
    ...walk(join(ROOT, 'docs/docs'), (p) => /\.mdx?$/.test(p)),
    ...walk(join(ROOT, 'docs/i18n/es'), (p) => /\.mdx?$/.test(p)),
  ].map(rel);
  for (const page of [...pages, 'README.md', 'RELEASING.md']) found.push(...scanText(page, markdownProse(read(page))));
  found.push(...scanText('CHANGELOG.md', markdownProse(unreleasedSection(read('CHANGELOG.md')))));
  for (const file of [
    'packages/zplc-ide/electron-builder.yml',
    'docs/docusaurus.config.js',
    'docs/sidebars.js',
    'docs/src/components/LandingPage/content.js',
  ]) {
    found.push(...scanText(file, configLines(read(file))));
  }
  for (const file of walk(join(ROOT, 'docs/i18n/es'), (p) => p.endsWith('.json')).map(rel)) {
    const messages = JSON.parse(read(file)) as Record<string, { message?: string }>;
    for (const [key, entry] of Object.entries(messages)) found.push(...scanText(`${file}:${key}`, entry.message ?? ''));
  }
  return found;
}
