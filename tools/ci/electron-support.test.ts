import { describe, expect, it } from 'bun:test';

import { load, problems, type Support } from './electron-support';

const support: Support = {
  recordedOn: '2026-10-10',
  source: 'the schedule',
  policy: 'the latest three',
  supportedMajors: [42, 43, 44],
  endOfLife: { 42: '2026-10-20', 43: '2027-01-05', 44: '2027-03-02' },
  latestPatch: { 42: '42.11.12', 43: '43.7.9', 44: '44.7.0' },
};

describe('the Electron line (IDE-028)', () => {
  it('IDE-028 accepts a dependency on a supported major, and its latest patch at a release', () => {
    expect(problems('43.4.1', '43.4.1', support, false)).toEqual([]);
    expect(problems('44.7.0', undefined, support, true)).toEqual([]);
  });

  it('IDE-028 fails when the dependency is on a major that Electron no longer supports, or one the record does not know', () => {
    expect(problems('41.9.9', undefined, support, false)).toEqual([expect.stringContaining('major 41, which is not supported')]);
    expect(problems('45.0.0', undefined, support, false)).toEqual([expect.stringContaining('major 45, which is not supported')]);
  });

  it('IDE-028 fails at a release when the dependency is not the latest patch of its line', () => {
    expect(problems('43.4.1', '43.4.1', support, true)).toEqual(['electron is 43.4.1; the latest patch of 43 recorded on 2026-10-10 is 43.7.9']);
  });

  it('IDE-028 refuses a range, an installed version that differs, and a record that is not three lines with their patch and end', () => {
    expect(problems('^43.4.1', undefined, support, false)[0]).toContain('pin one exact version');
    expect(problems('43.4.1', '43.3.0', support, false)[0]).toContain('the installed electron is 43.3.0');
    expect(problems('43.4.1', undefined, { ...support, supportedMajors: [43, 44] }, false)[0]).toContain('lists 2 supported majors');
    expect(problems('43.4.1', undefined, { ...support, latestPatch: { 42: '42.11.12', 44: '44.7.0' } }, false)[0]).toContain('no latest patch for 43');
  });

  it('IDE-028 holds for the dependency of this repository: it is on a supported major line, exactly pinned', () => {
    const { dependency, installed, support: committed } = load();
    expect(problems(dependency, installed, committed, false)).toEqual([]);
  });
});
