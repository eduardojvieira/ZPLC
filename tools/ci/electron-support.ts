// The Electron line of Studio (IDE-028): at each release Electron is on a supported major line, at its latest patch.
//
//   bun tools/ci/electron-support.ts             the major line: fails when the dependency is outside the supported majors
//   bun tools/ci/electron-support.ts --release   also the latest patch: run it before a release is tagged
//
// The supported majors and the latest patch of each are written in one place, tools/ci/electron-support.json, by a person,
// from the Electron release schedule and npm at the time of a release: a build has no network, and the schedule moves every
// eight weeks. The pull-request check is the line, which fails the day the dependency is no longer supported by the record;
// the latest patch is the release check, because a new patch of the line is not a defect of a commit that did not change it.
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

export interface Support {
  recordedOn: string;
  source: string;
  policy: string;
  supportedMajors: number[];
  endOfLife: Record<string, string>;
  latestPatch: Record<string, string>;
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const ROOT = new URL('../../', import.meta.url);

export function problems(dependency: string, installed: string | undefined, support: Support, release: boolean): string[] {
  const found: string[] = [];
  const parsed = VERSION.exec(dependency);
  if (!parsed) return [`the electron dependency is "${dependency}": pin one exact version, so that a build is the one that was tested`];
  const major = Number(parsed[1]);
  const lines = support.supportedMajors;
  if (lines.length !== 3 || new Set(lines).size !== 3)
    found.push(`electron-support.json lists ${lines.length} supported majors: Electron supports its latest three`);
  for (const line of lines) {
    if (!VERSION.test(support.latestPatch[String(line)] ?? '')) found.push(`electron-support.json has no latest patch for ${line}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(support.endOfLife[String(line)] ?? ''))
      found.push(`electron-support.json has no end of support date for ${line}`);
  }
  if (!lines.includes(major))
    found.push(
      `electron ${dependency} is on major ${major}, which is not supported: the supported majors ` +
        `are ${lines.join(', ')} (recorded ${support.recordedOn})`,
    );
  if (installed !== undefined && installed !== dependency)
    found.push(`the installed electron is ${installed} and the dependency is ${dependency}: run bun install`);
  const latest = support.latestPatch[String(major)];
  if (release && latest !== undefined && latest !== dependency)
    found.push(`electron is ${dependency}; the latest patch of ${major} recorded on ${support.recordedOn} is ${latest}`);
  return found;
}

export function load(): { dependency: string; installed: string | undefined; support: Support } {
  const manifest = JSON.parse(readFileSync(new URL('packages/zplc-ide/package.json', ROOT), 'utf8')) as {
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  const dependency = manifest.devDependencies?.electron ?? manifest.dependencies?.electron ?? '';
  const installedFile = new URL('packages/zplc-ide/node_modules/electron/package.json', ROOT);
  return {
    dependency,
    installed: existsSync(installedFile) ? (JSON.parse(readFileSync(installedFile, 'utf8')) as { version: string }).version : undefined,
    support: JSON.parse(readFileSync(new URL('tools/ci/electron-support.json', ROOT), 'utf8')) as Support,
  };
}

if (import.meta.main) {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { release: { type: 'boolean', default: false } } });
  const { dependency, installed, support } = load();
  const found = problems(dependency, installed, support, values.release);
  if (found.length > 0) {
    console.error(found.map((message) => `electron-support: ${message}`).join('\n'));
    process.exit(1);
  }
  console.log(
    `electron-support: electron ${dependency} is on a supported major line (${support.supportedMajors.join(
      ', ',
    )} as of ${support.recordedOn})${values.release ? ' and at its latest patch' : ''}`,
  );
}
