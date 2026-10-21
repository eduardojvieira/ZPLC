// The tracked conformance matrix (VF-003) and the report that says which rows have a case. The matrix is generated
// from section 6 of the spec; CI reads only the committed file, and these tests are where the committed file is checked.
import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import { loadCases } from '../../packages/zplc-ide/src/conformance/cases';
import { evidenceOf, factsOf, needOf, report, untaggedRows, withCases, type CaseFacts, type Gap } from './conformance-coverage';
import {
  buildMatrix,
  checkAgainstSpec,
  expandRequirements,
  parseSection,
  serialize,
  validateMatrix,
  type Matrix,
  type MatrixRow,
} from './generate-conformance-matrix';

const spec = [
  '## 5. Workstreams',
  '- **CMP-001** Not a row.',
  '## 6. IEC 61131-3 conformance matrix for 2.0',
  '**State today:** Works.',
  '### 6.1 Data types',
  '| Element | State today | 2.0 target | Requirement |',
  '|---|---|---|---|',
  '| `BOOL` | Works | Works | CMP-025 |',
  '| `INT` | Broken for negative values | Works | CMP-011 |',
  '| `CHAR`, `WCHAR` | Missing; `CHAR` accepted with size 0 | Decision D-04 (2.x recommended); rejected with a message | CMP-003 |',
  '| Arrays of arrays | Missing | Decision D-04 (2.x recommended) | CMP-006 |',
  '### 6.5 Statements and operators',
  '| Element | State today | 2.0 target | Requirement |',
  '|---|---|---|---|',
  '| Communication blocks (12) | Broken: handshake and bounds | Works | COM-001 to COM-003 |',
  '| `BOOL` | Registered, not executed | Works | CMP-025, CMP-026 |',
  '| Unknown mnemonic | Broken: the parser does not terminate | Reported as an error | LNG-017 |',
  '## 7. Feature preservation inventory',
  '| `SHOULD_NOT_BE_READ` | Works | Works | CMP-099 |',
].join('\n');

const row = (overrides: Partial<MatrixRow>): MatrixRow => ({
  id: 'data-types.bool',
  area: 'data-types',
  section: '6.1',
  title: 'BOOL',
  status: 'works',
  statusText: 'Works',
  target: 'works',
  targetText: 'Works',
  requirements: ['CMP-025'],
  cases: [],
  tags: [],
  ...overrides,
});
const matrixOf = (...rows: MatrixRow[]): Matrix => ({ schemaVersion: 1, source: 'specs/011-zplc-2-0-remediation/spec.md section 6', rows });
const fact = (overrides: Partial<CaseFacts>): CaseFacts => ({
  id: 'cmp/a',
  name: 'CMP-025 a',
  build: 'succeeds',
  matrix: ['data-types.bool'],
  tags: [],
  ...overrides,
});
const RUNNER = 'packages/zplc-ide/src/conformance/conformance.test.ts';
const requirements = new Set(['CMP-025', 'CMP-011', 'COM-006']);
const gap = (overrides: Partial<Gap> = {}): Gap => ({
  row: 'data-types.bool',
  requirement: 'CMP-025',
  reason: 'the case fails',
  added: '2026-10-10',
  ...overrides,
});

