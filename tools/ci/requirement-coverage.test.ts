// Evidence for requirements (VF-027, gate 2): what counts as an executed check and how the report counts requirements.
import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import {
  JOURNEY_DECLARATION,
  cChecks,
  conformanceChecks,
  coverage,
  isFailing,
  journeyChecks,
  mergeEvidence,
  pythonChecks,
  pythonFilesRunInCi,
  reportOnlyLines,
  scanFiles,
  serializeEvidence,
  unitChecks,
  type Check,
} from './requirement-coverage';
import { buildIndex, parseMapped } from './generate-requirement-index';
import type { Inventory } from './test-inventory';
import { flattenConcatenations } from './source-text';

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
    '  it(`${name} (CMP-020)`, () => {});',
    "  test.skip('skipped one (UX-001)', () => {});",
    "  itNative('needs the runtime (CMP-051)', async () => {});",
    "  itWasm('needs the WebAssembly runtime (IDE-025)', async () => {});",
    '});',
    "describe('RETURN (CMP-036 stopgap)', () => {});",
    '// a comment that cites UX-005 is not a test name',
    'const fixture = "describe(\'a fixture held in a string (UX-010)\', () => {})";',
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

describe('a title that a formatter cut in two (VF-017)', () => {
  it('is one title: the check of a test whose name spans lines names the whole of it', () => {
    const cut = "it(\n  'CMP-001 a title that is too long for ' +\n    'one line, and the rest of it', () => {});\n";
    expect(unitChecks('x.test.ts', cut).map(([id, check]) => `${id} ${check.test}`)).toEqual([
      'CMP-001 CMP-001 a title that is too long for one line, and the rest of it',
    ]);
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
      "        run: |\n          python3 -B -m unittest discover -s tools/hil -p 'test_hil_*.py'\n          python3 " +
        '-B tools/test_crc32_cross.py',
      '        run: python3 zplc/tools/firmware-test/test_fwtest.py',
      '          python3 tools/hil/test_board_io_description.py',
    ];
    const files = [
      PY,
      'tools/hil/sub/test_hil_b.py',
      'tools/hil/test_other.py',
      'tools/test_crc32_cross.py',
      'tools/firmware-test/test_fwtest.py',
      'tools/hil/test_board_io_description.py',
      'tools/hil/test_never.py',
    ];
    expect([...pythonFilesRunInCi(files, workflows)].sort()).toEqual([
      'tools/firmware-test/test_fwtest.py',
      'tools/hil/test_board_io_description.py',
      PY,
      'tools/test_crc32_cross.py',
    ]);
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
    '  run: async () => {} },',
    "{ name: '10 Close with unsaved changes', example: 'motor_start_stop', proves: [], partly: ['IDE-005', 'VF-008'],",
    '  run: async () => {} },',
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
    // a journey starts with its name and its example; a project fixture also has a `name:`, and no `example:`
    const journeys = text.match(/name: (['"]).+?\1,\s*example:/g)!.length;
    const declared = text.match(JOURNEY_DECLARATION)!.length;
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
    const check: Check = {
      kind: 'conformance',
      ref: 'conformance/cmp/cmp-011-int-division.expect.json',
      test: 'CMP-011 INT division of a negative operand',
    };
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
    const hand = {
      'REL-001': [
        {
          kind: 'unit' as const,
          ref: REF,
          test: 'signs ad hoc (REL-001)',
          partial: true,
          note: 'asserts the configuration, not the artifact',
        },
      ],
    };
    const merged = mergeEvidence(scanned, hand);
    expect(merged['REL-001']).toEqual(hand['REL-001']);
    expect(merged['VF-001']).toHaveLength(1);
  });

  it('keeps one record for a title that appears twice in a file', () => {
    const twice: Array<[string, Check]> = [
      ['VF-001', { kind: 'unit', ref: REF, test: 'same (VF-001)' }],
      ['VF-001', { kind: 'unit', ref: REF, test: 'same (VF-001)' }],
    ];
    expect(mergeEvidence(twice, {})['VF-001']).toHaveLength(1);
  });

  it('keeps hand-written records of kinds that no scan produces', () => {
    const merged = mergeEvidence(scanned, {
      'HIL-010': [{ kind: 'hardware', ref: 'specs/records/pico.md', note: 'bench run of 2026-10-10' }],
    });
    expect(merged['HIL-010']).toHaveLength(1);
  });
});

describe('serializeEvidence', () => {
  it('orders requirements as the index does and checks by kind then file name in code-point order, whatever the locale', () => {
    const evidence = {
      'CMP-002': [
        { kind: 'unit' as const, ref: 'b.test.ts', test: 't' },
        { kind: 'unit' as const, ref: 'B.test.ts', test: 't' },
        { kind: 'conformance' as const, ref: 'c.expect.json', test: 'CMP-002 x' },
      ],
      'VF-001': [{ kind: 'unit' as const, ref: 'a.test.ts', test: 't' }],
    };
    const lines = serializeEvidence(evidence, ['VF-001', 'CMP-002']).split('\n');
    expect(lines.filter((line) => line.startsWith('  "'))).toEqual(['  "VF-001": [', '  "CMP-002": [']);
    expect(lines.filter((line) => line.startsWith('    {')).map((line) => JSON.parse(line.replace(/,$/, '')).ref)).toEqual([
      'a.test.ts',
      'c.expect.json',
      'B.test.ts',
      'b.test.ts',
    ]);
  });

  it('writes a gate after every other record of its requirement, a decision included', () => {
    const evidence = {
      'VF-001': [
        { kind: 'gate' as const, ref: 'g.md', note: 'n' },
        { kind: 'decided' as const, ref: 'd.md', note: 'n' },
        { kind: 'unit' as const, ref: 'a.test.ts', test: 't' },
      ],
    };
    const lines = serializeEvidence(evidence, ['VF-001'])
      .split('\n')
      .filter((line) => line.startsWith('    {'));
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
  const conformance = (id: string, title: string): Check => ({
    kind: 'conformance',
    ref: `conformance/${id}.expect.json`,
    test: `${id} ${title}`,
  });
  const listed = ['packages/zplc-ide/src/conformance/conformance.test.ts > conformance > VF-002 fails'];

  it('counts a requirement as covered only when a passing check that is not partial exists', () => {
    const { states, overall, byWorkstream } = coverage(
      index,
      {
        'VF-001': [conformance('VF-001', 'passes')],
        'VF-002': [conformance('VF-002', 'fails')],
        'VF-003': [{ kind: 'unit', ref: REF, test: 'RETURN (VF-003 stopgap)', partial: true }],
      },
      listed,
    );
    expect(Object.fromEntries(states)).toEqual({
      'VF-001': 'covered',
      'VF-002': 'partial',
      'VF-003': 'partial',
      'VF-004': 'uncovered',
      'CMP-001': 'uncovered',
    });
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
    const gate: Check = {
      kind: 'gate',
      ref: 'docs/docs/development/hardware-in-the-loop.md',
      note: 'a hardware record of both learner boards',
    };
    const { states, overall, kinds, gated } = coverage(
      index,
      { 'VF-001': [conformance('VF-001', 'passes'), gate], 'VF-003': [gate] },
      listed,
    );
    expect(states.get('VF-001')).toBe('partial');
    expect(states.get('VF-003')).toBe('uncovered');
    expect(kinds.get('VF-001')).toEqual([]);
    expect(gated).toEqual(['VF-001', 'VF-003']);
    expect(overall).toEqual({ total: 5, covered: 0, partial: 1, decided: 0, uncovered: 4 });
  });

  it('lets a failing case sit beside a passing one: the passing one covers, and the requirement is named as still failing', () => {
    const { states, withFailures } = coverage(
      index,
      { 'VF-002': [conformance('VF-002', 'fails'), conformance('VF-002', 'passes')], 'VF-001': [conformance('VF-001', 'passes')] },
      listed,
    );
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

  it(
    'records the second port as shipped by D-06 (option A): checks that run it, the hosted CI run as evidence, and no decided ' + 'record',
    () => {
      const port = ['IO', '016'].join('-'); // not in the title: a title that names it would be a check of it
      const kinds = new Set(evidence[port]?.map((check) => check.kind));
      expect(kinds.has('decided')).toBe(false);
      expect([...kinds].sort()).toEqual(['c-test', 'manual', 'unit']);
      const hosted = evidence[port]?.find((check) => check.kind === 'manual');
      expect(hosted?.note).toContain('freertos-port');
      expect(hosted?.note).toMatch(/run .*39783240189 on commit 8cee3dd4/);
    },
  );

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
      // a formatter cuts a long title into 'a ' + 'b' and pads the cells of a table: compare what a person reads
      if (check.kind !== 'conformance') return flattenConcatenations(text).replace(/ {2,}/g, ' ').includes(check.test!);
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

  const expectGated = (ids: string[]) => {
    const gated = Object.entries(evidence)
      .filter(([, checks]) => checks.some((check) => check.kind === 'gate' && check.note))
      .map(([id]) => id);
    expect(gated).toEqual(expect.arrayContaining(ids));
    const listed = (JSON.parse(readFileSync(new URL('tools/ci/expected-failures.json', root), 'utf8')) as Array<{ test: string }>).map(
      (entry) => entry.test,
    );
    const full = JSON.parse(readFileSync(new URL('tools/ci/requirements-index.json', root), 'utf8')) as Array<{
      id: string;
      workstream: string;
      title: string;
    }>;
    const { states } = coverage(full, evidence, listed);
    expect(ids.filter((id) => states.get(id) === 'covered')).toEqual([]);
  };

  it('gates the requirements that need a hosted run, another operating system, a person or a decision of the owner', () => {
    expectGated(['IDE-027', 'HIL-007', 'REL-030', 'REL-036', 'REL-022', 'VF-014']);
  });

  it('closes a gate only through a written decision of the owner that names the evidence it accepts instead', () => {
    // LRN-012: the owner accepted journey 57 instead of a timed study with a person (2026-10-20).
    const accepted = (evidence['LRN-012'] ?? []).filter(
      (check) => check.kind === 'manual' && /Owner decision \d{4}-\d{2}-\d{2}/.test(check.note ?? ''),
    );
    expect(accepted.length).toBeGreaterThan(0);
    expect((evidence['LRN-012'] ?? []).some((check) => check.kind === 'gate')).toBe(false);
  });

  it('closes the requirements that needed a physical board through the software review the owner accepted instead (2026-10-20)', () => {
    // Every scenario of these requirements is should_pass, or cannot_judge_in_software for a named silicon fact
    // (tools/hil/software-review/verdicts.json). COM-016 is not here: COM-016.05 still should not pass.
    const closed = [
      'HIL-001',
      'HIL-002',
      'HIL-005',
      'HIL-010',
      'HIL-012',
      'HIL-014',
      'HIL-015',
      'LRN-013',
      'LRN-024',
      'RT-025',
      'LNG-004',
      'IO-006',
      'DOC-004',
    ];
    for (const id of closed) {
      const accepted = (evidence[id] ?? []).filter(
        (check) =>
          check.kind === 'manual' &&
          /^Owner decision 2026-10-20:/.test(check.note ?? '') &&
          /no physical bench run is recorded/.test(check.note ?? ''),
      );
      expect({ id, accepted: accepted.length }).toEqual({ id, accepted: 1 });
      expect({ id, gate: (evidence[id] ?? []).some((check) => check.kind === 'gate') }).toEqual({ id, gate: false });
    }
    expect((evidence['COM-016'] ?? []).some((check) => check.kind === 'manual' && /Owner decision/.test(check.note ?? ''))).toBe(false);
  });

  it('lists every gated requirement with the evidence its gate still asks for', () => {
    const run = Bun.spawnSync([process.execPath, 'tools/ci/requirement-coverage.ts', '--list'], { cwd: root.pathname });
    expect(run.exitCode).toBe(0);
    const out = run.stdout.toString();
    const gates = records.filter(({ check }) => check.kind === 'gate');
    expect(gates.length).toBeGreaterThan(0);
    for (const { id, check } of gates) {
      expect(out).toContain(`  ${id}! `);
      expect(out).toContain(check.note!);
    }
  }, 60_000); // a whole scan of the tree in a child process: slow on a loaded machine, and its time is not what this measures

  it('adds up: every requirement of the index is covered, partial or uncovered', () => {
    const listed = (JSON.parse(readFileSync(new URL('tools/ci/expected-failures.json', root), 'utf8')) as Array<{ test: string }>).map(
      (entry) => entry.test,
    );
    const full = JSON.parse(readFileSync(new URL('tools/ci/requirements-index.json', root), 'utf8')) as Array<{
      id: string;
      workstream: string;
      title: string;
    }>;
    const { overall, byWorkstream, errors } = coverage(full, evidence, listed);
    expect(errors).toEqual([]);
    expect(overall.covered + overall.partial + overall.decided + overall.uncovered).toBe(394);
    for (const counts of Object.values(byWorkstream))
      expect(counts.covered + counts.partial + counts.decided + counts.uncovered).toBe(counts.total);
    expect(Object.values(byWorkstream).reduce((sum, counts) => sum + counts.total, 0)).toBe(394);
  });
});

// Spec 012 (the 2.1 plant simulation) is reported next to spec 011 but never gates CI (spec 012 section 7 item 1).
describe('requirement coverage of spec 012', () => {
  const run = (...args: string[]) =>
    Bun.spawnSync(['bun', 'tools/ci/requirement-coverage.ts', ...args], { cwd: new URL('../../', import.meta.url).pathname });
  const text = (result: ReturnType<typeof run>) => result.stdout.toString();
  const index012 = () =>
    JSON.parse(readFileSync(new URL('./requirement-index-012.json', import.meta.url), 'utf8')) as Array<{
      id: string;
      workstream: string;
      title: string;
    }>;

  it('requirements of spec 012 are indexed with their IDs', () => {
    const counts: Record<string, number> = {};
    for (const { workstream } of index012()) counts[workstream] = (counts[workstream] ?? 0) + 1;
    expect(counts).toEqual({ PLT: 17, VIS: 19, PRT: 10, SCN: 16, LNK: 18, CRS: 25 });
  });

  it('a requirement of spec 012 with no test and no condition is reported as uncovered, and the report never fails', () => {
    const result = run('--spec', '012', '--list');
    expect(result.exitCode).toBe(0);
    expect(text(result)).toContain('spec 012');
    expect(text(result)).toMatch(/^ {2}(PLT|VIS|PRT|SCN|LNK|CRS)-\d{3} uncovered: /m);
    expect(text(result)).toMatch(/overall\s+\d+ \/\s+105/);
  });

  it('a test that names a requirement of spec 012 covers it', () => {
    const index = index012();
    const prefixes = new Set(index.map((entry) => entry.workstream));
    const scanned = scanFiles(
      ['packages/zplc-ide/src/plant/a.test.ts'],
      () => "it('the core runs headless (PLT-001)', () => {});",
      {
        runs: [{ pattern: 'packages/zplc-ide/src/**/*.test.ts', job: 'ide' }],
        notRunInCi: [],
      } as unknown as Inventory,
      prefixes,
    );
    const { states, overall } = coverage(index, mergeEvidence(scanned, {}), []);
    expect(states.get('PLT-001')).toBe('covered');
    expect(overall.total).toBe(105);
    expect(overall.covered).toBe(1);
  });

  it('a gated requirement of spec 012 is reported as pending with what its gate still asks for, never as covered', () => {
    const index = [
      { id: 'LNK-001', workstream: 'LNK', title: 'a' },
      { id: 'LNK-002', workstream: 'LNK', title: 'b' },
      { id: 'LNK-003', workstream: 'LNK', title: 'c' },
      { id: 'CRS-001', workstream: 'CRS', title: 'd' },
    ];
    const check = (id: string): Check => ({ kind: 'unit', ref: REF, test: `a check (${id})` });
    const gate: Check = { kind: 'gate', ref: 'tools/hil/BENCH-2.1.md', note: 'a HIL run on both learner boards' };
    const lines = reportOnlyLines(
      index,
      { 'LNK-001': [check('LNK-001')], 'LNK-002': [check('LNK-002'), gate], 'LNK-003': [gate] },
      [],
      true,
    );
    const out = lines.join('\n');
    expect(out).toMatch(/^ +covered +partial +decided +uncovered +pending$/m);
    expect(out).toMatch(/^LNK +1 \/ +3 +0 +0 +0 +2$/m);
    expect(out).toMatch(/^CRS +0 \/ +1 +0 +0 +1 +0$/m);
    expect(out).toMatch(/^overall +1 \/ +4 +0 +0 +1 +2$/m);
    expect(lines).toContain('  LNK-002 pending: b');
    expect(lines).toContain('  LNK-003 pending: c');
    expect(lines).toContain('        gate: a HIL run on both learner boards');
    expect(lines).toContain('  CRS-001 uncovered: d');
    expect(out).not.toContain('LNK-001');
    // without a gate the table keeps the four columns of spec 011
    expect(reportOnlyLines(index, { 'LNK-001': [check('LNK-001')] }, [], false).join('\n')).not.toContain('pending');
  });

  it('gates LNK-016 on the HIL runs of H8 and LNK-017 on those runs and the open TCP question, and reports both pending', () => {
    const records = JSON.parse(readFileSync(new URL('./requirement-evidence-012.json', import.meta.url), 'utf8')) as Record<
      string,
      Check[]
    >;
    const known = new Set(index012().map((entry) => entry.id));
    expect(Object.keys(records).filter((id) => !known.has(id))).toEqual([]);
    for (const [id, checks] of Object.entries(records))
      for (const check of checks) {
        expect({ id, kind: ['gate', 'decided', 'manual', 'hardware'].includes(check.kind) }).toEqual({ id, kind: true });
        expect({ id, note: Boolean(check.note) }).toEqual({ id, note: true });
        expect({ id, ref: existsSync(new URL(`../../${check.ref}`, import.meta.url)) }).toEqual({ id, ref: true });
      }
    const gated = Object.keys(records).filter((id) => records[id]!.some((check) => check.kind === 'gate'));
    expect(gated).toEqual(expect.arrayContaining(['LNK-016', 'LNK-017']));
    const result = run('--spec', '012', '--list');
    expect(result.exitCode).toBe(0);
    for (const id of ['LNK-016', 'LNK-017']) {
      expect(text(result)).toContain(`  ${id} pending: `);
      for (const check of records[id]!) expect(text(result)).toContain(`        gate: ${check.note}`);
    }
  });

  it('leaves the output and the check of spec 011 as they were', () => {
    const report = run();
    expect(text(report)).not.toContain('PLT');
    expect(text(report)).toMatch(/overall\s+\d+ \/\s+394/);
    const check = run('--check');
    expect(check.exitCode).toBe(0);
    expect(text(check)).toMatch(/^requirement-coverage: \d+ of 394 requirements covered/);
  });
});

// Spec 013 (the 2.1 Studio experience) is reported like spec 012: report only, never gating CI (spec 013 section 8.2 item 1).
// The plan of milestone M1 delivers U0 and U1; the requirements of U2 and U3 are pending, not uncovered.
describe('requirement coverage of spec 013', () => {
  const run = (...args: string[]) =>
    Bun.spawnSync(['bun', 'tools/ci/requirement-coverage.ts', ...args], { cwd: new URL('../../', import.meta.url).pathname });
  const text = (result: ReturnType<typeof run>) => result.stdout.toString();
  const index013 = () =>
    JSON.parse(readFileSync(new URL('./requirement-index-013.json', import.meta.url), 'utf8')) as Array<{
      id: string;
      workstream: string;
      title: string;
      mapped?: boolean;
    }>;

  it('spec 013 is reported with its seven prefixes', () => {
    const counts: Record<string, number> = {};
    for (const { workstream } of index013()) counts[workstream] = (counts[workstream] ?? 0) + 1;
    expect(counts).toEqual({ SHL: 16, FLW: 14, TST: 10, FND: 7, MSG: 7, GDE: 13, PLS: 13 });
    const result = run('--spec', '013');
    expect(result.exitCode).toBe(0);
    expect(text(result)).toContain('spec 013');
    for (const prefix of Object.keys(counts)) expect(text(result)).toContain(prefix);
    expect(text(result)).toMatch(/overall\s+\d+ \/\s+80/);
  });

  it('a requirement of U2 or U3 is pending, not uncovered', () => {
    const result = run('--spec', '013', '--list');
    expect(result.exitCode).toBe(0);
    // GDE-013 (the first-use sessions) stays pending until the owner's step G7; GDE-001 is covered since U3-X1b.
    expect(text(result)).toContain('GDE-013 pending');
    // every requirement the plan does not deliver is listed as pending, never as uncovered
    for (const entry of index013().filter((e) => !e.mapped)) expect(text(result)).not.toContain(`${entry.id} uncovered`);
    expect(text(result)).not.toContain('TST-003 uncovered');
    const mapped = index013().filter((entry) => entry.mapped);
    expect(mapped.length).toBe(31);
    expect(index013().filter((entry) => entry.mapped === undefined)).toEqual([]);
  });

  it('a test that names a requirement of spec 013 covers it', () => {
    const index = index013();
    const prefixes = new Set(index.map((entry) => entry.workstream));
    const scanned = scanFiles(
      ['packages/zplc-ide/src/commands/a.test.ts'],
      () => "it('FND-002 every surface has a command', () => {});",
      { runs: [{ pattern: 'packages/zplc-ide/src/**/*.test.ts', job: 'ide' }], notRunInCi: [] } as unknown as Inventory,
      prefixes,
    );
    const { states } = coverage(index, mergeEvidence(scanned, {}), []);
    expect(states.get('FND-002')).toBe('covered');
  });

  // The legs of U2's requirements that U3 delivers (plan-u2 Task Q1): a gate each, read from requirement-evidence-013.json.
  it('gates the four requirements whose last leg U3 delivers on the task that closes it, and reports them pending', () => {
    const records = JSON.parse(readFileSync(new URL('./requirement-evidence-013.json', import.meta.url), 'utf8')) as Record<
      string,
      Check[]
    >;
    expect(Object.keys(records).sort()).toEqual(['FND-005', 'SHL-005', 'SHL-008', 'SHL-009']);
    const known = new Set(index013().map((entry) => entry.id));
    for (const [id, checks] of Object.entries(records))
      for (const check of checks) {
        expect({ id, known: known.has(id), kind: check.kind }).toEqual({ id, known: true, kind: 'gate' });
        expect({ id, task: /plan-u3 Tasks? [A-Z]\d/.test(check.note ?? '') }).toEqual({ id, task: true });
        expect({ id, ref: existsSync(new URL(`../../${check.ref}`, import.meta.url)) }).toEqual({ id, ref: true });
      }
    const result = run('--spec', '013', '--list');
    expect(result.exitCode).toBe(0);
    for (const id of Object.keys(records)) {
      expect(text(result)).toContain(`  ${id} pending: `);
      for (const check of records[id]!) expect(text(result)).toContain(`        gate: ${check.note}`);
    }
  });

  it('spec 013 does not change the output or the exit code of spec 011 or 012', () => {
    const report = run();
    expect(text(report)).not.toContain('SHL');
    expect(text(report)).toMatch(/overall\s+\d+ \/\s+394/);
    expect(text(run('--spec', '012'))).not.toContain('SHL');
    expect(run('--spec', 'banana').exitCode).toBe(1);
  });
});

// Spec 014 (2.1 release quality) is reported like 012 and 013: report only until FRZ-004 makes it gate. It has no plan yet, so
// every requirement without a check is pending, never uncovered.
describe('requirement coverage of spec 014', () => {
  const run = (...args: string[]) =>
    Bun.spawnSync(['bun', 'tools/ci/requirement-coverage.ts', ...args], { cwd: new URL('../../', import.meta.url).pathname });
  const text = (result: ReturnType<typeof run>) => result.stdout.toString();
  const index014 = () =>
    JSON.parse(readFileSync(new URL('./requirement-index-014.json', import.meta.url), 'utf8')) as Array<{
      id: string;
      workstream: string;
      title: string;
      level?: string;
      mapped?: boolean;
    }>;

  it('the index has 69 requirements in ten workstreams, each with a level', () => {
    const counts: Record<string, number> = {};
    for (const { workstream } of index014()) counts[workstream] = (counts[workstream] ?? 0) + 1;
    expect(index014().length).toBe(69);
    expect(counts).toEqual({ FRZ: 4, BAR: 7, JRN: 8, REV: 6, AIX: 15, UXV: 9, FIX: 4, OSS: 5, PUB: 5, RCN: 6 });
    for (const { id, level } of index014()) expect({ id, level: ['MUST', 'SHOULD'].includes(level ?? '') }).toEqual({ id, level: true });
  });

  it('spec 014 is reported with every prefix and exits 0', () => {
    const result = run('--spec', '014');
    expect(result.exitCode).toBe(0);
    expect(text(result)).toContain('spec 014');
    for (const prefix of ['FRZ', 'BAR', 'JRN', 'REV', 'AIX', 'UXV', 'FIX', 'OSS', 'PUB', 'RCN']) expect(text(result)).toContain(prefix);
    expect(text(result)).toMatch(/overall\s+\d+ \/\s+69/);
    expect(text(result)).toContain('pending');
  });

  it('a requirement of spec 014 with no check is pending, never uncovered', () => {
    const result = run('--spec', '014', '--list');
    expect(result.exitCode).toBe(0);
    for (const entry of index014().filter((e) => e.mapped === false)) expect(text(result)).not.toContain(`${entry.id} uncovered`);
    expect(index014().filter((entry) => entry.mapped === undefined)).toEqual([]);
    // BAR-001 (the reviewer's bar.md) stays pending longest; FRZ-001 is covered since the scope list.
    expect(text(result)).toContain('BAR-001 pending');
  });

  it('spec 014 does not change the output of specs 011, 012 or 013', () => {
    expect(text(run())).not.toContain('FRZ');
    expect(text(run('--spec', '013'))).not.toContain('FRZ');
    expect(run('--check').exitCode).toBe(0);
  });
});

describe('the index of spec 013 from the plan mapping table', () => {
  const plan = [
    '### Spec 013 (milestones U0 and U1)',
    '| Requirement | Task(s) | Note |',
    '|---|---|---|',
    '| SHL-006, SHL-007 | W2 | two groups |',
    '| FLW-007 to FLW-010 | W6 | target |',
    '| Section 8.1 | W0 | baseline |',
    '**Not delivered here**: SHL-005.',
    '| TST-001 | X | after the marker |',
  ].join('\n');
  const spec = ['## 6. Workstreams', '### SHL: Shell', '- **SHL-005** A. B.', '- **SHL-006** C.', '- **SHL-007** D.'].join('\n');

  it('expands a list and a range, and stops at the paragraph of what is not delivered', () => {
    expect([...parseMapped(plan)]).toEqual(['SHL-006', 'SHL-007', 'FLW-007', 'FLW-008', 'FLW-009', 'FLW-010']);
  });

  it('marks what the plan delivers and what it leaves to later milestones, and refuses an ID the spec lacks', () => {
    const short = plan.replace('FLW-007 to FLW-010', 'SHL-007');
    expect(buildIndex(spec, short, { section: 6, mapped: true }).map((entry) => [entry.id, entry.mapped])).toEqual([
      ['SHL-005', false],
      ['SHL-006', true],
      ['SHL-007', true],
    ]);
    expect(() => buildIndex(spec, plan, { section: 6, mapped: true })).toThrow('does not have: FLW-007');
  });
});
