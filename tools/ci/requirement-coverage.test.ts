// Evidence for requirements (VF-027, gate 2): what counts as an executed check and how the report counts requirements.
import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import { cChecks, conformanceChecks, coverage, isFailing, journeyChecks, mergeEvidence, unitChecks, type Check } from './requirement-coverage';

const REF = 'packages/zplc-ide/src/a.test.ts';

describe('conformanceChecks', () => {
  it('names the case by its requirement and title, as the conformance runner registers it', () => {
    const text = JSON.stringify({ requirement: 'CMP-011', title: 'ABS of a negative INT', scans: 1, scanMs: 10, expect: [] });
    expect(conformanceChecks('conformance/cmp/cmp-011-abs.expect.json', text)).toEqual([
      ['CMP-011', { kind: 'conformance', ref: 'conformance/cmp/cmp-011-abs.expect.json', test: 'CMP-011 ABS of a negative INT' }],
    ]);
  });

  it('refuses an expectation that names no requirement', () => {
    expect(() => conformanceChecks('conformance/x.expect.json', '{"title":"x"}')).toThrow('conformance/x.expect.json');
  });
});

describe('unitChecks', () => {
  const source = [
    "describe('session store (IDE-008)', () => {",
    "  it('writes atomically (IDE-008, IDE-006)', () => {",
    "    const fixture = { requirement: 'CMP-001' };",
    '  });',
    "  it(`${name} (CMP-020)`, () => {});",
    "  test.skip('skipped one (UX-001)', () => {});",
    "});",
    "describe('RETURN (CMP-036 stopgap)', () => {});",
    "// a comment that cites UX-005 is not a test name",
    "const fixture = \"describe('a fixture held in a string (UX-010)', () => {})\";",
    "expect(/x/.test('a regular expression test (UX-011)')).toBe(true);",
  ].join('\n');

  it('records one check per requirement named in a describe, it or test title', () => {
    expect(unitChecks(REF, source).map(([id, check]) => `${id} ${check.test}`)).toEqual([
      'IDE-008 session store (IDE-008)',
      'IDE-008 writes atomically (IDE-008, IDE-006)',
      'IDE-006 writes atomically (IDE-008, IDE-006)',
      'CMP-036 RETURN (CMP-036 stopgap)',
    ]);
  });

  it('ignores identifiers in bodies, comments, computed names, skipped tests and strings that hold a test', () => {
    const ids = unitChecks(REF, source).map(([id]) => id);
    for (const ignored of ['CMP-001', 'CMP-020', 'UX-001', 'UX-005', 'UX-010', 'UX-011']) expect(ids).not.toContain(ignored);
  });

  it('marks a stopgap as covering only a leg of the requirement', () => {
    const stopgap = unitChecks(REF, source).find(([id]) => id === 'CMP-036')![1];
    expect(stopgap).toEqual({ kind: 'unit', ref: REF, test: 'RETURN (CMP-036 stopgap)', partial: true });
  });
});

describe('cChecks', () => {
  const source = [
    '/**',
    ' * @file test_vm_arith_edges.c',
    ' * @brief Defined results for the edge cases of the VM (RT-005, CMP-016)',
    ' */',
    '/* ---- RT-017: resume and step continue the scan ---- */',
    '// RT-004: the STATUS field is written byte by byte',
    'printf("RT-099 is only in a string\\n");',
  ].join('\n');

  it('records the identifiers named in comments, with the comment as the stable text', () => {
    expect(cChecks('firmware/lib/zplc_core/tests/test_x.c', source).map(([id, check]) => `${id}: ${check.test}`)).toEqual([
      'RT-005: Defined results for the edge cases of the VM (RT-005, CMP-016)',
      'CMP-016: Defined results for the edge cases of the VM (RT-005, CMP-016)',
      'RT-017: RT-017: resume and step continue the scan',
      'RT-004: RT-004: the STATUS field is written byte by byte',
    ]);
  });
});

