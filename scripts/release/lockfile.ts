// The packages of bun.lock and the dependency graph between them (REL-018, REL-019).
//
// The lockfile is the one record of what the repository builds from, so the bill of materials and the licence
// notices both start here instead of walking node_modules: a package that is not installed on the machine that
// generates them still shows up, and one that is installed but not locked does not.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LockPackage {
  /** The key of bun.lock: the package name, behind the names of the packages it is nested under. */
  key: string;
  /** `key` split into package names (a scoped name is one element). */
  chain: string[];
  id: string;
  name: string;
  /** The registry version, or `workspace:<path>` for a package of this repository. */
  version: string;
  /** Path of a workspace package, relative to the repository root. */
  workspacePath?: string;
  /** `sha512-<base64>` as bun records it; absent for workspace packages. */
  integrity?: string;
  dependencies: string[];
  optionalDependencies: string[];
  peerDependencies: string[];
  /** The `os` and `cpu` fields of the package's manifest, as bun records them; absent when it runs anywhere. */
  os?: string[];
  cpu?: string[];
}

export interface LockWorkspace {
  name: string;
  version?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface Lockfile {
  workspaces: Map<string, LockWorkspace>;
  packages: Map<string, LockPackage>;
}

/** bun.lock is JSON with trailing commas; remove the ones before `]` and `}` and leave strings alone. */
export function stripTrailingCommas(text: string): string {
  const out: string[] = [];
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (inString) {
      out.push(char);
      if (char === '\\') out.push(text[++index] ?? '');
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === ',') {
      let next = index + 1;
      while (next < text.length && /\s/.test(text[next]!)) next += 1;
      if (text[next] === ']' || text[next] === '}') continue;
    }
    out.push(char);
  }
  return out.join('');
}

/** `a/b/@s/c` is the chain [`a`, `b`, `@s/c`]. */
export function keyChain(key: string): string[] {
  const parts = key.split('/');
  const chain: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!;
    if (part.startsWith('@') && index + 1 < parts.length) chain.push(`${part}/${parts[++index]}`);
    else chain.push(part);
  }
  return chain;
}

/** `name@version`, `@scope/name@version` or `name@workspace:path`. */
export function splitId(id: string): { name: string; version: string } {
  const at = id.lastIndexOf('@');
  if (at <= 0) throw new Error(`bun.lock: package id "${id}" has no version`);
  return { name: id.slice(0, at), version: id.slice(at + 1) };
}

const WORKSPACE_PREFIX = 'workspace:';

export function parseLockfile(text: string): Lockfile {
  const raw = JSON.parse(stripTrailingCommas(text)) as {
    workspaces?: Record<
      string,
      { name?: string; version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    >;
    packages?: Record<string, unknown[]>;
  };
  if (!raw.packages || !raw.workspaces) throw new Error('bun.lock: no "packages" or "workspaces" section');
  const workspaces = new Map<string, LockWorkspace>();
  for (const [path, entry] of Object.entries(raw.workspaces)) {
    workspaces.set(path, {
      name: entry.name ?? '',
      ...(entry.version === undefined ? {} : { version: entry.version }),
      dependencies: entry.dependencies ?? {},
      devDependencies: entry.devDependencies ?? {},
    });
  }
  const packages = new Map<string, LockPackage>();
  for (const [key, tuple] of Object.entries(raw.packages)) {
    const id = tuple[0];
    if (typeof id !== 'string') throw new Error(`bun.lock: package "${key}" has no id`);
    const { name, version } = splitId(id);
    const meta = (tuple[2] && typeof tuple[2] === 'object' ? tuple[2] : {}) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalPeers?: string[];
      os?: string | string[];
      cpu?: string | string[];
    };
    const optionalPeers = new Set(meta.optionalPeers ?? []);
    const workspacePath = version.startsWith(WORKSPACE_PREFIX) ? version.slice(WORKSPACE_PREFIX.length) : undefined;
    const integrity = typeof tuple[3] === 'string' ? tuple[3] : undefined;
    packages.set(key, {
      key,
      chain: keyChain(key),
      id,
      name,
      version,
      ...(workspacePath === undefined ? {} : { workspacePath }),
      ...(integrity === undefined ? {} : { integrity }),
      ...(meta.os === undefined ? {} : { os: [meta.os].flat() }),
      ...(meta.cpu === undefined ? {} : { cpu: [meta.cpu].flat() }),
      dependencies: Object.keys(meta.dependencies ?? {}),
      optionalDependencies: Object.keys(meta.optionalDependencies ?? {}),
      peerDependencies: Object.keys(meta.peerDependencies ?? {}).filter((peer) => !optionalPeers.has(peer)),
    });
  }
  return { workspaces, packages };
}

/** The package that `name` means to the package at `chain`: the nearest enclosing nesting that has it, then the top level. */
export function resolveDependency(lock: Lockfile, chain: readonly string[], name: string): LockPackage | undefined {
  for (let depth = chain.length; depth >= 0; depth -= 1) {
    const found = lock.packages.get([...chain.slice(0, depth), name].join('/'));
    if (found) return found;
  }
  return undefined;
}

export interface ClosureOptions {
  /** Add the `devDependencies` of the workspace package itself. */
  includeDev?: boolean;
}

/**
 * Every package that `names` need at run time when resolved from `chain`: theirs, and the workspace packages among
 * them. Optional and (non-optional) peer dependencies count; a name the lockfile cannot resolve is reported.
 */
