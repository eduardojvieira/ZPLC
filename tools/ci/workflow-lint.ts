// Workflow lint: the rules of .github/workflows that a hosted run shows only once it has gone wrong.
//
//   bun tools/ci/workflow-lint.ts
//
// It parses every workflow of .github/workflows and prints one line per problem, naming the file and the job:
//
//   - a job with no time limit, a whole number of minutes in timeout-minutes (a reusable-workflow call, `uses:` at
//     job level, takes the limits of the workflow it calls);
//   - a shard job (ide-tests of ci.yml, desktop-ide-tests of nightly-quality.yml) whose matrix is not 1 to SHARDS of
//     tools/ci/test-shards.ts, that cancels the other shards when one fails, that does not pipe
//     `bun tools/ci/test-shards.ts env` into $GITHUB_ENV or run the files it selects, or whose time limit is not above
//     the longest shard of the plan;
//   - an env of a workflow, a job or a step that sets a variable that only `bun tools/ci/test-shards.ts env` may set.
//
// VF-006: a test does not match the text of a workflow, so these rules are a CI tool and not a test. The hosted run
// (VF-016) remains the proof that GitHub honours the workflows.
import { readdirSync, readFileSync } from 'node:fs';

import { SHARDS, SPLIT, measuredSeconds, plan, testFiles } from './test-shards';

type Env = Record<string, unknown> | undefined;
interface Job {
  uses?: string;
  env?: Env;
  'timeout-minutes'?: unknown;
  strategy?: { 'fail-fast'?: unknown; matrix?: { shard?: unknown; include?: unknown[] } };
  steps?: Array<{ name?: string; run?: string; env?: Env }>;
}
interface Workflow {
  env?: Env;
  jobs?: Record<string, Job>;
}

const SHARD_JOBS = { 'ci.yml': 'ide-tests', 'nightly-quality.yml': 'desktop-ide-tests' };
const JOURNEY_JOBS = { 'nightly-quality.yml': 'desktop-platforms' };
const SHARD_VARIABLES = new Set(['ZPLC_IDE_SHARD_FILES', ...Object.values(SPLIT).map(({ variable }) => variable)]);
const SELECT = 'bun tools/ci/test-shards.ts env "${{ matrix.shard }}" | tee -a "${GITHUB_ENV}"';
const FILES = '"${ZPLC_IDE_SHARD_FILES:?}"';
const DIR = new URL('../../.github/workflows/', import.meta.url);

/** Every problem of the workflows, given as file name to YAML text; empty when they follow the rules. */
export function lintWorkflows(workflows: Record<string, string>, longestShardMinutes: number): string[] {
  const problems: string[] = [];
  const envSets = (env: Env, where: string) => {
    for (const name of Object.keys(env ?? {}))
      if (SHARD_VARIABLES.has(name))
        problems.push(`${where} sets ${name}, which only bun tools/ci/test-shards.ts env may set, through $GITHUB_ENV`);
  };
  const parsed = new Map(Object.entries(workflows).map(([file, text]) => [file, (Bun.YAML.parse(text) ?? {}) as Workflow]));
  for (const [file, workflow] of parsed) {
    envSets(workflow.env, `${file}: the workflow env`);
    for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
      const limit = job['timeout-minutes'];
      if (job.uses === undefined && !(Number.isInteger(limit) && (limit as number) > 0))
        problems.push(`${file} job ${id}: timeout-minutes must be a whole number of minutes above 0`);
      envSets(job.env, `${file} job ${id}: env`);
      (job.steps ?? []).forEach((step, index) => envSets(step.env, `${file} job ${id} step "${step.name ?? index + 1}": env`));
    }
  }
  for (const [file, id] of Object.entries(SHARD_JOBS)) {
    const job = parsed.get(file)?.jobs?.[id];
    const at = `${file} job ${id}`;
    if (!job) {
      problems.push(`${at}: missing; it runs the IDE suite in the shards of tools/ci/test-shards.ts`);
      continue;
    }
    const runs = (job.steps ?? []).map((step) => step.run ?? '');
    if (JSON.stringify(job.strategy?.matrix?.shard) !== JSON.stringify(Array.from({ length: SHARDS }, (_, index) => index + 1)))
      problems.push(`${at}: the shard matrix must be 1 to ${SHARDS}, the SHARDS of tools/ci/test-shards.ts`);
    if (job.strategy?.['fail-fast'] !== false) problems.push(`${at}: fail-fast must be false, so that one failing shard stops no other`);
    if (!runs.some((run) => run.includes(SELECT))) problems.push(`${at}: no step pipes ${SELECT.replace(' | ', ' into ')}`);
    if (!runs.some((run) => run.includes(FILES))) problems.push(`${at}: no step reads the files of the shard from ${FILES}`);
    const limit = job['timeout-minutes'];
    if (Number.isInteger(limit) && !((limit as number) > longestShardMinutes))
      problems.push(
        `${at}: timeout-minutes ${limit} must be above ${longestShardMinutes.toFixed(1)}, the longest shard of tools/ci/test-shards.ts`,
      );
  }
  // The journeys of macOS and Windows run in shards of run-journeys.ts (ZPLC_JOURNEY_SHARD=k/n), each system with its own n: the
  // matrix lists the shards 1 to n of every system with shards: n, and the step that runs the journeys names both.
  for (const [file, id] of Object.entries(JOURNEY_JOBS)) {
    const job = parsed.get(file)?.jobs?.[id];
    const at = `${file} job ${id}`;
    if (!job) {
      problems.push(`${at}: missing; it runs the journeys in shards (ZPLC_JOURNEY_SHARD)`);
      continue;
    }
    const entries = (job.strategy?.matrix?.include ?? []) as Array<{ runner?: string; shard?: number; shards?: number }>;
    const bySystem = new Map<string | undefined, typeof entries>();
    for (const entry of entries) bySystem.set(entry.runner, [...(bySystem.get(entry.runner) ?? []), entry]);
    const consistent =
      entries.length > 0 &&
      [...bySystem.values()].every((group) => group.every((entry, index) => entry.shard === index + 1 && entry.shards === group.length));
    if (!consistent) problems.push(`${at}: matrix.include must list the shards 1 to n of each system, with shards: n on every entry`);
    if (job.strategy?.['fail-fast'] !== false) problems.push(`${at}: fail-fast must be false, so that one failing shard stops no other`);
    const steps = (job.steps ?? []).filter((step) => (step.run ?? '').includes('smoke:journeys'));
    const expected = '${{ matrix.shard }}/${{ matrix.shards }}';
    if (steps.length === 0 || steps.some((step) => step.env?.ZPLC_JOURNEY_SHARD !== expected))
      problems.push(`${at}: the step that runs smoke:journeys must set ZPLC_JOURNEY_SHARD to "${expected}"`);
  }
  return problems;
}

if (import.meta.main) {
  const names = readdirSync(DIR)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  const longest = Math.max(...plan(testFiles(), measuredSeconds()).map((shard) => shard.seconds)) / 60;
  const problems = lintWorkflows(Object.fromEntries(names.map((name) => [name, readFileSync(new URL(name, DIR), 'utf8')])), longest);
  if (problems.length > 0) {
    console.error(problems.map((problem) => `workflow-lint: ${problem}`).join('\n'));
    process.exit(1);
  }
  console.log(
    `workflow-lint: ${names.length} workflows; every job has a time limit and the shard jobs follow tools/ci/test-shards.ts ` +
      `(longest shard ${longest.toFixed(1)} min)`,
  );
}
