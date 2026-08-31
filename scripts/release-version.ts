// @ts-nocheck

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PACKAGE_JSON_PATHS = [
  'package.json',
  'packages/zplc-compiler/package.json',
  'packages/zplc-hil/package.json',
  'packages/zplc-ide/package.json',
] as const;

const SEMVER_WITH_PRERELEASE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/;

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

export function findPackageVersionDrift(
  canonicalVersion: string,
  manifests: Record<string, string>,
): string[] {
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
  const drift = findPackageVersionDrift(rootVersion, manifests);
  if (drift.length > 0) {
    throw new Error(`Product version drift detected:\n${drift.join('\n')}`);
  }

  console.log(`Validated canonical product version ${rootVersion} in ${PACKAGE_JSON_PATHS.length} package manifests`);
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
    throw new Error(
      `Invalid or missing release version '${version ?? ''}'. Expected semver like 1.5.0 or 1.5.1-rc.1`
    );
  }

  for (const relativePath of PACKAGE_JSON_PATHS) {
    const absolutePath = join(repoRoot, relativePath);
    const updated = updatePackageJsonVersion(readFileSync(absolutePath, 'utf8'), version);
    writeFileSync(absolutePath, updated);
  }

  console.log(`Applied release version ${version} to ${PACKAGE_JSON_PATHS.length} package manifests`);
}

if (import.meta.main) {
  main();
}
