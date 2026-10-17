// The internationalisation guard of Studio (UX-029, UX-031), checked without a new dependency:
//
//   bun tools/ci/i18n-guard.ts              check the repository (also run by `bun run lint:ide`)
//   bun tools/ci/i18n-guard.ts --write      lower the listed counts that shrank and drop the entries that reached zero
//   bun tools/ci/i18n-guard.ts --list       print every hard-coded string with its line
//
// In a component (a .tsx source of packages/zplc-ide/src that is not a test, the i18n module or the component gallery) the
// guard finds, by walking the TypeScript syntax tree:
//   hard-coded-text        JSX text with letters, or a string or template literal with letters shown as a JSX child
//   hard-coded-attribute   a string literal with letters in `aria-label`, `placeholder`, `alt`, `label`, `tooltip`, `title`
//                          or `description`
// Text inside <code>, <kbd>, <pre>, <samp> and <var> is a literal of the technical vocabulary and is not translated.
// The strings go through `t()` of src/i18n instead. The sources that held hard-coded strings when the rule was added are
// on tools/ci/i18n-offenders.json, one entry per file and rule with the count it had; the list can only shrink: a count
// above its entry (or a file that is not listed) fails, a count below must be lowered (--write does it), and an entry
// that reached zero must be removed.
//
// Over the two catalogs (src/i18n/en.ts and es.ts), read as data, it fails on:
//   missing-key, extra-key, placeholder-mismatch   Spanish and English differ in their keys or in their {placeholders}
//   sentence-case                                  a capital letter in the middle of a sentence that is not an acronym,
//                                                  a code token, a quoted label or a name on PROPER_NOUNS (UX-031)
//   exclamation                                    an exclamation mark, `!` or `¡` (UX-031)
//   internal-term                                  a term of the engineering team: "candidate", "link zplc.json", "stopgap" (UX-031)
// The catalogs have no list of offenders: they start clean and stay clean.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import ts from 'typescript';

import { en } from '../../packages/zplc-ide/src/i18n/en';
import { es } from '../../packages/zplc-ide/src/i18n/es';

export const IDE_SRC = 'packages/zplc-ide/src';
const LIST_PATH = new URL('./i18n-offenders.json', import.meta.url);

export const RULES = ['hard-coded-text', 'hard-coded-attribute'] as const;
export type Rule = (typeof RULES)[number];
export const REQUIREMENT: Record<Rule, string> = { 'hard-coded-text': 'UX-029', 'hard-coded-attribute': 'UX-029' };

export interface SourceFile { path: string; text: string }
export interface Violation { file: string; rule: Rule; line: number; snippet: string }
export interface Offender { file: string; rule: Rule; count: number; requirement: string; added: string; reason: string }

/** A component the guard reads: a .tsx source of the application that is not a test, the i18n module or the gallery. */
export const isGuarded = (path: string): boolean =>
  path.startsWith(`${IDE_SRC}/`) && path.endsWith('.tsx') && !path.endsWith('.test.tsx')
  && !path.startsWith(`${IDE_SRC}/i18n/`) && !path.startsWith(`${IDE_SRC}/ui/gallery/`);

const USER_ATTRIBUTES = new Set(['aria-label', 'placeholder', 'alt', 'label', 'tooltip', 'title', 'description']);
const LITERAL_TAGS = new Set(['code', 'kbd', 'pre', 'samp', 'var', 'style', 'script']);
const hasLetters = (text: string): boolean => /\p{L}/u.test(text.replace(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi, ''));

/** The string literals an expression can show as they are: a literal, a template, either branch of `?:`, `&&`, `||`, `??`, `+`. */
function literalsIn(expression: ts.Expression): ts.Node[] {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression];
  if (ts.isTemplateExpression(expression)) return [expression.head, ...expression.templateSpans.map((span) => span.literal)];
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)) return literalsIn(expression.expression);
  if (ts.isConditionalExpression(expression)) return [...literalsIn(expression.whenTrue), ...literalsIn(expression.whenFalse)];
  if (ts.isBinaryExpression(expression) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(expression.operatorToken.kind)) {
    return [...literalsIn(expression.left), ...literalsIn(expression.right)];
  }
  return [];
}

const textOf = (node: ts.Node): string => (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) ? node.text : '');

