// What the documentation says exists must exist (DOC-014).
//
//   bun tools/docs/check_doc_claims.ts            check every page, English and Spanish, and the root documents
//   bun tools/docs/check_doc_claims.ts --list     also print what was checked, by kind
//
// A claim is an inline code span (or a word of a shell block) of a documentation page that names:
//
//   a Kconfig symbol     CONFIG_ZPLC_STACK_DEPTH     defined in a Kconfig file, or used by a tracked source or board file
//   a shell command      zplc dbg bp add <pc>        in the command table of firmware/app/src/shell_cmds.c
//   a command line verb  zplc-cli test               in the usage text of packages/zplc-ide/src/cli/index.ts
//   a C identifier       zplc_sched_init()           declared or used in a tracked C source or header
//   an IEC call          ABS(x), TON(...)            a function or block of the compiler registry, or an IEC keyword
//   a repository path    firmware/app/Kconfig        a tracked file or folder
//
// A claim that does not hold is an error that names the page and the line. A claim that is deliberately absent (a path that a
// build creates, a name that a page says does not exist) is listed in docs/doc-claims-allowlist.json with the reason, and an
// entry that no page uses any more is an error too, so the list can only shrink.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { getAllFBNames, getAllFnNames } from '../../packages/zplc-compiler/src/compiler/stdlib/index.ts';
import { parseCli, parseKconfig, parseShellCommands, type ShellCommand } from './source-parsers';

