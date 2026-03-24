import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE_JSON_PATHS = [
  'package.json',
  'packages/zplc-compiler/package.json',
  'packages/zplc-hil/package.json',
  'packages/zplc-ide/package.json',
] as const;

const SEMVER_WITH_PRERELEASE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

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

function main(): void {
  const version = process.argv[2];

  if (!version || !isValidReleaseVersion(version)) {
    throw new Error(
      `Invalid or missing release version '${version ?? ''}'. Expected semver like 1.5.0 or 1.5.0-preview.1`
    );
  }

  const repoRoot = join(import.meta.dir, '..');

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
