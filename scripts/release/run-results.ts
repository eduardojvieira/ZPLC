// Writes the results file that the release notes are rendered from (REL-027):
//
//   bun scripts/release/run-results.ts --needs needs.json --evidence <folder of release bundles> \
//       --junit compiler=typescript=junit-compiler.xml --version 2.0.0-rc.4 --tag v2.0.0-rc.4 \
//       --commit <sha> --run-url <url> --out run-results.json
//
// Three things are read and nothing is assumed: the result of each job of the run (`needs`), which files each
// platform bundle holds (the release-evidence-*.json that scripts/release-artifacts.mjs wrote) and the JUnit reports
// of the test suites. A check counts as passed when the job that runs it succeeded; the table below says which
// checks each job runs, and packages/zplc-ide/scripts/release-config.test.ts proves that against the workflow.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseJunit } from '../../tools/ci/check-expected-failures';
import type { AssetResult, CheckState, ChannelStateName, Platform, RunResults, SigningState } from './release-notes';

export interface ClassifiedAsset { platform: Platform; signing: SigningState; arch?: 'x64' | 'arm64' }

/** What kind of file a release asset is, from its name alone. */
export function classifyAsset(name: string): ClassifiedAsset {
  const arch = /(?:^|[-_])(x64|x86_64|amd64)(?=[-_.]|$)/.test(name) ? 'x64' : /(?:^|[-_])(arm64|aarch64)(?=[-_.]|$)/.test(name) ? 'arm64' : undefined;
  const withArch = (asset: ClassifiedAsset): ClassifiedAsset => (arch === undefined ? asset : { ...asset, arch });
  if (/^zplc-(?:cli|mcp)-/.test(name)) return withArch({ platform: 'cli', signing: 'unsigned' });
  if (/^zplc-runtime-/.test(name)) return { platform: 'firmware', signing: 'unsigned' };
  if (/\.(?:cdx|spdx)\.json$/.test(name)) return { platform: 'metadata', signing: 'unsigned' };
  if (/\.(?:dmg|zip)$/.test(name)) return withArch({ platform: 'macos', signing: 'adhoc' });
  if (/\.exe$/.test(name)) return withArch({ platform: 'windows', signing: /-unsigned\.exe$/.test(name) ? 'unsigned' : 'signed' });
  return withArch({ platform: 'linux', signing: 'unsigned' });
}

/** Executed (passed and failed), failed and skipped tests of one JUnit report of `bun test`. */
export function countJunit(xml: string): { executed: number; failed: number; skipped: number } {
  const counts = { executed: 0, failed: 0, skipped: 0 };
  for (const status of parseJunit(xml, 'suite').values()) {
    if (status === 'skip') counts.skipped += 1;
    else {
      counts.executed += 1;
      if (status === 'fail') counts.failed += 1;
    }
  }
  return counts;
}

export interface CollectInput {
  version: string;
  tag: string;
  commit: string;
  runUrl: string;
  /** A folder that holds, at any depth, the release-evidence-*.json files of the platform bundles. */
  evidenceDirectory: string;
  junit: Array<{ suite: string; job: string; path: string }>;
  expectedFailures: Array<{ test: string; requirement: string; added: string; reason: string }>;
  /** scripts/release/release-status.json: what a person says about a version that no job can. */
  status: Record<string, { completeness?: string; knownIssues?: string[] }>;
  knownLimits?: Record<string, { en: string }>;
  channels: Array<{ channel: string; state: ChannelStateName }>;
  /** `toJSON(needs)` of the workflow: the result of each job this one waits for. */
  needs: Record<string, { result: string }>;
}

function evidenceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...evidenceFiles(path));
    else if (/^release-evidence-.*\.json$/.test(entry.name)) found.push(path);
  }
  return found.sort();
}

