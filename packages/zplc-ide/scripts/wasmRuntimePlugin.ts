// The browser runtime of the IDE, built with the IDE (IDE-025).
//
// `virtual:zplc-wasm-runtime` is a module of the Vite build whose source is the WebAssembly runtime that tools/wasm-core
// builds from this tree, with its manifest (file, bytes, sha256, commit, product version, toolchain) next to it. The module
// is embedded as base64 in a chunk the page loads only when a simulation falls back to it, so that the Electron build,
// which loads its page from file://, needs no fetch of a file and no new IPC (constitution rule 6). The same manifest
// is written to dist/wasm-runtime.json, which is where a release looks for what it shipped.
//
//   clang and wasm-ld found         the runtime is built and embedded
//   one of them missing, CI unset   the module exports `unavailableReason`: the simulation says why it has no runtime
//   one of them missing, CI set     the build fails, with the tools named
//   the build itself fails          the build fails
//
// Nothing the build writes is a source file: the module lives in the bundle and in a temporary folder.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Plugin } from 'vite';

export const WASM_RUNTIME_MODULE_ID = 'virtual:zplc-wasm-runtime';

/** The exit code of tools/wasm-core/build.ts for "a tool is missing" (EXIT_TOOLCHAIN_MISSING there). */
const EXIT_TOOLCHAIN_MISSING = 3;

export interface WasmRuntimeManifest {
  file: string;
  bytes: number;
  sha256: string;
  commit: string;
  dirty: boolean;
  version: string;
  toolchain: string;
}

export interface WasmRuntimeBuild {
  manifest: WasmRuntimeManifest | null;
  bytesBase64: string | null;
  /** Why there is no module: set exactly when `manifest` is null. */
  unavailableReason: string | null;
}

export interface Spawned {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface WasmRuntimeBuildOptions {
  /** The repository root, where tools/wasm-core lives. */
  root: string;
  /** True where CI is set: a missing tool is then an error. */
  ci: boolean;
  /** Runs a command; a test replaces it. */
  spawn?: (command: string[]) => Spawned;
}

function defaultSpawn(command: string[]): Spawned {
  const done = spawnSync(command[0]!, command.slice(1), { encoding: 'utf8' });
  return { status: done.status, stdout: done.stdout ?? '', stderr: done.stderr ?? done.error?.message ?? '' };
}

export function isCi(environment: NodeJS.ProcessEnv = process.env): boolean {
  return !['', '0', 'false'].includes(environment.CI ?? '');
}

/** Builds the module, or says why it cannot be built here. Throws on a failed build, and on a missing tool where CI is set. */
export function buildWasmRuntime(options: WasmRuntimeBuildOptions): WasmRuntimeBuild {
  const spawn = options.spawn ?? defaultSpawn;
  const bun = process.versions.bun ? process.execPath : 'bun';
  const work = mkdtempSync(path.join(tmpdir(), 'zplc-ide-wasm-'));
  try {
    const out = path.join(work, 'zplc-runtime.wasm');
    const manifestFile = path.join(work, 'zplc-runtime.json');
    const done = spawn([bun, path.join(options.root, 'tools/wasm-core/build.ts'), '--out', out, '--manifest', manifestFile]);
    if (done.status === EXIT_TOOLCHAIN_MISSING) {
      const reason = done.stderr.trim().replace(/^wasm-core: /, '') || 'a tool of the WebAssembly build is missing';
      if (options.ci) throw new Error(`${reason} (CI is set: the WebAssembly runtime of ZPLC is built in CI; install clang and lld)`);
      return {
        manifest: null,
        bytesBase64: null,
        unavailableReason:
          `${reason}. This build has no browser runtime: native simulation is unaffected, and the web build of ZPLC ` + `cannot simulate.`,
      };
    }
    if (done.status !== 0) throw new Error(`the WebAssembly runtime did not build:\n${done.stdout}${done.stderr}`);
    return {
      manifest: JSON.parse(readFileSync(manifestFile, 'utf8')) as WasmRuntimeManifest,
      bytesBase64: readFileSync(out).toString('base64'),
      unavailableReason: null,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** The source of the virtual module. */
export function runtimeModuleSource(built: WasmRuntimeBuild): string {
  return [
    `export const manifest = ${JSON.stringify(built.manifest)};`,
    `export const bytesBase64 = ${JSON.stringify(built.bytesBase64)};`,
    `export const unavailableReason = ${JSON.stringify(built.unavailableReason)};`,
    '',
  ].join('\n');
}

export function wasmRuntimePlugin(root: string): Plugin {
  const resolved = `\0${WASM_RUNTIME_MODULE_ID}`;
  let built: WasmRuntimeBuild | undefined;
  const build = (): WasmRuntimeBuild => {
    built ??= buildWasmRuntime({ root, ci: isCi() });
    return built;
  };
  return {
    name: 'zplc-wasm-runtime',
    resolveId(source) {
      return source === WASM_RUNTIME_MODULE_ID ? resolved : null;
    },
    load(id) {
      return id === resolved ? runtimeModuleSource(build()) : null;
    },
    generateBundle() {
      // only a build that loaded the module has anything to record
      if (built?.manifest) {
        this.emitFile({ type: 'asset', fileName: 'wasm-runtime.json', source: `${JSON.stringify(built.manifest, null, 2)}\n` });
      }
    },
  };
}
