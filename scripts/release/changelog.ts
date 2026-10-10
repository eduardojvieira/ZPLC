// The changelog holds only tagged versions (REL-031).
//
//   bun scripts/release/changelog.ts --check     CHANGELOG.md against package.json and the tags of this clone
//
// Entries accumulate under `## Unreleased`; the heading of a version is written when it is cut, so every older
// version heading must have its tag. A heading of an older version with no tag is listed, with the reason, in
// scripts/release/changelog-untagged.json: the list can only shrink. A clone with no tags (a shallow CI checkout)
// cannot say which headings are tagged, so the tag rules are skipped there and run where the tags are, in the release run.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function parse(version: string): { core: number[]; pre: string[] } {
  const [core = '', pre] = version.split('-', 2) as [string, string | undefined];
  return { core: core.split('.').map(Number), pre: pre === undefined ? [] : pre.split('.') };
}

/** Semantic versioning precedence: negative when `a` is the older. */
export function compareVersions(a: string, b: string): number {
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (difference !== 0) return difference;
  }
  if (left.pre.length === 0 || right.pre.length === 0) return right.pre.length - left.pre.length;
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index += 1) {
    const x = left.pre[index];
    const y = right.pre[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const numeric = /^\d+$/.test(x) && /^\d+$/.test(y);
    if (numeric && Number(x) !== Number(y)) return Number(x) - Number(y);
    if (!numeric && x !== y) {
      if (/^\d+$/.test(x)) return -1;
      if (/^\d+$/.test(y)) return 1;
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

const DATED = /^## (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) - (\d{4}-\d{2}-\d{2})$/;

export interface ChangelogInput {
  text: string;
  /** The tags of the clone, `v2.0.0-rc.3`; empty when it has none. */
  tags: string[];
  /** The version of the root package.json. */
  productVersion: string;
  /** Older versions that have a heading and no tag, with the reason. */
  untagged: Record<string, string>;
}

export function checkChangelog({ text, tags, productVersion, untagged }: ChangelogInput): string[] {
  const problems: string[] = [];
  const versions: string[] = [];
  const headings = text.split('\n').filter((line) => line.startsWith('## '));
  headings.forEach((heading, index) => {
    const dated = DATED.exec(heading);
    if (heading === '## Unreleased') {
      if (index !== 0) problems.push('"## Unreleased" must be the first heading');
    } else if (dated) {
      versions.push(dated[1]!);
    } else {
      problems.push(`"${heading}" is neither "## Unreleased" nor "## <version> - <date>"`);
    }
  });
  versions.forEach((version, index) => {
    if (index > 0 && compareVersions(version, versions[index - 1]!) >= 0) {
      problems.push(`## ${version} is newer than the heading before it: versions go from newest to oldest`);
    }
    if (compareVersions(version, productVersion) > 0) {
      problems.push(`## ${version} is above the product version ${productVersion} of package.json`);
    }
  });
  if (tags.length > 0) {
    for (const version of versions) {
      // the version being cut is written before its tag exists; every older one has been tagged
      if (compareVersions(version, productVersion) < 0 && !tags.includes(`v${version}`) && !(version in untagged)) {
        problems.push(`## ${version} has no tag v${version}`);
      }
    }
    for (const version of Object.keys(untagged)) {
      if (tags.includes(`v${version}`)) problems.push(`changelog-untagged.json lists ${version}, which has a tag now: remove it`);
    }
  }
  return problems;
}

function main(argv: string[]): number {
  if (!argv.includes('--check')) { console.error('usage: changelog.ts --check'); return 2; }
  const root = resolve(import.meta.dir, '..', '..');
  const tags = spawnSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const problems = checkChangelog({
    text: readFileSync(join(root, 'CHANGELOG.md'), 'utf8'),
    tags,
    productVersion: (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version,
    untagged: JSON.parse(readFileSync(join(root, 'scripts/release/changelog-untagged.json'), 'utf8')) as Record<string, string>,
  });
  for (const problem of problems) console.error(`changelog: ${problem}`);
  if (problems.length === 0) console.log(`changelog: ${tags.length === 0 ? 'headings and order checked; this clone has no tags, so the tag rules were skipped' : `${tags.length} tags checked`}`);
  return problems.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
