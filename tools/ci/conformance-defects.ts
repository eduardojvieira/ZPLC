// Which conformance case shows each defect of the review (VF-004).
//
//   bun tools/ci/conformance-defects.ts            the counts, and the problems when there are any
//   bun tools/ci/conformance-defects.ts --write    write conformance/defect-map.md from conformance/defects.json and the cases
//   bun tools/ci/conformance-defects.ts --check    CI: fail on a problem, or when defect-map.md is not what --write would produce
//
// VF-004 asks for one case for every defect listed under "Current failures" of CMP, LNG and RT that can be shown on a
// host. The defects are a hand-kept list (conformance/defects.json: the spec may be untracked, so CI cannot read them
// from it), and each one is in exactly one of four states:
//
//   cases    a conformance case that exists, whose requirement is one of the requirements that fix the defect
//   tests    another executed test that shows it (the property tests of the runner, a unit test): the file must exist
//            and must contain the name of the test
//   hostless a defect that no program shows (a thread, a power cut, an editor gesture): it says why, and one of the
//            requirements that fix it must have a recorded check in tools/ci/requirement-evidence.json
//   open     a defect with no executed check yet, with the reason: it is listed, not hidden
//
// The map is generated, so that "which case shows the defect that CMP-011 fixes" is answered by reading one file.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { loadCases } from '../../packages/zplc-ide/src/conformance/cases';
import type { Evidence } from './requirement-coverage';

export const SEVERITIES = ['Blocker', 'Major', 'Minor'] as const;
export const AREAS = ['CMP', 'LNG', 'RT'] as const;
export const DEFECT_ID = /^(CMP|LNG|RT)-D\d{2}[a-z]$/;
const REQUIREMENT_ID = /^[A-Z]{2,4}-\d{3}$/;

export interface TestRef { file: string; test: string }
export interface Defect {
  id: string;
  severity: (typeof SEVERITIES)[number];
  /** The defect, as the review states it. */
  defect: string;
  /** The requirements that fix it. */
  fixedBy: string[];
  cases?: string[];
  tests?: TestRef[];
  hostless?: string;
  open?: string;
  note?: string;
}
export interface DefectFile { schema: 1; defects: Defect[] }
export interface CaseInfo { requirement: string; name: string; build: 'succeeds' | 'fails' }

export interface Context {
  cases: Map<string, CaseInfo>;
  /** The ids of tools/ci/requirements-index.json. */
  requirements: Set<string>;
  /** The expected-failure list, as "<file> > <describe> > <test>". */
  listed: string[];
  /** The requirements that have at least one check in tools/ci/requirement-evidence.json. */
  withEvidence: Set<string>;
  /** The text of a repository file, or undefined when it does not exist. */
  read: (path: string) => string | undefined;
}

export const DEFECTS_FILE = new URL('../../conformance/defects.json', import.meta.url);
export const MAP_FILE = new URL('../../conformance/defect-map.md', import.meta.url);
const ROOT = new URL('../../', import.meta.url);
const RUNNER = 'packages/zplc-ide/src/conformance/conformance.test.ts';

/** The state of a defect, which validate() has already checked is exactly one. */
export type State = 'case' | 'test' | 'hostless' | 'open';
export function stateOf(defect: Defect): State {
  if ((defect.cases?.length ?? 0) > 0) return 'case';
  if ((defect.tests?.length ?? 0) > 0) return 'test';
  return defect.hostless !== undefined ? 'hostless' : 'open';
}