describe('parseSection', () => {
  const rows = parseSection(spec);

  it('reads the tables of section 6 and nothing outside it', () => {
    expect(rows.map((entry) => entry.id)).toEqual([
      'data-types.bool',
      'data-types.int',
      'data-types.char-wchar',
      'data-types.arrays-of-arrays',
      'statements.communication-blocks-12',
      'statements.bool',
      'statements.unknown-mnemonic',
    ]);
  });

  it('classifies the state today and the 2.0 target by the words of the table, and keeps those words', () => {
    expect(rows.map((entry) => [entry.status, entry.target])).toEqual([
      ['works', 'works'],
      ['broken', 'works'],
      ['missing', 'rejects'],
      ['missing', 'decision'],
      ['broken', 'works'],
      ['unverified', 'works'],
      ['broken', 'rejects'],
    ]);
    expect(rows[1]).toMatchObject({
      title: 'INT',
      section: '6.1',
      area: 'data-types',
      statusText: 'Broken for negative values',
      targetText: 'Works',
    });
  });

  it('expands a range of requirements and a list', () => {
    expect(rows[4]!.requirements).toEqual(['COM-001', 'COM-002', 'COM-003']);
    expect(rows[5]!.requirements).toEqual(['CMP-025', 'CMP-026']);
    expect(expandRequirements('CMP-011, CMP-016')).toEqual(['CMP-011', 'CMP-016']);
    expect(() => expandRequirements('CMP-001 to COM-003')).toThrow('crosses workstreams');
  });

  it('stops on a state or target no rule reads and on a subsection with no area, so that a new row is a decision', () => {
    expect(() => parseSection(spec.replace('| Works | Works | CMP-025 |', '| Sometimes | Works | CMP-025 |'))).toThrow(
      'no rule reads the state today "Sometimes"',
    );
    expect(() => parseSection(spec.replace('| Works | Works | CMP-025 |', '| Works | Eventually | CMP-025 |'))).toThrow(
      'no rule reads the 2.0 target "Eventually"',
    );
    expect(() => parseSection(spec.replace('### 6.5 Statements and operators', '### 6.5 Something new'))).toThrow('no area slug');
    expect(() => parseSection(spec.replace('| CMP-025 |', '| nothing |'))).toThrow('names no requirement');
  });

  it('stops, for the whole spec, on a name or an architecture-sensitive row that section 6 no longer has', () => {
    expect(() => parseSection(spec, true)).toThrow('SLUGS names elements that section 6 no longer has');
  });

  it('gives two elements of one area and one name two different ids', () => {
    const doubled = spec.replace(
      '| Arrays of arrays | Missing | Decision D-04 (2.x recommended) | CMP-006 |',
      '| `BOOL` | Works | Works | CMP-025 |',
    );
    expect(
      parseSection(doubled)
        .map((entry) => entry.id)
        .slice(0, 4),
    ).toEqual(['data-types.bool', 'data-types.int', 'data-types.char-wchar', 'data-types.bool-2']);
  });
});

describe('the committed matrix', () => {
  const committed = JSON.parse(readFileSync(new URL('../../conformance/matrix.json', import.meta.url), 'utf8')) as Matrix;
  const specFile = new URL('../../specs/011-zplc-2-0-remediation/spec.md', import.meta.url);

  it('is well formed, and its rows are the ones of section 6: 94 that must work, 5 that are rejected, 12 left to D-04', () => {
    expect(validateMatrix(committed)).toEqual([]);
    const count = (target: string) => committed.rows.filter((entry) => entry.target === target).length;
    expect([committed.rows.length, count('works'), count('rejects'), count('decision')]).toEqual([111, 94, 5, 12]);
  });

  it('is in step with section 6 while the spec is tracked, and says so when it cannot check', () => {
    if (!existsSync(specFile)) return; // the spec is untracked: CI checks that the file is well formed, above
    expect(checkAgainstSpec(committed, readFileSync(specFile, 'utf8'))).toEqual([]);
  });

  it('lists exactly the cases that name each row, which is what conformance-coverage --write generates', () => {
    const cases = loadCases(new URL('../../conformance', import.meta.url).pathname).map(factsOf);
    expect(serialize(withCases(committed, cases))).toBe(serialize(committed));
  });

  it(
    'has a passing case for every row that must work, a negative case for every row that is rejected, or a gap that names the ' +
      'requirement',
    () => {
      const cases = loadCases(new URL('../../conformance', import.meta.url).pathname).map(factsOf);
      const listed = (
        JSON.parse(readFileSync(new URL('./expected-failures.json', import.meta.url), 'utf8')) as Array<{ test: string }>
      ).map((entry) => entry.test);
      const gaps = JSON.parse(readFileSync(new URL('../../conformance/matrix-gaps.json', import.meta.url), 'utf8')) as Gap[];
      const index = JSON.parse(readFileSync(new URL('./requirements-index.json', import.meta.url), 'utf8')) as Array<{ id: string }>;
      expect(report(committed, cases, listed, gaps, new Set(index.map((entry) => entry.id))).errors).toEqual([]);
    },
  );

  it('tags every row that is architecture-sensitive with a case that carries the tag (VF-005)', () => {
    const cases = loadCases(new URL('../../conformance', import.meta.url).pathname).map(factsOf);
    // A row whose only tagged case is on the expected-failure list still names it; the rule is about the tag, not the result.
    expect(untaggedRows(committed, cases, 'arch-sensitive')).toEqual([]);
    expect(untaggedRows(committed, cases, 'alignment')).toEqual([]);
  });
});