export function violationsOf(file: SourceFile): Violation[] {
  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Violation[] = [];
  const add = (node: ts.Node, rule: Rule): void => {
    found.push({ file: file.path, rule, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, snippet: node.getText().replace(/\s+/g, ' ').slice(0, 80) });
  };
  const visit = (node: ts.Node, literal: boolean): void => {
    let inLiteralTag = literal;
    if (ts.isJsxElement(node)) inLiteralTag = literal || LITERAL_TAGS.has(node.openingElement.tagName.getText());
    if (!literal && ts.isJsxText(node) && hasLetters(node.text)) add(node, 'hard-coded-text');
    if (!literal && ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      if (literalsIn(node.expression).some((item) => hasLetters(textOf(item)))) add(node, 'hard-coded-text');
    }
    if (ts.isJsxAttribute(node) && USER_ATTRIBUTES.has(node.name.getText()) && node.initializer) {
      const shown = ts.isJsxExpression(node.initializer) ? (node.initializer.expression ? literalsIn(node.initializer.expression) : []) : [node.initializer];
      if (shown.some((item) => hasLetters(textOf(item)))) add(node, 'hard-coded-attribute');
    }
    ts.forEachChild(node, (child) => visit(child, inLiteralTag));
  };
  visit(source, false);
  return found;
}

export interface GuardOptions { offenders: Offender[] }
const key = (file: string, rule: string): string => `${file}\u0000${rule}`;

function countsOf(files: readonly SourceFile[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of files.filter((item) => isGuarded(item.path))) {
    for (const violation of violationsOf(file)) counts.set(key(file.path, violation.rule), (counts.get(key(file.path, violation.rule)) ?? 0) + 1);
  }
  return counts;
}

export function checkSources(files: readonly SourceFile[], options: GuardOptions): string[] {
  const problems: string[] = [];
  const counts = countsOf(files);
  const listed = new Map(options.offenders.map((entry) => [key(entry.file, entry.rule), entry] as const));
  for (const [id, count] of [...counts].sort(([left], [right]) => left.localeCompare(right))) {
    const [file, rule] = id.split('\u0000') as [string, Rule];
    const entry = listed.get(id);
    const requirement = REQUIREMENT[rule];
    const plural = count === 1 ? '' : 's';
    if (!entry) problems.push(`${requirement}: ${file} has ${count} ${rule} string${plural}; write them in src/i18n/en.ts and es.ts and use t(); the list of offenders can only shrink`);
    else if (count > entry.count) problems.push(`${requirement}: ${file} grew from ${entry.count} to ${count} ${rule} strings; a file on tools/ci/i18n-offenders.json can only shrink`);
    else if (count < entry.count) problems.push(`${requirement}: ${file} now has ${count} ${rule} strings, recorded ${entry.count}; lower the entry (bun tools/ci/i18n-guard.ts --write)`);
  }
  for (const entry of options.offenders) {
    if (!counts.has(key(entry.file, entry.rule))) problems.push(`${entry.requirement}: ${entry.file} has no ${entry.rule} string any more; remove the entry (bun tools/ci/i18n-guard.ts --write)`);
  }
  return problems;
}

/** The list as it should be after work on the sources: counts lowered to what the files hold now, zero counts dropped. */
export function ratchetOffenders(files: readonly SourceFile[], offenders: readonly Offender[]): Offender[] {
  const counts = countsOf(files);
  return offenders.flatMap((entry) => {
    const count = counts.get(key(entry.file, entry.rule)) ?? 0;
    return count === 0 ? [] : [{ ...entry, count: Math.min(count, entry.count) }];
  });
}

// ---- the catalogs ---------------------------------------------------------------------------------------------------

/** Names and technical words that keep their capital inside a sentence, in both languages. */
export const PROPER_NOUNS: ReadonlySet<string> = new Set([
  'ZPLC', 'Studio', 'Learn', 'Tests', 'English', 'Español', 'GitHub', 'Modbus', 'MQTT', 'Zephyr', 'Windows', 'macOS', 'Linux',
  'Electron', 'Raspberry', 'Pi', 'Pico', 'Arduino', 'Docusaurus', 'AppImage', 'Setup', 'Portable',
]);
export const INTERNAL_TERMS: readonly string[] = ['candidate', 'link zplc.json', 'stopgap', 'candidato', 'vincular zplc.json'];

