// @ts-nocheck

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PACKAGE_JSON_PATHS = [
  'package.json',
  'packages/zplc-compiler/package.json',
  'packages/zplc-hil/package.json',
  'packages/zplc-ide/package.json',
] as const;

/**
 * The source that carries the version of the compiler package into every debug map (CMP-053). A release
 * bump rewrites it with the manifests, and --check fails when it differs from them.
 */
export const COMPILER_VERSION_SOURCE = 'packages/zplc-compiler/src/compiler/debug-map.ts';
const COMPILER_VERSION_DECLARATION = /(export const COMPILER_VERSION = ')([^']*)(';)/;

const SEMVER_WITH_PRERELEASE = new RegExp(
  String.raw`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|` +
    String.raw`[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$`,
);

export function isValidReleaseVersion(version: string): boolean {
  return SEMVER_WITH_PRERELEASE.test(version);
}

export function isPrereleaseVersion(version: string): boolean {
  return version.includes('-');
}

export function updatePackageJsonVersion(packageJsonContent: string, version: string): string {
  const parsed = JSON.parse(packageJsonContent) as { version?: string } & Record<string, unknown>;
  parsed.version = version;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function updateCompilerVersionSource(sourceContent: string, version: string): string {
  if (!COMPILER_VERSION_DECLARATION.test(sourceContent)) {
    throw new Error(`${COMPILER_VERSION_SOURCE} has no COMPILER_VERSION declaration to update`);
  }
  return sourceContent.replace(COMPILER_VERSION_DECLARATION, `$1${version}$3`);
}

export function findCompilerVersionDrift(canonicalVersion: string, sourceContent: string): string[] {
  const found = COMPILER_VERSION_DECLARATION.exec(sourceContent)?.[2];
  return found === canonicalVersion ? [] : [`${COMPILER_VERSION_SOURCE}: expected ${canonicalVersion}, found ${found ?? 'missing'}`];
}

export function findPackageVersionDrift(canonicalVersion: string, manifests: Record<string, string>): string[] {
  return Object.entries(manifests).flatMap(([relativePath, content]) => {
    const version = (JSON.parse(content) as { version?: unknown }).version;
    return version === canonicalVersion
      ? []
      : [`${relativePath}: expected ${canonicalVersion}, found ${typeof version === 'string' ? version : 'missing'}`];
  });
}

function checkVersions(repoRoot: string): void {
  const rootPath = join(repoRoot, PACKAGE_JSON_PATHS[0]);
  const rootContent = readFileSync(rootPath, 'utf8');
  const rootVersion = (JSON.parse(rootContent) as { version?: unknown }).version;

  if (typeof rootVersion !== 'string' || !isValidReleaseVersion(rootVersion)) {
    throw new Error(`Invalid root package version '${typeof rootVersion === 'string' ? rootVersion : ''}'`);
  }

  const manifests = Object.fromEntries(
    PACKAGE_JSON_PATHS.map((relativePath) => [relativePath, readFileSync(join(repoRoot, relativePath), 'utf8')]),
  );
  const drift = [
    ...findPackageVersionDrift(rootVersion, manifests),
    ...findCompilerVersionDrift(rootVersion, readFileSync(join(repoRoot, COMPILER_VERSION_SOURCE), 'utf8')),
  ];
  if (drift.length > 0) {
    throw new Error(`Product version drift detected:\n${drift.join('\n')}`);
  }

  console.log(
    `Validated canonical product version ${rootVersion} in ${PACKAGE_JSON_PATHS.length} package manifests and the compiler version of ` +
      `the debug map`,
  );
}

function main(): void {
  const argument = process.argv[2];
  const repoRoot = join(import.meta.dir, '..');

  if (argument === '--check') {
    checkVersions(repoRoot);
    return;
  }

  const version = argument;

  if (!version || !isValidReleaseVersion(version)) {
    throw new Error(`Invalid or missing release version '${version ?? ''}'. Expected semver like 1.5.0 or 1.5.1-rc.1`);
  }

  for (const relativePath of PACKAGE_JSON_PATHS) {
    const absolutePath = join(repoRoot, relativePath);
    const updated = updatePackageJsonVersion(readFileSync(absolutePath, 'utf8'), version);
    writeFileSync(absolutePath, updated);
  }

  const sourcePath = join(repoRoot, COMPILER_VERSION_SOURCE);
  writeFileSync(sourcePath, updateCompilerVersionSource(readFileSync(sourcePath, 'utf8'), version));

  console.log(
    `Applied release version ${version} to ${PACKAGE_JSON_PATHS.length} package manifests and the compiler version of the debug map`,
  );
}

if (import.meta.main) {
  main();
}
