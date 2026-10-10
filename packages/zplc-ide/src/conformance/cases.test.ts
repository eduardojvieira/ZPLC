import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cellLocation, loadCases, parseExpectation } from './cases';

const conformanceRoot = fileURLToPath(new URL('../../../../conformance', import.meta.url));

const runtime = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  requirement: 'CMP-011',
  title: 'INT division of a negative operand',
  scans: 1,
  scanMs: 10,
  expect: [{ at: '%QW0', type: 'INT', value: -4 }],
  ...overrides,
});
const rejects = (text: string, message: string) => expect(() => parseExpectation(text, 'case.expect.json')).toThrow(message);

describe('parseExpectation', () => {
  it('accepts a case that runs the program and a case that must not build', () => {
    expect(parseExpectation(runtime(), 'x')).toMatchObject({ build: 'succeeds', scans: 1, scanMs: 10, fault: false, inputs: [], files: [] });
    expect(parseExpectation(runtime(), 'x')).toMatchObject({ expect: [{ at: '%QW0', type: 'INT', value: -4, afterScan: 1 }] });
    expect(parseExpectation(JSON.stringify({ requirement: 'CMP-001', title: 'x', build: 'fails', lines: [6] }), 'x'))
      .toEqual({ requirement: 'CMP-001', title: 'x', build: 'fails', lines: [6], messageIncludes: [], matrix: [], tags: [], files: [], tasks: [] });
  });

  it('defaults a check to the last scan and an input to the first', () => {
    const parsed = parseExpectation(runtime({
      scans: 3,
      inputs: [{ at: '%IX0.0', type: 'BOOL', value: true }, { at: '%IX0.1', type: 'BOOL', value: true, beforeScan: 2 }],
      expect: [{ var: 'total', type: 'REAL', value: 1.5 }, { at: '%QX0.0', type: 'BOOL', value: false, afterScan: 2 }],
    }), 'x');
    if (parsed.build !== 'succeeds') throw new Error('expected a case that builds');
    expect(parsed.inputs.map((input) => input.beforeScan)).toEqual([1, 2]);
    expect(parsed.expect.map((check) => check.afterScan)).toEqual([3, 2]);
  });

  it('accepts a case that ends in a VM fault with nothing else to read', () => {
    expect(parseExpectation(runtime({ fault: true, expect: [] }), 'x')).toMatchObject({ fault: true, expect: [] });
  });

  it('accepts the exact list of the warnings of a build that passes, and rejects one that is not a warning', () => {
    expect(parseExpectation(runtime({ warnings: [{ code: 'IMPLICIT_NARROWING', line: 7 }] }), 'x')).toMatchObject({ warnings: [{ code: 'IMPLICIT_NARROWING', line: 7 }] });
    expect(parseExpectation(runtime({ warnings: [] }), 'x')).toMatchObject({ warnings: [] });
    expect(parseExpectation(runtime(), 'x')).not.toHaveProperty('warnings');
    rejects(runtime({ warnings: [{ code: 'narrowing', line: 7 }] }), 'code must be a diagnostic code');
    rejects(runtime({ warnings: [{ code: 'IMPLICIT_NARROWING' }] }), 'line must be a line number');
    rejects(runtime({ warnings: [{ code: 'IMPLICIT_NARROWING', line: 1, column: 2 }] }), 'unknown key "column"');
    rejects(JSON.stringify({ requirement: 'CMP-001', title: 'x', build: 'fails', lines: [6], warnings: [] }), 'unknown key "warnings"');
  });

  it('names the file in every rejection', () => {
    expect(() => parseExpectation('{', 'a/b.expect.json')).toThrow('a/b.expect.json');
    expect(() => parseExpectation(runtime({ scans: 0 }), 'a/b.expect.json')).toThrow('a/b.expect.json');
  });

  it('rejects text that is not a JSON object', () => {
    rejects('{', 'not valid JSON');
    rejects('[]', 'must be a JSON object');
    rejects('null', 'must be a JSON object');
  });

  it('rejects a misspelled key, because a typo would silently drop an assertion', () => {
    rejects(runtime({ scan: 2 }), 'unknown key "scan"');
    rejects(runtime({ expect: [{ at: '%QW0', type: 'INT', value: 1, aftrScan: 1 }] }), 'unknown key "aftrScan"');
    rejects(JSON.stringify({ requirement: 'CMP-001', title: 'x', build: 'fails', scans: 1 }), 'unknown key "scans"');
  });

  it.each(['', 'cmp-011', 'CMP-11', 'CMP011', 'CMP-0111', 42])('rejects the requirement %p', (requirement) => {
    rejects(runtime({ requirement }), 'requirement');
  });

  it('requires a title and a known build outcome', () => {
    rejects(runtime({ title: '' }), 'title');
    rejects(runtime({ title: undefined }), 'title');
    rejects(runtime({ build: 'maybe' }), 'build');
  });

  it.each([0, -1, 1.5, '2', null, 100_001])('rejects scans %p', (scans) => {
    rejects(runtime({ scans }), 'scans');
  });

  it.each([0, 1.5, '10', undefined])('rejects scanMs %p', (scanMs) => {
    rejects(runtime({ scanMs }), 'scanMs');
  });

  it('rejects a case that asserts nothing', () => {
    rejects(runtime({ expect: [] }), 'asserts nothing');
    rejects(runtime({ expect: undefined }), 'asserts nothing');
  });

  it('rejects a check that names both or neither of an address and a variable', () => {
    rejects(runtime({ expect: [{ at: '%QW0', var: 'x', type: 'INT', value: 1 }] }), 'exactly one of "at" and "var"');
    rejects(runtime({ expect: [{ type: 'INT', value: 1 }] }), 'exactly one of "at" and "var"');
  });

  it('rejects an unknown type and a value that does not belong to its type', () => {
    rejects(runtime({ expect: [{ at: '%QW0', type: 'INTEGER', value: 1 }] }), 'type');
    rejects(runtime({ expect: [{ at: '%QW0', type: 'INT', value: '1' }] }), 'value');
    rejects(runtime({ expect: [{ at: '%QW0', type: 'INT', value: 1.5 }] }), 'value');
    rejects(runtime({ expect: [{ at: '%QW0', type: 'INT', value: 32768 }] }), 'value');
    rejects(runtime({ expect: [{ at: '%QB0', type: 'SINT', value: 128 }] }), 'value');
    rejects(runtime({ expect: [{ at: '%QB0', type: 'USINT', value: -1 }] }), 'value');
    rejects(runtime({ expect: [{ at: '%QX0.0', type: 'BOOL', value: 1 }] }), 'value');
    rejects(runtime({ expect: [{ at: '%QD0', type: 'REAL', value: Number.NaN }] }), 'value');
    rejects(runtime({ expect: [{ at: '%QD0', type: 'UDINT', value: -1 }] }), 'value');
  });

  it('rejects an address that is malformed or whose size does not match the type', () => {
    rejects(runtime({ expect: [{ at: 'QW0', type: 'INT', value: 1 }] }), 'address');
    rejects(runtime({ expect: [{ at: '%QW', type: 'INT', value: 1 }] }), 'address');
    rejects(runtime({ expect: [{ at: '%QZ0', type: 'INT', value: 1 }] }), 'address');
    rejects(runtime({ expect: [{ at: '%QD0', type: 'INT', value: 1 }] }), 'width');
    rejects(runtime({ expect: [{ at: '%QX0.0', type: 'INT', value: 1 }] }), 'width');
    rejects(runtime({ expect: [{ at: '%QW0', type: 'BOOL', value: true }] }), 'width');
    rejects(runtime({ expect: [{ at: '%QX0', type: 'BOOL', value: true }] }), 'bit');
    rejects(runtime({ expect: [{ at: '%QX0.8', type: 'BOOL', value: true }] }), 'bit');
    rejects(runtime({ expect: [{ at: '%QW0.1', type: 'INT', value: 1 }] }), 'bit');
  });

  it('rejects a scan number outside the run', () => {
    rejects(runtime({ expect: [{ at: '%QW0', type: 'INT', value: 1, afterScan: 2 }] }), 'afterScan');
    rejects(runtime({ expect: [{ at: '%QW0', type: 'INT', value: 1, afterScan: 0 }] }), 'afterScan');
    rejects(runtime({ inputs: [{ at: '%IW0', type: 'INT', value: 1, beforeScan: 2 }] }), 'beforeScan');
  });

  it('only lets a case set inputs in the input image', () => {
    rejects(runtime({ inputs: [{ at: '%QW0', type: 'INT', value: 1 }] }), 'input');
    rejects(runtime({ inputs: [{ var: 'x', type: 'INT', value: 1 }] }), 'input');
  });

  it('rejects bad lines, messages and files', () => {
    const negative = (overrides: Record<string, unknown>) => JSON.stringify({ requirement: 'CMP-001', title: 'x', build: 'fails', ...overrides });
    rejects(negative({ lines: [0] }), 'lines');
    rejects(negative({ lines: 'six' }), 'lines');
    rejects(negative({ messageIncludes: [''] }), 'messageIncludes');
    rejects(runtime({ files: ['../x.st'] }), 'files');
    rejects(runtime({ files: ['x.txt'] }), 'files');
    rejects(runtime({ fault: 'yes' }), 'fault');
  });
});

