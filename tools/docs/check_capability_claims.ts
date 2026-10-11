// No public text states a capability that the evidence does not back (DOC-012).
//
//   bun tools/docs/check_capability_claims.ts            check the public text of the repository
//   bun tools/docs/check_capability_claims.ts --list     also print the files that were read, by kind of surface
//
// check_doc_claims.ts holds that the names a page mentions exist. This check holds that what a page says ZPLC can do is
// something that a recorded check shows. The public surfaces are the README, the package READMEs, the changelog and the
// release notes, the documentation pages (their title and description, and their text outside code and outside generated
// blocks), the site configuration and the text of its landing page, and the agent index of the site.
//
// A claim is a sentence that mentions a capability and does not limit it. The capabilities are the rules of
// docs/capability-claims.json: each has a pattern and the evidence that backs it, which is one of
//
//   rows    named rows of conformance/matrix.json, each of which must be "works" by the executed conformance cases
//           (the state that the language reference prints, not the state of the spec's table before the work)
//   boards  the board manifest: some board has a passing hardware record (the level derived from its evidence records)
//   wasm    the simulator capability profile: the browser simulator has a feature that is not unavailable
//   none    nothing in the repository can back it, so only a sentence that limits it may mention it
//
// A sentence limits a claim when it says that something is not, never, without, partial, missing, broken, not yet, only,
// and the like: the text of a limitation is how the documentation stays honest, so it is never an error. Numbers that count
// a thing (boards, examples, lessons, functions) are compared with what the repository holds. A sentence that names a
// release or a commit is about that release and is not compared with the present.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { getAllFBNames, getAllFnNames } from '../../packages/zplc-compiler/src/compiler/stdlib/index.ts';
import { getLegacyWasmCapabilities } from '../../packages/zplc-ide/src/runtime/debugCapabilities';
import { markdownFiles } from './check_doc_claims';
import { loadInputs, type RowFacts } from './generate_language_reference';

const ROOT = new URL('../../', import.meta.url).pathname;
const REGISTRY = 'docs/capability-claims.json';
const ALLOWLIST = 'docs/capability-claims-allowlist.json';
const DOC_DIRS = ['docs/docs', 'docs/i18n/es/docusaurus-plugin-content-docs/current'];

export type Evidence =
  | { rows: string[] }
  | { boards: 'human-hil' }
  | { wasm: true }
  | { none: string };

export interface Rule {
  id: string;
  /** Case-insensitive unless `caseSensitive` is true. */
  pattern: string;
  caseSensitive?: boolean;
  evidence: Evidence;
}

export interface Registry {
  schemaVersion: 1;
  rules: Rule[];
  /** Nouns that a number counts, and the truth that the number is held to. */
  counts: Array<{ id: string; noun: string; truth: 'boards' | 'examples' | 'lessons' | 'functions' | 'function-blocks' | 'languages'; requires?: string }>;
}

export interface Truth {
  rows: Map<string, string>;
  hilBoards: string[];
  boardCount: number;
  wasmAvailable: boolean;
  counts: Record<Registry['counts'][number]['truth'], number>;
}

/** A sentence that mentions a capability and is not a claim of ZPLC: a plan, or what another project says. It can only shrink. */
export interface Allowed { file: string; startsWith: string; reason: string }

export type Kind = 'readme' | 'package' | 'release' | 'page' | 'metadata' | 'site';
export interface Surface { file: string; kind: Kind; text: string }
export interface Finding { file: string; line: number; rule: string; message: string; sentence: string }

// ---------------------------------------------------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------------------------------------------------

/** Words that make a sentence a limitation (English and Spanish) rather than a capability. */
const LIMITS = new RegExp(
  '\\b(?:not|no|never|cannot|can\'t|won\'t|doesn\'t|don\'t|isn\'t|aren\'t|without|nor|neither|none|zero|unavailable|disabled|unsupported|unverified|missing|broken|partial|partially|partly|ignored|refuse[sd]?|reject(?:s|ed)?|fails?|failed|failing|limits?|limited|limitations?|yet|until|only|future|planned|later|stopgap|instead|undefined|wrong|incorrect|except|unless|rather than|assum\\w+|nunca|sin|ni|tampoco|todav[ií]a|a[uú]n|solo|s[oó]lo|[uú]nicamente|futuro|l[ií]mite|l[ií]mites|falla|fallan|rechaza|rechazan|rechazado|parcial|parcialmente|ignora|desactivad[oa]|salvo|excepto|hasta que|cross-build|cross-builds)\\b|\\bnot yet\\b|\\bno se\\b|\\bno est[aá]\\b',
  'i',
);

