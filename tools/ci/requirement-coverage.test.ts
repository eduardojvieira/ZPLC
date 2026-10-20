// Evidence for requirements (VF-027, gate 2): what counts as an executed check and how the report counts requirements.
import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import { cChecks, conformanceChecks, coverage, isFailing, journeyChecks, mergeEvidence, pythonChecks, pythonFilesRunInCi, scanFiles, serializeEvidence, unitChecks, type Check } from './requirement-coverage';
import type { Inventory } from './test-inventory';

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
    "  itNative('needs the runtime (CMP-051)', async () => {});",
    "  itWasm('needs the WebAssembly runtime (IDE-025)', async () => {});",
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
      'CMP-051 needs the runtime (CMP-051)',
      'IDE-025 needs the WebAssembly runtime (IDE-025)',
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

describe('describeCases titles', () => {
  it('counts the title of a describeCases table of the HIL harness as a unit check', () => {
    const ref = 'packages/zplc-hil/tests/blocks/timers.test.ts';
    expect(unitChecks(ref, "describeCases('HIL cases: timer blocks (HIL-001)', timerTests);")).toEqual([
      ['HIL-001', { kind: 'unit', ref, test: 'HIL cases: timer blocks (HIL-001)' }],
    ]);
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

describe('pythonChecks and the Python files CI runs', () => {
  const PY = 'tools/hil/test_hil_a.py';

  it('finds the requirement of a `# ---- ID: what it proves ----` comment line, and nothing else', () => {
    const text = [
      '"""HIL-001: a docstring is not a check."""',
      '# ---- HIL-015: the reference projects run on both sides ----',
      '    # ---- HIL-010 stopgap: the software leg ----',
      '# HIL-007 a plain comment is not a check',
      'x = "# ---- HIL-004: inside a string, but at the start of no line ----"',
    ].join('\n');
    expect(pythonChecks(PY, text)).toEqual([
      ['HIL-015', { kind: 'py-test', ref: PY, test: 'HIL-015: the reference projects run on both sides' }],
      ['HIL-010', { kind: 'py-test', ref: PY, test: 'HIL-010 stopgap: the software leg', partial: true }],
    ]);
  });

  it('takes the files from the workflow commands: a script run by path and a unittest discover glob', () => {
    const workflows = [
      "        run: |\n          python3 -B -m unittest discover -s tools/hil -p 'test_hil_*.py'\n          python3 -B tools/test_crc32_cross.py",
      '        run: python3 zplc/tools/firmware-test/test_fwtest.py',
      '          python3 tools/hil/test_board_io_description.py',
    ];
    const files = [PY, 'tools/hil/sub/test_hil_b.py', 'tools/hil/test_other.py', 'tools/test_crc32_cross.py', 'tools/firmware-test/test_fwtest.py', 'tools/hil/test_board_io_description.py', 'tools/hil/test_never.py'];
    expect([...pythonFilesRunInCi(files, workflows)].sort()).toEqual(['tools/firmware-test/test_fwtest.py', 'tools/hil/test_board_io_description.py', PY, 'tools/test_crc32_cross.py']);
  });

  it('scans a Python file only when a CI command runs it', () => {
    const text = '# ---- HIL-015: compared ----\n';
    const inventory = { runs: [], notRunInCi: [] } as unknown as Inventory;
    const scanned = scanFiles([PY, 'tools/hil/test_never.py'], () => text, inventory, undefined, new Set([PY]));
    expect(scanned.map(([id, check]) => `${id} ${check.ref}`)).toEqual([`HIL-015 ${PY}`]);
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

  it('keeps one record for a title that appears twice in a file', () => {
    const twice: Array<[string, Check]> = [['VF-001', { kind: 'unit', ref: REF, test: 'same (VF-001)' }], ['VF-001', { kind: 'unit', ref: REF, test: 'same (VF-001)' }]];
    expect(mergeEvidence(twice, {})['VF-001']).toHaveLength(1);
  });

  it('keeps hand-written records of kinds that no scan produces', () => {
    const merged = mergeEvidence(scanned, { 'HIL-010': [{ kind: 'hardware', ref: 'specs/records/pico.md', note: 'bench run of 2026-10-10' }] });
    expect(merged['HIL-010']).toHaveLength(1);
  });
});

describe('serializeEvidence', () => {
  it('orders requirements as the index does and checks by kind then file name in code-point order, whatever the locale', () => {
    const evidence = {
      'CMP-002': [{ kind: 'unit' as const, ref: 'b.test.ts', test: 't' }, { kind: 'unit' as const, ref: 'B.test.ts', test: 't' }, { kind: 'conformance' as const, ref: 'c.expect.json', test: 'CMP-002 x' }],
      'VF-001': [{ kind: 'unit' as const, ref: 'a.test.ts', test: 't' }],
    };
    const lines = serializeEvidence(evidence, ['VF-001', 'CMP-002']).split('\n');
    expect(lines.filter((line) => line.startsWith('  "'))).toEqual(['  "VF-001": [', '  "CMP-002": [']);
    expect(lines.filter((line) => line.startsWith('    {')).map((line) => JSON.parse(line.replace(/,$/, '')).ref)).toEqual(['a.test.ts', 'c.expect.json', 'B.test.ts', 'b.test.ts']);
  });

  it('writes a gate after every other record of its requirement, a decision included', () => {
    const evidence = { 'VF-001': [{ kind: 'gate' as const, ref: 'g.md', note: 'n' }, { kind: 'decided' as const, ref: 'd.md', note: 'n' }, { kind: 'unit' as const, ref: 'a.test.ts', test: 't' }] };
    const lines = serializeEvidence(evidence, ['VF-001']).split('\n').filter((line) => line.startsWith('    {'));
    expect(lines.map((line) => JSON.parse(line.replace(/,$/, '')).kind)).toEqual(['unit', 'decided', 'gate']);
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
    expect(overall).toEqual({ total: 5, covered: 1, partial: 2, decided: 0, uncovered: 2 });
    expect(byWorkstream.VF).toEqual({ total: 4, covered: 1, partial: 2, decided: 0, uncovered: 1 });
    expect(byWorkstream.CMP).toEqual({ total: 1, covered: 0, partial: 0, decided: 0, uncovered: 1 });
  });

  it('counts a decided requirement in its own column, never as covered, until a passing check exists', () => {
    const decided: Check = { kind: 'decided', ref: 'docs/docs/runtime/port-interface.md', test: 'decision D-06', note: 'D-06 default B' };
    const { states, overall } = coverage(index, { 'VF-004': [decided], 'VF-001': [decided, conformance('VF-001', 'passes')] }, listed);
    expect(states.get('VF-004')).toBe('decided');
    expect(states.get('VF-001')).toBe('covered');
    expect(overall).toEqual({ total: 5, covered: 1, partial: 0, decided: 1, uncovered: 3 });
  });

  it('keeps a gated requirement out of covered whatever its checks, counts a gate alone as no check, and names every gated one', () => {
    const gate: Check = { kind: 'gate', ref: 'docs/docs/development/hardware-in-the-loop.md', note: 'a hardware record of both learner boards' };
    const { states, overall, kinds, gated } = coverage(index, { 'VF-001': [conformance('VF-001', 'passes'), gate], 'VF-003': [gate] }, listed);
    expect(states.get('VF-001')).toBe('partial');
    expect(states.get('VF-003')).toBe('uncovered');
    expect(kinds.get('VF-001')).toEqual([]);
    expect(gated).toEqual(['VF-001', 'VF-003']);
    expect(overall).toEqual({ total: 5, covered: 0, partial: 1, decided: 0, uncovered: 4 });
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
  const KINDS = ['conformance', 'unit', 'journey', 'c-test', 'manual', 'hardware', 'py-test', 'decided', 'gate'];
  const records = Object.entries(evidence).flatMap(([id, checks]) => checks.map((check) => ({ id, check })));

  it('records the second port as decided by D-06 (default B), not as covered by a check', () => {
    const port = ['IO', '016'].join('-'); // not in the title: a title that names it would be a check of it
    expect(evidence[port]?.map((check) => check.kind)).toEqual(['decided']);
    expect(evidence[port]?.[0]?.note).toContain('D-06');
  });

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
    const manual = records.filter(({ check }) => ['manual', 'hardware', 'decided', 'gate'].includes(check.kind));
    expect(manual.filter(({ check }) => !check.note).map(({ id }) => id)).toEqual([]);
  });

  it('gates the requirements that only a run on a physical board can meet, so that no test or comment covers them', () => {
    const board = ['HIL-001', 'HIL-010', 'HIL-015', 'LRN-013', 'LRN-024'];
    const gated = Object.entries(evidence).filter(([, checks]) => checks.some((check) => check.kind === 'gate' && check.note)).map(([id]) => id);
    expect(gated).toEqual(expect.arrayContaining(board));
    const listed = (JSON.parse(readFileSync(new URL('tools/ci/expected-failures.json', root), 'utf8')) as Array<{ test: string }>).map((entry) => entry.test);
    const full = JSON.parse(readFileSync(new URL('tools/ci/requirements-index.json', root), 'utf8')) as Array<{ id: string; workstream: string; title: string }>;
    const { states } = coverage(full, evidence, listed);
    expect(board.filter((id) => states.get(id) === 'covered')).toEqual([]);
  });

  it('lists every gated requirement with the evidence its gate still asks for', () => {
    const run = Bun.spawnSync(['bun', 'tools/ci/requirement-coverage.ts', '--list'], { cwd: root.pathname });
    expect(run.exitCode).toBe(0);
    const out = run.stdout.toString();
    const gates = records.filter(({ check }) => check.kind === 'gate');
    expect(gates.length).toBeGreaterThan(0);
    for (const { id, check } of gates) {
      expect(out).toContain(`  ${id}! `);
      expect(out).toContain(check.note!);
    }
  });

  it('adds up: every requirement of the index is covered, partial or uncovered', () => {
    const listed = (JSON.parse(readFileSync(new URL('tools/ci/expected-failures.json', root), 'utf8')) as Array<{ test: string }>).map((entry) => entry.test);
    const full = JSON.parse(readFileSync(new URL('tools/ci/requirements-index.json', root), 'utf8')) as Array<{ id: string; workstream: string; title: string }>;
    const { overall, byWorkstream, errors } = coverage(full, evidence, listed);
    expect(errors).toEqual([]);
    expect(overall.covered + overall.partial + overall.decided + overall.uncovered).toBe(387);
    for (const counts of Object.values(byWorkstream)) expect(counts.covered + counts.partial + counts.decided + counts.uncovered).toBe(counts.total);
    expect(Object.values(byWorkstream).reduce((sum, counts) => sum + counts.total, 0)).toBe(387);
  });
});