const ROOT = new URL('../../', import.meta.url).pathname;
const DOC_DIRS = ['docs/docs', 'docs/i18n/es/docusaurus-plugin-content-docs/current'];
/** Documents outside the site that make the same kind of claim. */
export const ROOT_DOCUMENTS = ['README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'QUICKSTART_AGENTS.md', 'ARCHITECTURE.md', 'VERSIONING.md'];
const ALLOWLIST = 'docs/doc-claims-allowlist.json';

export type Kind = 'kconfig' | 'shell' | 'cli' | 'c-api' | 'call' | 'path';
export interface Claim {
  kind: Kind;
  token: string;
  page: string;
  line: number;
}
export interface Finding extends Claim {
  message: string;
}
export interface AllowEntry {
  kind: Kind;
  token: string;
  reason: string;
}

/** Names that are not functions of the registry but may be written with parentheses in ST, IL or the docs. */
const IEC_CALLS = new Set([
  'REF',
  'ADR',
  'SIZEOF',
  'INT',
  'SINT',
  'DINT',
  'LINT',
  'UINT',
  'USINT',
  'UDINT',
  'ULINT',
  'REAL',
  'LREAL',
  'BOOL',
  'BYTE',
  'WORD',
  'DWORD',
  'LWORD',
  'TIME',
  'STRING',
  'WSTRING',
  'ARRAY',
  'POINTER',
  'CAL',
  'CALC',
  'CALCN',
  'AND',
  'OR',
  'XOR',
  'NOT',
  'ANDN',
  'ORN',
  'XORN',
  'ADD',
  'SUB',
  'MUL',
  'DIV',
  'GT',
  'GE',
  'EQ',
  'NE',
  'LT',
  'LE',
  'MOVE',
]);

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^\s`{]*)/;
const SHELL_FENCES = new Set(['bash', 'sh', 'shell', 'console', 'zsh', 'shell-session']);
const TOP_LEVEL = new Set([
  'firmware',
  'packages',
  'docs',
  'tools',
  'conformance',
  'scripts',
  'examples',
  'specs',
  'odd',
  '.github',
  '.agents',
  '.specify',
]);

// ---------------------------------------------------------------------------
// Extracting claims
// ---------------------------------------------------------------------------

/** The claims of one page: the code spans outside fences, and the lines of the shell fences. */
export function extractClaims(page: string, text: string): Claim[] {
  const claims: Claim[] = [];
  const lines = text.split('\n');
  let fence: { marker: string; shell: boolean } | undefined;
  let frontMatter = lines[0]?.trim() === '---';
  lines.forEach((raw, index) => {
    const line = index + 1;
    if (frontMatter) {
      if (index > 0 && raw.trim() === '---') frontMatter = false;
      return;
    }
    const open = FENCE.exec(raw);
    if (fence) {
      if (open && open[2]!.startsWith(fence.marker[0]!) && open[2]!.length >= fence.marker.length && raw.trim() === open[2]) {
        fence = undefined;
        return;
      }
      if (fence.shell) claims.push(...claimsOf(raw.replace(/^\s*\$\s+/, ''), page, line, true));
      return;
    }
    if (open) {
      fence = { marker: open[2]!, shell: SHELL_FENCES.has(open[3]!.toLowerCase()) };
      return;
    }
    for (const match of raw.matchAll(/(`{1,2})([^`]+?)\1/g)) claims.push(...claimsOf(match[2]!.trim(), page, line, false));
  });
  return claims;
}

function claimsOf(span: string, page: string, line: number, shellLine: boolean): Claim[] {
  const found: Claim[] = [];
  const add = (kind: Kind, token: string) => found.push({ kind, token, page, line });
  const text = span.trim();
  if (text === '') return found;

  // a shell command or a command-line verb: the span starts with it
  const shell = /^zplc((?: [a-z_][\w-]*)+)/.exec(text);
  if (shell) add('shell', shellToken(text, shell[1]!));
  const cli = /^zplc-cli\s+([a-z][\w-]*)/.exec(text);
  if (cli) add('cli', cli[1]!);

  const words = shellLine
    ? text.split(/\s+/)
    : /^[\w./-]+\s/.test(text) && repoPath(text.split(/\s+/)[0]!)
      ? [text.split(/\s+/)[0]!]
      : [text];
  for (const word of words) {
    const bare = word.replace(/^[("']+|[)"',;:.]+$/g, '');
    // Kconfig symbol, with or without a value
    const config = /^CONFIG_([A-Z0-9_]+)(?:=.*)?$/.exec(bare);
    if (config) {
      add('kconfig', config[1]!);
      continue;
    }
    // C identifier that the runtime owns
    const cName = /^(zplc_[a-z0-9_]+)(?:\(.*)?$/.exec(bare);
    if (cName && !shell) {
      add('c-api', cName[1]!);
      continue;
    }
    // IEC call: an upper-case name followed by an argument list
    const call = /^([A-Z][A-Z0-9_]+)\(.*\)?$/.exec(bare);
    if (call && !shellLine) {
      add('call', call[1]!);
      continue;
    }
    // repository path
    const path = repoPath(bare);
    if (path) add('path', path);
  }
  return found;
}

/**
 * A shell claim is the command words, followed by the number of arguments that the claim writes as `<placeholder>` when it writes
 * any: `zplc dbg poke <addr> <value>` is `zplc dbg poke#2`. The count is checked against the command table.
 */
export function shellToken(text: string, words: string): string {
  const rest = text.slice(`zplc${words}`.length);
  const placeholders = (rest.match(/<[^<>\s]+>/g) ?? []).length;
  return placeholders > 0 ? `zplc${words}#${placeholders}` : `zplc${words}`;
}

/** The path that a word names, when it names one of the repository: placeholders, URLs and absolute paths are not claims. */
export function repoPath(word: string): string | undefined {
  if (/^[a-z]+:\/\//.test(word) || word.startsWith('/') || word.startsWith('~')) return undefined;
  if (/[<>*{}|$=]|\.\.\./.test(word)) return undefined;
  const cleaned = word
    .replace(/^\.\//, '')
    .replace(/:\d+(?:-\d+)?$/, '')
    .replace(/#.*$/, '')
    .replace(/\/+$/, '');
  const first = cleaned.split('/')[0]!;
  if (
    !cleaned.includes('/') &&
    !new RegExp(
      String.raw`^(west\.yml|CMakeLists\.txt|package\.json|bun\.lock|justfile|README\.md|CONTRIBUTING\.md|AGENTS\.md|` +
        String.raw`ARCHITECTURE\.md|VERSIONING\.md|SECURITY\.md|CHANGELOG\.md|LICENSE)$`,
    ).test(cleaned)
  )
    return undefined;
  if (cleaned.includes('/') && !TOP_LEVEL.has(first)) return undefined;
  return cleaned;
}

// ---------------------------------------------------------------------------
// What exists
// ---------------------------------------------------------------------------

export interface Index {
  kconfig: Set<string>;
  /** CONFIG_ names that tracked sources, board files and Kconfig files use. */
  configUsed: Set<string>;
  shell: ShellCommand[];
  cliCommands: Set<string>;
  cIdentifiers: Set<string>;
  calls: Set<string>;
  files: Set<string>;
  directories: Set<string>;
}

function git(args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0 && result.exitCode !== 1) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString()}`);
  return result.stdout.toString();
}

export function buildIndex(): Index {
  const files = new Set(git(['ls-files']).split('\n').filter(Boolean));
  const directories = new Set<string>();
  for (const file of files) {
    const parts = file.split('/');
    for (let length = 1; length < parts.length; length += 1) directories.add(parts.slice(0, length).join('/'));
  }
  const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
  const kconfigFiles = [...files].filter((file) => /(^|\/)Kconfig[^/]*$/.test(file));
  const kconfig = new Set<string>();
  const dependedOn = new Set<string>();
  for (const file of kconfigFiles) {
    for (const symbol of parseKconfig(read(file))) {
      kconfig.add(symbol.name);
      for (const dependency of symbol.depends) for (const name of dependency.match(/[A-Z][A-Z0-9_]+/g) ?? []) dependedOn.add(name);
    }
  }
  const configUsed = new Set([
    ...dependedOn,
    ...git([
      'grep',
      '-hoE',
      'CONFIG_[A-Z0-9_]+',
      '--',
      '*.conf',
      '*.c',
      '*.h',
      '*.cmake',
      '*.txt',
      '*.overlay',
      'Kconfig*',
      '*.yml',
      '*.json',
      ':!docs',
      ':!specs',
      ':!tools/docs',
    ])
      .split('\n')
      .filter(Boolean)
      .map((name) => name.replace(/^CONFIG_/, '')),
  ]);
  const cIdentifiers = new Set(
    git(['grep', '-hoE', '\\bzplc_[a-z0-9_]+\\b', '--', '*.c', '*.h', '*.cmake', 'CMakeLists.txt', ':!docs', ':!specs', ':!tools/docs'])
      .split('\n')
      .filter(Boolean),
  );
  const cli = parseCli(read('packages/zplc-ide/src/cli/index.ts'));
  return {
    kconfig,
    configUsed,
    shell: parseShellCommands(read('firmware/app/src/shell_cmds.c')),
    cliCommands: new Set(cli.commands.map((command) => command.name)),
    cIdentifiers,
    calls: new Set([...getAllFnNames(), ...getAllFBNames()].map((name) => name.toUpperCase())),
    files,
    directories,
  };
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

export function checkClaim(claim: Claim, index: Index): string | undefined {
  switch (claim.kind) {
    case 'kconfig':
      if (index.kconfig.has(claim.token)) return undefined;
      // a ZPLC symbol exists only where a Kconfig file defines it; the others are Zephyr's, which this repository can only show it uses
      if (!claim.token.startsWith('ZPLC') && index.configUsed.has(claim.token)) return undefined;
      return claim.token.startsWith('ZPLC')
        ? `CONFIG_${claim.token} is not defined by any Kconfig file of the repository`
        : `CONFIG_${claim.token} is not a Kconfig symbol that a file of the repository defines, depends on or sets`;
    case 'shell': {
      const [command, given] = claim.token.split('#');
      const words = command!.split(' ');
      let prefix = [words[0]!];
      for (const word of words.slice(1)) {
        const children = index.shell.filter(
          (entry) => entry.path.length === prefix.length + 1 && entry.path.slice(0, prefix.length).join(' ') === prefix.join(' '),
        );
        if (children.length === 0) break; // a leaf: the rest are arguments
        if (!children.some((child) => child.path[prefix.length] === word))
          return `the shell has no command \`${[...prefix, word].join(' ')}\``;
        prefix = [...prefix, word];
      }
      if (given === undefined) return undefined;
      const entry = index.shell.find((candidate) => candidate.path.join(' ') === prefix.join(' '));
      if (!entry || entry.group || entry.required === undefined) return undefined;
      // words that the claim wrote after the command are arguments; `given` counts the placeholders
      const consumed = prefix.length - 1;
      const extra = words.length - 1 - consumed;
      const total = Number(given) + extra;
      const most = entry.required + (entry.optional ?? 0);
      if (total < entry.required || total > most)
        return `\`${prefix.join(' ')}\` takes ${entry.required} required and ${
          entry.optional ?? 0
        } optional argument(s); the page gives ${total}`;
      return undefined;
    }
    case 'cli':
      return index.cliCommands.has(claim.token)
        ? undefined
        : `zplc-cli has no command ${claim.token} (it has ${[...index.cliCommands].join(', ')})`;
    case 'c-api':
      return index.cIdentifiers.has(claim.token)
        ? undefined
        : `${claim.token} is not declared or used by any C source, header or tool of the repository`;
    case 'call':
      return index.calls.has(claim.token.toUpperCase()) || IEC_CALLS.has(claim.token.toUpperCase())
        ? undefined
        : `${claim.token} is not a function or function block of the compiler registry`;
    case 'path':
      return index.files.has(claim.token) || index.directories.has(claim.token)
        ? undefined
        : `${claim.token} is not a tracked file or folder`;
  }
}

