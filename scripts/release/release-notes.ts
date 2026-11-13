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
import { join } from 'node:path';
import { classifyAsset } from './run-results';

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
  /** The evidence level of the board a firmware image is for, from the manifest of the firmware release (REL-022). */
  evidenceLevel?: 'cross-build' | 'human-hil';
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
  /** Whether the bundles hold the checksum files that the render job merges into the `SHA256SUMS` of the release. */
  sha256sums?: boolean;
  changes: string[];
  /** What a user has to do differently after this release, and how to move (DOC-030). */
  breaking?: string[];
  migration?: string[];
  knownIssues: string[];
}

const CHANNEL_STATES: readonly string[] = ['live', 'submitted', 'refused', 'not yet submittable'];
const PLATFORM_NAMES: Record<'macos' | 'windows' | 'linux', string> = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };

export function releaseTitle(results: RunResults): string {
  if (!results.version.includes('-')) return `ZPLC v${results.version}`;
  if (!results.completeness || results.completeness.trim() === '') {
    throw new Error(
      `Prerelease ${results.version} has no completeness statement: its title must say how complete it ` +
        `is (scripts/release/release-status.json)`,
    );
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

export interface ChangelogParts {
  structured: boolean;
  changes: string[];
  breaking: string[];
  migration: string[];
  limits: string[];
}

const PART_HEADINGS: Record<string, keyof Omit<ChangelogParts, 'structured'> | 'ignore'> = {
  'what changed for you': 'changes',
  'breaking changes': 'breaking',
  migration: 'migration',
  'known limits': 'limits',
  'details for contributors': 'ignore',
};

/**
 * The parts of the section of one version (DOC-030). A section with `###` headings that name its parts says, for a user,
 * what changed, what breaks, how to migrate and what is limited; the details for contributors stay in the changelog. A
 * section without them (an older release) is all "what changed".
 */
export function changelogParts(text: string, version: string): ChangelogParts {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line === `## ${version}` || line.startsWith(`## ${version} - `));
  const parts: ChangelogParts = { structured: false, changes: [], breaking: [], migration: [], limits: [] };
  if (start < 0) return parts;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    body.push(line);
  }
  parts.structured = body.some((line) => /^### /.test(line) && PART_HEADINGS[line.slice(4).trim().toLowerCase()] !== undefined);
  if (!parts.structured) {
    parts.changes = changelogSection(text, version);
    return parts;
  }
  let target: keyof Omit<ChangelogParts, 'structured'> | 'ignore' | undefined;
  for (const line of body) {
    const heading = /^### (.+)$/.exec(line);
    if (heading) {
      target = PART_HEADINGS[heading[1]!.trim().toLowerCase()];
      continue;
    }
    if (target === undefined || target === 'ignore') continue;
    const item = /^(?:-|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      parts[target].push(item[1]!.trim());
      continue;
    }
    if (/^\s+\S/.test(line) && parts[target].length > 0) parts[target][parts[target].length - 1] += ` ${line.trim()}`;
  }
  // "None." under a heading says that nothing is recorded, and is not an item
  for (const key of ['changes', 'breaking', 'migration', 'limits'] as const)
    parts[key] = parts[key].filter((item) => item !== '' && !/^none\.?$/i.test(item));
  return parts;
}

function signingText(asset: AssetResult): string {
  const verified = asset.checks.signature === 'passed';
  switch (asset.signing) {
    case 'adhoc':
      return verified
        ? 'Signed ad hoc and sealed; signature verified in this run. Not notarized: macOS asks for approval the first time a downloaded ' +
            'copy opens.'
        : `Intended to be signed ad hoc; the signature check did not pass in this run ` +
            `(${asset.checks.signature === 'failed' ? 'it failed' : 'it did not run'}), so no signature is claimed. Not notarized.`;
    case 'signed':
      return verified
        ? 'Signed; signature verified in this run.'
        : `Claimed signed, but the signature check did not pass in this run ` +
            `(${asset.checks.signature === 'failed' ? 'it failed' : 'it did not run'}), so no signature is claimed.`;
    case 'unsigned':
      return asset.platform === 'windows'
        ? 'Unsigned. Windows warns before it runs, and Smart App Control blocks it.'
        : 'Unsigned. Integrity comes from the checksums and the build provenance attestation.';
  }
}

/** What a level establishes, in the words of the hardware support page: the level is the board's, and is never implied by a build. */
const LEVEL_TEXT: Record<NonNullable<AssetResult['evidenceLevel']>, string> = {
  'cross-build': 'cross-build (the firmware builds for the board and fits its flash and RAM budget; it has not been flashed or run on it)',
  'human-hil': 'human-hil (a person ran a recorded procedure on the board, and the record names the firmware version and image it covers)',
};

function checksText(asset: AssetResult): string {
  if (asset.platform === 'firmware' && asset.name.endsWith('.manifest.json')) {
    return 'lists the firmware images of this release with their checksums, build identity and the evidence level of each board';
  }
  if (asset.platform === 'firmware') {
    // a firmware image is built and checksummed, never launched by the run: the only label that it can carry is its board's level
    return asset.evidenceLevel === undefined
      ? 'built for its board; the evidence level of the board is not recorded in this run'
      : `built for its board. Evidence level of the board: ${LEVEL_TEXT[asset.evidenceLevel]}`;
  }
  const word = (state: CheckState) => (state === 'not-run' ? 'not run' : state);
  const parts = [`launched on its own system: ${word(asset.checks.launch)}`];
  if (asset.checks.install !== 'not-run') parts.push(`installed and launched in clean containers: ${word(asset.checks.install)}`);
  return parts.join('; ');
}

function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

const INSTALL_GUIDE = 'https://eduardojvieira.github.io/ZPLC/docs/getting-started/install';

/** The systems of the downloads, in the words a person knows their computer by. */
const SYSTEMS = [
  { label: 'Windows, Intel or AMD (x64)', platform: 'windows', os: 'win', arch: 'x64' },
  { label: 'Windows on ARM (arm64)', platform: 'windows', os: 'win', arch: 'arm64' },
  { label: 'macOS, Apple silicon (M1 and later)', platform: 'macos', os: 'mac', arch: 'arm64' },
  { label: 'macOS, Intel', platform: 'macos', os: 'mac', arch: 'x64' },
  { label: 'Linux, Intel or AMD (x86_64)', platform: 'linux', os: 'linux', arch: 'x64' },
  { label: 'Linux on ARM (arm64, aarch64)', platform: 'linux', os: 'linux', arch: 'arm64' },
] as const;

/** The formats of each system, the recommended one first. */
const FORMATS: Record<'windows' | 'macos' | 'linux', Array<[string, RegExp]>> = {
  windows: [
    ['Installer', /-setup(?:-unsigned)?\.exe$/],
    ['Portable', /-portable(?:-unsigned)?\.exe$/],
  ],
  macos: [
    ['Disk image', /\.dmg$/],
    ['Zip', /\.zip$/],
  ],
  linux: [
    ['Debian, Ubuntu (.deb)', /\.deb$/],
    ['Fedora (.rpm)', /\.rpm$/],
    ['Other distributions (AppImage)', /\.AppImage$/],
  ],
};

/** A section that GitHub shows collapsed, under its summary. */
function details(summary: string, body: string[]): string[] {
  return ['<details>', `<summary>${summary}</summary>`, '', ...body, '', '</details>', ''];
}

/** The display name of each board of firmware/app/boards/boards.json, by the `board_id` that its image names carry. */
function boardNames(): Map<string, string> {
  const boards = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', 'firmware', 'app', 'boards', 'boards.json'), 'utf8')) as Array<{
    board_id: string;
    display_name: string;
  }>;
  return new Map(boards.map((board) => [board.board_id, board.display_name]));
}