describe('parseExpectation: matrix rows, tags and located diagnostics (VF-003, VF-005)', () => {
  const negative = (overrides: Record<string, unknown>) => JSON.stringify({ requirement: 'CMP-003', title: 'x', build: 'fails', ...overrides });

  it('carries the matrix rows, the tags and the note of a case that runs and of one that must not build', () => {
    expect(parseExpectation(runtime({ matrix: ['data-types.dint'], tags: ['arch-sensitive', 'division'], note: 'IEC 61131-3 table 33: DIV' }), 'x'))
      .toMatchObject({ matrix: ['data-types.dint'], tags: ['arch-sensitive', 'division'], note: 'IEC 61131-3 table 33: DIV' });
    expect(parseExpectation(negative({ matrix: ['data-types.char-wchar'] }), 'x')).toMatchObject({ build: 'fails', matrix: ['data-types.char-wchar'], tags: [] });
  });

  it('asserts diagnostic codes and columns of a rejected program, one for each line', () => {
    expect(parseExpectation(negative({ lines: [4, 7], columns: [3, 9], codes: ['COMPILATION_FAILED', 'COMPILATION_FAILED'] }), 'x'))
      .toMatchObject({ lines: [4, 7], columns: [3, 9], codes: ['COMPILATION_FAILED', 'COMPILATION_FAILED'] });
    rejects(negative({ columns: [3] }), 'columns needs "lines"');
    rejects(negative({ lines: [4], columns: [3, 9] }), 'one column for each line');
    rejects(negative({ lines: [4], columns: [0] }), 'columns');
    rejects(negative({ lines: [4, 7], codes: ['COMPILATION_FAILED'] }), 'same length');
    rejects(negative({ codes: ['compilation failed'] }), 'codes');
  });

  it('refuses a matrix row that is not an id, a repeated row, an unknown tag and a tag without arch-sensitive', () => {
    rejects(runtime({ matrix: ['Data types'] }), 'matrix');
    rejects(runtime({ matrix: ['data-types.dint', 'data-types.dint'] }), 'twice');
    rejects(runtime({ tags: ['arch-sensitive', 'fast'] }), 'tags');
    rejects(runtime({ tags: ['alignment'] }), 'arch-sensitive');
    rejects(runtime({ note: '' }), 'note');
  });

  it('describes the tasks of a project, with defaults, and refuses a task that is not well formed', () => {
    const parsed = parseExpectation(runtime({ scanMs: 20, files: ['other.st'], tasks: [{ name: 'Fast', programs: ['main.st'] }, { name: 'Slow', trigger: 'cyclic', interval_ms: 100, priority: 7, programs: ['other.st'] }] }), 'x');
    expect(parsed.tasks).toEqual([
      { name: 'Fast', trigger: 'cyclic', interval_ms: 20, priority: 1, programs: ['main.st'] },
      { name: 'Slow', trigger: 'cyclic', interval_ms: 100, priority: 7, programs: ['other.st'] },
    ]);
    expect(parseExpectation(negative({ files: ['other.st'], tasks: [{ name: 'Ev', trigger: 'event', programs: ['other.st'] }] }), 'x')).toMatchObject({ build: 'fails', files: ['other.st'], tasks: [{ trigger: 'event' }] });
    rejects(runtime({ tasks: [{ name: 'Bad name', programs: ['main.st'] }] }), 'name');
    rejects(runtime({ tasks: [{ name: 'T', trigger: 'sometimes', programs: ['main.st'] }] }), 'trigger');
    rejects(runtime({ tasks: [{ name: 'T', programs: [] }] }), 'programs');
    rejects(runtime({ tasks: [{ name: 'T', priority: 256, programs: ['main.st'] }] }), 'priority');
    rejects(runtime({ tasks: [{ name: 'T', programs: ['main.st'], watchdog: 1 }] }), 'unknown key "watchdog"');
  });

  it('does not let a run-only key sit in a rejected case, nor a reject-only key in a case that runs', () => {
    rejects(negative({ scans: 1 }), 'unknown key "scans"');
    rejects(runtime({ codes: ['COMPILATION_FAILED'] }), 'unknown key "codes"');
  });
});

