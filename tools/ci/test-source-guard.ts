// Source-text guard (VF-006): a test must prove behaviour, not match the text of the product source.
//
//   bun tools/ci/test-source-guard.ts
//
// The guard lists every tracked test file that reads a product source file. A test that reads
// packages/*/src, packages/*/electron, packages/*/shared, packages/*/scripts, scripts, firmware (C, headers, CMake, board
// configuration) or .github/workflows is a source-text test: it freezes how the code is written, not what it
// does. So is a test outside the assembler's own that asserts on generated assembly text (`expect(...assembly)`
// followed by a text matcher: toContain, toMatch, toStartWith, toEndWith, or toBe and toEqual with a string),
// which is listed with the pseudo file "generated assembly text".
// The files on tools/ci/pinned-source-offenders.json are known offenders being replaced; the guard fails on
//
//   - a test file that reads product source and is not on the list (a new offender),
//   - a listed file that no longer reads product source, or reads fewer files than listed (a stale entry),
//   - a listed file that reads a product source file its entry does not name (the list cannot grow by edits).
//
// The list can only shrink, and VF-006 requires it to be empty at GA.
//
// How a read is recognised (heuristics, each one tested in test-source-guard.test.ts):
//   1. A read call is readFile, readFileSync, readTextFile, Bun.file(...) or a `?raw` import (TypeScript,
//      JavaScript), open(...) or .read_text()/.read_bytes() (Python), fopen(...) (C).
//   2. The string literals of the call, and of the constants the call names (up to three hops), are its paths.
//   3. A literal is a product file when a tracked product source file equals it relative to the test or to the
//      repository, or when exactly one product file ends with it once leading ./ and ../ are removed (a bare name
//      that several files share, such as index.ts or CMakeLists.txt, says nothing about which one is read). Only
//      literals with a source extension count, so project sources (.st), manifests (.json), conformance cases,
//      examples and fixtures are never product source.
//   4. A loop variable or callback parameter (`for (const n of X)`, `X.map((n) => ...)`) ranges over X, and the
//      parameter of a helper function receives the arguments of the helper's calls in the file. When a TypeScript
//      read is anchored at the test (import.meta, __dirname) but still names something the file does not define
//      and its path has no file name of its own, every source-extension literal of the file is taken as read.
//   5. A constant that the test imports from a tracked module is followed one hop (a path kept in a shared module),
//      and so is `module.NAME` for a Python module that the test loads by file name (`with_name("x.py")`).
//   6. A directory listing (readdirSync) anchored at the test, whose result a read depends on, reads every product
//      source file of that directory; the entry is reported as the directory, with a trailing /.
//   7. Comments are ignored. The assembler's own unit tests are exempt: assembly text may be asserted there.
//   8. An assertion whose subject names `asm` or `assembly` (result.assembly, asm, generatedAssembly) and ends in a
//      text matcher is an assertion on generated assembly text; `expect(result.assembly).toEqual(expect.any(String))`
//      is not. Only a subject that names it is seen: a helper
//      that returns the text under another name is missed.
// ponytail: a string scan, not a type-aware analysis. A path assembled by a function, or a directory walked
// recursively, is missed; such a test should name the file once as a literal.
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

import { TEST_FILE } from './test-inventory';

export interface SourceFile {
  path: string;
  text: string;
}
export interface Pinned {
  file: string;
  requirement: string;
  added: string;
  reads: string[];
  replacement: string;
  reason: string;
}

export const ASSEMBLY_TEXT = 'generated assembly text';
const ASSEMBLY_ASSERTION = new RegExp(
  String.raw`\bexpect\(\s*(?:[\w$.!?[\]()]*?\.)?\w*(?:asm|Asm|assembly|Assembly)\w*\b[^)]*\)\s*\.(?:not\.)?(?:(?:toContain|` +
    String.raw`toMatch|toStartWith|toEndWith)\b|(?:toBe|toEqual)\(\s*[\`'"])`,
);

