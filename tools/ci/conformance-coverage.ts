// Which rows of the conformance matrix have an executed case (VF-003, WP-14).
//
//   bun tools/ci/conformance-coverage.ts                  the rows by target and state, and the rows still without a case
//   bun tools/ci/conformance-coverage.ts --list           also every uncovered row with the requirement that owns it
//   bun tools/ci/conformance-coverage.ts --tag <tag>      the cases that carry a tag, one path per line (VF-005: the firmware
//                                                         test method runs "arch-sensitive" and "alignment" on QEMU)
//   bun tools/ci/conformance-coverage.ts --write          write the "cases" of each row of conformance/matrix.json
//   bun tools/ci/conformance-coverage.ts --check          CI: fail when matrix.json is not what the cases generate, when a row
//                                                         that must work has no passing case, or a row that 2.0 rejects has no
//                                                         negative case, and the row is not in conformance/matrix-gaps.json
//
// A case names the rows it is evidence for in its own expectation (`"matrix": ["data-types.dint"]`), so adding a case needs
// no edit to a registry. A row that must work needs a passing case: one that builds and runs and is not on the expected-failure
// list (tools/ci/expected-failures.json). A row that 2.0 rejects (or leaves to decision D-04, whose recommendation is to reject
// with a message) needs a negative case, which asserts the diagnostic position. A row without one is listed in
// conformance/matrix-gaps.json with the requirement that will close it, and the entry goes stale, and fails the check, the day
// the row gets its case: the same rule as the expected-failure list, so the list can only shrink.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { CASE_TAGS, loadCases, type ConformanceCase } from '../../packages/zplc-ide/src/conformance/cases';
import { ID_PATTERN, type Requirement } from './generate-requirement-index';
import { MATRIX_FILE, serialize, validateMatrix, type Matrix, type MatrixRow } from './generate-conformance-matrix';

export interface Gap { row: string; requirement: string; reason: string; added: string }
export interface CaseFacts { id: string; name: string; build: 'succeeds' | 'fails'; matrix: string[]; tags: string[] }
/** What a row needs: a case that builds and runs, or a case that must not build. */
export type Need = 'passing' | 'negative';

export const RUNNER = 'packages/zplc-ide/src/conformance/conformance.test.ts';
const ROOT = new URL('../../', import.meta.url);
const GAPS_FILE = new URL('conformance/matrix-gaps.json', ROOT);
const CONFORMANCE = new URL('conformance', ROOT).pathname;

export const needOf = (row: Pick<MatrixRow, 'target'>): Need => (row.target === 'works' ? 'passing' : 'negative');

export function factsOf(found: ConformanceCase): CaseFacts {
  const { build, matrix, tags } = found.expectation;
  return { id: found.id, name: found.name, build, matrix, tags };
}

/** The ids the expected-failure list holds are "<runner> > conformance > <requirement> <title>". */
const isListed = (name: string, listed: string[]) => listed.includes(`${RUNNER} > conformance > ${name}`);

/** The cases of a row that count towards its need: not on the expected-failure list, and of the kind the row needs. */
export function evidenceOf(row: MatrixRow, cases: CaseFacts[], listed: string[]): { all: string[]; counting: string[] } {
  const own = cases.filter((found) => found.matrix.includes(row.id));
  const kind = needOf(row) === 'passing' ? 'succeeds' : 'fails';
  return { all: own.map((found) => found.id).sort(), counting: own.filter((found) => found.build === kind && !isListed(found.name, listed)).map((found) => found.id).sort() };
}

export interface Report {
  rows: Array<{ row: MatrixRow; need: Need; cases: string[]; counting: string[]; gap?: Gap }>;
  errors: string[];
}

export function report(matrix: Matrix, cases: CaseFacts[], listed: string[], gaps: Gap[], requirements: Set<string>): Report {
  const errors: string[] = [];
  const known = new Set(matrix.rows.map((row) => row.id));
  const byId = new Map(gaps.map((gap) => [gap.row, gap]));
  for (const found of cases) for (const id of found.matrix) if (!known.has(id)) errors.push(`${found.id} names the row ${id}, which is not in conformance/matrix.json`);
  gaps.forEach((gap, index) => {
    if (!known.has(gap.row)) errors.push(`matrix-gaps.json names the row ${gap.row}, which is not in conformance/matrix.json`);
    if (!ID_PATTERN.test(gap.requirement ?? '') || !requirements.has(gap.requirement)) errors.push(`matrix-gaps.json: ${gap.row} must name the requirement that will close it, one of tools/ci/requirements-index.json (found ${JSON.stringify(gap.requirement)})`);
    if (typeof gap.reason !== 'string' || gap.reason.trim() === '' || !/^\d{4}-\d{2}-\d{2}$/.test(gap.added ?? '')) errors.push(`matrix-gaps.json: ${gap.row} needs a reason and the date it was added (YYYY-MM-DD)`);
    if (gaps.findIndex((other) => other.row === gap.row) !== index) errors.push(`matrix-gaps.json lists ${gap.row} twice`);
  });
  const rows = matrix.rows.map((row) => {
    const { all, counting } = evidenceOf(row, cases, listed);
    const gap = byId.get(row.id);
    const need = needOf(row);
    const noun = need === 'passing' ? 'passing case' : 'negative case';
    if (counting.length === 0 && gap === undefined) errors.push(`${row.id} (${row.title}; target ${row.target}) has no ${noun}: add one under conformance/ naming "${row.id}" in its "matrix" list, or list the row in conformance/matrix-gaps.json with the requirement that will close it`);
    if (counting.length > 0 && gap !== undefined) errors.push(`matrix-gaps.json lists ${row.id}, which now has a ${noun} (${counting[0]}): remove the entry`);
    return { row, need, cases: all, counting, gap };
  });
  return { rows, errors };
}

