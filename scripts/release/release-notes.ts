// The notes and the title of a release, rendered from what the run recorded (REL-027).
//
//   bun scripts/release/release-notes.ts --results run-results.json --out notes.md [--title-out title.txt] \
//       [--changelog CHANGELOG.md]
//
// The input says, for each asset, the job that built it, its signing state and which checks passed in this run;
// which suites ran with their counts; the known failures and issues; the state of each Windows channel; and the
// changes. Every sentence about signing or checking is rendered from those fields, and where a check did not pass
// or did not run the notes say that and make no claim. scripts/release/run-results.ts writes the file in the pipeline.
import { readFileSync, writeFileSync } from 'node:fs';

export type Platform = 'macos' | 'windows' | 'linux' | 'cli' | 'firmware' | 'metadata';
export type SigningState = 'adhoc' | 'unsigned' | 'signed';
export type CheckState = 'passed' | 'failed' | 'not-run';
export type ChannelStateName = 'live' | 'submitted' | 'refused' | 'not yet submittable';

export interface AssetResult {
  name: string;
  platform: Platform;
  /** The job that built the file, e.g. `build-macos (arm64)`. */
  job: string;
  runUrl?: string;
  signing: SigningState;
  checks: { signature: CheckState; launch: CheckState; install: CheckState };
}

export interface RunResults {
  schemaVersion: 1;
  version: string;
  tag: string;
  commit: string;
  runUrl: string;
  /** How complete a prerelease is: part of its title (REL-031). */
  completeness?: string;
  jobs: Array<{ job: string; result: string }>;
  assets: AssetResult[];
  suites: Array<{ suite: string; job: string; executed: number; failed: number; skipped: number }>;
  knownFailures: Array<{ id: string; summary: string; tracking?: string }>;
  channels: Array<{ channel: string; state: ChannelStateName }>;
  changes: string[];
  knownIssues: string[];
}

const CHANNEL_STATES: readonly string[] = ['live', 'submitted', 'refused', 'not yet submittable'];
const PLATFORM_NAMES: Record<'macos' | 'windows' | 'linux', string> = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };

export function releaseTitle(results: RunResults): string {
  if (!results.version.includes('-')) return `ZPLC v${results.version}`;
  if (!results.completeness || results.completeness.trim() === '') {
    throw new Error(`Prerelease ${results.version} has no completeness statement: its title must say how complete it is (scripts/release/release-status.json)`);
  }
  return `ZPLC v${results.version}: release candidate, ${results.completeness.trim()}`;
}

/** The bullets of the `## <version>` section of a changelog; a bullet that continues on indented lines is one item. */
export function changelogSection(text: string, version: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line === `## ${version}` || line.startsWith(`## ${version} - `));
  if (start < 0) return [];
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (line.startsWith('- ')) items.push(line.slice(2).trim());
    else if (/^\s+\S/.test(line) && items.length > 0) items[items.length - 1] += ` ${line.trim()}`;
  }
  return items;
}

function signingText(asset: AssetResult): string {
  const verified = asset.checks.signature === 'passed';
  switch (asset.signing) {
    case 'adhoc':
      return verified
        ? 'Signed ad hoc and sealed; signature verified in this run. Not notarized: macOS asks for approval the first time a downloaded copy opens.'
        : `Intended to be signed ad hoc; the signature check did not pass in this run (${asset.checks.signature === 'failed' ? 'it failed' : 'it did not run'}), so no signature is claimed. Not notarized.`;
    case 'signed':
      return verified
        ? 'Signed; signature verified in this run.'
        : `Claimed signed, but the signature check did not pass in this run (${asset.checks.signature === 'failed' ? 'it failed' : 'it did not run'}), so no signature is claimed.`;
    case 'unsigned':
      return asset.platform === 'windows'
        ? 'Unsigned. Windows warns before it runs, and Smart App Control blocks it.'
        : 'Unsigned. Integrity comes from the checksums and the build provenance attestation.';
  }
}

function checksText(asset: AssetResult): string {
  const word = (state: CheckState) => (state === 'not-run' ? 'not run' : state);
  const parts = [`launched on its own system: ${word(asset.checks.launch)}`];
  if (asset.checks.install !== 'not-run') parts.push(`installed and launched in clean containers: ${word(asset.checks.install)}`);
  return parts.join('; ');
}