export function checkClaims(claims: Claim[], index: Index, allowlist: AllowEntry[]): { findings: Finding[]; unused: AllowEntry[] } {
  const used = new Set<AllowEntry>();
  const findings: Finding[] = [];
  for (const claim of claims) {
    const message = checkClaim(claim, index);
    if (message === undefined) continue;
    const allowed = allowlist.find((entry) => entry.kind === claim.kind && entry.token === claim.token);
    if (allowed) {
      used.add(allowed);
      continue;
    }
    findings.push({ ...claim, message });
  }
  return { findings, unused: allowlist.filter((entry) => !used.has(entry)) };
}

export function allowlistErrors(allowlist: AllowEntry[]): string[] {
  return allowlist.flatMap((entry, position) => {
    const where = `${ALLOWLIST}[${position}]`;
    const errors: string[] = [];
    if (!['kconfig', 'shell', 'cli', 'c-api', 'call', 'path'].includes(entry.kind))
      errors.push(`${where}: kind must be one of kconfig, shell, cli, c-api, call, path`);
    if (typeof entry.token !== 'string' || entry.token === '') errors.push(`${where}: token must be the text of the claim`);
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 10)
      errors.push(`${where}: reason must say why the claim is deliberately absent`);
    return errors;
  });
}

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

export function markdownFiles(root: string, base: string): string[] {
  const out: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      if (entry.name.startsWith('_')) continue;
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.mdx?$/.test(entry.name)) out.push(path);
    }
  };
  walk(base);
  return out.sort();
}