/** The capital letters of a text that open a word in the middle of a sentence, apart from the acronyms, code tokens and names. */
export function midSentenceCapitals(text: string): string[] {
  const words = text.replace(/\{\w+\}/g, '0').split(/\s+/).filter(Boolean);
  const found: string[] = [];
  words.forEach((word, index) => {
    if (index === 0) return;
    const previous = words[index - 1]!;
    if (/[.?!:;·–—]$/.test(previous)) return;
    if (/^["“«`]/.test(word)) return; // the label of a control or a file, quoted
    const bare = word.replace(/^[("'`¿¡]+|[)"'`.,;:?!…]+$/g, '');
    if (!/^\p{Lu}/u.test(bare)) return;
    if (/^\p{Lu}+$/u.test(bare) || /[\d./_\\+-]/.test(bare)) return; // an acronym (ST, USB), a code token (zplc.json, I/O) or a key combination (Ctrl+S)
    if (PROPER_NOUNS.has(bare)) return;
    found.push(bare);
  });
  return found;
}

const placeholdersOf = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();

export function checkCatalogs(english: Readonly<Record<string, string>> = en, spanish: Readonly<Record<string, string>> = es): string[] {
  const problems: string[] = [];
  for (const id of Object.keys(english)) {
    if (!(id in spanish)) problems.push(`UX-029: "${id}" is in the English catalog and not in the Spanish one (missing-key)`);
    else if (placeholdersOf(english[id]!).join() !== placeholdersOf(spanish[id]!).join()) problems.push(`UX-029: "${id}" has other {placeholders} in Spanish than in English (placeholder-mismatch)`);
  }
  for (const id of Object.keys(spanish)) if (!(id in english)) problems.push(`UX-029: "${id}" is in the Spanish catalog and not in the English one (extra-key)`);
  for (const [language, catalog] of [['English', english], ['Spanish', spanish]] as const) {
    for (const [id, text] of Object.entries(catalog)) {
      if (/[!¡]/.test(text)) problems.push(`UX-031: ${language} "${id}" has an exclamation mark (exclamation)`);
      const internal = INTERNAL_TERMS.find((term) => text.toLowerCase().includes(term));
      if (internal) problems.push(`UX-031: ${language} "${id}" uses the internal term "${internal}" (internal-term)`);
      const capitals = midSentenceCapitals(text);
      if (capitals.length > 0) problems.push(`UX-031: ${language} "${id}" is not in sentence case: ${capitals.map((word) => `"${word}"`).join(', ')} (sentence-case)`);
    }
  }
  return problems;
}

// ---- the repository -------------------------------------------------------------------------------------------------

export function readSources(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (path: string): void => {
    if (statSync(join(root, path)).isDirectory()) for (const name of readdirSync(join(root, path)).sort()) walk(posix.join(path, name));
    else if (path.endsWith('.tsx')) files.push({ path, text: readFileSync(join(root, path), 'utf8') });
  };
  if (existsSync(join(root, IDE_SRC))) walk(IDE_SRC);
  return files;
}

export function readOffenders(): Offender[] {
  return existsSync(LIST_PATH) ? JSON.parse(readFileSync(LIST_PATH, 'utf8')) as Offender[] : [];
}

export function checkRepository(root = resolve(dirname(new URL(import.meta.url).pathname), '../..')): string[] {
  return [...checkSources(readSources(root), { offenders: readOffenders() }), ...checkCatalogs()];
}

if (import.meta.main) {
  const root = resolve(dirname(new URL(import.meta.url).pathname), '../..');
  const files = readSources(root);
  if (process.argv.includes('--list')) {
    for (const file of files.filter((item) => isGuarded(item.path))) for (const violation of violationsOf(file)) console.log(`${violation.file}:${violation.line} ${violation.rule} ${violation.snippet}`);
  }
  if (process.argv.includes('--seed')) {
    if (readOffenders().length > 0) { console.error('i18n-guard: the list exists; it only shrinks (--write)'); process.exit(1); }
    const seeded: Offender[] = [...countsOf(files)].sort(([left], [right]) => left.localeCompare(right)).map(([id, count]) => {
      const [file, rule] = id.split('\u0000') as [string, Rule];
      return { file, rule, count, requirement: REQUIREMENT[rule], added: new Date().toISOString().slice(0, 10), reason: 'Not yet moved to the catalogs of src/i18n; the surface\'s own work package moves it.' };
    });
    writeFileSync(LIST_PATH, `${JSON.stringify(seeded, null, 2)}\n`);
  } else if (process.argv.includes('--write')) {
    writeFileSync(LIST_PATH, `${JSON.stringify(ratchetOffenders(files, readOffenders()), null, 2)}\n`);
  }
  const problems = checkRepository(root);
  if (problems.length > 0) {
    console.error(problems.map((problem) => `i18n-guard: ${problem}`).join('\n'));
    process.exit(1);
  }
  console.log(`i18n-guard: ok (${Object.keys(en).length} keys in both catalogs, ${readOffenders().length} file and rule entries are listed, ${relative(root, LIST_PATH.pathname)})`);
}
