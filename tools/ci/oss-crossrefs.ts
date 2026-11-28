// OSS-005: cross-references inside the repository MUST agree.
//
//   bun tools/ci/oss-crossrefs.ts [--root <dir>]
//
// Checks four mechanical classes across AGENTS.md, specs/**/*.md, docs/docs/**/*.md and the Spanish docs twin:
//   1. agents-rule: AGENTS.md rule/guideline/regla numbers are in range and match the rule's topic (not off-by-one).
//   2. requirement-id: every requirement ID with a known spec prefix exists in the requirement indices or specs.
//   3. decision-id: every D-nn decision ID cited exists in a spec decision table (or the retired D-02 -> S-5 note).
//   4. repo-path: relative markdown links in AGENTS.md/specs and backtick repo paths in AGENTS.md/docs exist on disk.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface CrossrefFinding {
  file: string;
  line: number;
  rule: 'agents-rule' | 'requirement-id' | 'decision-id' | 'repo-path';
  message: string;
}

const INDEX_FILES = [
  'tools/ci/requirements-index.json',
  'tools/ci/requirement-index-012.json',
  'tools/ci/requirement-index-013.json',
  'tools/ci/requirement-index-014.json',
] as const;

/** Generated output paths that are intentionally untracked and valid in documentation prose. */
const ALLOWED_UNTRACKED_PATHS = new Set(['docs/build']);

/** Historical notes that quote a previously wrong citation to explain the fix or requirement itself. */
const HISTORICAL_QUOTE = /(?:still cites|citing rule 7|cite rule 7|as rule 7|not "rule 5"|wrong citation)/i;

function walkMarkdown(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'build') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function parseAgentsMaxRule(root: string): number {
  const path = join(root, 'AGENTS.md');
  if (!existsSync(path)) return 10;
  const text = readFileSync(path, 'utf8');
  let max = 0;
  for (const match of text.matchAll(/^(\d+)\.\s+\*\*/gm)) {
    const n = Number(match[1]);
    if (n > max) max = n;
  }
  return max > 0 ? max : 10;
}

function loadValidRequirements(root: string, specFiles: readonly string[]): { ids: Set<string>; prefixes: Set<string> } {
  const ids = new Set<string>();
  for (const rel of INDEX_FILES) {
    const full = join(root, rel);
    if (!existsSync(full)) continue;
    const parsed = JSON.parse(readFileSync(full, 'utf8')) as unknown;
    const list = Array.isArray(parsed) ? parsed : ((parsed as { requirements?: unknown[] }).requirements ?? []);
    for (const item of list) {
      if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
        ids.add((item as { id: string }).id);
      }
    }
  }
  for (const file of specFiles) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/^[-*]\s+\*\*([A-Z]{2,4}-\d{3})\*\*/gm)) {
      ids.add(match[1]!);
    }
  }
  const prefixes = new Set<string>([...ids].map((id) => id.split('-')[0]!));
  return { ids, prefixes };
}

function loadValidDecisions(specFiles: readonly string[]): Set<string> {
  const decisions = new Set<string>(['D-02']); // D-02 was promoted to owner decision S-5 and never reused (spec 011 §4.4)
  for (const file of specFiles) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/^\|\s*(D-\d{2})\s*\|/gm)) {
      decisions.add(match[1]!);
    }
  }
  return decisions;
}

const AGENTS_RULE_RE =
  /(?:AGENTS(?:\.md)?[^\n]{0,40}\b(?:rule|guideline|regla)\s+(\d+)|\b(?:rule|guideline|regla)\s+(\d+)\b[^\n]{0,40}AGENTS(?:\.md)?)/gi;

function checkAgentsRuleLine(rel: string, lineNo: number, line: string, maxRule: number): CrossrefFinding[] {
  if (HISTORICAL_QUOTE.test(line)) return [];
  const findings: CrossrefFinding[] = [];
  for (const match of line.matchAll(AGENTS_RULE_RE)) {
    const num = Number(match[1] ?? match[2]);
    const snippet = match[0];
    if (num < 1 || num > maxRule) {
      findings.push({
        file: rel,
        line: lineNo,
        rule: 'agents-rule',
        message: `AGENTS.md rule ${num} is out of range (1..${maxRule})`,
      });
      continue;
    }
    if (num === 7 && /physical|flash|deploy|force|serial|físic|graba/i.test(line)) {
      findings.push({
        file: rel,
        line: lineNo,
        rule: 'agents-rule',
        message: `"${snippet.trim()}" cites rule 7 (Style) for physical operations, which is rule 8`,
      });
    } else if (num === 5 && /dependenc/i.test(line)) {
      findings.push({
        file: rel,
        line: lineNo,
        rule: 'agents-rule',
        message: `"${snippet.trim()}" cites rule 5 (Documentation) for dependencies, which is rule 6`,
      });
    } else if (num === 4 && /both languages|two languages|english and spanish|dos idiomas|in parallel/i.test(line)) {
      findings.push({
        file: rel,
        line: lineNo,
        rule: 'agents-rule',
        message: `"${snippet.trim()}" cites rule 4 (Test first) for bilingual documentation, which is rule 5`,
      });
    }
  }
  return findings;
}

