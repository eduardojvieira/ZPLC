// The software bill of materials (REL-018): CycloneDX 1.5 JSON written from the source tree, with no dependency.
//
//   bun scripts/release/sbom.ts --out sbom.cdx.json     write it, and fail when it is below what the lockfile lists
//   bun scripts/release/sbom.ts --check                 the same checks without writing a file
//   bun scripts/release/sbom.ts --verify sbom.cdx.json  check a document that a release already holds
//   bun scripts/release/sbom.ts --update-floor          raise the recorded floor to the current count
//
// Sources: bun.lock (every locked package, with its integrity hash), the workspace package.json files, and the
// projects of west.yml. The projects that Zephyr's own west.yml imports are listed only when a manifest for them
// is given with --west-import (the firmware CI jobs have one); the repository alone cannot know them.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { integrityHex, parseLockfile, productionClosure, resolveDependency, type Lockfile } from './lockfile';

export interface WorkspaceManifest {
  name: string;
  version?: string;
}

export interface SbomInput {
  lockText: string;
  /** package.json of each workspace path of the lockfile. */
  workspaceManifests: Record<string, WorkspaceManifest>;
  westText: string;
  /** Zephyr's own manifests, for the projects it imports. */
  westImports?: string[];
  productVersion: string;
  commit?: string;
  /** Workspace paths whose production closure ships; the rest is build tooling. Default: every workspace. */
  shippedWorkspaces?: string[];
  /** Seconds since the epoch (SOURCE_DATE_EPOCH); no timestamp is written without it, so the file is reproducible. */
  epoch?: number;
}

export interface Component {
  type: 'application' | 'library' | 'framework';
  'bom-ref': string;
  name: string;
  version: string;
  purl: string;
  scope?: 'required' | 'optional' | 'excluded';
  hashes?: Array<{ alg: string; content: string }>;
  properties?: Array<{ name: string; value: string }>;
}

export interface Sbom {
  bomFormat: 'CycloneDX';
  specVersion: '1.5';
  version: 1;
  metadata: Record<string, unknown>;
  components: Component[];
  dependencies: Array<{ ref: string; dependsOn: string[] }>;
}

/** `pkg:npm/%40scope/name@1.0.0`: the purl specification percent-encodes the `@` of a scope. */
export function npmPurl(name: string, version: string): string {
  return `pkg:npm/${name.startsWith('@') ? `%40${name.slice(1)}` : name}@${version}`;
}

function genericPurl(name: string, version: string, vcsUrl?: string): string {
  const base = `pkg:generic/${name.startsWith('@') ? `%40${name.slice(1)}` : name}@${version}`;
  return vcsUrl === undefined ? base : `${base}?vcs_url=${encodeURIComponent(vcsUrl)}`;
}

export interface WestProject {
  name: string;
  url: string;
  revision: string;
}

interface WestManifest {
  manifest?: {
    remotes?: Array<{ name: string; 'url-base'?: string }>;
    projects?: Array<{ name: string; url?: string; remote?: string; 'repo-path'?: string; revision?: string }>;
  };
}

export function westProjects(text: string): WestProject[] {
  const manifest = (Bun.YAML.parse(text) as WestManifest | null)?.manifest;
  const bases = new Map((manifest?.remotes ?? []).map((remote) => [remote.name, remote['url-base'] ?? '']));
  return (manifest?.projects ?? []).map((project) => {
    const base = project.remote === undefined ? '' : (bases.get(project.remote) ?? '');
    const url = project.url ?? (base === '' ? '' : `${base.replace(/\/$/, '')}/${project['repo-path'] ?? project.name}`);
    return { name: project.name, url, revision: project.revision ?? 'unknown' };
  });
}

function westPurl(project: WestProject): string {
  const github = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(project.url);
  return github
    ? `pkg:github/${github[1]}/${github[2]}@${project.revision}`
    : genericPurl(project.name, project.revision, project.url || undefined);
}