/**
 * The downloads, first (S4): a row per system with the direct address of each file on the release, and the tools and
 * the firmware collapsed. Only a file that a bundle of the run holds is linked.
 */
function downloads(results: RunResults): string[] {
  const repository = /^(https:\/\/[^/]+\/[^/]+\/[^/]+)\/actions\/runs\/\d+/.exec(results.runUrl)?.[1];
  if (repository === undefined)
    throw new Error(`the run URL ${results.runUrl} names no repository, so the notes cannot link the files of the release`);
  const link = (label: string, name: string) =>
    `[${label}](${repository}/releases/download/${encodeURIComponent(results.tag)}/${encodeURIComponent(name)})`;
  const arch = (name: string) => classifyAsset(name).arch;
  const out = ['### Download', '', '| Your system | Download | Other formats |', '| --- | --- | --- |'];
  for (const system of SYSTEMS) {
    const files = results.assets.filter((asset) => asset.platform === system.platform && arch(asset.name) === system.arch);
    const [first, ...others] = FORMATS[system.platform].flatMap(([label, pattern]) => {
      const file = files.find((asset) => pattern.test(asset.name));
      return file ? [link(label, file.name)] : [];
    });
    const smaller = others.map((other) => `<sub>${other}</sub>`).join(' · ');
    out.push(`| ${system.label} | ${first ? `**${first}**` : 'Not in this release'} | ${smaller} |`);
  }
  out.push(
    '',
    'Not sure which one? Windows: **Settings**, **System**, **About**, _System type_. Mac: Apple menu, **About This Mac**: a _Chip_ ' +
      'is Apple silicon, a _Processor_ is Intel. Linux: `uname -m` prints `x86_64` or `aarch64`. How to open ZPLC the first time: ' +
      `[First launch](${INSTALL_GUIDE}#first-launch).`,
    '',
  );

  const tools = results.assets.filter((asset) => asset.platform === 'cli');
  if (tools.length > 0) {
    const tool = (kind: 'cli' | 'mcp', system: (typeof SYSTEMS)[number]) => {
      const file = tools.find(
        (asset) =>
          asset.name.startsWith(`zplc-${kind}-`) &&
          /-(win|mac|linux)-[^-]+$/.exec(asset.name)?.[1] === system.os &&
          arch(asset.name) === system.arch,
      );
      return file ? link('Download', file.name) : 'Not in this release';
    };
    out.push(
      ...details('Command line tool and MCP server', [
        '| Your system | Command line tool (`zplc-cli`) | MCP server for AI assistants (`zplc-mcp`) |',
        '| --- | --- | --- |',
        ...SYSTEMS.map((system) => `| ${system.label} | ${tool('cli', system)} | ${tool('mcp', system)} |`),
        '',
        'Each is one executable that needs no installer, Node.js or Bun. On macOS and Linux, make it executable first: ' +
          '`chmod +x <file>`.',
      ]),
    );
  }

  const firmware = results.assets.filter((asset) => asset.platform === 'firmware');
  const images = firmware.filter((asset) => !asset.name.endsWith('.manifest.json'));
  if (images.length > 0) {
    const names = boardNames();
    const prefix = `zplc-runtime-${results.version}-`;
    const boards = new Map<string, AssetResult[]>();
    for (const image of images) {
      const board = (image.name.startsWith(prefix) ? image.name.slice(prefix.length) : image.name).replace(/\.[^.]+$/, '');
      boards.set(board, [...(boards.get(board) ?? []), image]);
    }
    const rows = [...boards].map(([board, files]) => {
      const [flash, ...rest] = [...files]
        .sort((a, b) => Number(a.name.endsWith('.elf')) - Number(b.name.endsWith('.elf')))
        .map((file) => {
          const extension = file.name.slice(file.name.lastIndexOf('.') + 1);
          return link(extension === 'elf' ? 'Debug image (.elf)' : `Flash image (.${extension})`, file.name);
        });
      const links = [`**${flash}**`, ...rest.map((other) => `<sub>${other}</sub>`)].join(' · ');
      return `| ${cell(names.get(board) ?? board)} | ${links} | ${files[0]!.evidenceLevel ?? 'not recorded'} |`;
    });
    const levels = [...new Set(images.flatMap((image) => (image.evidenceLevel ? [image.evidenceLevel] : [])))];
    const manifest = firmware.find((asset) => asset.name.endsWith('.manifest.json'));
    out.push(
      ...details('Runtime firmware for the boards', [
        '| Board | Download | Evidence level of the board |',
        '| --- | --- | --- |',
        ...rows,
        '',
        ...levels.map((level) => `- ${LEVEL_TEXT[level]}`),
        ...(manifest
          ? ['', `${link('Firmware manifest', manifest.name)}: the images with their checksums, build identity and board levels.`]
          : []),
      ]),
    );
  }

  if (results.sha256sums === true) {
    out.push(
      `**Check the file:** compare it with its line in ${link('SHA256SUMS', 'SHA256SUMS')}, as ` +
        `[Verify the download](${INSTALL_GUIDE}#verify-the-download) shows.`,
      '',
    );
  }
  return out;
}