export function collectClaims(root = ROOT): Claim[] {
  // the project skill of the agents is documentation too (DOC-022): its paths and commands must exist
  const skills = existsSync(join(root, '.agents/skills')) ? markdownFiles(root, '.agents/skills') : [];
  const pages = [...DOC_DIRS.flatMap((directory) => markdownFiles(root, directory)), ...ROOT_DOCUMENTS, ...skills];
  return pages.flatMap((page) => extractClaims(relative(root, join(root, page)), readFileSync(join(root, page), 'utf8')));
}

if (import.meta.main) {
  const allowlist = JSON.parse(readFileSync(join(ROOT, ALLOWLIST), 'utf8')) as AllowEntry[];
  const index = buildIndex();
  const claims = collectClaims();
  const errors = allowlistErrors(allowlist);
  const { findings, unused } = checkClaims(claims, index, allowlist);
  const byKind = new Map<Kind, number>();
  for (const claim of claims) byKind.set(claim.kind, (byKind.get(claim.kind) ?? 0) + 1);
  const counts = [...byKind].map(([kind, count]) => `${count} ${kind}`).join(', ');
  if (process.argv.includes('--list')) console.log(`doc-claims: checked ${claims.length} claims: ${counts}`);
  for (const finding of findings) errors.push(`${finding.page}:${finding.line}: ${finding.kind}: ${finding.message}`);
  for (const entry of unused) errors.push(`${ALLOWLIST}: the entry for ${entry.kind} ${entry.token} is not used by any page: remove it`);
  if (errors.length > 0) {
    console.error(errors.map((message) => `doc-claims: ${message}`).join('\n'));
    process.exit(1);
  }
  console.log(`doc-claims: ${claims.length} claims hold (${counts}); ${allowlist.length} are deliberately absent`);
}