export function buildSbom(input: SbomInput): Sbom {
  const lock = parseLockfile(input.lockText);
  const shipped = input.shippedWorkspaces ?? [...lock.workspaces.keys()].filter((path) => path !== '');
  const required = new Set<string>();
  for (const path of shipped) {
    for (const entry of productionClosure(lock, path).packages) required.add(entry.key);
    const own = lock.workspaces.get(path);
    if (own) required.add(own.name);
  }

  const components = new Map<string, Component>();
  const edges = new Map<string, Set<string>>();
  const purlOf = (key: string): string | undefined => {
    const entry = lock.packages.get(key);
    if (!entry) return undefined;
    return entry.workspacePath !== undefined
      ? genericPurl(
          entry.name,
          input.workspaceManifests[entry.workspacePath]?.version ?? lock.workspaces.get(entry.workspacePath)?.version ?? 'unknown',
        )
      : npmPurl(entry.name, entry.version);
  };

  for (const entry of lock.packages.values()) {
    const purl = purlOf(entry.key)!;
    const isRequired = required.has(entry.key);
    const existing = components.get(purl);
    if (existing) {
      if (isRequired) existing.scope = 'required';
    } else {
      const version = entry.workspacePath !== undefined ? purl.slice(purl.lastIndexOf('@') + 1) : entry.version;
      const hash = integrityHex(entry.integrity);
      components.set(purl, {
        type: 'library',
        'bom-ref': purl,
        name: entry.name,
        version,
        purl,
        scope: isRequired ? 'required' : 'excluded',
        ...(hash ? { hashes: [hash] } : {}),
      });
    }
    const dependsOn = edges.get(purl) ?? new Set<string>();
    edges.set(purl, dependsOn);
    const workspace = entry.workspacePath === undefined ? undefined : lock.workspaces.get(entry.workspacePath);
    const direct = workspace
      ? [...Object.keys(workspace.dependencies), ...Object.keys(workspace.devDependencies)]
      : [...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies];
    const chain = workspace ? [entry.name] : entry.chain;
    for (const name of direct) {
      const target = resolveDependency(lock, chain, name);
      const targetPurl = target ? purlOf(target.key) : undefined;
      if (targetPurl !== undefined && targetPurl !== purl) dependsOn.add(targetPurl);
    }
  }

  const west = [...westProjects(input.westText), ...(input.westImports ?? []).flatMap((text) => westProjects(text))];
  for (const project of west) {
    const purl = westPurl(project);
    if (components.has(purl)) continue;
    components.set(purl, {
      type: 'framework',
      'bom-ref': purl,
      name: project.name,
      version: project.revision,
      purl,
      scope: 'required',
      properties: [{ name: 'zplc:source', value: 'west manifest' }],
    });
    edges.set(purl, new Set());
  }

  const productPurl = genericPurl('zplc', input.productVersion);
  const sorted = [...components.values()].sort((a, b) => a.purl.localeCompare(b.purl));
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      ...(input.epoch === undefined ? {} : { timestamp: new Date(input.epoch * 1000).toISOString() }),
      tools: { components: [{ type: 'application', name: 'zplc-sbom', version: input.productVersion }] },
      component: {
        type: 'application',
        'bom-ref': productPurl,
        name: 'zplc',
        version: input.productVersion,
        purl: productPurl,
        ...(input.commit === undefined ? {} : { properties: [{ name: 'zplc:commit', value: input.commit }] }),
      },
    },
    components: sorted,
    dependencies: sorted.map((component) => ({ ref: component.purl, dependsOn: [...(edges.get(component.purl) ?? [])].sort() })),
  };
}

export interface SbomCheckOptions {
  lock: Lockfile;
  floor: number;
}

/** What is wrong with the document; an empty list means it holds every locked package and meets the floor. */
export function checkSbom(sbom: Pick<Sbom, 'components'>, { lock, floor }: SbomCheckOptions): string[] {
  const problems: string[] = [];
  const locked = new Map<string, string>();
  for (const entry of lock.packages.values()) {
    if (entry.workspacePath === undefined) locked.set(npmPurl(entry.name, entry.version), entry.id);
  }
  const held = new Set(sbom.components.map((component) => component.purl));
  const missing = [...locked]
    .filter(([purl]) => !held.has(purl))
    .map(([, id]) => id)
    .sort();
  const heldNpm = [...held].filter((purl) => purl.startsWith('pkg:npm/')).length;
  if (missing.length > 0) {
    problems.push(
      `bun.lock lists ${locked.size} packages but the document holds ${heldNpm}: missing ${missing.slice(0, 10).join(', ')}${
        missing.length > 10 ? `, and ${missing.length - 10} more` : ''
      }`,
    );
  }
  if (sbom.components.length < floor) {
    problems.push(
      `the document holds ${sbom.components.length} components, below the recorded floor of ${floor} (scripts/release/sbom-floor.json)`,
    );
  }
  for (const component of sbom.components) {
    if (!component.name || !component.version || !component.purl)
      problems.push(`a component has no name, version or purl: ${JSON.stringify(component)}`);
  }
  return problems;
}

