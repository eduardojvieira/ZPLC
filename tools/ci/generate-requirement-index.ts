// The tracked requirement index (VF-027, WP-01-T7). The spec of the 2.0 remediation may be untracked, so CI reads
// requirement identifiers from tools/ci/requirements-index.json and never from the spec itself.
//
//   bun tools/ci/generate-requirement-index.ts           regenerate the index from the spec (section 5) and the plan (appendix 12)
//   bun tools/ci/generate-requirement-index.ts --check   CI: fail when the committed index is not what the spec generates;
//                                                        when the spec or the plan is absent, only check that the index is well formed
//   --spec <file> --plan <file>                          where to read them (default: specs/011-zplc-2-0-remediation/)
//   --out <file>                                         the index to write or check (default: tools/ci/requirements-index.json);
//                                                        spec 012 has its own, tools/ci/requirement-index-012.json, with
//                                                        --spec and --plan naming specs/012-zplc-2-1-plant-simulation/{spec,plan}.md
//   --section <n> --mapped                               spec 013 (tools/ci/requirement-index-013.json): its requirements are
//                                                        in section 6; --plan names plan-m1.md, whose table "Spec 013 (milestones
//                                                        U0 and U1)" marks each requirement it delivers `mapped: true`; the others
//                                                        (U2, U3) get `mapped: false`
//
// Regenerate whenever a requirement is added, removed or reworded in the spec, and commit the result.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

export interface Requirement {
  id: string;
  workstream: string;
  title: string;
  /** Phase and owning package come from the plan's coverage appendix; absent when the plan does not name the requirement. */
  phase?: number;
  workPackage?: string;
  alsoAdvancedBy?: string[];
  /** Spec 013 only: whether the plan of milestone M1 delivers it (a row of its mapping table); false is for U2 and U3. */
  mapped?: boolean;
}

export const ID_PATTERN = /^[A-Z]{2,4}-[0-9]{3}$/;
const ROOT = new URL('../../', import.meta.url);
export const INDEX_FILE = new URL('tools/ci/requirements-index.json', ROOT);
const SPEC_DIR = 'specs/011-zplc-2-0-remediation/';
const TITLE_MAX = 140;