describe('checkAgainstSpec', () => {
  const generated = buildMatrix(spec, () => [], false);

  it('accepts the matrix that the spec generates, whatever cases it lists', () => {
    expect(checkAgainstSpec(generated, spec, false)).toEqual([]);
    expect(checkAgainstSpec(withCases(generated, [fact({})]), spec, false)).toEqual([]);
  });

  it('names the rows added, removed and changed, and a changed order', () => {
    const reworded = spec
      .replace('| `INT` | Broken for negative values |', '| `INT` | Works |')
      .replace('| Arrays of arrays |', '| Arrays of structures |');
    const [message] = checkAgainstSpec(generated, reworded, false);
    expect(message).toContain('stale');
    expect(message).toContain('added data-types.arrays-of-structures');
    expect(message).toContain('removed data-types.arrays-of-arrays');
    expect(message).toContain('changed data-types.int');
    const swapped: Matrix = { ...generated, rows: [generated.rows[1]!, generated.rows[0]!, ...generated.rows.slice(2)] };
    expect(checkAgainstSpec(swapped, spec, false)[0]).toContain('order differs');
  });
});

describe('validateMatrix', () => {
  it('refuses what the generator never writes', () => {
    expect(validateMatrix(matrixOf(row({})))).toEqual([]);
    expect(validateMatrix({ rows: [] })).toHaveLength(1);
    expect(validateMatrix(matrixOf(row({ id: 'Bool' })))[0]).toContain('id must look like');
    expect(validateMatrix(matrixOf(row({}), row({})))).toContain('data-types.bool: duplicate');
    expect(validateMatrix(matrixOf(row({ status: 'ok' as never })))[0]).toContain('status must be one of');
    expect(validateMatrix(matrixOf(row({ target: 'maybe' as never })))[0]).toContain('target must be one of');
    expect(validateMatrix(matrixOf(row({ requirements: [] })))[0]).toContain('requirements');
    expect(validateMatrix(matrixOf(row({ cases: ['not a path'] })))[0]).toContain('cases');
    expect(validateMatrix(matrixOf(row({ tags: ['fast'] })))[0]).toContain('tags');
    expect(validateMatrix(matrixOf(row({ area: 'literals' })))[0]).toContain('must start with its area');
  });
});

describe('what a row needs', () => {
  it('is a passing case when 2.0 makes it work and a negative case when 2.0 rejects it or leaves it to D-04', () => {
    expect(needOf(row({ target: 'works' }))).toBe('passing');
    expect(needOf(row({ target: 'rejects' }))).toBe('negative');
    expect(needOf(row({ target: 'decision' }))).toBe('negative');
  });

  it('counts a case that builds for a row that must work, and a case that must not build for a row that is rejected', () => {
    const cases = [fact({ id: 'cmp/runs', name: 'CMP-025 runs' }), fact({ id: 'cmp/refused', name: 'CMP-003 refused', build: 'fails' })];
    expect(evidenceOf(row({ target: 'works' }), cases, [])).toEqual({ all: ['cmp/refused', 'cmp/runs'], counting: ['cmp/runs'] });
    expect(evidenceOf(row({ target: 'rejects' }), cases, [])).toEqual({ all: ['cmp/refused', 'cmp/runs'], counting: ['cmp/refused'] });
  });

  it('does not count a case that is on the expected-failure list, because it does not pass', () => {
    const cases = [fact({ id: 'cmp/runs', name: 'CMP-025 runs' })];
    expect(evidenceOf(row({}), cases, [`${RUNNER} > conformance > CMP-025 runs`]).counting).toEqual([]);
    expect(evidenceOf(row({}), cases, [`${RUNNER} > conformance > CMP-025 runs`]).all).toEqual(['cmp/runs']);
  });
});