export function renderReleaseNotes(results: RunResults): string {
  for (const { channel, state } of results.channels) {
    if (!CHANNEL_STATES.includes(state))
      throw new Error(`Unknown channel state for ${channel}: ${state} (channel state must be one of ${CHANNEL_STATES.join(', ')})`);
  }
  const out: string[] = downloads(results);

  out.push('### What changed', '');
  out.push(
    ...(results.changes.length > 0
      ? results.changes.map((change) => `- ${change}`)
      : ['No user-facing change is recorded for this version.']),
    '',
  );

  out.push('### Breaking changes', '');
  out.push(
    ...((results.breaking ?? []).length > 0
      ? results.breaking!.map((change) => `- ${change}`)
      : ['No breaking change is recorded for this version.']),
    '',
  );
  if ((results.migration ?? []).length > 0) {
    out.push('### Migration', '', ...results.migration!.map((step) => `- ${step}`), '');
  }

  out.push('### Known issues', '');
  if (results.knownIssues.length === 0 && results.knownFailures.length === 0) {
    out.push('No known issue is recorded for this release.');
  } else {
    out.push(...results.knownIssues.map((issue) => `- ${issue}`));
    if (results.knownFailures.length > 0) {
      out.push('', 'Checks that fail and are listed as expected failures:', '');
      out.push(
        ...results.knownFailures.map((failure) => `- ${failure.id}: ${failure.summary}${failure.tracking ? ` (${failure.tracking})` : ''}`),
      );
    }
  }
  out.push('');

  if (results.assets.some((asset) => asset.platform === 'windows' && asset.signing === 'unsigned')) {
    out.push('### Windows: unsigned installers', '');
    out.push('The setup and portable executables are not signed, so their file names carry `unsigned`. To run one:', '');
    out.push('1. Windows shows "Windows protected your PC" (SmartScreen).', '2. Select **More info**, then **Run anyway**.', '');
    out.push(
      'Smart App Control blocks unsigned apps and offers no Run anyway option. On a PC where Smart App Control is on, these files do not ' +
        'run.',
      '',
    );
  }

  // what the run recorded, collapsed (S4): every line is still in the notes, under a summary that says what it holds
  const signing = ['| Asset | Built by | Signing state | Checks in this run |', '| --- | --- | --- | --- |'];
  for (const asset of results.assets) {
    const job = asset.runUrl ? `[${asset.job}](${asset.runUrl})` : asset.job;
    signing.push(`| ${cell(asset.name)} | ${cell(job)} | ${cell(signingText(asset))} | ${cell(checksText(asset))} |`);
  }
  signing.push('');
  for (const platform of ['macos', 'windows', 'linux'] as const) {
    if (results.assets.some((asset) => asset.platform === platform)) continue;
    const job = results.jobs.find((candidate) => candidate.job === `build-${platform}`);
    signing.push(
      `No files were published for ${PLATFORM_NAMES[platform]}: its build job ${
        job ? `ended in ${job.result}` : 'did not report a result'
      }.`,
      '',
    );
  }
  // the images of every board or none (REL-022): the notes say which job to read when there are none
  if (!results.assets.some((asset) => asset.platform === 'firmware')) {
    const failed = results.jobs.filter(
      (candidate) =>
        /^(?:build|assemble)-firmware$|^prepare-release-evidence-firmware$/.test(candidate.job) && candidate.result !== 'success',
    );
    signing.push(
      `No firmware image was published: ${
        failed.length > 0
          ? failed.map((candidate) => `${candidate.job} ended in ${candidate.result}`).join(', ')
          : 'the firmware jobs did not ' + 'report a result'
      }.`,
    );
  }
  out.push(...details(`Signing state and checks of every asset (${results.assets.length} files)`, signing));

  if (results.suites.length === 0) {
    out.push(
      ...details('Tests executed in this run: none recorded', [
        'The run recorded no test results, so these notes make no claim about tests.',
      ]),
    );
  } else {
    const total = results.suites.reduce(
      (sum, suite) => ({
        executed: sum.executed + suite.executed,
        failed: sum.failed + suite.failed,
        skipped: sum.skipped + suite.skipped,
      }),
      { executed: 0, failed: 0, skipped: 0 },
    );
    out.push(
      ...details(`Tests executed in this run: ${total.executed} executed, ${total.failed} failed, ${total.skipped} skipped`, [
        '| Suite | Job | Executed | Failed | Skipped |',
        '| --- | --- | --- | --- | --- |',
        ...results.suites.map(
          (suite) => `| ${cell(suite.suite)} | ${cell(suite.job)} | ${suite.executed} | ${suite.failed} | ${suite.skipped} |`,
        ),
        '',
        `${total.executed} tests executed, ${total.failed} failed, ${total.skipped} skipped.`,
      ]),
    );
  }

  if (results.channels.length > 0) {
    out.push(
      ...details('Windows channels', [
        '| Channel | State |',
        '| --- | --- |',
        ...results.channels.map((channel) => `| ${channel.channel} | ${channel.state} |`),
        '',
        'A channel is live, submitted, refused or not yet submittable. Until a channel is live, the unsigned files of this release are ' +
          'the only Windows download.',
      ]),
    );
  }

  out.push(
    ...details('Verify what you downloaded: checksums and build provenance', [
      'Every file is listed in `SHA256SUMS`. In the folder with your download:',
      '',
      '```text',
      'Linux:    sha256sum --ignore-missing -c SHA256SUMS',
      'macOS:    shasum -a 256 -c SHA256SUMS',
      'Windows:  Get-FileHash .\\<file> -Algorithm SHA256   (compare it with the line for your file)',
      '```',
      '',
      'The build provenance attestation says which run built the file:',
      '',
      '```text',
      'gh attestation verify <file> --repo eduardojvieira/ZPLC',
      '```',
      '',
      'An attestation proves where a file was built, not that it is safe, and it does not change the warnings of your operating system.',
    ]),
  );

  out.push(
    ...details('Evidence boundary: what this release does not establish', [
      `Built from commit \`${results.commit}\` by [this run](${results.runUrl}).`,
      '',
      'Repository and hosted workflow results do not establish HIL, board qualification, timing, safety certification, or human release ' +
        'sign-off.',
      'Prerelease tags remain release candidates, not GA declarations.',
    ]),
  );

  out.push('### Documentation', '');
  out.push(
    '- [Full Documentation](https://eduardojvieira.github.io/ZPLC/)',
    '- [Reference Documentation](https://eduardojvieira.github.io/ZPLC/reference)',
    '',
  );
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
    console.error(
      'usage: release-notes.ts --results <run-results.json> --out <notes.md> [--title-out <file>] [--changelog <CHANGELOG.md>]',
    );
    return 2;
  }
  try {
    const results = parseResults(readFileSync(options.results, 'utf8'));
    if (options.changelog) {
      const parts = changelogParts(readFileSync(options.changelog, 'utf8'), results.version);
      if (results.changes.length === 0) results.changes = parts.changes;
      results.breaking = [...(results.breaking ?? []), ...parts.breaking];
      results.migration = [...(results.migration ?? []), ...parts.migration];
      results.knownIssues = [...results.knownIssues, ...parts.limits];
    }
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
