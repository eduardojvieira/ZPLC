// The macOS installers are built from a copy of the repository, so the copy must hold every file the host
// runtime's CMake project and the application build read outside their own folders, or the build fails on the release
// runner only.
import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { STAGED_PATHS } from './package-mac-release.mjs';
import { WASM_BUILD_SCRIPT } from './wasmRuntimePlugin';

const CORE = 'firmware/lib/zplc_core';
const ROOT = join(import.meta.dir, '..', '..', '..');
const PACKAGE = 'packages/zplc-ide';
const cmake = readFileSync(new URL(`../../../${CORE}/CMakeLists.txt`, import.meta.url), 'utf8');
const staged = (path: string) => STAGED_PATHS.some((stage) => path === stage || path.startsWith(`${stage}/`));

/** Repository paths that the CMake project names through `${CMAKE_CURRENT_*_DIR}/../`. */
function pathsOutsideCore(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\$\{CMAKE_CURRENT_(?:SOURCE|LIST)_DIR\}\/((?:\.\.\/)+[^\s)"]*)/g)) {
    const path = posix.normalize(posix.join(CORE, match[1]!));
    if (path !== '.' && !path.startsWith('..')) found.add(path);
  }
  return [...found].sort();
}

// Modules only the tests import: the application build never reads them.
const TEST_ONLY = new Set(['src/cli/wasmModuleGuard.ts']);

/** Repository paths that the application's sources import from outside the package, by the module that imports them. */
function importsOutsidePackage(): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (directory: string): void => {
    for (const entry of readdirSync(join(ROOT, PACKAGE, directory), { withFileTypes: true })) {
      const path = posix.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test') walk(path);
        continue;
      }
      if (!/\.(ts|tsx|mts)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name) || TEST_ONLY.has(path)) continue;
      const text = readFileSync(join(ROOT, PACKAGE, path), 'utf8');
      for (const match of text.matchAll(/(?:from |import\()['"]((?:\.\.\/){2,}[^'"]+)['"]/g)) {
        const target = relative(ROOT, join(ROOT, PACKAGE, dirname(path), match[1]!))
          .split(sep)
          .join('/');
        if (!target.startsWith(`${PACKAGE}/`)) found.set(target, path);
      }
    }
  };
  walk('src');
  walk('electron');
  return found;
}

describe('the macOS stage holds what the host runtime build reads', () => {
  it('copies every path outside the core that CMakeLists.txt names', () => {
    const outside = pathsOutsideCore(cmake);
    expect(outside).toContain('firmware/app/src/zplc_modbus_tcp.c');
    expect(outside.filter((path) => !staged(path))).toEqual([]);
  });

  // Release rehearsal 40118359942: the application build stopped on "Cannot find module
  // '../../../../tools/hil/usb-ids.json'" in src/config/serialBoards.ts.
  // Release rehearsal 40125534053: the Vite build stopped on "Module not found .../tools/wasm-core/build.ts", which the
  // WebAssembly runtime plugin runs from the repository root by path, not by import.
  it('copies what the WebAssembly runtime plugin of the Vite build runs from the repository root', () => {
    expect(staged(WASM_BUILD_SCRIPT)).toBe(true);
  });

  it('copies every file that the application imports from outside its package', () => {
    const outside = importsOutsidePackage();
    expect([...outside.keys()]).toContain('tools/hil/usb-ids.json');
    expect([...outside].filter(([path]) => !staged(path)).map(([path, by]) => `${path} (imported by ${by})`)).toEqual([]);
  });
});
