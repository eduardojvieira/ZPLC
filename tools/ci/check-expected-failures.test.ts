import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkRun, parseJunit, validateEntries, type Entry, type Status } from './check-expected-failures';

const entry = (overrides: Partial<Entry> = {}): Entry => ({
  test: 'packages/zplc-ide/src/a.test.ts > block > case',
  requirement: 'CMP-012',
  added: '2026-10-09',
  reason: 'fails until CMP-012 lands',
  ...overrides,
});
const run = (...results: Array<[string, Status]>) => new Map<string, Status>(results);
const SUITE = 'packages/zplc-ide';

const junit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="4" failures="1" skipped="1">
  <testsuite name="src/a.test.ts" file="src/a.test.ts" tests="4">
    <testsuite name="outer" file="src/a.test.ts" tests="3">
      <testsuite name="inner" file="src/a.test.ts" tests="1">
        <testcase name="fails &quot;quoted&quot; &lt;x&gt; &amp; y" classname="inner &gt; outer" file="src/a.test.ts">
          <failure type="AssertionError" message="boom">AssertionError</failure>
        </testcase>
      </testsuite>
      <testcase name="passes" classname="outer" file="src/a.test.ts" />
      <testcase name="skipped" classname="outer" file="src/a.test.ts">
        <skipped />
      </testcase>
    </testsuite>
    <testcase name="top level" classname="" file="src/a.test.ts" />
  </testsuite>
</testsuites>`;

describe('parseJunit', () => {
  it('identifies each test by suite, file, describe path and decoded name, with its status', () => {
    expect(parseJunit(junit, SUITE)).toEqual(run(
      ['packages/zplc-ide/src/a.test.ts > outer > inner > fails "quoted" <x> & y', 'fail'],
      ['packages/zplc-ide/src/a.test.ts > outer > passes', 'pass'],
      ['packages/zplc-ide/src/a.test.ts > outer > skipped', 'skip'],
      ['packages/zplc-ide/src/a.test.ts > top level', 'pass'],
    ));
  });
});

describe('validateEntries', () => {
  it('accepts a well-formed list, including the empty one', () => {
    expect(validateEntries([])).toEqual([]);
    expect(validateEntries([entry(), entry({ test: 'packages/zplc-compiler/src/b.test.ts > x' })])).toEqual([]);
  });

  it.each(['', 'cmp-012', 'CMP-12', 'CMP012', 'CMP-0123', '1-001'])('rejects the requirement %p', (requirement) => {
    expect(validateEntries([entry({ requirement })]).join('\n')).toContain('requirement');
  });

  it.each([undefined, '', '09/10/2026', '2026-1-9', '2026-13-01', '2026-02-30'])('rejects the date %p', (added) => {
    expect(validateEntries([entry({ added: added as string })]).join('\n')).toContain('added');
  });

  it('rejects a missing reason, a missing test and a test that no CI suite runs', () => {
    expect(validateEntries([entry({ reason: '' })]).join('\n')).toContain('reason');
    expect(validateEntries([entry({ test: '' })]).join('\n')).toContain('test');
    expect(validateEntries([entry({ test: 'scripts/x.test.ts > y' })]).join('\n')).toContain('suite');
  });

  it('rejects a duplicated test and anything that is not a list of objects', () => {
    expect(validateEntries([entry(), entry({ requirement: 'CMP-013' })]).join('\n')).toContain('duplicate');
    expect(validateEntries({}).join('\n')).toContain('array');
    expect(validateEntries([null]).join('\n')).toContain('object');
  });
});

describe('checkRun', () => {
  const listed = entry();

  it('is quiet when every failure is listed and still fails', () => {
    expect(checkRun([listed], run([listed.test, 'fail'], ['packages/zplc-ide/src/a.test.ts > ok', 'pass']), SUITE, 1)).toEqual([]);
  });

  it('is quiet for an empty list and a clean run', () => {
    expect(checkRun([], run(['packages/zplc-ide/src/a.test.ts > ok', 'pass']), SUITE, 0)).toEqual([]);
  });

  it('fails on a failure that is not listed, naming it', () => {
    const errors = checkRun([], run(['packages/zplc-ide/src/a.test.ts > bad', 'fail']), SUITE, 1);
    expect(errors).toEqual(['unlisted failure: packages/zplc-ide/src/a.test.ts > bad']);
  });

  it('fails on a listed test that now passes, so the list can only shrink', () => {
    const errors = checkRun([listed], run([listed.test, 'pass']), SUITE, 0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('remove');
    expect(errors[0]).toContain(listed.test);
  });

  it('fails on a listed test that did not run, was skipped or was renamed', () => {
    expect(checkRun([listed], run([listed.test, 'skip']), SUITE, 0)).toHaveLength(1);
    expect(checkRun([listed], run(['packages/zplc-ide/src/a.test.ts > other', 'pass']), SUITE, 0)).toHaveLength(1);
  });

  it('ignores entries that belong to another suite', () => {
    const other = entry({ test: 'packages/zplc-compiler/src/b.test.ts > x' });
    expect(checkRun([other], run(['packages/zplc-ide/src/a.test.ts > ok', 'pass']), SUITE, 0)).toEqual([]);
  });

  it('fails when the command failed but the report shows no failing test', () => {
    const errors = checkRun([], run(['packages/zplc-ide/src/a.test.ts > ok', 'pass']), SUITE, 1);
    expect(errors.join('\n')).toContain('exited 1');
  });

  it('fails on a report with no tests', () => {
    expect(checkRun([], run(), SUITE, 0).join('\n')).toContain('no tests');
  });
});

describe('check-expected-failures command', () => {
  const script = join(import.meta.dir, 'check-expected-failures.ts');
  const withReport = (xml: string, exitCode: number) => {
    const dir = mkdtempSync(join(tmpdir(), 'zplc-expected-failures-'));
    try {
      writeFileSync(join(dir, 'report.xml'), xml);
      const result = Bun.spawnSync([process.execPath, script, '--exit-code', String(exitCode), `${SUITE}=${join(dir, 'report.xml')}`]);
      return { code: result.exitCode, stderr: result.stderr.toString(), stdout: result.stdout.toString() };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('turns a failing test that is not on the committed list into a failure', () => {
    const result = withReport(junit, 1);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('unlisted failure: packages/zplc-ide/src/a.test.ts > outer > inner > fails');
  });

  it('passes a clean run against the committed list', () => {
    const clean = junit.replace(/<failure[\s\S]*?<\/failure>/, '');
    const result = withReport(clean, 0);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  it('fails when the report cannot be read', () => {
    const result = Bun.spawnSync([process.execPath, script, '--exit-code', '1', `${SUITE}=/nonexistent/report.xml`]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('cannot read');
  });
});
