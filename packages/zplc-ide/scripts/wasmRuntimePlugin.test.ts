import { describe, expect, it } from 'bun:test';
import { writeFileSync } from 'node:fs';

import { buildWasmRuntime, isCi, runtimeModuleSource, WASM_RUNTIME_MODULE_ID, type Spawned } from './wasmRuntimePlugin';

// IDE-025: the browser runtime is built with the IDE. A machine without clang and wasm-ld degrades with a reason, and CI,
// where it is built for the release, fails; a build that fails fails everywhere.

const MANIFEST = { file: 'zplc-runtime.wasm', bytes: 3, sha256: 'ab'.repeat(32), commit: 'c'.repeat(40), dirty: false, version: '2.0.0', toolchain: 'clang version 23' };

/** A builder that wrote its two files, as tools/wasm-core/build.ts does with --out and --manifest. */
function wrote(command: string[]): Spawned {
  writeFileSync(command[command.indexOf('--out') + 1]!, new Uint8Array([0, 0x61, 0x73]));
  writeFileSync(command[command.indexOf('--manifest') + 1]!, JSON.stringify(MANIFEST));
  return { status: 0, stdout: '', stderr: '' };
}

const missing: Spawned = { status: 3, stdout: '', stderr: 'wasm-core: cannot build the WebAssembly runtime: clang and wasm-ld (the lld package) not found on the PATH\n' };

describe('the build of the browser runtime inside the IDE build (IDE-025)', () => {
  it('embeds the module and its manifest when the tools are there', () => {
    const built = buildWasmRuntime({ root: '/repo', ci: true, spawn: wrote });
    expect(built.manifest).toEqual(MANIFEST);
    expect(Buffer.from(built.bytesBase64!, 'base64')).toEqual(Buffer.from([0, 0x61, 0x73]));
    expect(built.unavailableReason).toBeNull();
  });

  it('runs the builder of tools/wasm-core with an output and a manifest in a temporary folder', () => {
    let seen: string[] = [];
    buildWasmRuntime({ root: '/repo', ci: false, spawn: (command) => { seen = command; return wrote(command); } });
    expect(seen[1]).toBe('/repo/tools/wasm-core/build.ts');
    expect(seen[seen.indexOf('--out') + 1]).toMatch(/zplc-ide-wasm-.*\/zplc-runtime\.wasm$/);
    expect(seen[seen.indexOf('--manifest') + 1]).toMatch(/zplc-runtime\.json$/);
  });

  it('degrades with the reason where clang and wasm-ld are missing and CI is not set', () => {
    const built = buildWasmRuntime({ root: '/repo', ci: false, spawn: () => missing });
    expect(built.manifest).toBeNull();
    expect(built.bytesBase64).toBeNull();
    expect(built.unavailableReason).toContain('clang and wasm-ld');
    expect(built.unavailableReason).toContain('native simulation is unaffected');
  });

  it('fails the build, naming the tools, where they are missing and CI is set', () => {
    expect(() => buildWasmRuntime({ root: '/repo', ci: true, spawn: () => missing })).toThrow(/clang and wasm-ld.*CI is set/s);
  });

  it('fails the build whenever the builder itself fails, CI or not', () => {
    const broken: Spawned = { status: 1, stdout: '', stderr: 'error: use of undeclared identifier' };
    for (const ci of [false, true]) {
      expect(() => buildWasmRuntime({ root: '/repo', ci, spawn: () => broken })).toThrow('use of undeclared identifier');
    }
  });

  it('reads CI the way the rest of the repository does', () => {
    expect(isCi({ CI: 'true' })).toBe(true);
    expect(isCi({ CI: '1' })).toBe(true);
    expect(isCi({ CI: '' })).toBe(false);
    expect(isCi({ CI: '0' })).toBe(false);
    expect(isCi({ CI: 'false' })).toBe(false);
    expect(isCi({})).toBe(false);
  });

  it('writes a virtual module that exports the manifest, the bytes and the reason', () => {
    expect(WASM_RUNTIME_MODULE_ID).toBe('virtual:zplc-wasm-runtime');
    const source = runtimeModuleSource({ manifest: MANIFEST, bytesBase64: 'AGFz', unavailableReason: null });
    expect(source).toContain('export const bytesBase64 = "AGFz";');
    expect(source).toContain('export const unavailableReason = null;');
    expect(source).toContain(`"sha256":"${MANIFEST.sha256}"`);
  });
});