describe('journeyChecks', () => {
  const source = [
    "{ name: '9 Undo after switching tabs', example: 'motor_start_stop', proves: ['LNG-009'], partly: [],",
    "  run: async () => {} },",
    "{ name: '10 Close with unsaved changes', example: 'motor_start_stop', proves: [], partly: ['IDE-005', 'VF-008'],",
    "  run: async () => {} },",
  ].join('\n');

  it('records what each journey proves, and what it proves only in part', () => {
    expect(journeyChecks('packages/zplc-ide/scripts/journeys.ts', source)).toEqual([
      ['LNG-009', { kind: 'journey', ref: 'packages/zplc-ide/scripts/journeys.ts', test: '9 Undo after switching tabs' }],
      ['IDE-005', { kind: 'journey', ref: 'packages/zplc-ide/scripts/journeys.ts', test: '10 Close with unsaved changes', partial: true }],
      ['VF-008', { kind: 'journey', ref: 'packages/zplc-ide/scripts/journeys.ts', test: '10 Close with unsaved changes', partial: true }],
    ]);
  });
});

describe('journeys.ts', () => {
  it('declares what every journey proves in the form the scanner reads', () => {
    const text = readFileSync(new URL('../../packages/zplc-ide/scripts/journeys.ts', import.meta.url), 'utf8');
    const journeys = text.match(/^\s+name: '/gm)!.length;
    const declared = text.match(/name: '[^']+', example: '[^']*', proves: \[[^\]]*\], partly: \[[^\]]*\]/g)!.length;
    expect(journeys).toBeGreaterThan(0);
    expect(declared).toBe(journeys);
  });
});

describe('isFailing', () => {
  const listed = [
    'packages/zplc-ide/src/conformance/conformance.test.ts > conformance > CMP-011 INT division of a negative operand',
    `${REF} > session store (IDE-008) > writes atomically`,
  ];

  it('knows a conformance case by the name the runner registers it under', () => {
    const check: Check = { kind: 'conformance', ref: 'conformance/cmp/cmp-011-int-division.expect.json', test: 'CMP-011 INT division of a negative operand' };
    expect(isFailing(check, listed)).toBe(true);
    expect(isFailing({ ...check, test: 'CMP-011 ABS of a negative INT' }, listed)).toBe(false);
  });

  it('knows a describe block by any listed test inside it', () => {
    expect(isFailing({ kind: 'unit', ref: REF, test: 'session store (IDE-008)' }, listed)).toBe(true);
    expect(isFailing({ kind: 'unit', ref: 'packages/zplc-ide/src/b.test.ts', test: 'session store (IDE-008)' }, listed)).toBe(false);
  });
});

describe('mergeEvidence', () => {
  const scanned: Array<[string, Check]> = [
    ['REL-001', { kind: 'unit', ref: REF, test: 'signs ad hoc (REL-001)' }],
    ['VF-001', { kind: 'conformance', ref: 'conformance/h/a.expect.json', test: 'VF-001 a' }],
  ];

  it('keeps a hand-written record in place of the scanned one it names', () => {
    const hand = { 'REL-001': [{ kind: 'unit' as const, ref: REF, test: 'signs ad hoc (REL-001)', partial: true, note: 'asserts the configuration, not the artifact' }] };
    const merged = mergeEvidence(scanned, hand);
    expect(merged['REL-001']).toEqual(hand['REL-001']);
    expect(merged['VF-001']).toHaveLength(1);
  });

  it('keeps hand-written records of kinds that no scan produces', () => {
    const merged = mergeEvidence(scanned, { 'HIL-010': [{ kind: 'hardware', ref: 'specs/records/pico.md', note: 'bench run of 2026-10-10' }] });
    expect(merged['HIL-010']).toHaveLength(1);
  });
});