const REQ_RE = /\b([A-Z]{2,4}-\d{3})\b/g;
const DEC_RE = /\b(D-\d{2})\b/g;
const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
const REPO_PATH_RE = /`((?:firmware|packages|tools|scripts|docs|specs|conformance|examples|\.github|\.specify)\/[A-Za-z0-9_.\-/]+)`/g;

export function checkCrossrefs(root: string = resolve(import.meta.dir, '..', '..')): CrossrefFinding[] {
  const findings: CrossrefFinding[] = [];
  const maxRule = parseAgentsMaxRule(root);
  const specFiles = walkMarkdown(join(root, 'specs')).sort();
  const docsEnFiles = walkMarkdown(join(root, 'docs/docs')).sort();
  const docsEsFiles = walkMarkdown(join(root, 'docs/i18n/es/docusaurus-plugin-content-docs/current')).sort();
  const agentsPath = join(root, 'AGENTS.md');
  const allTargets = [...(existsSync(agentsPath) ? [agentsPath] : []), ...specFiles, ...docsEnFiles, ...docsEsFiles];

  const { ids: validReqs, prefixes: knownPrefixes } = loadValidRequirements(root, specFiles);
  const validDecisions = loadValidDecisions(specFiles);

  for (const full of allTargets) {
    const rel = full.slice(root.length + 1);
    const lines = readFileSync(full, 'utf8').split('\n');
    const isSpecOrAgents = rel === 'AGENTS.md' || rel.startsWith('specs/');
    const isDocsOrAgents = rel === 'AGENTS.md' || rel.startsWith('docs/');
    let inFence = false;

    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;

      findings.push(...checkAgentsRuleLine(rel, lineNo, line, maxRule));

      if (knownPrefixes.size > 0) {
        for (const match of line.matchAll(REQ_RE)) {
          const id = match[1]!;
          const prefix = id.split('-')[0]!;
          if (knownPrefixes.has(prefix) && !validReqs.has(id)) {
            findings.push({ file: rel, line: lineNo, rule: 'requirement-id', message: `unknown requirement ID ${id}` });
          }
        }
      }

      if (validDecisions.size > 1) {
        for (const match of line.matchAll(DEC_RE)) {
          const id = match[1]!;
          if (!validDecisions.has(id)) {
            findings.push({ file: rel, line: lineNo, rule: 'decision-id', message: `unknown decision ID ${id}` });
          }
        }
      }

      if (isSpecOrAgents) {
        for (const match of line.matchAll(LINK_RE)) {
          const href = match[1]!.trim();
          if (/^(https?:|mailto:|#)/.test(href) || /[<*{}]/.test(href)) continue;
          const [pathPart] = href.split('#');
          if (!pathPart) continue;
          const target = resolve(dirname(full), pathPart);
          if (!existsSync(target)) {
            findings.push({ file: rel, line: lineNo, rule: 'repo-path', message: `broken relative link "${href}"` });
          }
        }
      }

      if (isDocsOrAgents) {
        for (const match of line.matchAll(REPO_PATH_RE)) {
          const candidate = match[1]!.replace(/\/+$/, '');
          if (/[<*{}]/.test(candidate) || candidate.includes('...') || ALLOWED_UNTRACKED_PATHS.has(candidate)) continue;
          if (!existsSync(join(root, candidate))) {
            findings.push({ file: rel, line: lineNo, rule: 'repo-path', message: `repository path "${candidate}" does not exist` });
          }
        }
      }
    });
  }

  return findings;
}

if (import.meta.main) {
  const idx = process.argv.indexOf('--root');
  const root = idx !== -1 && process.argv[idx + 1] ? resolve(process.argv[idx + 1]!) : resolve(import.meta.dir, '..', '..');
  const findings = checkCrossrefs(root);
  for (const finding of findings) {
    console.error(`${finding.rule}: ${finding.file}:${finding.line}: ${finding.message}`);
  }
  console.log(`oss-crossrefs: ${findings.length} finding(s)`);
  process.exit(findings.length > 0 ? 1 : 0);
}
