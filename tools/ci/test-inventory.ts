// Test inventory (VF-022): every tracked test file is run by a CI job, or is on record as not run.
//
//   bun tools/ci/test-inventory.ts
//
// tools/ci/test-inventory.json maps test files (glob patterns) to the CI job that runs them, with a
// command that one step of that job must contain. Files that CI cannot run go under "notRunInCi" with the
// requirement that will fix it. A file matches the first rule that fits, "runs" before "notRunInCi";
// a file with no rule, a rule that no file uses, and a command missing from its job all fail.
// ponytail: it proves a job names the command, not that the command picks the file up (ctest still needs
// add_test, a bun suite needs its glob); a per-file check would need each runner's own listing.
import { readFileSync } from 'node:fs';

export interface Inventory {
  runs: Array<{ pattern: string; job: string; command: string }>;
  notRunInCi: Array<{ pattern: string; requirement: string; reason: string }>;
}
export interface Workflow { jobs: Record<string, { steps: Array<{ name?: string; uses?: string; run?: string }> }> }

export const TEST_FILE = /\.test\.(ts|tsx|mjs)$|(^|\/)test_[^/]*\.py$|_test\.py$|^firmware\/(.*\/)?tests\/.*\.c$/;
const ROOT = new URL('../../', import.meta.url);

export function checkInventory(files: string[], inventory: Inventory, workflow: Workflow): string[] {
  const errors: string[] = [];
  for (const { pattern, job, command } of inventory.runs) {
    const steps = workflow.jobs[job]?.steps;
    if (!steps) errors.push(`rule "${pattern}": ci.yml has no job "${job}"`);
    else if (!steps.some((step) => step.run?.includes(command))) errors.push(`rule "${pattern}": no step of job "${job}" runs "${command}"`);
  }
  for (const { pattern, requirement, reason } of inventory.notRunInCi) {
    if (!/^[A-Z]+-[0-9]{3}$/.test(requirement ?? '')) errors.push(`rule "${pattern}": requirement must look like HIL-004`);
    if ((reason ?? '').trim() === '') errors.push(`rule "${pattern}": reason must say why CI cannot run it`);
  }
  const rules = [...inventory.runs, ...inventory.notRunInCi].map((rule) => ({ rule, glob: new Bun.Glob(rule.pattern) }));
  const used = new Set<object>();
  for (const file of files) {
    const found = rules.find(({ glob }) => glob.match(file));
    if (found) used.add(found.rule);
    else errors.push(`no CI job runs ${file}`);
  }
  for (const { rule } of rules) if (!used.has(rule)) errors.push(`rule "${rule.pattern}" matches no test file, remove it`);
  return errors;
}

export function loadRepository() {
  const listed = Bun.spawnSync(['git', 'ls-files'], { cwd: ROOT.pathname });
  if (listed.exitCode !== 0) throw new Error(`git ls-files failed: ${listed.stderr.toString()}`);
  return {
    files: listed.stdout.toString().split('\n').filter((file) => TEST_FILE.test(file)),
    inventory: JSON.parse(readFileSync(new URL('tools/ci/test-inventory.json', ROOT), 'utf8')) as Inventory,
    workflow: Bun.YAML.parse(readFileSync(new URL('.github/workflows/ci.yml', ROOT), 'utf8')) as Workflow,
  };
}

if (import.meta.main) {
  const { files, inventory, workflow } = loadRepository();
  const errors = checkInventory(files, inventory, workflow);
  if (errors.length > 0) {
    console.error(errors.map((message) => `test-inventory: ${message}`).join('\n'));
    process.exit(1);
  }
  console.log(`test-inventory: ${files.length} test files, ${inventory.notRunInCi.length} rules for files CI does not run`);
}
