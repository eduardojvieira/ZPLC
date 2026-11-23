// The IDE suite in shards. `bun test` runs the files of packages/zplc-ide one after the other, and the whole suite took
// 3 h 37 min pinned to 4 cores (tools/ci/ide-test-times.json), so ci.yml and nightly-quality.yml run it as SHARDS jobs:
//
//   bun tools/ci/test-shards.ts                       the plan: the units of every shard and their measured minutes
//   bun tools/ci/test-shards.ts env <shard>           NAME=VALUE lines for $GITHUB_ENV: ZPLC_IDE_SHARD_FILES, the
//                                                     `bun test` paths of the shard, and the part of each split file it runs
//   bun tools/ci/test-shards.ts check <shard> --exit-code <status> <junit.xml>
//                                                     the expected-failure rule (VF-027) over the report of one shard
//   bun tools/ci/test-shards.ts merge <out.xml> <junit.xml>...
//                                                     one report of all the shards, for the release notes (REL-027)
//   bun tools/ci/test-shards.ts times <junit.xml> "<how it was measured>"
//                                                     a new ide-test-times.json from a report of the whole suite
//
// A unit is a test file, or one part of a file of SPLIT: the file reads `i/n` from its variable and keeps the i-th of n
// slices of its cases; without the variable it runs them all. Units go longest first to the shard with the least
// measured time (LPT), and two parts of one file never share a shard. A file the table does not list counts
// UNMEASURED_SECONDS, so a new test file always lands in a shard; every unit also counts LOAD_SECONDS.
// tools/ci/test-shards.test.ts proves that the shards hold every file and every case once.
// ponytail: a part counts the time of its file over the number of parts (the three parts of scenarioParity.test.ts
// measured 25.6, 21.0 and 18.6 min); time the parts if a shard outgrows its job.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { checkRun, parseJunit, validateEntries, type Entry } from './check-expected-failures';

export const SUITE = 'packages/zplc-ide';
export const SHARDS = 8;
export const SPLIT: Record<string, { variable: string; parts: number }> = {
  'src/cli/scenarioParity.test.ts': { variable: 'ZPLC_PARITY_PART', parts: 3 },
};
export const UNMEASURED_SECONDS = 60;
/** Loading a file takes time that no testcase holds: (13027 s of wall time - 12906 s of testcases) / 620 files. */
export const LOAD_SECONDS = 0.2;
/** The file names `bun test` runs (bun's default pattern). */
export const BUN_TEST_FILE = /[._](?:test|spec)\.[cm]?[jt]sx?$/;

const ROOT = resolve(import.meta.dir, '../..');
const TIMES = new URL('./ide-test-times.json', import.meta.url);

export interface Unit {
  /** Relative to packages/zplc-ide, as the JUnit report of `bun test` names it. */
  file: string;
  part?: string;
  seconds: number;
}
export interface Shard {
  units: Unit[];
  seconds: number;
}

/** The test files of the IDE package, from git: what a CI checkout holds. */
export function testFiles(): string[] {
  const listed = Bun.spawnSync(['git', 'ls-files', '--', SUITE], { cwd: ROOT });
  if (listed.exitCode !== 0) throw new Error(`git ls-files failed: ${listed.stderr.toString()}`);
  return listed.stdout
    .toString()
    .split('\n')
    .filter((file) => BUN_TEST_FILE.test(file) && !file.includes('/node_modules/'))
    .map((file) => file.slice(SUITE.length + 1));
}

export const measuredSeconds = (): Record<string, number> =>
  (JSON.parse(readFileSync(TIMES, 'utf8')) as { seconds: Record<string, number> }).seconds;

export function plan(files: string[], seconds: Record<string, number>, shards = SHARDS): Shard[] {
  const units = files.flatMap((file): Unit[] => {
    const time = seconds[file] ?? UNMEASURED_SECONDS;
    const split = SPLIT[file];
    if (!split) return [{ file, seconds: LOAD_SECONDS + time }];
    return Array.from({ length: split.parts }, (_, index) => ({
      file,
      part: `${index + 1}/${split.parts}`,
      seconds: LOAD_SECONDS + time / split.parts,
    }));
  });
  units.sort((a, b) => b.seconds - a.seconds || a.file.localeCompare(b.file) || (a.part ?? '').localeCompare(b.part ?? ''));
  const result: Shard[] = Array.from({ length: shards }, () => ({ units: [], seconds: 0 }));
  for (const unit of units) {
    const free = result.filter((shard) => !shard.units.some((other) => other.file === unit.file));
    if (free.length === 0) throw new Error(`${unit.file} has more parts than there are shards`);
    const target = free.reduce((least, shard) => (shard.seconds < least.seconds ? shard : least));
    target.units.push(unit);
    target.seconds += unit.seconds;
  }
  for (const shard of result) shard.units.sort((a, b) => a.file.localeCompare(b.file));
  return result;
}

/** The environment of one shard: the paths for `bun test` (./ makes each one a path, not a name filter) and its parts. */
export function environment(shard: Shard): Record<string, string> {
  const env: Record<string, string> = { ZPLC_IDE_SHARD_FILES: shard.units.map(({ file }) => `./${file}`).join(' ') };
  for (const { file, part } of shard.units) if (part) env[SPLIT[file]!.variable] = part;
  return env;
}