describe('report', () => {
  const bool = row({});
  const refused = row({ id: 'data-types.char-wchar', title: 'CHAR', target: 'rejects', status: 'missing', requirements: ['CMP-003'] });
  const matrix = matrixOf(bool, refused);
  const covered = [fact({}), fact({ id: 'cmp/char', name: 'CMP-003 char', build: 'fails', matrix: ['data-types.char-wchar'] })];

  it('has no error when every row has a counting case', () => {
    expect(report(matrix, covered, [], [], requirements).errors).toEqual([]);
  });

  it('asks for a case, or a gap that names the requirement, for a row with none', () => {
    const { errors } = report(matrix, [covered[0]!], [], [], requirements);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('data-types.char-wchar');
    expect(errors[0]).toContain('negative case');
    expect(errors[0]).toContain('matrix-gaps.json');
  });

  it('accepts a gap for a row that has no counting case, with the case that fails on the list', () => {
    const failing = [`${RUNNER} > conformance > CMP-003 char`];
    expect(report(matrix, covered, failing, [gap({ row: 'data-types.char-wchar', requirement: 'COM-006' })], requirements).errors).toEqual(
      [],
    );
  });

  it('refuses a gap that has gone stale, one for an unknown row, one without a known requirement and a repeated one', () => {
    expect(report(matrix, covered, [], [gap()], requirements).errors[0]).toContain('now has a passing case');
    expect(report(matrix, covered, [], [gap({ row: 'data-types.nothing' })], requirements).errors[0]).toContain('data-types.nothing');
    expect(
      report(matrix, covered, [], [gap({ requirement: 'CMP-999' })], requirements).errors.some((message) =>
        message.includes('requirement that will close it'),
      ),
    ).toBe(true);
    expect(
      report(matrix, covered, [], [gap({ reason: ' ' })], requirements).errors.some((message) => message.includes('needs a reason')),
    ).toBe(true);
    const twice = report(
      matrix,
      [covered[0]!],
      [],
      [gap({ row: 'data-types.char-wchar' }), gap({ row: 'data-types.char-wchar' })],
      requirements,
    ).errors;
    expect(twice.some((message) => message.includes('twice'))).toBe(true);
  });

  it('refuses a case that names a row the matrix does not have', () => {
    expect(
      report(matrix, [...covered, fact({ id: 'cmp/typo', name: 'CMP-025 typo', matrix: ['data-types.bol'] })], [], [], requirements)
        .errors[0],
    ).toContain('data-types.bol');
  });
});

describe('withCases and untaggedRows', () => {
  it('lists the cases that name a row, sorted, and none for a row no case names', () => {
    const cases = [fact({ id: 'cmp/b' }), fact({ id: 'cmp/a' }), fact({ id: 'cmp/other', matrix: ['literals.typed'] })];
    expect(withCases(matrixOf(row({}), row({ id: 'data-types.int' })), cases).rows.map((entry) => entry.cases)).toEqual([
      ['cmp/a', 'cmp/b'],
      [],
    ]);
  });

  it('names a row tagged architecture-sensitive that no case carries the tag for', () => {
    const tagged = matrixOf(row({ tags: ['arch-sensitive'] }));
    expect(untaggedRows(tagged, [fact({})], 'arch-sensitive')).toEqual(['data-types.bool']);
    expect(untaggedRows(tagged, [fact({ tags: ['arch-sensitive', 'division'] })], 'arch-sensitive')).toEqual([]);
  });
});