export function validate(file: DefectFile, context: Context): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const known = new Set(Object.keys({ id: 1, severity: 1, defect: 1, fixedBy: 1, cases: 1, tests: 1, hostless: 1, open: 1, note: 1 }));
  for (const defect of file.defects) {
    const where = `defects.json: ${defect.id}`;
    if (!DEFECT_ID.test(defect.id)) errors.push(`defects.json: "${defect.id}" is not an id like CMP-D01a`);
    if (seen.has(defect.id)) errors.push(`${where} is listed twice`);
    seen.add(defect.id);
    for (const key of Object.keys(defect)) if (!known.has(key)) errors.push(`${where} has an unknown key "${key}"`);
    if (!(SEVERITIES as readonly string[]).includes(defect.severity)) errors.push(`${where}: severity must be ${SEVERITIES.join(', ')}`);
    if (typeof defect.defect !== 'string' || defect.defect.trim() === '') errors.push(`${where}: say what the defect is`);
    if (!Array.isArray(defect.fixedBy) || defect.fixedBy.length === 0) errors.push(`${where}: name the requirements that fix it`);
    for (const requirement of defect.fixedBy ?? []) {
      if (!REQUIREMENT_ID.test(requirement) || !context.requirements.has(requirement)) errors.push(`${where}: ${requirement} is not a requirement of tools/ci/requirements-index.json`);
    }
    const states = [(defect.cases?.length ?? 0) > 0, (defect.tests?.length ?? 0) > 0, defect.hostless !== undefined, defect.open !== undefined];
    const shown = states[0] || states[1];
    if (!shown && !states[2] && !states[3]) errors.push(`${where}: give a case, a test, "hostless" or "open"`);
    if (shown && (states[2] || states[3])) errors.push(`${where}: a defect that a case or a test shows is neither hostless nor open`);
    if (states[2] && states[3]) errors.push(`${where}: hostless and open exclude each other`);
    for (const key of ['hostless', 'open', 'note'] as const) {
      if (defect[key] !== undefined && (typeof defect[key] !== 'string' || defect[key]!.trim() === '')) errors.push(`${where}: ${key} must say why`);
    }
    for (const id of defect.cases ?? []) {
      const found = context.cases.get(id);
      if (!found) errors.push(`${where}: the case ${id} does not exist under conformance/`);
      else if (!defect.fixedBy.includes(found.requirement)) errors.push(`${where}: the case ${id} is filed under ${found.requirement}, which is not one of ${defect.fixedBy.join(', ')}: name it in fixedBy or pick another case`);
    }
    for (const { file: path, test } of defect.tests ?? []) {
      const text = context.read(path);
      if (text === undefined) errors.push(`${where}: the test file ${path} does not exist`);
      else if (!text.includes(test)) errors.push(`${where}: ${path} does not contain "${test}"`);
    }
    if (states[2] && !defect.fixedBy.some((requirement) => context.withEvidence.has(requirement))) {
      errors.push(`${where}: hostless, but none of ${defect.fixedBy.join(', ')} has a recorded check: say it is open`);
    }
  }
  return errors;
}

/** The cases of the map that are on the expected-failure list: shown, and failing today. */
export function failingCases(file: DefectFile, context: Pick<Context, 'cases' | 'listed'>): string[] {
  const used = new Set(file.defects.flatMap((defect) => defect.cases ?? []));
  return [...used].filter((id) => {
    const found = context.cases.get(id);
    return found !== undefined && context.listed.includes(`${RUNNER} > conformance > ${found.name}`);
  }).sort();
}

const label: Record<State, string> = {
  case: 'shown by a conformance case',
  test: 'shown by another executed test',
  hostless: 'no program shows it on a host',
  open: 'open: no executed check yet',
};

export function counts(file: DefectFile): Record<State, number> {
  const total: Record<State, number> = { case: 0, test: 0, hostless: 0, open: 0 };
  for (const defect of file.defects) total[stateOf(defect)] += 1;
  return total;
}

const cell = (text: string) => text.replaceAll('|', '\\|');