const FLOOR_FILE = 'scripts/release/sbom-floor.json';

function repositoryInput(root: string, westImports: string[]): SbomInput {
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const lockText = read('bun.lock');
  const lock = parseLockfile(lockText);
  const manifests: Record<string, WorkspaceManifest> = {};
  for (const path of lock.workspaces.keys()) {
    if (path !== '') manifests[path] = JSON.parse(read(`${path}/package.json`)) as WorkspaceManifest;
  }
  let commit: string | undefined;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    /* a source archive has no git */
  }
  const epoch = process.env.SOURCE_DATE_EPOCH;
  return {
    lockText,
    workspaceManifests: manifests,
    westText: read('west.yml'),
    westImports: westImports.map((path) => readFileSync(path, 'utf8')),
    productVersion: (JSON.parse(read('package.json')) as { version: string }).version,
    shippedWorkspaces: ['packages/zplc-ide'],
    ...(commit === undefined ? {} : { commit }),
    ...(epoch !== undefined && /^\d+$/.test(epoch) ? { epoch: Number(epoch) } : {}),
  };
}

function main(argv: string[]): number {
  const options = { out: '', verify: '', check: false, updateFloor: false, westImports: [] as string[] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--out') options.out = argv[++index] ?? '';
    else if (flag === '--verify') options.verify = argv[++index] ?? '';
    else if (flag === '--west-import') options.westImports.push(argv[++index] ?? '');
    else if (flag === '--check') options.check = true;
    else if (flag === '--update-floor') options.updateFloor = true;
    else {
      console.error(`sbom: unknown argument ${flag}`);
      return 2;
    }
  }
  if (!options.out && !options.verify && !options.check && !options.updateFloor) {
    console.error('usage: sbom.ts --out <file> | --check | --verify <file> | --update-floor [--west-import <zephyr west.yml>]');
    return 2;
  }
  const root = resolve(dirname(import.meta.path), '..', '..');
  const floorPath = join(root, FLOOR_FILE);
  const floor = (JSON.parse(readFileSync(floorPath, 'utf8')) as { components: number }).components;
  const lock = parseLockfile(readFileSync(join(root, 'bun.lock'), 'utf8'));

  if (options.verify) {
    const document = JSON.parse(readFileSync(options.verify, 'utf8')) as Sbom;
    const problems = checkSbom(document, { lock, floor });
    for (const problem of problems) console.error(`sbom: ${problem}`);
    if (problems.length === 0) console.log(`sbom: ${options.verify} holds ${document.components.length} components (floor ${floor})`);
    return problems.length === 0 ? 0 : 1;
  }

  const sbom = buildSbom(repositoryInput(root, options.westImports));
  const problems = checkSbom(sbom, { lock, floor });
  for (const problem of problems) console.error(`sbom: ${problem}`);
  if (options.updateFloor) {
    if (sbom.components.length < floor) {
      console.error(`sbom: the floor is ${floor} and is never lowered here`);
      return 1;
    }
    writeFileSync(floorPath, `${JSON.stringify({ schema: 1, components: sbom.components.length }, null, 2)}\n`);
    console.log(`sbom: floor is now ${sbom.components.length}`);
  }
  if (options.out) {
    writeFileSync(options.out, `${JSON.stringify(sbom, null, 2)}\n`);
    console.log(`sbom: wrote ${sbom.components.length} components to ${options.out}`);
  }
  if (options.check && problems.length === 0)
    console.log(`sbom: ${sbom.components.length} components, bun.lock lists ${lock.packages.size} entries, floor ${floor}`);
  return problems.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
