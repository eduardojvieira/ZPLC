// The outcome of a release run, read from the result of each job (`toJSON(needs)` of the last job of release.yml):
//
//   bun tools/ci/release/run-outcome.ts needs.json
//
// What a run did is read and nothing is assumed (VF-021, REL-036): no platform's files reached the draft release unless
// its build job, which opens and launches every installer, and its evidence job, which checks the produced files,
// succeeded. The reproducibility check is not read here: no job may wait for it (REL-032), and this one waits for the
// others.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

export interface Needs { [job: string]: { result?: string } }

export function checkRunOutcome(needs: Needs): string[] {
  const problems: string[] = [];
  const result = (job: string) => needs[job]?.result ?? 'absent';
  for (const platform of ['macos', 'windows', 'linux']) {
    if (result(`upload-release-${platform}`) !== 'success') continue;
    if (result(`build-${platform}`) !== 'success') problems.push(`upload-release-${platform} ran although build-${platform} was ${result(`build-${platform}`)}: files reached the draft that were not installed and launched`);
    if (result(`prepare-release-evidence-${platform}`) !== 'success') problems.push(`upload-release-${platform} ran although prepare-release-evidence-${platform} was ${result(`prepare-release-evidence-${platform}`)}: files reached the draft that no check of the produced files had passed`);
  }
  return problems;
}

if (import.meta.main) {
  const { positionals } = parseArgs({ args: Bun.argv.slice(2), allowPositionals: true });
  if (!positionals[0]) { console.error('usage: run-outcome.ts <needs.json>'); process.exit(2); }
  const problems = checkRunOutcome(JSON.parse(readFileSync(positionals[0], 'utf8')) as Needs);
  if (problems.length > 0) { console.error(problems.map((problem) => `run-outcome: ${problem}`).join('\n')); process.exit(1); }
  console.log('run-outcome: every file that reached the draft release comes from a platform whose installers were launched and checked');
}