function title(text: string): string {
  const plain = text.replaceAll('`', '').trim();
  // The first sentence ends at a full stop before a capital or a bracket; "e.g." and "i.e." do not end one.
  const guarded = plain.replace(/\b(e\.g|i\.e)\./g, (abbreviation) => abbreviation.replaceAll('.', '\u0000'));
  const end = /[.!?](?=\s+[A-Z(])/.exec(guarded)?.index;
  const sentence = (end === undefined ? guarded : guarded.slice(0, end + 1)).replaceAll('\u0000', '.');
  if (sentence.length <= TITLE_MAX) return sentence;
  return `${sentence.slice(0, sentence.lastIndexOf(' ', TITLE_MAX)).trimEnd()}…`;
}

/** The requirement bullets of section 5, in spec order. */
export function parseSpec(spec: string, sectionNumber = 5): Array<{ id: string; workstream: string; title: string }> {
  const start = spec.search(new RegExp(`^## ${sectionNumber}\\. `, 'm'));
  if (start < 0) throw new Error(`the spec has no "## ${sectionNumber}." section`);
  const after = spec.slice(start + 1);
  const end = after.search(/^## /m);
  const section = end < 0 ? after : after.slice(0, end);
  const found: Array<{ id: string; workstream: string; title: string }> = [];
  const seen = new Set<string>();
  let heading = '';
  for (const line of section.split('\n')) {
    heading = /^### ([A-Z]{2,4}):/.exec(line)?.[1] ?? heading;
    const match = /^- \*\*([A-Z]{2,4}-[0-9]{3})\*\* (.+)$/.exec(line);
    if (!match) continue;
    const [, id = '', text = ''] = match;
    const workstream = id.slice(0, id.indexOf('-'));
    if (seen.has(id)) throw new Error(`${id} appears twice in section 5`);
    if (workstream !== heading) throw new Error(`${id} is under the ${heading || 'missing'} heading`);
    seen.add(id);
    found.push({ id, workstream, title: title(text) });
  }
  return found;
}

/** Owner, phase and the packages that also advance each requirement, from the rows of the coverage appendix. */
export function parsePlan(plan: string): Map<string, { workPackage: string; phase: number; alsoAdvancedBy: string[] }> {
  const rows = new Map<string, { workPackage: string; phase: number; alsoAdvancedBy: string[] }>();
  for (const match of plan.matchAll(/^\| ([A-Z]{2,4}-[0-9]{3}) \| (WP-[0-9]+) \| ([0-9]+) \|([^|]*)\|\s*$/gm)) {
    const [, id = '', workPackage = '', phase = '', also = ''] = match;
    rows.set(id, {
      workPackage,
      phase: Number(phase),
      alsoAdvancedBy: also
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    });
  }
  return rows;
}

/**
 * The requirement IDs of the mapping table of spec 013 in plan-m1.md: the first cell of each row, a list ("A-001, A-002") or
 * a range ("FLW-007 to FLW-010"), between the heading "### Spec 013 (milestones" and the paragraph "Not delivered here".
 */
export function parseMapped(plan: string): Set<string> {
  const start = plan.search(/^### Spec 013 \(milestones/m);
  if (start < 0) throw new Error('the plan has no "### Spec 013 (milestones" mapping table');
  const rest = plan.slice(start);
  const end = rest.search(/\*\*Not delivered here\*\*/);
  const mapped = new Set<string>();
  for (const line of (end < 0 ? rest : rest.slice(0, end)).split('\n')) {
    const cell = /^\| ([A-Z]{2,4}-[0-9]{3}[^|]*) \|/.exec(line)?.[1] ?? '';
    if (cell === '') continue;
    for (const range of cell.split(',')) {
      const bounds = /^\s*([A-Z]{2,4})-([0-9]{3})(?: to \1-([0-9]{3}))?\s*$/.exec(range);
      if (!bounds) throw new Error(`cannot read the requirement cell "${cell}"`);
      const [, prefix = '', first = '0', last = first] = bounds;
      for (let number = Number(first); number <= Number(last); number++) mapped.add(`${prefix}-${String(number).padStart(3, '0')}`);
    }
  }
  return mapped;
}

export interface IndexOptions {
  /** The section of the spec that holds the requirement bullets (5 for specs 011 and 012, 6 for spec 013). */
  section?: number;
  /** Read `plan` as plan-m1.md and mark each requirement `mapped`, instead of reading the coverage appendix of spec 011's plan. */
  mapped?: boolean;
}

export function buildIndex(spec: string, plan?: string, options: IndexOptions = {}): Requirement[] {
  const requirements = parseSpec(spec, options.section);
  if (options.mapped) {
    if (plan === undefined) throw new Error('--mapped needs the plan');
    const mapped = parseMapped(plan);
    const known = new Set(requirements.map((requirement) => requirement.id));
    const unknown = [...mapped].filter((id) => !known.has(id));
    if (unknown.length > 0) throw new Error(`the plan maps requirements that the spec does not have: ${unknown.join(', ')}`);
    return requirements.map((requirement) => ({ ...requirement, mapped: mapped.has(requirement.id) }));
  }
  const rows = plan === undefined ? new Map<string, { workPackage: string; phase: number; alsoAdvancedBy: string[] }>() : parsePlan(plan);
  const known = new Set(requirements.map((requirement) => requirement.id));
  const unknown = [...rows.keys()].filter((id) => !known.has(id));
  if (unknown.length > 0) throw new Error(`the plan names requirements that the spec does not have: ${unknown.join(', ')}`);
  return requirements.map((requirement) => ({ ...requirement, ...rows.get(requirement.id) }));
}

export function validateIndex(index: unknown): string[] {
  if (!Array.isArray(index)) return ['the index must be an array'];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const entry of index as Array<Record<string, unknown>>) {
    const id = String(entry?.id);
    if (typeof entry?.id !== 'string' || !ID_PATTERN.test(entry.id)) {
      errors.push(`${id}: id must look like CMP-012`);
      continue;
    }
    if (seen.has(id)) errors.push(`${id}: duplicate`);
    seen.add(id);
    if (entry.workstream !== id.slice(0, id.indexOf('-')))
      errors.push(`${id}: workstream ${String(entry.workstream)} does not match the identifier`);
    if (typeof entry.title !== 'string' || entry.title.trim() === '') errors.push(`${id}: title must not be empty`);
    if (entry.workPackage !== undefined && !/^WP-[0-9]+$/.test(String(entry.workPackage)))
      errors.push(`${id}: workPackage must look like WP-12`);
    if (entry.phase !== undefined && !Number.isInteger(entry.phase)) errors.push(`${id}: phase must be a whole number`);
    if (entry.mapped !== undefined && typeof entry.mapped !== 'boolean') errors.push(`${id}: mapped must be true or false`);
    const also = entry.alsoAdvancedBy;
    if (also !== undefined && !(Array.isArray(also) && also.every((item) => /^WP-[0-9]+$/.test(String(item)))))
      errors.push(`${id}: alsoAdvancedBy must list packages like WP-12`);
  }
  return errors;
}

/** One requirement per line, so that a change to the spec shows as a small diff. */
export const serialize = (index: Requirement[]): string => `[\n${index.map((entry) => `  ${JSON.stringify(entry)}`).join(',\n')}\n]\n`;

const REGENERATE = 'regenerate it with: bun tools/ci/generate-requirement-index.ts';

export function checkAgainstSpec(committed: string, spec: string, plan?: string, options: IndexOptions = {}): string[] {
  const expected = buildIndex(spec, plan, options);
  if (committed === serialize(expected)) return [];
  let current: Array<Record<string, unknown>> = [];
  try {
    current = JSON.parse(committed) as Array<Record<string, unknown>>;
  } catch {
    return [`requirements-index.json is not valid JSON; ${REGENERATE}`];
  }
  const before = new Map(current.map((entry) => [String(entry.id), JSON.stringify(entry)]));
  const after = new Map(expected.map((entry) => [entry.id, JSON.stringify(entry)]));
  const names = (ids: string[]) =>
    ids.length === 0 ? 'none' : ids.slice(0, 8).join(', ') + (ids.length > 8 ? ` and ${ids.length - 8} more` : '');
  const added = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  const changed = [...after].filter(([id, text]) => before.has(id) && before.get(id) !== text).map(([id]) => id);
  return [`requirements-index.json is stale (added ${names(added)}; removed ${names(removed)}; changed ${names(changed)}); ${REGENERATE}`];
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      check: { type: 'boolean', default: false },
      spec: { type: 'string' },
      plan: { type: 'string' },
      out: { type: 'string' },
      section: { type: 'string' },
      mapped: { type: 'boolean', default: false },
    },
  });
  const specFile = values.spec ?? new URL(`${SPEC_DIR}spec.md`, ROOT).pathname;
  const planFile = values.plan ?? new URL(`${SPEC_DIR}plan.md`, ROOT).pathname;
  const outFile = values.out ?? INDEX_FILE.pathname;
  const options: IndexOptions = { ...(values.section !== undefined && { section: Number(values.section) }), mapped: values.mapped };
  const sources =
    existsSync(specFile) && existsSync(planFile)
      ? { spec: readFileSync(specFile, 'utf8'), plan: readFileSync(planFile, 'utf8') }
      : undefined;
  let errors: string[] = [];
  if (values.check) {
    const committed = readFileSync(outFile, 'utf8');
    try {
      errors = validateIndex(JSON.parse(committed));
    } catch {
      errors = ['requirements-index.json is not valid JSON'];
    }
    if (errors.length === 0 && sources) errors = checkAgainstSpec(committed, sources.spec, sources.plan, options);
    if (errors.length === 0)
      console.log(
        `requirement-index: ${(JSON.parse(committed) as unknown[]).length} requirements${
          sources ? ', in step with the spec' : ' (spec or plan not present: only checked that the index is well formed)'
        }`,
      );
  } else if (!sources) {
    errors = [`the spec and the plan are needed to regenerate the index: ${specFile}, ${planFile}`];
  } else {
    const index = buildIndex(sources.spec, sources.plan, options);
    errors = validateIndex(index);
    if (errors.length === 0) {
      writeFileSync(outFile, serialize(index));
      console.log(`requirement-index: wrote ${index.length} requirements to ${values.out ?? 'tools/ci/requirements-index.json'}`);
    }
  }
  if (errors.length > 0) {
    console.error(errors.map((message) => `requirement-index: ${message}`).join('\n'));
    process.exit(1);
  }
}