/** A sentence that is about a release or a commit says what that release did. */
const HISTORICAL = /\b\d+\.\d+\.\d+(?:-[\w.]+)?\b|\b[0-9a-f]{7,40}\b|\brc\.\d+\b/;

export function sentencesOf(text: string): Array<{ line: number; sentence: string }> {
  const out: Array<{ line: number; sentence: string }> = [];
  const emit = (line: number, raw: string) => {
    const prose = raw
      .replace(/`[^`]*`/g, ' ')                       // code is a name, not a claim
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')      // a link keeps its words
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[*_>#]+/g, ' ');
    // a table row is one statement; any other block is cut at the end of a sentence
    const parts = raw.trimStart().startsWith('|') ? [prose.replace(/\|/g, ' ')] : prose.split(/(?<=[.!?])\s+/);
    for (const part of parts) {
      const sentence = part.replace(/\s+/g, ' ').trim();
      if (sentence.length > 2 && /[A-Za-z]/.test(sentence)) out.push({ line, sentence });
    }
  };
  let fence = '';
  let inFront = false;
  let generated = false;
  let block: { line: number; text: string } | undefined;
  let previousRow = '';
  let tableHeader = '';
  const flush = () => { if (block) emit(block.line, block.text); block = undefined; };
  const lines = text.split('\n');
  lines.forEach((raw, index) => {
    const line = index + 1;
    if (index === 0 && raw.trim() === '---') { inFront = true; return; }
    if (inFront) { if (raw.trim() === '---') inFront = false; return; }
    if (/\{\/\* >>> GENERATED/.test(raw)) { flush(); generated = true; return; }
    if (/\{\/\* <<< END GENERATED/.test(raw)) { generated = false; return; }
    if (generated) return;
    const marker = /^\s*(`{3,}|~{3,})/.exec(raw);
    if (fence) { if (marker && marker[1]![0] === fence[0]) fence = ''; return; }
    if (marker) { flush(); fence = marker[1]!; return; }
    if (raw.trim() === '' || /^\s*(?:import |export |<|\{\/\*|:::|---+$)/.test(raw)) { flush(); return; }
    if (raw.trimStart().startsWith('|')) {
      flush();
      // the header row of a table says what its columns are ("What it does not establish"): it governs the rows below it
      if (/^\s*\|[\s:|-]+\|\s*$/.test(raw)) { tableHeader = previousRow; return; }
      const next = lines[index + 1] ?? '';
      if (/^\s*\|[\s:|-]+\|\s*$/.test(next)) { previousRow = raw; return; }
      emit(line, `${tableHeader} ${raw}`);
      return;
    }
    if (/^#{1,6}\s/.test(raw)) { flush(); emit(line, raw.replace(/^#+\s*/, '')); return; }
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(raw);
    if (item) { flush(); block = { line, text: item[1]! }; return; }
    if (block) block.text += ` ${raw.trim()}`;
    else block = { line, text: raw.trim() };
  });
  flush();
  return out;
}