describe('coverage', () => {
  const index = [
    { id: 'VF-001', workstream: 'VF', title: 'a' },
    { id: 'VF-002', workstream: 'VF', title: 'b' },
    { id: 'VF-003', workstream: 'VF', title: 'c' },
    { id: 'VF-004', workstream: 'VF', title: 'd' },
    { id: 'CMP-001', workstream: 'CMP', title: 'e' },
  ];
  const conformance = (id: string, title: string): Check => ({ kind: 'conformance', ref: `conformance/${id}.expect.json`, test: `${id} ${title}` });
  const listed = ['packages/zplc-ide/src/conformance/conformance.test.ts > conformance > VF-002 fails'];

  it('counts a requirement as covered only when a passing check that is not partial exists', () => {
    const { states, overall, byWorkstream } = coverage(index, {
      'VF-001': [conformance('VF-001', 'passes')],
      'VF-002': [conformance('VF-002', 'fails')],
      'VF-003': [{ kind: 'unit', ref: REF, test: 'RETURN (VF-003 stopgap)', partial: true }],
    }, listed);
    expect(Object.fromEntries(states)).toEqual({ 'VF-001': 'covered', 'VF-002': 'partial', 'VF-003': 'partial', 'VF-004': 'uncovered', 'CMP-001': 'uncovered' });
    expect(overall).toEqual({ total: 5, covered: 1, partial: 2, uncovered: 2 });
    expect(byWorkstream.VF).toEqual({ total: 4, covered: 1, partial: 2, uncovered: 1 });
    expect(byWorkstream.CMP).toEqual({ total: 1, covered: 0, partial: 0, uncovered: 1 });
  });

  it('lets a failing case sit beside a passing one: the passing one covers, and the requirement is named as still failing', () => {
    const { states, withFailures } = coverage(index, { 'VF-002': [conformance('VF-002', 'fails'), conformance('VF-002', 'passes')], 'VF-001': [conformance('VF-001', 'passes')] }, listed);
    expect(states.get('VF-002')).toBe('covered');
    expect(withFailures).toEqual(['VF-002']);
  });

  it('refuses evidence or an expected failure that names a requirement the index does not have', () => {
    const { errors } = coverage(index, { 'ZZ-999': [conformance('ZZ-999', 'x')] }, []);
    expect(errors).toEqual(['evidence names ZZ-999, which is not in tools/ci/requirements-index.json']);
  });
});

describe('the committed evidence (VF-027)', () => {
  const root = new URL('../../', import.meta.url);
  const evidence = JSON.parse(readFileSync(new URL('tools/ci/requirement-evidence.json', root), 'utf8')) as Record<string, Check[]>;
  const index = JSON.parse(readFileSync(new URL('tools/ci/requirements-index.json', root), 'utf8')) as Array<{ id: string }>;
  const KINDS = ['conformance', 'unit', 'journey', 'c-test', 'manual', 'hardware'];
  const records = Object.entries(evidence).flatMap(([id, checks]) => checks.map((check) => ({ id, check })));

  it('names only requirements of the index', () => {
    const known = new Set(index.map((entry) => entry.id));
    expect(Object.keys(evidence).filter((id) => !known.has(id))).toEqual([]);
  });

  it('gives every check a known kind and a file that exists', () => {
    expect(records.filter(({ check }) => !KINDS.includes(check.kind)).map(({ id }) => id)).toEqual([]);
    expect(records.filter(({ check }) => !existsSync(new URL(check.ref, root))).map(({ id, check }) => `${id}: ${check.ref}`)).toEqual([]);
  });

  it('finds the named test in its file, so that a rename breaks the record loudly', () => {
    const named = (check: Check) => {
      const text = readFileSync(new URL(check.ref, root), 'utf8');
      if (check.kind !== 'conformance') return text.includes(check.test!);
      const { requirement, title } = JSON.parse(text) as { requirement: string; title: string };
      return `${requirement} ${title}` === check.test;
    };
    const missing = records.filter(({ check }) => check.test !== undefined && existsSync(new URL(check.ref, root)) && !named(check));
    expect(missing.map(({ id, check }) => `${id}: ${check.test}`)).toEqual([]);
  });

  it('explains every record that a person wrote', () => {
    const manual = records.filter(({ check }) => check.kind === 'manual' || check.kind === 'hardware');
    expect(manual.filter(({ check }) => !check.note).map(({ id }) => id)).toEqual([]);
  });

  it('adds up: every requirement of the index is covered, partial or uncovered', () => {
    const listed = (JSON.parse(readFileSync(new URL('tools/ci/expected-failures.json', root), 'utf8')) as Array<{ test: string }>).map((entry) => entry.test);
    const full = JSON.parse(readFileSync(new URL('tools/ci/requirements-index.json', root), 'utf8')) as Array<{ id: string; workstream: string; title: string }>;
    const { overall, byWorkstream, errors } = coverage(full, evidence, listed);
    expect(errors).toEqual([]);
    expect(overall.covered + overall.partial + overall.uncovered).toBe(387);
    for (const counts of Object.values(byWorkstream)) expect(counts.covered + counts.partial + counts.uncovered).toBe(counts.total);
    expect(Object.values(byWorkstream).reduce((sum, counts) => sum + counts.total, 0)).toBe(387);
  });
});