/** The expected failures that one shard answers for: those of the files it runs whole, and those of a split file it ran. */
export function shardEntries(entries: Entry[], shard: Shard, ran: Set<string>): Entry[] {
  const whole = new Set(shard.units.filter(({ part }) => !part).map(({ file }) => file));
  return entries.filter((entry) => {
    const file = entry.test.slice(SUITE.length + 1).split(' > ')[0]!;
    return whole.has(file) || (file in SPLIT && ran.has(entry.test));
  });
}

const attribute = (text: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(text)?.[1];

/** One `bun test` JUnit report of several: their suites under one <testsuites>, whose counts are the sums. */
export function mergeReports(reports: string[]): string {
  const totals = { tests: 0, assertions: 0, failures: 0, skipped: 0, time: 0 };
  const bodies = reports.map((xml) => {
    const open = /<testsuites\b([^>]*)>/.exec(xml);
    const close = xml.lastIndexOf('</testsuites>');
    if (!open || close < open.index) throw new Error('not a JUnit report of bun test');
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] += Number(attribute(open[1]!, key) ?? 0);
    return xml.slice(open.index + open[0].length, close).replace(/^\n|\n\s*$/g, '');
  });
  const counts = Object.entries(totals)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="bun test" ${counts}>\n${bodies.join('\n')}\n</testsuites>\n`;
}

/** The sum of the testcase times of each file of a report, in seconds with one decimal. */
export function fileSeconds(xml: string): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const [, rest = ''] of xml.matchAll(/<testcase\b([^>]*)>/g)) {
    const file = attribute(rest, 'file') ?? '';
    sums[file] = (sums[file] ?? 0) + Number(attribute(rest, 'time') ?? 0);
  }
  return Object.fromEntries(
    Object.entries(sums)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, sum]) => [file, Math.round(sum * 10) / 10]),
  );
}

const minutes = (seconds: number) => (seconds / 60).toFixed(1);

function shardOf(text: string | undefined, shards: Shard[]): Shard {
  const index = Number(text);
  if (!Number.isInteger(index) || index < 1 || index > shards.length)
    throw new Error(`the shard must be 1 to ${shards.length}, not "${text}"`);
  return shards[index - 1]!;
}

if (import.meta.main) {
  const [command, ...rest] = Bun.argv.slice(2);
  const shards = plan(testFiles(), measuredSeconds());
  try {
    if (command === undefined) {
      shards.forEach((shard, index) => {
        console.log(`shard ${index + 1}/${shards.length}: ${minutes(shard.seconds)} min, ${shard.units.length} units`);
        for (const unit of shard.units) console.log(`  ${unit.file}${unit.part ? ` part ${unit.part}` : ''} ${minutes(unit.seconds)} min`);
      });
    } else if (command === 'env') {
      for (const [name, value] of Object.entries(environment(shardOf(rest[0], shards)))) console.log(`${name}=${value}`);
    } else if (command === 'check') {
      const { values, positionals } = parseArgs({ args: rest, options: { 'exit-code': { type: 'string' } }, allowPositionals: true });
      const [index, report] = positionals;
      const exitCode = Number(values['exit-code']);
      if (report === undefined || !Number.isInteger(exitCode)) throw new Error('usage: check <shard> --exit-code <status> <junit.xml>');
      const shard = shardOf(index, shards);
      const entries: unknown = JSON.parse(readFileSync(new URL('./expected-failures.json', import.meta.url), 'utf8'));
      const known = new Set(
        (JSON.parse(readFileSync(new URL('./requirements-index.json', import.meta.url), 'utf8')) as Array<{ id: string }>).map(
          ({ id }) => id,
        ),
      );
      const errors = validateEntries(entries, known);
      if (errors.length === 0) {
        const results = parseJunit(readFileSync(report, 'utf8'), SUITE);
        errors.push(...checkRun(shardEntries(entries as Entry[], shard, new Set(results.keys())), results, SUITE, exitCode));
      }
      if (errors.length > 0) {
        console.error(errors.map((message) => `expected-failures: ${message}`).join('\n'));
        process.exit(1);
      }
      console.log(`expected-failures: shard ${index}/${shards.length}, no unlisted failure`);
    } else if (command === 'merge') {
      const [out, ...reports] = rest;
      if (out === undefined || reports.length !== shards.length)
        throw new Error(`merge needs the output file and the ${shards.length} shard reports, got ${reports.length}`);
      writeFileSync(out, mergeReports(reports.map((report) => readFileSync(report, 'utf8'))));
    } else if (command === 'times') {
      const [report, measured] = rest;
      if (report === undefined || !measured) throw new Error('usage: times <junit.xml> "<how it was measured>"');
      console.log(JSON.stringify({ measured, seconds: fileSeconds(readFileSync(report, 'utf8')) }, null, 2));
    } else {
      throw new Error(`unknown command "${command}": use env, check, merge, times or nothing for the plan`);
    }
  } catch (error) {
    console.error(`test-shards: ${(error as Error).message}`);
    process.exit(2);
  }
}
