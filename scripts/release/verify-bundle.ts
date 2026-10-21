// What a release integrity bundle holds, read from the files that were produced (VF-021, REL-017, REL-018):
//
//   bun scripts/release/verify-bundle.ts <folder> --version <v> --tag <tag> --commit-sha <sha>
//
// scripts/release-artifacts.mjs writes the bundle of a platform: the assets, SHA256SUMS and release-evidence.json (the two
// are renamed per platform before the upload). This reads the folder as a person who downloads it would: every file the
// checksum file names is there with that checksum, no asset is left out of it, the evidence file says the same names and
// hashes for the identity of this run, and a bill of materials in it is the one scripts/release/sbom.ts accepts. It reads no
// workflow and no configuration.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

export interface BundleIdentity {
  version: string;
  tag: string;
  commitSha: string;
}

const SUM_LINE = /^([a-f0-9]{64}) {2}(.+)$/;

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** What is wrong with the bundle in `directory`; an empty list means it is what its checksum and evidence files say. */
export function verifyBundle(directory: string, identity: BundleIdentity): string[] {
  const problems: string[] = [];
  const names = readdirSync(directory).sort();
  const kinds = new Map(names.map((name) => [name, lstatSync(join(directory, name))] as const));
  for (const [name, status] of kinds) if (!status.isFile()) problems.push(`${name} is not a regular file`);
  const sums = names.filter((name) => /^SHA256SUMS/.test(name));
  const evidence = names.filter((name) => /^release-evidence.*\.json$/.test(name));
  if (sums.length !== 1) problems.push(`the bundle holds ${sums.length} checksum files, not one`);
  if (evidence.length !== 1) problems.push(`the bundle holds ${evidence.length} evidence files, not one`);
  if (sums.length !== 1 || evidence.length !== 1) return problems;

  const listed = new Map<string, string>();
  readFileSync(join(directory, sums[0]!), 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .forEach((line, index) => {
      const match = SUM_LINE.exec(line);
      if (!match) problems.push(`${sums[0]} line ${index + 1} is not "<sha256>  <name>"`);
      else if (listed.has(match[2]!)) problems.push(`${sums[0]} names ${match[2]} twice`);
      else listed.set(match[2]!, match[1]!);
    });
  for (const [name, hash] of listed) {
    if (!kinds.get(name)?.isFile()) problems.push(`${sums[0]} names ${name}, which the bundle does not hold`);
    else if (sha256(join(directory, name)) !== hash) problems.push(`${name} does not have the checksum that ${sums[0]} states`);
  }
  const assets = names.filter((name) => !sums.includes(name) && !evidence.includes(name));
  for (const name of assets) if (!listed.has(name)) problems.push(`${name} is in the bundle and in no checksum line`);
  if (assets.length === 0) problems.push('the bundle holds no asset');

  const record = JSON.parse(readFileSync(join(directory, evidence[0]!), 'utf8')) as {
    schemaVersion?: unknown;
    version?: string;
    tag?: string;
    commitSha?: string;
    artifacts?: Array<{ name: string; byteLength: number; sha256: string }>;
  };
  if (record.schemaVersion !== 1) problems.push(`${evidence[0]} has schemaVersion ${JSON.stringify(record.schemaVersion)}, not 1`);
  for (const key of ['version', 'tag', 'commitSha'] as const) {
    if (record[key] !== identity[key])
      problems.push(`${evidence[0]} says ${key} ${JSON.stringify(record[key])}, this run is ${JSON.stringify(identity[key])}`);
  }
  const recorded = new Map((record.artifacts ?? []).map((artifact) => [artifact.name, artifact]));
  for (const name of assets) {
    const artifact = recorded.get(name);
    if (!artifact) problems.push(`${evidence[0]} does not list ${name}`);
    else if (artifact.sha256 !== listed.get(name) || artifact.byteLength !== kinds.get(name)!.size)
      problems.push(`${evidence[0]} describes ${name} differently from the file and from ${sums[0]}`);
  }
  for (const name of recorded.keys())
    if (!assets.includes(name)) problems.push(`${evidence[0]} lists ${name}, which the bundle does not hold`);

  for (const name of assets.filter((candidate) => candidate.endsWith('.cdx.json'))) {
    const document = JSON.parse(readFileSync(join(directory, name), 'utf8')) as { bomFormat?: string; components?: unknown[] };
    if (document.bomFormat !== 'CycloneDX') problems.push(`${name} is not a CycloneDX document`);
    if (!Array.isArray(document.components) || document.components.length === 0) problems.push(`${name} holds no component`);
  }
  return problems;
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: { version: { type: 'string' }, tag: { type: 'string' }, 'commit-sha': { type: 'string' } },
  });
  const directory = positionals[0];
  if (!directory || !values.version || !values.tag || !values['commit-sha']) {
    console.error('usage: verify-bundle.ts <folder> --version <v> --tag <tag> --commit-sha <sha>');
    process.exit(2);
  }
  const problems = verifyBundle(resolve(directory), { version: values.version, tag: values.tag, commitSha: values['commit-sha'] });
  // the bill of materials is held to the lockfile and the recorded floor by the tool that writes it
  for (const name of readdirSync(directory).filter((file) => file.endsWith('.cdx.json'))) {
    const checked = Bun.spawnSync(['bun', join(import.meta.dir, 'sbom.ts'), '--verify', join(directory, name)], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (checked.exitCode !== 0) problems.push(`${name} fails the bill of materials check: ${checked.stderr.toString().trim()}`);
  }
  if (problems.length > 0) {
    console.error(problems.map((problem) => `verify-bundle: ${problem}`).join('\n'));
    process.exit(1);
  }
  console.log(`verify-bundle: ${directory} holds what its checksum and evidence files say`);
}
