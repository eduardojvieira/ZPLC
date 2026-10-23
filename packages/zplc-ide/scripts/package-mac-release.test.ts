// The macOS installers are built from a copy of the repository, so the copy must hold every file the host
// runtime's CMake project reads outside its own folder, or the configure step fails on the release runner only.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { STAGED_PATHS } from './package-mac-release.mjs';

const CORE = 'firmware/lib/zplc_core';
const cmake = readFileSync(new URL(`../../../${CORE}/CMakeLists.txt`, import.meta.url), 'utf8');

/** Repository paths that the CMake project names through `${CMAKE_CURRENT_*_DIR}/../`. */
function pathsOutsideCore(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\$\{CMAKE_CURRENT_(?:SOURCE|LIST)_DIR\}\/((?:\.\.\/)+[^\s)"]*)/g)) {
    const path = posix.normalize(posix.join(CORE, match[1]!));
    if (path !== '.' && !path.startsWith('..')) found.add(path);
  }
  return [...found].sort();
}

describe('the macOS stage holds what the host runtime build reads', () => {
  it('copies every path outside the core that CMakeLists.txt names', () => {
    const outside = pathsOutsideCore(cmake);
    expect(outside).toContain('firmware/app/src/zplc_modbus_tcp.c');
    const missing = outside.filter((path) => !STAGED_PATHS.some((staged) => path === staged || path.startsWith(`${staged}/`)));
    expect(missing).toEqual([]);
  });
});
