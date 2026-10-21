// The one expected-failure rule (VF-027). CI runs a test suite with bun's JUnit
// reporter, then calls this script with the suite's report and the exit code:
//
//   bun tools/ci/check-expected-failures.ts --exit-code "$status" packages/zplc-ide=junit.xml
//
// A failing test must be listed in tools/ci/expected-failures.json with the
// requirement that will fix it. Anything else that fails turns the job red, and
// so does a listed test that no longer fails: the list can only shrink.
//
// Entry: { "test": "<id>", "requirement": "CMP-012", "added": "2026-10-09", "reason": "<why it fails>" }
// The id is printed by the "unlisted failure" message, so copy it from a red run. The requirement must be in
// tools/ci/requirements-index.json; a green run ends with the requirement progress counts (VF-027).
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { progress } from './requirement-coverage';

export type Status = 'pass' | 'fail' | 'skip';
export interface Entry {
  test: string;
  requirement: string;
  added: string;
  reason: string;
}

// The suites CI evaluates through this script. An entry outside them would never be checked.
export const SUITES = ['packages/zplc-compiler', 'packages/zplc-ide'];
const LIST = new URL('./expected-failures.json', import.meta.url);

const entities: Record<string, string> = { quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' };
const decode = (text: string) =>
  text.replace(/&(#\d+|quot|apos|lt|gt|amp);/g, (_, name: string) =>
    name.startsWith('#') ? String.fromCodePoint(Number(name.slice(1))) : entities[name]!,
  );
const attributes = (text: string) =>
  Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1]!, decode(match[2]!)]));

// Test id: "<suite>/<file> > <describe> > ... > <test name>", all relative to the repository root.
// ponytail: a regex scan of bun's JUnit output, not an XML parser; swap it if bun changes the shape of its report.
export function parseJunit(xml: string, suite: string): Map<string, Status> {
  const results = new Map<string, Status>();
  const describes: string[] = [];
  let current: { id: string; status: Status } | undefined;
  const record = () => {
    if (current && results.get(current.id) !== 'fail') results.set(current.id, current.status);
    current = undefined;
  };
  for (const match of xml.matchAll(/<(\/?)(testsuite|testcase)\b([^>]*)>|<(failure|error|skipped)\b/g)) {
    const [, closing, tag, rest = '', child] = match;
    if (child) {
      if (current && current.status !== 'fail') current.status = child === 'skipped' ? 'skip' : 'fail';
    } else if (tag === 'testsuite') {
      if (closing) describes.pop();
      else if (!rest.endsWith('/')) describes.push(attributes(rest).name ?? '');
    } else if (closing) {
      record();
    } else {
      const { name = '', file = describes[0] ?? '' } = attributes(rest);
      current = { id: [`${suite}/${file}`, ...describes.slice(1), name].join(' > '), status: 'pass' };
      if (rest.endsWith('/')) record();
    }
  }
  return results;
}

const isDate = (text: unknown) => {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(text);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
};

/** `known` is the set of identifiers of tools/ci/requirements-index.json; without it only the shape of the identifier is checked. */
export function validateEntries(entries: unknown, known?: Set<string>): string[] {
  if (!Array.isArray(entries)) return ['expected-failures.json must be an array'];
  const errors: string[] = [];
  const seen = new Set<unknown>();
  entries.forEach((entry: Record<string, unknown> | null, index) => {
    const where = `entry ${index}${typeof entry?.test === 'string' ? ` (${entry.test})` : ''}`;
    if (typeof entry !== 'object' || entry === null) return void errors.push(`${where} must be an object`);
    if (typeof entry.test !== 'string' || entry.test === '') errors.push(`${where}: test must be a non-empty identifier`);
    else if (!SUITES.some((suite) => (entry.test as string).startsWith(`${suite}/`)))
      errors.push(`${where}: test is in no suite that CI checks (${SUITES.join(', ')})`);
    if (typeof entry.requirement !== 'string' || !/^[A-Z]+-[0-9]{3}$/.test(entry.requirement))
      errors.push(`${where}: requirement must look like CMP-012`);
    else if (known && !known.has(entry.requirement))
      errors.push(`${where}: requirement ${entry.requirement} is not in tools/ci/requirements-index.json`);
    if (!isDate(entry.added)) errors.push(`${where}: added must be a valid YYYY-MM-DD date`);
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') errors.push(`${where}: reason must say why the test fails`);
    if (seen.has(entry.test)) errors.push(`${where}: duplicate entry`);
    seen.add(entry.test);
  });
  return errors;
}

// ponytail: if a listed failure and a file that fails to load share one run, the load error is hidden
// (bun writes no testcase for it); close it by comparing the "N fail" line of bun's console summary.
export function checkRun(entries: Entry[], results: Map<string, Status>, suite: string, exitCode: number): string[] {
  const errors: string[] = [];
  const listed = new Set(entries.map((entry) => entry.test));
  const failed = [...results].filter(([, status]) => status === 'fail').map(([id]) => id);
  if (results.size === 0) errors.push(`${suite}: the report contains no tests`);
  if (exitCode !== 0 && failed.length === 0)
    errors.push(`${suite}: the test command exited ${exitCode} but no test failed in the report (crash, load error or timeout)`);
  for (const id of failed) if (!listed.has(id)) errors.push(`unlisted failure: ${id}`);
  for (const entry of entries.filter((candidate) => candidate.test.startsWith(`${suite}/`))) {
    const status = results.get(entry.test);
    if (status === 'pass') errors.push(`listed test now passes, remove it from the list (${entry.requirement}): ${entry.test}`);
    else if (status !== 'fail')
      errors.push(`listed test did not run or was skipped, remove it or fix its identifier (${entry.requirement}): ${entry.test}`);
  }
  return errors;
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: { 'exit-code': { type: 'string', default: '0' } },
    allowPositionals: true,
  });
  const exitCode = Number(values['exit-code']);
  const entries: unknown = JSON.parse(readFileSync(LIST, 'utf8'));
  const known = new Set(
    (JSON.parse(readFileSync(new URL('./requirements-index.json', import.meta.url), 'utf8')) as Array<{ id: string }>).map(
      (requirement) => requirement.id,
    ),
  );
  const errors = validateEntries(entries, known);
  const listIsValid = errors.length === 0;
  if (positionals.length === 0 || !Number.isInteger(exitCode))
    errors.push('usage: check-expected-failures.ts --exit-code <status> <suite>=<junit.xml>...');
  for (const argument of positionals) {
    const [suite = '', report = ''] = argument.split('=');
    if (!SUITES.includes(suite)) errors.push(`unknown suite "${suite}", expected one of ${SUITES.join(', ')}`);
    else if (listIsValid) {
      try {
        errors.push(...checkRun(entries as Entry[], parseJunit(readFileSync(report, 'utf8'), suite), suite, exitCode));
      } catch (error) {
        errors.push(`cannot read the ${suite} report ${report}: ${(error as Error).message}`);
      }
    }
  }
  if (errors.length > 0) {
    console.error(errors.map((message) => `expected-failures: ${message}`).join('\n'));
    process.exit(1);
  }
  console.log(`expected-failures: ${(entries as Entry[]).length} listed, no unlisted failure`);
  try {
    const { errors: unknownIds, line } = progress();
    if (unknownIds.length > 0) {
      console.error(unknownIds.map((message) => `expected-failures: ${message}`).join('\n'));
      process.exit(1);
    }
    console.log(line);
  } catch (error) {
    console.error(`expected-failures: the requirement counts could not be computed: ${(error as Error).message}`);
  }
}