function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderReleaseNotes(results: RunResults): string {
  for (const { channel, state } of results.channels) {
    if (!CHANNEL_STATES.includes(state)) throw new Error(`Unknown channel state for ${channel}: ${state} (channel state must be one of ${CHANNEL_STATES.join(', ')})`);
  }
  const out: string[] = [];
  out.push(`## Release v${results.version}`, '');
  out.push(`Built from commit \`${results.commit}\` by [this run](${results.runUrl}).`, '');

  out.push('### What changed', '');
  out.push(...(results.changes.length > 0 ? results.changes.map((change) => `- ${change}`) : ['No user-facing change is recorded for this version.']), '');

  out.push('### Known issues', '');
  if (results.knownIssues.length === 0 && results.knownFailures.length === 0) {
    out.push('No known issue is recorded for this release.');
  } else {
    out.push(...results.knownIssues.map((issue) => `- ${issue}`));
    if (results.knownFailures.length > 0) {
      out.push('', 'Checks that fail and are listed as expected failures:', '');
      out.push(...results.knownFailures.map((failure) => `- ${failure.id}: ${failure.summary}${failure.tracking ? ` (${failure.tracking})` : ''}`));
    }
  }
  out.push('');

  out.push('### Signing state and checks of every asset', '');
  out.push('| Asset | Built by | Signing state | Checks in this run |', '| --- | --- | --- | --- |');
  for (const asset of results.assets) {
    const job = asset.runUrl ? `[${asset.job}](${asset.runUrl})` : asset.job;
    out.push(`| ${cell(asset.name)} | ${cell(job)} | ${cell(signingText(asset))} | ${cell(checksText(asset))} |`);
  }
  out.push('');
  for (const platform of ['macos', 'windows', 'linux'] as const) {
    if (results.assets.some((asset) => asset.platform === platform)) continue;
    const job = results.jobs.find((candidate) => candidate.job === `build-${platform}`);
    out.push(`No files were published for ${PLATFORM_NAMES[platform]}: its build job ${job ? `ended in ${job.result}` : 'did not report a result'}.`, '');
  }

  out.push('### Tests executed in this run', '');
  if (results.suites.length === 0) {
    out.push('The run recorded no test results, so these notes make no claim about tests.');
  } else {
    out.push('| Suite | Job | Executed | Failed | Skipped |', '| --- | --- | --- | --- | --- |');
    for (const suite of results.suites) out.push(`| ${cell(suite.suite)} | ${cell(suite.job)} | ${suite.executed} | ${suite.failed} | ${suite.skipped} |`);
    const total = results.suites.reduce((sum, suite) => ({ executed: sum.executed + suite.executed, failed: sum.failed + suite.failed, skipped: sum.skipped + suite.skipped }), { executed: 0, failed: 0, skipped: 0 });
    out.push('', `${total.executed} tests executed, ${total.failed} failed, ${total.skipped} skipped.`);
  }
  out.push('');

  if (results.assets.some((asset) => asset.platform === 'windows' && asset.signing === 'unsigned')) {
    out.push('### Windows: unsigned installers', '');
    out.push('The setup and portable executables are not signed, so their file names carry `unsigned`. To run one:', '');
    out.push('1. Windows shows "Windows protected your PC" (SmartScreen).', '2. Select **More info**, then **Run anyway**.', '');
    out.push('Smart App Control blocks unsigned apps and offers no Run anyway option. On a PC where Smart App Control is on, these files do not run.', '');
  }
  if (results.channels.length > 0) {
    out.push('### Windows channels', '', '| Channel | State |', '| --- | --- |');
    out.push(...results.channels.map((channel) => `| ${channel.channel} | ${channel.state} |`));
    out.push('', 'A channel is live, submitted, refused or not yet submittable. Until a channel is live, the unsigned files above are the only Windows download.', '');
  }

  out.push('### Verify what you downloaded', '');
  out.push('Every file is listed in `SHA256SUMS`. In the folder with your download:', '', '```text');
  out.push('Linux:    sha256sum --ignore-missing -c SHA256SUMS', 'macOS:    shasum -a 256 -c SHA256SUMS', 'Windows:  Get-FileHash .\\<file> -Algorithm SHA256   (compare it with the line for your file)', '```', '');
  out.push('The build provenance attestation says which run built the file:', '', '```text', 'gh attestation verify <file> --repo eduardojvieira/ZPLC', '```', '');
  out.push('An attestation proves where a file was built, not that it is safe, and it does not change the warnings of your operating system.', '');

  out.push('### Evidence boundary', '');
  out.push('Repository and hosted workflow results do not establish HIL, board qualification, timing, safety certification, or human release sign-off.');
  out.push('Prerelease tags remain release candidates, not GA declarations.', '');

  out.push('### Documentation', '');
  out.push('- [Full Documentation](https://eduardojvieira.github.io/ZPLC/)', '- [Reference Documentation](https://eduardojvieira.github.io/ZPLC/reference)', '');
  return out.join('\n');
}

function parseResults(text: string): RunResults {
  const parsed = JSON.parse(text) as Partial<RunResults>;
  if (parsed.schemaVersion !== 1) throw new Error('the results file must have schemaVersion 1');
  for (const key of ['version', 'tag', 'commit', 'runUrl'] as const) {
    if (typeof parsed[key] !== 'string' || parsed[key] === '') throw new Error(`the results file has no ${key}`);
  }
  return { jobs: [], assets: [], suites: [], knownFailures: [], channels: [], changes: [], knownIssues: [], ...parsed } as RunResults;
}

function main(argv: string[]): number {
  const options: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!['--results', '--out', '--title-out', '--changelog'].includes(flag ?? '') || argv[index + 1] === undefined) {
      console.error(`release-notes: unknown or incomplete argument ${flag}`);
      return 2;
    }
    options[flag!.slice(2)] = argv[index + 1]!;
  }
  if (!options.results || !options.out) {
    console.error('usage: release-notes.ts --results <run-results.json> --out <notes.md> [--title-out <file>] [--changelog <CHANGELOG.md>]');
    return 2;
  }
  try {
    const results = parseResults(readFileSync(options.results, 'utf8'));
    if (results.changes.length === 0 && options.changelog) results.changes = changelogSection(readFileSync(options.changelog, 'utf8'), results.version);
    const title = releaseTitle(results);
    writeFileSync(options.out, renderReleaseNotes(results));
    if (options['title-out']) writeFileSync(options['title-out'], title);
    console.error(`release-notes: ${title}`);
    return 0;
  } catch (error) {
    console.error(`release-notes: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