/** The title and the description of a page, which are public text of their own (the metadata of the site). */
function metadataOf(text: string): Array<{ line: number; sentence: string }> {
  const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1];
  if (!front) return [];
  const out: Array<{ line: number; sentence: string }> = [];
  front.split('\n').forEach((raw, index) => {
    const match = /^(title|description|sidebar_label):\s*(.*)$/.exec(raw);
    if (match) out.push({ line: index + 2, sentence: match[2]!.replace(/^["']|["']$/g, '') });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciséis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
};

export function numberOf(word: string): number | undefined {
  const lower = word.toLowerCase();
  if (/^\d+$/.test(lower)) return Number(lower);
  return NUMBER_WORDS[lower];
}

function holds(evidence: Evidence, truth: Truth): { ok: boolean; why: string } {
  if ('rows' in evidence) {
    const states = evidence.rows.map((id) => [id, truth.rows.get(id) ?? 'unknown'] as const);
    const bad = states.filter(([, state]) => state !== 'works');
    return { ok: bad.length === 0, why: bad.map(([id, state]) => `${id} is ${state}`).join(', ') };
  }
  if ('boards' in evidence) return { ok: truth.hilBoards.length > 0, why: 'no board has a passing hardware record' };
  if ('wasm' in evidence) return { ok: truth.wasmAvailable, why: 'the browser simulator is unavailable in its capability profile' };
  return { ok: false, why: evidence.none };
}

export function checkSentence(file: string, line: number, sentence: string, registry: Registry, truth: Truth): Finding[] {
  const findings: Finding[] = [];
  const limited = LIMITS.test(sentence);
  if (!limited) {
    for (const rule of registry.rules) {
      if (!new RegExp(rule.pattern, rule.caseSensitive ? '' : 'i').test(sentence)) continue;
      const verdict = holds(rule.evidence, truth);
      if (!verdict.ok) findings.push({ file, line, rule: rule.id, sentence, message: `states a capability that the evidence does not back (${verdict.why})` });
    }
  }
  if (!HISTORICAL.test(sentence)) {
    for (const count of registry.counts) {
      if (count.requires && !new RegExp(count.requires, 'i').test(sentence)) continue;
      // "six Zephyr boards", "all seven board profiles", "21 example projects"; "the two boards" is a subset and is not a total
      const frame = new RegExp(`\\b(\\d+|${Object.keys(NUMBER_WORDS).join('|')})\\s+(?:[\\p{L}-]+\\s+)?(?:${count.noun})\\b`, 'giu');
      for (const match of sentence.matchAll(frame)) {
        if (/\b(?:the|these|those|both|of|las|los|esas|esos|estas|estos|del)\s+$/i.test(sentence.slice(0, match.index))) continue;
        const stated = numberOf(match[1]!);
        if (stated === undefined || stated < 2) continue;
        const actual = truth.counts[count.truth];
        if (stated !== actual) findings.push({ file, line, rule: `count-${count.id}`, sentence, message: `says ${stated} (${match[0]}), the repository has ${actual}` });
      }
    }
  }
  return findings;
}

export function checkSurface(surface: Surface, registry: Registry, truth: Truth): Finding[] {
  const parts = [...(surface.kind === 'page' ? metadataOf(surface.text) : []), ...sentencesOf(surface.text)];
  return parts.flatMap(({ line, sentence }) => checkSentence(surface.file, line, sentence, registry, truth));
}

// ---------------------------------------------------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------------------------------------------------

export function loadRegistry(root = ROOT): Registry {
  return JSON.parse(readFileSync(join(root, REGISTRY), 'utf8')) as Registry;
}

export function registryErrors(registry: Registry, rowIds: Set<string>): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const rule of registry.rules) {
    if (seen.has(rule.id)) errors.push(`${REGISTRY}: the rule ${rule.id} is listed twice`);
    seen.add(rule.id);
    try { new RegExp(rule.pattern); } catch { errors.push(`${REGISTRY}: the pattern of ${rule.id} is not a regular expression`); }
    if ('rows' in rule.evidence) for (const id of rule.evidence.rows) if (!rowIds.has(id)) errors.push(`${REGISTRY}: ${rule.id} names the matrix row ${id}, which does not exist`);
  }
  return errors;
}

/**
 * The examples the Welcome screen lists: every folder of the bundled projects except the lesson starters (they belong to
 * Learn) and the fixtures that the example catalogue hides. A folder with no catalogue entry is listed too.
 */
export function welcomeExamples(root = ROOT): number {
  const base = join(root, 'packages/zplc-ide/projects');
  const folders = readdirSync(base).filter((name) => statSync(join(base, name)).isDirectory());
  const catalogue = readFileSync(join(root, 'packages/zplc-ide/src/utils/exampleCatalog.ts'), 'utf8');
  const hidden = new Set([...catalogue.matchAll(/^ {2}(\w+): \{[^\n]*showOnWelcome: false/gm)].map((match) => match[1]!));
  return folders.filter((name) => !name.endsWith('_starter') && !hidden.has(name)).length;
}

export function loadTruth(root = ROOT): Truth {
  const inputs = loadInputs(root);
  const rows = new Map(inputs.facts.map((fact: RowFacts) => [fact.row.id, fact.state]));
  const boards = JSON.parse(readFileSync(join(root, 'firmware/app/boards/boards.json'), 'utf8')) as Array<{ board_id: string; ide_id: string }>;
  const script = `
import importlib.util, json, sys
from pathlib import Path
root = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("zplc_boards", root / "firmware/zephyr/scripts/zplc_boards.py")
library = importlib.util.module_from_spec(spec); spec.loader.exec_module(library)
boards = json.loads((root / "firmware/app/boards/boards.json").read_text())
print(json.dumps([b["ide_id"] for b in boards if library.support_level(b, root)["level"] != "cross-build"]))
`;
  const run = Bun.spawnSync(['python3', '-B', '-c', script, root], { stdout: 'pipe', stderr: 'pipe' });
  if (run.exitCode !== 0) throw new Error(`the board levels could not be read: ${run.stderr.toString()}`);
  const lessons = (JSON.parse(readFileSync(join(root, 'packages/zplc-ide/src/generated/lessonIndex.json'), 'utf8')) as { lessons: unknown[] }).lessons.length;
  const wasm = getLegacyWasmCapabilities();
  return {
    rows,
    hilBoards: JSON.parse(run.stdout.toString()) as string[],
    boardCount: boards.length,
    wasmAvailable: Object.values(wasm.features).some((feature) => feature.status !== 'unavailable'),
    counts: {
      boards: boards.length,
      examples: welcomeExamples(root),
      lessons,
      functions: getAllFnNames().length,
      'function-blocks': getAllFBNames().length,
      languages: 5,
    },
  };
}

export function surfaces(root = ROOT): Surface[] {
  const found: Surface[] = [];
  const add = (file: string, kind: Kind) => { if (existsSync(join(root, file))) found.push({ file, kind, text: readFileSync(join(root, file), 'utf8') }); };
  add('README.md', 'readme');
  for (const file of ['packages/zplc-compiler/README.md', 'packages/zplc-ide/README.md']) add(file, 'package');
  add('CHANGELOG.md', 'release');
  add('docs/static/llm.txt', 'site');
  add('docs/docusaurus.config.js', 'metadata');
  add('docs/src/components/LandingPage/content.js', 'site');
  add('docs/src/pages/index.js', 'site');
  for (const directory of DOC_DIRS) for (const file of markdownFiles(root, directory)) add(file, 'page');
  // a draft is not published, so it is not public text
  return found.filter((surface) => !(surface.kind === 'page' && /^---\n(?:[^\n]*\n)*?draft:\s*true\s*$/m.test(surface.text.slice(0, 600))));
}

export function loadAllowlist(root = ROOT): Allowed[] {
  const path = join(root, ALLOWLIST);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Allowed[]) : [];
}

/** Findings that no entry of the allowlist covers, and the entries that cover nothing (which are errors: the list can only shrink). */
export function applyAllowlist(findings: Finding[], allowlist: Allowed[]): { kept: Finding[]; errors: string[] } {
  const used = new Set<Allowed>();
  const kept = findings.filter((finding) => {
    const entry = allowlist.find((candidate) => candidate.file === finding.file && finding.sentence.startsWith(candidate.startsWith));
    if (entry) used.add(entry);
    return entry === undefined;
  });
  const errors = allowlist.flatMap((entry) => [
    ...(entry.reason.trim().length < 10 ? [`${ALLOWLIST}: the entry for ${entry.file} must say why the sentence is not a claim`] : []),
    ...(used.has(entry) ? [] : [`${ALLOWLIST}: the entry for ${entry.file} ("${entry.startsWith.slice(0, 40)}") matches no finding: remove it`]),
  ]);
  return { kept, errors };
}

export function check(root = ROOT): { findings: Finding[]; errors: string[]; read: Surface[] } {
  const registry = loadRegistry(root);
  const truth = loadTruth(root);
  const errors = registryErrors(registry, new Set(truth.rows.keys()));
  const read = surfaces(root);
  // The changelog keeps one section per release: only the section that is not yet released describes the present.
  const all = read.flatMap((surface) => {
    const text = surface.kind === 'release' ? unreleasedSection(surface.text) : surface.text;
    return checkSurface({ ...surface, text }, registry, truth);
  });
  const { kept, errors: allowErrors } = applyAllowlist(all, loadAllowlist(root));
  return { findings: kept, errors: [...errors, ...allowErrors], read };
}

/** The part of a changelog from `## Unreleased` to the first dated heading, with the lines kept in place. */
export function unreleasedSection(text: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^## Unreleased\b/.test(line));
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  return lines.map((line, index) => (index >= start && (end < 0 || index < end) ? line : '')).join('\n');
}

if (import.meta.main) {
  const { findings, errors, read } = check();
  if (process.argv.includes('--list')) {
    const byKind = new Map<Kind, number>();
    for (const surface of read) byKind.set(surface.kind, (byKind.get(surface.kind) ?? 0) + 1);
    console.log(`capability claims: read ${[...byKind].map(([kind, count]) => `${count} ${kind}`).join(', ')}`);
  }
  for (const finding of findings) errors.push(`${relative(ROOT, join(ROOT, finding.file))}:${finding.line}: ${finding.rule}: ${finding.message}: "${finding.sentence.slice(0, 160)}"`);
  if (errors.length > 0) {
    console.error(errors.map((message) => `capability-claims: ${message}`).join('\n'));
    process.exit(1);
  }
  console.log(`capability-claims: ${read.length} public files carry no capability claim that the evidence does not back`);
}
