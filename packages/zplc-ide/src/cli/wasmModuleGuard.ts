import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'bun:test';

import { buildCoreWasm, toolchain, type ModuleManifest } from '../../../../tools/wasm-core/build';

// The WebAssembly runtime that the tests drive, built once per test process by tools/wasm-core from this tree. Without
// clang and wasm-ld the tests that need it are skipped on a developer machine, with the reason said once, and fail in CI,
// as the tests that need the native runtime do (VF-023).
const tools = toolchain();
export const wasmToolchainAvailable = !('missing' in tools);
const inCi = !['', '0', 'false'].includes(process.env.CI ?? '');
const missing = 'missing' in tools ? tools.missing.join(' and ') : '';

if (!wasmToolchainAvailable && !inCi) {
  console.warn(`the WebAssembly runtime is not built: ${missing} not found. The tests that need it are skipped here and fail in CI; install clang and lld.`);
}

export interface BuiltWasmModule { bytes: Uint8Array; manifest: ModuleManifest }

let built: BuiltWasmModule | undefined;

/** The module of this tree. The first call builds it (about ten seconds); the rest of the process reuses it. */
export function builtWasmModule(): BuiltWasmModule {
  if (built === undefined) {
    const directory = mkdtempSync(join(tmpdir(), 'zplc-wasm-runtime-'));
    try {
      const file = join(directory, 'zplc-runtime.wasm');
      const manifest = buildCoreWasm(file);
      built = { bytes: new Uint8Array(readFileSync(file)), manifest };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  return built;
}

export const itWasm = (wasmToolchainAvailable || !inCi
  ? it.skipIf(!wasmToolchainAvailable)
  : (name: string) => it(name, () => {
    throw new Error(`cannot build the WebAssembly runtime: ${missing} not found on the PATH (CI is set); install clang and lld`);
  })) as ReturnType<typeof it.skipIf>;