export function collectRunResults(input: CollectInput): RunResults {
  const state = (job: string): CheckState => {
    const result = input.needs[job]?.result;
    return result === 'success' ? 'passed' : result === 'failure' ? 'failed' : 'not-run';
  };
  const assets = new Map<string, AssetResult>();
  for (const file of evidenceFiles(input.evidenceDirectory)) {
    const evidence = JSON.parse(readFileSync(file, 'utf8')) as { artifacts?: Array<{ name: string }> };
    for (const { name } of evidence.artifacts ?? []) {
      const { platform, signing, arch } = classifyAsset(name);
      // the checks that the job of this kind of file runs, and only those
      const checks = ((): AssetResult['checks'] => {
        switch (platform) {
          case 'macos': return { signature: state('build-macos'), launch: state('build-macos'), install: 'not-run' };
          case 'windows': return { signature: 'not-run', launch: state('build-windows'), install: 'not-run' };
          case 'linux': return { signature: 'not-run', launch: state('build-linux'), install: /\.(?:deb|rpm)$/.test(name) ? state('build-linux') : 'not-run' };
          case 'cli': return { signature: 'not-run', launch: state('build-binaries'), install: 'not-run' };
          default: return { signature: 'not-run', launch: 'not-run', install: 'not-run' };
        }
      })();
      const job = platform === 'cli' ? `build-binaries${arch ? ` (${/-(linux|mac|win)-/.exec(name)?.[1] ?? '?'}-${arch})` : ''}`
        : platform === 'firmware' ? 'build-firmware'
          : platform === 'metadata' ? 'prepare-release-evidence'
            : `build-${platform}${arch ? ` (${arch})` : ''}`;
      assets.set(name, { name, platform, job, runUrl: input.runUrl, signing, checks });
    }
  }

  const suites = input.junit.map(({ suite, job, path }) => ({ suite, job, ...countJunit(readFileSync(path, 'utf8')) }));
  const status = input.status[input.version] ?? {};
  const limits = Object.entries(input.knownLimits ?? {}).map(([id, limit]) => `${id}: ${limit.en}`);
  return {
    schemaVersion: 1,
    version: input.version,
    tag: input.tag,
    commit: input.commit,
    runUrl: input.runUrl,
    ...(status.completeness === undefined ? {} : { completeness: status.completeness }),
    jobs: Object.entries(input.needs).map(([job, { result }]) => ({ job, result })).sort((a, b) => a.job.localeCompare(b.job)),
    assets: [...assets.values()].sort((a, b) => a.name.localeCompare(b.name)),
    suites,
    knownFailures: input.expectedFailures.map((entry) => ({ id: entry.test, summary: entry.reason, tracking: entry.requirement })),
    channels: input.channels,
    changes: [],
    knownIssues: [...(status.knownIssues ?? []), ...limits],
  };
}

function main(argv: string[]): number {
  const root = resolve(import.meta.dir, '..', '..');
  const options = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!flag?.startsWith('--') || argv[index + 1] === undefined) { console.error(`run-results: bad argument ${flag}`); return 2; }
    options.set(flag, [...(options.get(flag) ?? []), argv[index + 1]!]);
  }
  const one = (flag: string, fallback?: string): string => {
    const value = options.get(flag)?.[0] ?? fallback;
    if (value === undefined) throw new Error(`${flag} is required`);
    return value;
  };
  try {
    const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
    const results = collectRunResults({
      version: one('--version'),
      tag: one('--tag'),
      commit: one('--commit'),
      runUrl: one('--run-url'),
      evidenceDirectory: one('--evidence'),
      junit: (options.get('--junit') ?? []).map((spec) => {
        const [suite = '', job = '', ...rest] = spec.split('=');
        return { suite, job, path: rest.join('=') };
      }),
      expectedFailures: readJson(one('--expected-failures', join(root, 'tools/ci/expected-failures.json'))),
      status: readJson<{ versions: CollectInput['status'] }>(one('--status', join(root, 'scripts/release/release-status.json'))).versions,
      knownLimits: readJson(one('--known-limits', join(root, 'docs/known-limits.json'))),
      channels: readJson(one('--channels', join(root, 'scripts/release/channels.json'))),
      needs: readJson(one('--needs')),
    });
    writeFileSync(one('--out'), `${JSON.stringify(results, null, 2)}\n`);
    console.error(`run-results: ${results.assets.length} assets, ${results.suites.length} suites, ${results.jobs.length} jobs`);
    return 0;
  } catch (error) {
    console.error(`run-results: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