export function render(file: DefectFile, context: Pick<Context, 'cases'>, order: string[]): string {
  const total = counts(file);
  const out: string[] = [
    '# The defects of the review and the cases that show them (VF-004)',
    '',
    'Generated by `bun tools/ci/conformance-defects.ts --write` from `conformance/defects.json` and the cases of this folder; do not edit it by hand.',
    'Each row is one defect listed under "Current failures" of the CMP, LNG and RT workstreams of the remediation spec. A defect is shown by a case',
    'of this suite, by another executed test, or it is listed with the reason that no program of a host shows it, or as open.',
    '',
    '| State | Defects |',
    '|---|---|',
    ...(Object.keys(label) as State[]).map((state) => `| ${label[state]} | ${total[state]} |`),
    `| all | ${file.defects.length} |`,
  ];
  for (const area of AREAS) {
    const rows = file.defects.filter((defect) => defect.id.startsWith(`${area}-`));
    if (rows.length === 0) continue;
    out.push('', `## ${area}`, '', '| Defect | Severity | Fixed by | Shown by | The defect |', '|---|---|---|---|---|');
    for (const defect of rows) {
      const state = stateOf(defect);
      const shown = [
        ...(defect.cases ?? []).map((id) => `\`${id}\``),
        ...(defect.tests ?? []).map(({ file: path, test }) => `${path.split('/').at(-1)} (${test})`),
      ];
      const detail = state === 'hostless' ? `no program: ${defect.hostless}` : state === 'open' ? `open: ${defect.open}` : '';
      const text = [defect.defect, defect.note, detail].filter((part) => part !== undefined && part !== '').join(' ');
      out.push(`| ${defect.id} | ${defect.severity} | ${defect.fixedBy.join(', ')} | ${cell(shown.join('<br>') || '-')} | ${cell(text)} |`);
    }
  }
  const rank = new Map(order.map((id, position) => [id, position]));
  const byRequirement = new Map<string, { defects: string[]; cases: Set<string> }>();
  for (const defect of file.defects) {
    for (const requirement of defect.fixedBy) {
      const entry = byRequirement.get(requirement) ?? { defects: [], cases: new Set<string>() };
      entry.defects.push(defect.id);
      for (const id of defect.cases ?? []) if (context.cases.get(id)?.requirement === requirement) entry.cases.add(id);
      byRequirement.set(requirement, entry);
    }
  }
  out.push('', '## By requirement', '', 'The defects that each requirement fixes, and the cases filed under that requirement that show them.', '', '| Requirement | Defects | Cases |', '|---|---|---|');
  for (const [requirement, entry] of [...byRequirement].sort(([a], [b]) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) || a.localeCompare(b))) {
    out.push(`| ${requirement} | ${entry.defects.join(', ')} | ${[...entry.cases].sort().map((id) => `\`${id}\``).join('<br>') || '-'} |`);
  }
  return `${out.join('\n')}\n`;
}

export function loadContext(): Context & { requirementOrder: string[] } {
  const readJson = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8')) as T;
  const cases = new Map(loadCases(new URL('conformance', ROOT).pathname).map((found) => [found.id, { requirement: found.expectation.requirement, name: found.name, build: found.expectation.build }] as const));
  const index = readJson<Array<{ id: string }>>('tools/ci/requirements-index.json');
  const evidence = readJson<Evidence>('tools/ci/requirement-evidence.json');
  return {
    cases,
    requirements: new Set(index.map((entry) => entry.id)),
    requirementOrder: index.map((entry) => entry.id),
    listed: readJson<Array<{ test: string }>>('tools/ci/expected-failures.json').map((entry) => entry.test),
    withEvidence: new Set(Object.entries(evidence).filter(([, checks]) => checks.length > 0).map(([id]) => id)),
    read: (path) => (existsSync(new URL(path, ROOT)) ? readFileSync(new URL(path, ROOT), 'utf8') : undefined),
  };
}

if (import.meta.main) {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { write: { type: 'boolean', default: false }, check: { type: 'boolean', default: false } } });
  const file = JSON.parse(readFileSync(DEFECTS_FILE, 'utf8')) as DefectFile;
  const context = loadContext();
  const errors = validate(file, context);
  const wanted = render(file, context, context.requirementOrder);
  const current = existsSync(MAP_FILE) ? readFileSync(MAP_FILE, 'utf8') : '';
  if (values.write && errors.length === 0) {
    writeFileSync(MAP_FILE, wanted);
    console.log(`conformance-defects: wrote conformance/defect-map.md for ${file.defects.length} defects`);
  } else if (values.check && current !== wanted) {
    errors.push('conformance/defect-map.md is not what conformance/defects.json and the cases generate; regenerate it with: bun tools/ci/conformance-defects.ts --write');
  }
  const total = counts(file);
  if (errors.length === 0 && !values.write) {
    console.log(`conformance-defects: ${file.defects.length} defects: ${total.case} shown by a case, ${total.test} by another executed test, ${total.hostless} not shown by any program of a host, ${total.open} open`);
    const failing = failingCases(file, context);
    if (failing.length > 0) console.log(`note: ${failing.length} of the cases are on the expected-failure list today: ${failing.join(', ')}`);
  }
  if (errors.length > 0) {
    console.error(errors.map((message) => `conformance-defects: ${message}`).join('\n'));
    process.exit(1);
  }
}