/** What `--write` stores in the matrix: each row with the cases that name it. */
export function withCases(matrix: Matrix, cases: CaseFacts[]): Matrix {
  return { ...matrix, rows: matrix.rows.map((row) => ({ ...row, cases: cases.filter((found) => found.matrix.includes(row.id)).map((found) => found.id).sort() })) };
}

/** Rows tagged as architecture-sensitive (VF-005) that no case carries the tag for: a note, not an error. */
export function untaggedRows(matrix: Matrix, cases: CaseFacts[], tag: string): string[] {
  return matrix.rows.filter((row) => row.tags.includes(tag) && !cases.some((found) => found.matrix.includes(row.id) && found.tags.includes(tag))).map((row) => row.id);
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { list: { type: 'boolean', default: false }, tag: { type: 'string' }, write: { type: 'boolean', default: false }, check: { type: 'boolean', default: false } },
  });
  const matrix = JSON.parse(readFileSync(MATRIX_FILE, 'utf8')) as Matrix;
  const matrixErrors = validateMatrix(matrix);
  if (matrixErrors.length > 0) {
    console.error(matrixErrors.map((message) => `conformance-coverage: conformance/matrix.json: ${message}`).join('\n'));
    process.exit(1);
  }
  const found = loadCases(CONFORMANCE);
  const cases = found.map(factsOf);
  if (values.tag !== undefined) {
    if (!(CASE_TAGS as readonly string[]).includes(values.tag)) {
      console.error(`conformance-coverage: the tags are ${CASE_TAGS.join(', ')}`);
      process.exit(1);
    }
    for (const entry of found.filter((candidate) => candidate.expectation.tags.includes(values.tag as never))) console.log(entry.id);
    process.exit(0);
  }
  const listed = (JSON.parse(readFileSync(new URL('tools/ci/expected-failures.json', ROOT), 'utf8')) as Array<{ test: string }>).map((entry) => entry.test);
  const gaps = JSON.parse(readFileSync(GAPS_FILE, 'utf8')) as Gap[];
  const index = JSON.parse(readFileSync(new URL('tools/ci/requirements-index.json', ROOT), 'utf8')) as Requirement[];
  const { rows, errors } = report(matrix, cases, listed, gaps, new Set(index.map((entry) => entry.id)));
  const wanted = serialize(withCases(matrix, cases));
  const behind = serialize(matrix) !== wanted;

  if (values.write) {
    writeFileSync(MATRIX_FILE, wanted);
    console.log(`conformance-coverage: wrote the cases of ${matrix.rows.length} rows to conformance/matrix.json`);
  } else if (values.check) {
    if (behind) errors.push('conformance/matrix.json does not list the cases the tree has; regenerate it with: bun tools/ci/conformance-coverage.ts --write');
    if (errors.length === 0) {
      const works = rows.filter((entry) => entry.row.target === 'works');
      console.log(`conformance-coverage: ${works.filter((entry) => entry.counting.length > 0).length} of ${works.length} rows that must work have a passing case, ${rows.filter((entry) => entry.gap !== undefined).length} rows listed as gaps`);
    }
  } else {
    const count = (target: string, satisfied: boolean) => rows.filter((entry) => entry.row.target === target && (entry.counting.length > 0) === satisfied).length;
    const total = (target: string) => rows.filter((entry) => entry.row.target === target).length;
    console.log('target        rows  with a case that counts  gaps');
    for (const target of ['works', 'rejects', 'decision']) {
      console.log(`${target.padEnd(12)}${String(total(target)).padStart(5)}${String(count(target, true)).padStart(24)}${String(count(target, false)).padStart(7)}`);
    }
    const by = (key: 'status') => [...new Set(rows.map((entry) => entry.row[key]))].map((state) => `${state} ${rows.filter((entry) => entry.row[key] === state).length}`).join(', ');
    console.log(`\nstate today: ${by('status')}`);
    console.log(`cases: ${cases.length} (${cases.filter((entry) => entry.build === 'succeeds').length} run a program, ${cases.filter((entry) => entry.build === 'fails').length} must not build), ${cases.filter((entry) => entry.matrix.length > 0).length} name a row, ${cases.filter((entry) => entry.tags.includes('arch-sensitive')).length} architecture-sensitive, ${cases.filter((entry) => entry.tags.includes('alignment')).length} alignment-sensitive`);
    for (const tag of ['arch-sensitive', 'alignment']) {
      const missing = untaggedRows(matrix, cases, tag);
      if (missing.length > 0) console.log(`note: rows tagged ${tag} with no case that carries the tag: ${missing.join(', ')}`);
    }
    if (values.list) {
      console.log('');
      for (const entry of rows.filter((candidate) => candidate.counting.length === 0)) {
        console.log(`${entry.row.id.padEnd(62)} ${entry.row.target.padEnd(8)} ${entry.gap?.requirement ?? '??'}  ${entry.gap?.reason ?? 'NOT LISTED'}`);
      }
    }
    if (behind) console.log('\nnote: conformance/matrix.json is behind the cases; regenerate it with --write');
  }
  if (values.check && errors.length > 0) {
    console.error(errors.map((message) => `conformance-coverage: ${message}`).join('\n'));
    process.exit(1);
  }
  if (!values.check && !values.write && errors.length > 0) console.log(`\n${errors.length} problems; run with --check for the list`);
}
