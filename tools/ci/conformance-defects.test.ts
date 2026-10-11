import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { counts, failingCases, loadContext, render, stateOf, validate, type Context, type Defect, type DefectFile } from './conformance-defects';

const good: Defect = { id: 'CMP-D01a', severity: 'Blocker', defect: 'A thing goes wrong.', fixedBy: ['CMP-001'], cases: ['cmp/cmp-001-a'] };
const context: Context = {
  cases: new Map([
    ['cmp/cmp-001-a', { requirement: 'CMP-001', name: 'CMP-001 a thing is refused', build: 'fails' }],
    ['cmp/cmp-002-b', { requirement: 'CMP-002', name: 'CMP-002 another thing', build: 'succeeds' }],
  ]),
  requirements: new Set(['CMP-001', 'CMP-002', 'RT-001', 'RT-019']),
  listed: [],
  withEvidence: new Set(['CMP-001', 'RT-001']),
  read: (path) => (path === 'tests/a.test.ts' ? "it('names the defect', () => {})" : undefined),
};
const check = (...defects: Defect[]) => validate({ schema: 1, defects }, context);

describe('the map of defects and cases (VF-004)', () => {
  it('accepts a defect that a case shows, that a test shows, that no program shows with a requirement that has a check, and an open one', () => {
    expect(check(
      good,
      { ...good, id: 'CMP-D01b', cases: undefined, tests: [{ file: 'tests/a.test.ts', test: 'names the defect' }] },
      { ...good, id: 'RT-D01a', fixedBy: ['RT-001'], cases: undefined, hostless: 'a thread, not a program' },
      { ...good, id: 'RT-D03a', fixedBy: ['RT-019'], cases: undefined, open: 'no executed check yet' },
    )).toEqual([]);
  });

  it('refuses a case that does not exist, and a case filed under a requirement that does not fix the defect', () => {
    expect(check({ ...good, cases: ['cmp/missing'] })).toEqual(['defects.json: CMP-D01a: the case cmp/missing does not exist under conformance/']);
    expect(check({ ...good, cases: ['cmp/cmp-002-b'] })[0]).toContain('is filed under CMP-002, which is not one of CMP-001');
  });

  it('refuses a test whose file or name is not there, so that a rename breaks the map loudly', () => {
    const shown: Defect = { ...good, cases: undefined };
    expect(check({ ...shown, tests: [{ file: 'tests/missing.test.ts', test: 'x' }] })[0]).toContain('does not exist');
    expect(check({ ...shown, tests: [{ file: 'tests/a.test.ts', test: 'renamed' }] })[0]).toContain('does not contain "renamed"');
  });

  it('refuses a defect that nothing shows, and states that exclude each other', () => {
    const bare: Defect = { ...good, cases: undefined };
    expect(check(bare)[0]).toContain('give a case, a test, "hostless" or "open"');
    expect(check({ ...good, hostless: 'why' })[0]).toContain('neither hostless nor open');
    expect(check({ ...bare, hostless: 'why', open: 'why' })[0]).toContain('exclude each other');
    expect(check({ ...bare, open: ' ' })[0]).toContain('open must say why');
  });

  it('refuses "no program shows it" when none of the requirements that fix the defect has a check', () => {
    const errors = check({ ...good, fixedBy: ['RT-019'], cases: undefined, hostless: 'a processor' });
    expect(errors).toEqual(['defects.json: CMP-D01a: hostless, but none of RT-019 has a recorded check: say it is open']);
  });

  it('refuses an id that is not one, a repeated id, an unknown requirement, an unknown key and a missing statement', () => {
    expect(check({ ...good, id: 'CMP-1' })[0]).toContain('is not an id like CMP-D01a');
    expect(check(good, good)[0]).toContain('is listed twice');
    expect(check({ ...good, fixedBy: ['CMP-999'] })[0]).toContain('CMP-999 is not a requirement');
    expect(check({ ...good, extra: 1 } as Defect)[0]).toContain('unknown key "extra"');
    expect(check({ ...good, defect: ' ' })[0]).toContain('say what the defect is');
    expect(check({ ...good, fixedBy: [] })[0]).toContain('name the requirements');
  });

  it('reports the cases of the map that the expected-failure list holds, and counts the states', () => {
    const file: DefectFile = { schema: 1, defects: [good, { ...good, id: 'CMP-D01b', cases: undefined, open: 'later' }] };
    const listed = { ...context, listed: ['packages/zplc-ide/src/conformance/conformance.test.ts > conformance > CMP-001 a thing is refused'] };
    expect(failingCases(file, listed)).toEqual(['cmp/cmp-001-a']);
    expect(counts(file)).toEqual({ case: 1, test: 0, hostless: 0, open: 1 });
    expect(stateOf(file.defects[1]!)).toBe('open');
  });

  it('renders each defect with its cases, and each requirement with the defects it fixes', () => {
    const text = render({ schema: 1, defects: [good] }, context, ['CMP-001']);
    expect(text).toContain('| CMP-D01a | Blocker | CMP-001 | `cmp/cmp-001-a` | A thing goes wrong. |');
    expect(text).toContain('| CMP-001 | CMP-D01a | `cmp/cmp-001-a` |');
  });
});

describe('the committed map (VF-004)', () => {
  const file = JSON.parse(readFileSync(new URL('../../conformance/defects.json', import.meta.url), 'utf8')) as DefectFile;
  const repository = loadContext();

  it('has a case, a test, a reason or an open mark for every defect of the review, and each of them checks out', () => {
    expect(validate(file, repository)).toEqual([]);
    expect(file.defects.length).toBeGreaterThanOrEqual(130);
  });

  it('covers each workstream of the review: CMP, LNG and RT', () => {
    for (const area of ['CMP', 'LNG', 'RT']) expect(file.defects.some((defect) => defect.id.startsWith(`${area}-`))).toBe(true);
  });

  it('is the map that the tool generates from the defects and the cases', () => {
    const committed = readFileSync(new URL('../../conformance/defect-map.md', import.meta.url), 'utf8');
    expect(committed).toBe(render(file, repository, repository.requirementOrder));
  });

  it('has more defects shown by a case than shown any other way', () => {
    // the shape of the list, not its numbers: a defect that a program can show is shown by a case
    const total = counts(file);
    expect(total.case).toBeGreaterThan(total.test + total.hostless + total.open);
  });
});