describe('cellLocation', () => {
  it.each([
    ['%QW2', 'INT', { address: 0x1004, size: 2 }],
    ['%QX0.3', 'BOOL', { address: 0x1000, size: 1, bit: 3 }],
    ['%IB5', 'BYTE', { address: 5, size: 1 }],
    ['%ID1', 'DINT', { address: 4, size: 4 }],
    ['%MD1', 'REAL', { address: 0x2004, size: 4 }],
  ] as const)('maps %s as %s', (at, type, expected) => {
    expect(cellLocation(at, type)).toEqual(expected);
  });
});

describe('loadCases', () => {
  const tree = (files: Record<string, string>) => {
    const root = mkdtempSync(join(tmpdir(), 'zplc-cases-'));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return root;
  };
  const load = (files: Record<string, string>) => {
    const root = tree(files);
    try {
      return loadCases(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it('pairs every .expect.json with the source file of the same name, in any language, in any folder', () => {
    const cases = load({
      'a/one.st': 'PROGRAM P END_PROGRAM',
      'a/one.expect.json': runtime(),
      'b/two.ld.json': '{}',
      'b/two.expect.json': runtime({ title: 'second' }),
    });
    expect(cases.map((found) => [found.name, found.extension])).toEqual([
      ['CMP-011 INT division of a negative operand', '.st'],
      ['CMP-011 second', '.ld.json'],
    ]);
  });

  it('rejects an expectation without a source, a source without an expectation, and two sources for one case', () => {
    expect(() => load({ 'one.expect.json': runtime() })).toThrow('no source file');
    expect(() => load({ 'one.st': 'x', 'one.expect.json': runtime(), 'orphan.st': 'x' })).toThrow('orphan.st');
    expect(() => load({ 'one.st': 'x', 'one.il': 'x', 'one.expect.json': runtime() })).toThrow('more than one source');
  });

  it('rejects two cases with one name, because the name identifies the test', () => {
    expect(() => load({ 'a.st': 'x', 'a.expect.json': runtime(), 'b.st': 'x', 'b.expect.json': runtime() })).toThrow('duplicate case name');
  });

  it('lets a case bring extra source files and rejects one that is missing', () => {
    const [found] = load({ 'p.st': 'x', 'lib.st': 'x', 'p.expect.json': runtime({ files: ['lib.st'] }) });
    expect(found!.extras.map((path) => path.split('/').pop())).toEqual(['lib.st']);
    expect(() => load({ 'p.st': 'x', 'p.expect.json': runtime({ files: ['lib.st'] }) })).toThrow('lib.st');
  });

  it('refuses a task that runs a program the case does not have', () => {
    const tasks = [{ name: 'T', programs: ['ghost.st'] }];
    expect(() => load({ 'p.st': 'x', 'p.expect.json': runtime({ tasks }) })).toThrow('ghost.st');
    expect(load({ 'p.st': 'x', 'ghost.st': 'x', 'p.expect.json': runtime({ tasks, files: ['ghost.st'] }) })).toHaveLength(1);
    expect(() => load({ 'p.st': 'x', 'p.expect.json': runtime({ tasks: [{ name: 'T', programs: ['main.il'] }] }) })).toThrow('main.il');
  });

  it('lets a case that must not build bring further files, as a case that runs does', () => {
    const [found] = load({ 'p.st': 'x', 'lib.st': 'x', 'p.expect.json': JSON.stringify({ requirement: 'CMP-035', title: 'x', build: 'fails', files: ['lib.st'] }) });
    expect(found!.extras.map((path) => path.split('/').pop())).toEqual(['lib.st']);
  });

  it('knows each case by its path under the root, without the extension', () => {
    const [found] = load({ 'cmp/cmp-011-x.st': 'x', 'cmp/cmp-011-x.expect.json': runtime() });
    expect(found!.id).toBe('cmp/cmp-011-x');
  });

  it('refuses a matrix row that the matrix of the same root does not have, and accepts one it has', () => {
    const matrix = JSON.stringify({ schemaVersion: 1, rows: [{ id: 'data-types.dint' }] });
    expect(load({ 'a.st': 'x', 'a.expect.json': runtime({ matrix: ['data-types.dint'] }), 'matrix.json': matrix })).toHaveLength(1);
    expect(() => load({ 'a.st': 'x', 'a.expect.json': runtime({ matrix: ['data-types.dnit'] }), 'matrix.json': matrix })).toThrow('data-types.dnit');
  });

  it('reads a malformed expectation as a failure that names the file', () => {
    expect(() => load({ 'deep/one.st': 'x', 'deep/one.expect.json': '{"requirement": "CMP-011"}' })).toThrow('one.expect.json');
  });
});

describe('the committed cases', () => {
  it('all load: each has a source, a valid expectation and a unique name', () => {
    expect(loadCases(conformanceRoot).length).toBeGreaterThanOrEqual(2);
  });
});
