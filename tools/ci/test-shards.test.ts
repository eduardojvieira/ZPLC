// The shards of the IDE suite (tools/ci/test-shards.ts) hold every test file and every case of it once: none is dropped,
// none runs twice. The split files are listed by `bun test` itself, with a name filter that runs no case.
import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parseJunit, type Entry } from './check-expected-failures';
import {
  LOAD_SECONDS,
  SHARDS,
  SPLIT,
  SUITE,
  UNMEASURED_SECONDS,
  environment,
  measuredSeconds,
  mergeReports,
  plan,
  shardEntries,
  testFiles,
  type Shard,
} from './test-shards';

const IDE = resolve(import.meta.dir, '../..', SUITE);
const files = testFiles();
const seconds = measuredSeconds();
const shards = plan(files, seconds);
const count = <T>(values: T[]) => values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<T, number>());

const withoutParts = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !Object.values(SPLIT).some(({ variable }) => variable === name)),
);

/** The cases `bun test` registers in one file, with the environment given: a name filter that no case matches runs none. */
async function listCases(file: string, env: Record<string, string>) {
  const scratch = mkdtempSync(join(tmpdir(), 'zplc-shard-list-'));
  try {
    const report = join(scratch, 'list.xml');
    const run = Bun.spawn(
      ['bun', 'test', `./${file}`, '-t', '^no case has this name$', '--reporter=junit', `--reporter-outfile=${report}`],
      { cwd: IDE, env: { ...withoutParts, ...env }, stdout: 'pipe', stderr: 'pipe' },
    );
    const [stderr] = await Promise.all([new Response(run.stderr).text(), run.exited]);
    const listed = parseJunit(readFileSync(report, 'utf8'), SUITE);
    if (listed.size === 0) throw new Error(`bun test listed no case of ${file}: ${stderr}`);
    return [...listed.keys()];
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

describe('the shards of the IDE suite', () => {
  it('run every test file of the package once, and each split file once in each of its parts, on as many shards', () => {
    expect(files.length).toBeGreaterThan(600);
    expect(shards).toHaveLength(SHARDS);
    const units = shards.flatMap((shard) => shard.units);
    const runs = count(units.map(({ file }) => file));
    expect([...runs.keys()].sort()).toEqual([...files].sort());
    for (const file of files) expect(runs.get(file)).toBe(SPLIT[file]?.parts ?? 1);
    for (const [file, { parts }] of Object.entries(SPLIT)) {
      const holders = shards.filter((shard) => shard.units.some((unit) => unit.file === file));
      expect(holders).toHaveLength(parts);
      const named = units.filter((unit) => unit.file === file).map(({ part }) => part);
      expect(named.sort()).toEqual(Array.from({ length: parts }, (_, index) => `${index + 1}/${parts}`).sort());
    }
  });

  it('place a test file that the timing table does not list, as one unit of UNMEASURED_SECONDS', () => {
    const added = 'src/zz-new/added.test.ts';
    expect(seconds[added]).toBeUndefined();
    const holders = plan([...files, added], seconds).flatMap((shard) => shard.units.filter((unit) => unit.file === added));
    expect(holders).toEqual([{ file: added, seconds: LOAD_SECONDS + UNMEASURED_SECONDS }]);
  });

  it('give each shard its files as bun test paths, and the part of each split file it runs', () => {
    for (const file of files) expect(file).not.toMatch(/\s/);
    for (const shard of shards) {
      const env = environment(shard);
      expect(env.ZPLC_IDE_SHARD_FILES!.split(' ')).toEqual(shard.units.map(({ file }) => `./${file}`));
      for (const unit of shard.units) if (unit.part) expect(env[SPLIT[unit.file]!.variable]).toBe(unit.part);
    }
  });

  it('are the same plan on every run', () => {
    expect(plan([...files].reverse(), seconds)).toEqual(shards);
  });
});

describe.each(Object.entries(SPLIT))('the parts of %s', (file, { variable, parts }) => {
  it('hold every case of the file once, and the file alone holds all of them, with the variable unset or empty', async () => {
    const [all, empty, ...each] = await Promise.all([
      listCases(file, {}),
      listCases(file, { [variable]: '' }),
      ...Array.from({ length: parts }, (_, index) => listCases(file, { [variable]: `${index + 1}/${parts}` })),
    ]);
    expect(empty).toEqual(all!);
    for (const cases of each) expect(cases.length).toBeGreaterThan(0);
    const runs = count(each.flat());
    expect([...runs.keys()].sort()).toEqual([...all!].sort());
    expect([...runs.values()].every((times) => times === 1)).toBe(true);
  }, 120_000);

  it('refuses a part that is not i/n', async () => {
    const run = Bun.spawn(['bun', 'test', `./${file}`, '-t', '^no case has this name$'], {
      cwd: IDE,
      env: { ...withoutParts, [variable]: `${parts + 1}/${parts}` },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stderr, code] = await Promise.all([new Response(run.stderr).text(), run.exited]);
    expect(code).not.toBe(0);
    expect(stderr).toContain(`${variable} must be i/n with 1 <= i <= n, not "${parts + 1}/${parts}"`);
  });
});

// VF-027: the expected-failure rule, applied by each shard to the files it ran.
describe('the expected-failure rule in a shard', () => {
  const entry = (test: string): Entry => ({ test, requirement: 'VF-027', added: '2026-11-23', reason: 'fixture' });
  const shard: Shard = {
    units: [
      { file: 'src/a.test.ts', seconds: 1 },
      { file: 'src/cli/scenarioParity.test.ts', part: '1/3', seconds: 1 },
    ],
    seconds: 2,
  };
  const ranHere = `${SUITE}/src/cli/scenarioParity.test.ts > parity > plant_a: tests`;

  it('answers for the files the shard runs whole, and for the cases of a split file that it ran', () => {
    const entries = [
      entry(`${SUITE}/src/a.test.ts > a > fails`),
      entry(ranHere),
      entry(`${SUITE}/src/cli/scenarioParity.test.ts > parity > plant_b: tests`),
      entry(`${SUITE}/src/b.test.ts > b > fails`),
    ];
    expect(shardEntries(entries, shard, new Set([ranHere])).map(({ test }) => test)).toEqual([entries[0]!.test, ranHere]);
  });

  it('names every expected failure of the IDE after a test file, and one of a split file after a case it registers', async () => {
    const listed = (JSON.parse(readFileSync(new URL('./expected-failures.json', import.meta.url), 'utf8')) as Entry[]).filter(({ test }) =>
      test.startsWith(`${SUITE}/`),
    );
    const fileOf = (test: string) => test.slice(SUITE.length + 1).split(' > ')[0]!;
    for (const { test } of listed) expect(files).toContain(fileOf(test));
    for (const file of new Set(listed.map(({ test }) => fileOf(test)).filter((name) => name in SPLIT))) {
      const cases = await listCases(file, {});
      for (const { test } of listed.filter((candidate) => fileOf(candidate.test) === file)) expect(cases).toContain(test);
    }
  });
});

// REL-027: the release notes count the cases of the suite from one report of all the shards.
describe('one report of the shards', () => {
  const report = (suites: string, tests: number, failures: number) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="bun test" tests="${tests}" assertions="${tests}" failures="${failures}" ` +
    `skipped="0" time="1.5">\n${suites}\n</testsuites>\n`;
  const first = report(
    '  <testsuite name="src/a.test.ts" file="src/a.test.ts" tests="1">\n' +
      '    <testcase name="one" file="src/a.test.ts" time="1" />\n' +
      '  </testsuite>',
    1,
    0,
  );
  const second = report(
    '  <testsuite name="src/b.test.ts" file="src/b.test.ts" tests="2">\n' +
      '    <testcase name="two" file="src/b.test.ts" time="1" />\n' +
      '    <testcase name="three" file="src/b.test.ts" time="1">\n      <failure type="AssertionError" />\n    </testcase>\n' +
      '  </testsuite>',
    2,
    1,
  );

  it('holds the cases of every shard with their results, and the sums of their counts', () => {
    const merged = mergeReports([first, second]);
    expect(merged).toStartWith(
      '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="bun test" tests="3" assertions="3" failures="1" ',
    );
    expect(merged.match(/<testsuites\b/g)).toHaveLength(1);
    expect(parseJunit(merged, SUITE)).toEqual(new Map([...parseJunit(first, SUITE), ...parseJunit(second, SUITE)]));
    expect([...parseJunit(merged, SUITE).values()]).toEqual(['pass', 'pass', 'fail']);
  });

  it('refuses a file that is not a report of bun test', () => {
    expect(() => mergeReports([first, 'not a report'])).toThrow('not a JUnit report of bun test');
  });
});