export const REPLACEMENTS = ['behaviour', 'dom', 'artifact', 'contract', 'delete-with-layout'] as const;
const EXEMPT = /^packages\/zplc-compiler\/src\/assembler\//;
const PRODUCT_ROOT = /^(?:packages\/[^/]+\/(?:src|electron|shared|scripts)\/|scripts\/|tools\/|firmware\/|\.github\/workflows\/)/;
const FIXTURE = /(?:^|\/)(?:fixtures?|testdata|tests?|__snapshots__)\//;
const SOURCE_EXTENSION =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|css|html|sh|py|c|h|cmake|conf|overlay|dts|yml|yaml)$|(?:^|\/)(?:CMakeLists\.txt|Kconfig[\w.]*)$/;
const LIST = new URL('./pinned-source-offenders.json', import.meta.url);
const ROOT = new URL('../../', import.meta.url);

/** Product source: code and build configuration the product ships or is built from, never a test or a fixture. */
export function isProductSource(path: string): boolean {
  return PRODUCT_ROOT.test(path) && SOURCE_EXTENSION.test(path) && !TEST_FILE.test(path) && !FIXTURE.test(path);
}

/** The text with every comment replaced by spaces (offsets and line numbers stay), strings left alone. */
function withoutComments(text: string, python: boolean): string {
  let out = '';
  let quote = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const next = text[index + 1];
    if (quote) {
      out += char;
      if (char === '\\') out += text[++index] ?? '';
      else if (char === quote || (char === '\n' && quote !== '`')) quote = '';
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char;
      out += char;
    } else if (python ? char === '#' : char === '/' && next === '/') {
      const end = text.indexOf('\n', index);
      const stop = end < 0 ? text.length : end;
      out += ' '.repeat(stop - index);
      index = stop - 1;
    } else if (!python && char === '/' && next === '*') {
      const end = text.indexOf('*/', index + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += text.slice(index, stop).replace(/[^\n]/g, ' ');
      index = stop - 1;
    } else out += char;
  }
  return out;
}

const QUOTE = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
const literals = (text: string) =>
  [...text.matchAll(QUOTE)].map((match) => (match[1] ?? match[2] ?? match[3] ?? '').replace(/\$\{[^}]*\}/g, '*'));

/** The text between the bracket at `open` and its partner, honouring quotes. */
function balanced(text: string, open: number): string {
  let depth = 0;
  let quote = '';
  for (let index = open; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
    } else if (char === "'" || char === '"' || char === '`') quote = char;
    else if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char) && (depth -= 1) === 0) return text.slice(open + 1, index);
  }
  return text.slice(open + 1);
}

/** The expression a method is called on: back from the dot to the start of its statement or argument. */
function receiver(text: string, dot: number): string {
  let depth = 0;
  let index = dot - 1;
  for (; index >= 0; index -= 1) {
    const char = text[index]!;
    if (')]}'.includes(char)) depth += 1;
    else if ('([{'.includes(char)) {
      if (depth === 0) break;
      depth -= 1;
    } else if (depth === 0 && char === '\n' && /^\s*\./.test(text.slice(index + 1, index + 80))) continue;
    else if (
      depth === 0 &&
      (char === '\n' ||
        char === ';' ||
        char === ',' ||
        (char === '=' && text[index - 1] !== '=' && text[index + 1] !== '=' && text[index + 1] !== '>'))
    )
      break;
  }
  return text.slice(index + 1, dot);
}

interface Call {
  text: string;
  at: number;
}