export function closureFrom(
  lock: Lockfile,
  chain: readonly string[],
  names: readonly string[],
): { packages: LockPackage[]; unresolved: string[] } {
  const seen = new Map<string, LockPackage>();
  const unresolved = new Set<string>();
  const queue: Array<{ chain: readonly string[]; names: readonly string[] }> = [{ chain, names }];
  while (queue.length > 0) {
    const next = queue.pop()!;
    for (const name of next.names) {
      const found = resolveDependency(lock, next.chain, name);
      if (!found) {
        unresolved.add(`${next.chain.join('/')} -> ${name}`);
        continue;
      }
      if (seen.has(found.key)) continue;
      seen.set(found.key, found);
      if (found.workspacePath !== undefined) {
        const workspace = lock.workspaces.get(found.workspacePath);
        queue.push({ chain: [found.name], names: Object.keys(workspace?.dependencies ?? {}) });
      } else {
        queue.push({ chain: found.chain, names: [...found.dependencies, ...found.optionalDependencies, ...found.peerDependencies] });
      }
    }
  }
  return { packages: [...seen.values()].sort((a, b) => a.key.localeCompare(b.key)), unresolved: [...unresolved].sort() };
}

/** Everything a workspace package needs at run time: its dependencies and theirs. */
export function productionClosure(
  lock: Lockfile,
  workspacePath: string,
  options: ClosureOptions = {},
): { packages: LockPackage[]; unresolved: string[] } {
  const root = lock.workspaces.get(workspacePath);
  if (!root) throw new Error(`bun.lock has no workspace "${workspacePath}"`);
  return closureFrom(
    lock,
    [root.name],
    [...Object.keys(root.dependencies), ...(options.includeDev ? Object.keys(root.devDependencies) : [])],
  );
}

const storeListings = new Map<string, string[]>();

/** The `node_modules/.bun` folders of bun's isolated layout: `name@version`, with `/` as `+` and a `+hash` for peer variants. */
function storeFolders(repoRoot: string): string[] {
  let listing = storeListings.get(repoRoot);
  if (listing === undefined) {
    const store = join(repoRoot, 'node_modules', '.bun');
    listing = existsSync(store) ? readdirSync(store) : [];
    storeListings.set(repoRoot, listing);
  }
  return listing;
}

/**
 * Where an installed package lives. The lockfile key says what the package is nested under, not where the installer
 * put it: bun's isolated layout keeps every package in `node_modules/.bun/<name>@<version>`, the hoisted one may put
 * a nested package in the workspace's own node_modules. Each place it can be is tried, and the package.json found
 * must name the package and carry the locked version.
 */
export function locateInstalled(repoRoot: string, lock: Lockfile, entry: LockPackage): string | undefined {
  const bases = [repoRoot, ...[...lock.workspaces.keys()].filter((path) => path !== '').map((path) => join(repoRoot, path))];
  const nested = entry.chain.join('/node_modules/');
  const candidates: string[] = [];
  const owner = [...lock.workspaces.entries()].find(([, workspace]) => workspace.name === entry.chain[0]);
  if (owner && entry.chain.length > 1)
    candidates.push(join(repoRoot, owner[0], 'node_modules', entry.chain.slice(1).join('/node_modules/')));
  for (const base of bases) candidates.push(join(base, 'node_modules', nested));
  for (const base of bases) candidates.push(join(base, 'node_modules', entry.name));
  const prefix = `${entry.name.replace('/', '+')}@${entry.version}`;
  for (const folder of storeFolders(repoRoot)) {
    if (folder === prefix || folder.startsWith(`${prefix}+`))
      candidates.push(join(repoRoot, 'node_modules', '.bun', folder, 'node_modules', entry.name));
  }
  for (const directory of candidates) {
    const manifest = join(directory, 'package.json');
    if (!existsSync(manifest)) continue;
    try {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string; version?: string };
      if (parsed.name === entry.name && parsed.version === entry.version) return directory;
    } catch {
      /* an unreadable manifest is not this package */
    }
  }
  return undefined;
}

/**
 * Whether the package installs on this system: npm's `os` and `cpu` lists, where a name allows that value and `!name`
 * refuses it. bun skips a package whose lists leave the system out, so it is never on disk there.
 */
export function installsOn(entry: LockPackage, platform: { os: string; cpu: string }): boolean {
  const allows = (list: string[] | undefined, value: string): boolean => {
    if (list === undefined || list.includes(`!${value}`)) return list === undefined;
    const allowed = list.filter((item) => !item.startsWith('!'));
    return allowed.length === 0 || allowed.includes(value);
  };
  return allows(entry.os, platform.os) && allows(entry.cpu, platform.cpu);
}

/** `sha512-<base64>` as a hex digest, or undefined for another scheme. */
export function integrityHex(integrity: string | undefined): { alg: 'SHA-512' | 'SHA-256' | 'SHA-1'; content: string } | undefined {
  const match = /^(sha512|sha256|sha1)-([A-Za-z0-9+/]+={0,2})$/.exec(integrity ?? '');
  if (!match) return undefined;
  const alg = match[1] === 'sha512' ? 'SHA-512' : match[1] === 'sha256' ? 'SHA-256' : 'SHA-1';
  return { alg, content: Buffer.from(match[2]!, 'base64').toString('hex') };
}