/** The argument text (or, for a Python method, the receiver) of every read call in the file, with its offset. */
function reads(text: string, python: boolean): Call[] {
  const calls: Call[] = [];
  const argumentsOf = (pattern: RegExp) => {
    for (const match of text.matchAll(pattern)) calls.push({ text: balanced(text, match.index + match[0].length - 1), at: match.index });
  };
  if (python) {
    argumentsOf(/\bopen\s*\(/g);
    for (const match of text.matchAll(/\.(?:read_text|read_bytes)\s*\(/g))
      calls.push({ text: receiver(text, match.index), at: match.index });
  } else {
    argumentsOf(/\b(?:readFileSync|readFile|readTextFile|fopen)\s*\(/g);
    argumentsOf(/\bBun\.file\s*\(/g);
    for (const match of text.matchAll(/['"`]([^'"`\n]+)\?raw['"`]/g)) calls.push({ text: `'${match[1]}'`, at: match.index });
  }
  return calls;
}

/**
 * The right-hand side of `const NAME = ...` (TypeScript) or `NAME = ...` (Python) nearest above `at`, else the
 * first in the file, with its offset; undefined when the file does not define NAME.
 */
function definition(text: string, name: string, python: boolean, at: number): { body: string; at: number } | undefined {
  const pattern = new RegExp(
    python ? `^[ \\t]*${name}\\s*=(?!=)` : `\\b(?:const|let|var)\\s+${name}\\b(?:\\s*:[^=\\n]+)?\\s*=(?![=>])`,
    'gm',
  );
  const all = [...text.matchAll(pattern)];
  const found = all.filter((match) => match.index < at).at(-1) ?? all[0];
  if (!found) return undefined;
  const start = found.index + found[0].length;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]!;
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    else if (depth <= 0 && (char === ';' || char === '\n')) return { body: text.slice(start, index), at: found.index };
  }
  return { body: text.slice(start), at: found.index };
}

// A name is a variable that may carry part of a path unless it is an API word or a member (`path.join`, `fixture.root`).
const API = new Set([
  'new',
  'import',
  'as',
  'string',
  'await',
  'process',
  'from',
  'with_name',
  'str',
  'encoding',
  'text',
  'rb',
  'r',
  'utf8',
  'true',
  'false',
  'null',
  'undefined',
]);
const interpolations = (text: string) =>
  text.replace(/`((?:[^`\\]|\\.)*)`/g, (_, inner: string) => [...inner.matchAll(/\$\{([^}]*)\}/g)].map((part) => ` ${part[1]} `).join(' '));
const names = (text: string) =>
  [
    ...new Set(
      [
        ...interpolations(text)
          .replace(QUOTE, ' ')
          .matchAll(/(?:(?<![\w.])|(?<=\.\.\.))([A-Za-z_]\w*)(?![\w.(]|\s*\()/g),
      ].map((match) => match[1]!),
    ),
  ].filter((name) => !API.has(name));
const hasFileName = (literal: string) => /\.\w+$/.test(literal);
const ANCHOR = /import\.meta|__dirname|__file__/;

/** The body of `export const NAME = ...` in the tracked module that the test imports NAME from. */
function imported(
  text: string,
  name: string,
  testPath: string,
  tracked: string[],
  readModule?: (path: string) => string | undefined,
): string | undefined {
  const found = new RegExp(`import\\s*(?:type\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"](\\.[^'"]*)['"]`).exec(text);
  if (!found || !readModule) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(testPath), found[1]!)).replace(/\.[mc]?[jt]sx?$/, '');
  const module = ['.ts', '.tsx', '.mjs', '.js', '/index.ts']
    .map((extension) => `${base}${extension}`)
    .find((candidate) => tracked.includes(candidate));
  const source = module === undefined ? undefined : readModule(module);
  return source === undefined ? undefined : definition(withoutComments(source, false), name, false, Infinity)?.body;
}

/** Top-level comma-separated parts of an argument or parameter list. */
function splitList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
    } else if (char === "'" || char === '"' || char === '`') quote = char;
    else if ('([{<'.includes(char)) depth += 1;
    else if (')]}>'.includes(char) && !(char === '>' && text[index - 1] === '=')) depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

/** What a helper's parameter receives: the argument of every call of the nearest preceding helper that declares NAME. */
function argumentsOfCallers(text: string, name: string, python: boolean, at: number): { body: string; at: number } | undefined {
  const headers = python
    ? /\bdef\s+(\w+)\s*\(([^)]*)\)/g
    : /\bfunction\s+(\w+)\s*\(([^)]*)\)|\b(?:const|let|var)\s+(\w+)\s*(?::[^=\n]+)?=\s*(?:async\s*)?\(([^)]*)\)\s*(?::[^=]+?)?=>/g;
  let chosen: { callee: string; index: number; rest: boolean; at: number } | undefined;
  for (const match of text.matchAll(headers)) {
    if (match.index >= at) break;
    const callee = match[1] ?? match[3]!;
    const parameters = splitList(match[2] ?? match[4] ?? '').map((parameter) => parameter.replace(/^\.\.\./, (dots) => `${dots}`));
    const position = parameters.findIndex((parameter) => new RegExp(`^(?:\\.\\.\\.)?\\s*\\*{0,2}${name}\\b`).test(parameter));
    if (position >= 0)
      chosen = {
        callee,
        index: position,
        rest: parameters[position]!.startsWith('...') || parameters[position]!.startsWith('*'),
        at: match.index,
      };
  }
  if (!chosen) return undefined;
  const collected: string[] = [];
  for (const call of text.matchAll(new RegExp(`(?<!\\bfunction\\s|\\bdef\\s)\\b${chosen.callee}\\s*\\(`, 'g'))) {
    if (/\b(?:const|let|var)\s+$/.test(text.slice(Math.max(0, call.index - 8), call.index))) continue;
    const args = splitList(balanced(text, call.index + call[0].length - 1));
    collected.push(...(chosen.rest ? args.slice(chosen.index) : args.slice(chosen.index, chosen.index + 1)));
  }
  return collected.length > 0 ? { body: collected.join(' , '), at: chosen.at } : undefined;
}

/** What a loop variable or callback parameter ranges over: `for (const NAME of X)` and `X.map((NAME) => ...)`. */
function binding(text: string, name: string, at: number): { body: string; at: number } | undefined {
  const loops = [...text.matchAll(new RegExp(`for\\s*\\(\\s*(?:const|let|var)\\s+${name}\\s+of\\s+`, 'g'))].filter(
    (match) => match.index < at,
  );
  const loop = loops.at(-1);
  if (loop) {
    const inner = balanced(text, loop.index + loop[0].indexOf('('));
    return { body: inner.slice(inner.indexOf(' of ') + 4), at: loop.index };
  }
  const callbacks = [
    ...text.matchAll(new RegExp(`\\.(?:map|filter|forEach|flatMap|some|every|find)\\s*\\(\\s*(?:async\\s*)?\\(?\\s*${name}\\b`, 'g')),
  ].filter((match) => match.index < at);
  const callback = callbacks.at(-1);
  return callback ? { body: receiver(text, callback.index), at: callback.index } : undefined;
}

const LISTING = /\b(?:readdirSync|readdir)\s*\(/g;

/** The directories that the listing calls inside `expression` name, when they are anchored at the test. */
function listedDirectories(expression: string, file: SourceFile, text: string, python: boolean, at: number): string[] {
  const out: string[] = [];
  for (const match of expression.matchAll(LISTING)) {
    const segments: string[] = [];
    let anchored = false;
    const walk = (part: string, from: number, depth: number) => {
      anchored ||= ANCHOR.test(part);
      for (const token of part.matchAll(
        new RegExp(`${QUOTE.source}|(?:(?<![\\w.])|(?<=\\.\\.\\.))([A-Za-z_]\\w*)(?![\\w.(]|\\s*\\()`, 'g'),
      )) {
        if (token[4] === undefined) segments.push((token[1] ?? token[2] ?? token[3] ?? '').replace(/\$\{[^}]*\}/g, '*'));
        else if (depth < 3 && !API.has(token[4])) {
          const found = definition(text, token[4], python, from);
          if (found) walk(found.body, found.at, depth + 1);
        }
      }
    };
    walk(balanced(expression, match.index + match[0].length - 1), at, 0);
    if (anchored && !segments.some((segment) => segment.includes('*')))
      out.push(
        posix.normalize(posix.join(posix.dirname(file.path), ...segments.filter((segment) => segment !== '' && !hasFileName(segment)))),
      );
  }
  return out;
}

// `direct` are the literals of the call itself and always count. `indirect` ones came through a constant, a loop or a
// parameter and count only when that chain is anchored at the test, because a temporary folder is not the repository.
interface Resolved {
  direct: string[];
  indirect: string[];
  anchored: boolean;
  unknown: boolean;
  directories: string[];
}

function pathOf(
  call: Call,
  file: SourceFile,
  text: string,
  python: boolean,
  tracked: string[],
  readModule?: (path: string) => string | undefined,
): Resolved {
  const direct = literals(call.text);
  const indirect: string[] = [];
  const directories = listedDirectories(call.text, file, text, python, call.at);
  const seen = new Set<string>();
  let unknown = false;
  let anchored = ANCHOR.test(call.text);
  let pending = names(call.text).map((name) => ({ name, at: call.at }));
  for (let hop = 0; hop < 3 && pending.length > 0; hop += 1) {
    const next: typeof pending = [];
    for (const { name, at } of pending) {
      if (seen.has(name)) continue;
      seen.add(name);
      // The nearest binding wins: a helper's parameter shadows a constant of the same name defined earlier.
      const candidates = [
        definition(text, name, python, at),
        python ? undefined : binding(text, name, at),
        argumentsOfCallers(text, name, python, at),
      ];
      const local = candidates.filter((candidate) => candidate !== undefined).sort((a, b) => b.at - a.at)[0];
      const body = local?.body ?? (python ? undefined : imported(text, name, file.path, tracked, readModule));
      if (body === undefined) unknown = true;
      else {
        indirect.push(...literals(body));
        directories.push(...listedDirectories(body, file, text, python, local?.at ?? Infinity));
        next.push(...names(body).map((inner) => ({ name: inner, at: local?.at ?? Infinity })));
        anchored ||= ANCHOR.test(body);
      }
    }
    pending = next;
  }
  // A Python test that loads the module under test by file name reads the paths that module names: validator.WORKFLOW.
  const loaded = python && readModule ? /with_name\(\s*["']([^"']+\.py)["']\s*\)/.exec(text)?.[1] : undefined;
  const source = loaded === undefined ? undefined : readModule!(posix.join(posix.dirname(file.path), loaded));
  if (source !== undefined)
    for (const member of call.text.matchAll(/\b\w+\.([A-Z_][A-Z0-9_]*)\b/g))
      direct.push(...literals(definition(withoutComments(source, true), member[1]!, true, Infinity)?.body ?? ''));
  return { direct, indirect, anchored, unknown: unknown && anchored && ![...direct, ...indirect].some(hasFileName), directories };
}

const productCache = new WeakMap<string[], string[]>();
const productOf = (tracked: string[]) => {
  let product = productCache.get(tracked);
  if (!product) productCache.set(tracked, (product = tracked.filter(isProductSource)));
  return product;
};

/**
 * The product source files a test file reads, sorted. `tracked` is `git ls-files`; `readModule` returns the text
 * of a tracked module, to follow a path constant that the test imports.
 */
export function productReads(file: SourceFile, tracked: string[], readModule?: (path: string) => string | undefined): string[] {
  if (EXEMPT.test(file.path)) return [];
  const python = file.path.endsWith('.py');
  const text = withoutComments(file.text, python);
  const product = productOf(tracked);
  const matches = (literal: string) => {
    if (literal === '' || literal.includes('*')) return [];
    const relative = posix.normalize(posix.join(posix.dirname(file.path), literal));
    const bare = literal.replace(/^(?:\.{1,2}\/)+/, '');
    const exact = product.filter((candidate) => candidate === relative || candidate === bare);
    if (exact.length > 0) return exact;
    const ending = product.filter((candidate) => candidate.endsWith(`/${bare}`));
    return ending.length === 1 ? ending : [];
  };
  const found = new Set<string>();
  let unknown = false;
  for (const call of reads(text, python)) {
    const path = pathOf(call, file, text, python, tracked, readModule);
    unknown ||= path.unknown;
    for (const literal of path.anchored ? [...path.direct, ...path.indirect] : path.direct)
      for (const match of matches(literal)) found.add(match);
    for (const directory of path.directories)
      if (product.some((candidate) => posix.dirname(candidate) === directory)) found.add(`${directory}/`);
  }
  if (unknown) for (const literal of literals(text)) for (const match of matches(literal)) found.add(match);
  if (!python && ASSEMBLY_ASSERTION.test(text)) found.add(ASSEMBLY_TEXT);
  return [...found].sort();
}

export function findOffenders(
  files: SourceFile[],
  tracked: string[],
  readModule?: (path: string) => string | undefined,
): Map<string, string[]> {
  const offenders = new Map<string, string[]>();
  for (const file of files) {
    const found = productReads(file, tracked, readModule);
    if (found.length > 0) offenders.set(file.path, found);
  }
  return offenders;
}

const isDate = (text: unknown) =>
  typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text) && new Date(text).toISOString().slice(0, 10) === text;

/** `known` is the set of identifiers of tools/ci/requirements-index.json; without it only the shape is checked. */
export function validatePinned(entries: unknown, known?: Set<string>): string[] {
  if (!Array.isArray(entries)) return ['pinned-source-offenders.json must be an array'];
  const errors: string[] = [];
  const seen = new Set<string>();
  entries.forEach((entry: Record<string, unknown> | null, index) => {
    const where = `entry ${index}${typeof entry?.file === 'string' ? ` (${entry.file})` : ''}`;
    if (typeof entry !== 'object' || entry === null) return void errors.push(`${where} must be an object`);
    if (typeof entry.file !== 'string' || !TEST_FILE.test(entry.file)) errors.push(`${where}: file must be a tracked test file`);
    else if (seen.has(entry.file)) errors.push(`${where}: duplicate entry`);
    else seen.add(entry.file);
    if (typeof entry.requirement !== 'string' || !/^[A-Z]+-[0-9]{3}$/.test(entry.requirement))
      errors.push(`${where}: requirement must look like VF-006`);
    else if (known && !known.has(entry.requirement))
      errors.push(`${where}: requirement ${entry.requirement} is not in tools/ci/requirements-index.json`);
    if (!isDate(entry.added)) errors.push(`${where}: added must be a valid YYYY-MM-DD date`);
    if (!Array.isArray(entry.reads) || entry.reads.length === 0 || entry.reads.some((read) => typeof read !== 'string'))
      errors.push(`${where}: reads must list the product files the test reads`);
    if (!(REPLACEMENTS as readonly unknown[]).includes(entry.replacement))
      errors.push(`${where}: replacement must be one of ${REPLACEMENTS.join(', ')}`);
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '')
      errors.push(`${where}: reason must say what the test pins and how it will be replaced`);
  });
  return errors;
}

export function checkOffenders(offenders: Map<string, string[]>, entries: Pinned[]): string[] {
  const errors: string[] = [];
  const pinned = new Map(entries.map((entry) => [entry.file, entry]));
  for (const [file, read] of offenders) {
    const entry = pinned.get(file);
    if (!entry) {
      errors.push(
        `new offender: ${file} proves behaviour by product source text (${read.join(', ')}); test what the code does instead, or pin it ` +
          `with its requirement in tools/ci/pinned-source-offenders.json`,
      );
      continue;
    }
    const extra = read.filter((path) => !entry.reads.includes(path));
    if (extra.length > 0) errors.push(`${file} reads product source that its entry does not name: ${extra.join(', ')}`);
    const gone = entry.reads.filter((path) => !read.includes(path));
    if (gone.length > 0)
      errors.push(`stale entry: ${file} no longer reads ${gone.join(', ')}; update "reads" in tools/ci/pinned-source-offenders.json`);
  }
  for (const entry of entries)
    if (!offenders.has(entry.file))
      errors.push(`stale entry: ${entry.file} no longer reads product source; remove it from tools/ci/pinned-source-offenders.json`);
  return errors;
}

/** Every error of the guard for this repository (the tracked tree, read from disk); empty when the list matches. */
export function runGuard(): { errors: string[]; offenders: number; tests: number } {
  const listed = Bun.spawnSync(['git', 'ls-files'], { cwd: ROOT.pathname });
  if (listed.exitCode !== 0) throw new Error(`git ls-files failed: ${listed.stderr.toString()}`);
  const tracked = listed.stdout
    .toString()
    .split('\n')
    .filter((file) => file !== '');
  const files = tracked.filter((file) => TEST_FILE.test(file)).map((path) => ({ path, text: readFileSync(new URL(path, ROOT), 'utf8') }));
  const entries: unknown = JSON.parse(readFileSync(LIST, 'utf8'));
  const known = new Set(
    (JSON.parse(readFileSync(new URL('./requirements-index.json', import.meta.url), 'utf8')) as Array<{ id: string }>).map(
      (requirement) => requirement.id,
    ),
  );
  const errors = validatePinned(entries, known);
  const offenders = findOffenders(files, tracked, (path) => {
    try {
      return readFileSync(new URL(path, ROOT), 'utf8');
    } catch {
      return undefined;
    }
  });
  if (errors.length === 0) errors.push(...checkOffenders(offenders, entries as Pinned[]));
  return { errors, offenders: offenders.size, tests: files.length };
}

if (import.meta.main) {
  const { errors, offenders, tests } = runGuard();
  if (errors.length > 0) {
    console.error(errors.map((message) => `test-source-guard: ${message}`).join('\n'));
    process.exit(1);
  }
  console.log(
    `test-source-guard: ${tests} test files, ${offenders} match product source text and are all pinned (VF-006 wants the list empty at GA)`,
  );
}
