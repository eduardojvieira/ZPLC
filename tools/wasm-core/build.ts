// The core of the runtime as a WebAssembly module, built with clang and wasm-ld and no C library (IDE-025, VF-005).
//
//   bun tools/wasm-core/build.ts --out <file.wasm>
//
// It is the same source files as the native runtime and the firmware (firmware/lib/zplc_core/src/core): the VM, the
// loader with its verifier and the communication dispatcher, with the loader's verifier on the only path that loads a
// program (zplc_core_load). The module has no import: the clock is set by the embedder (zplc_shim_set_time), and the
// buffers for the artifact and the verifier are inside it. It is not the Emscripten module of the browser simulation
// (CMakeLists.txt, WASM_BUILD): it proves the core in WebAssembly, which that module is built from, without the SDK.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const here = import.meta.dir;
const root = resolve(here, '../..');
const core = join(root, 'firmware/lib/zplc_core');

const SOURCES = ['src/core/zplc_core.c', 'src/core/zplc_loader.c', 'src/core/zplc_comm_dispatch.c'].map((file) => join(core, file));
const SHIM = ['libc.c', 'hal.c'].map((file) => join(here, 'shim', file));

export interface Toolchain { clang: string; linker: string }

/** The tools that the build needs, or what is missing. */
export function toolchain(): Toolchain | { missing: string[] } {
  // an unversioned name first; distributions that install only the versioned tools are found by their version
  const first = (names: string[]) => names.map((name) => Bun.which(name)).find((found) => found !== null) ?? null;
  const versions = [20, 19, 18, 17, 16, 15, 14];
  const clang = first(['clang', ...versions.map((version) => `clang-${version}`)]);
  const linker = first(['wasm-ld', ...versions.map((version) => `wasm-ld-${version}`)]);
  const missing = [clang === null ? 'clang' : '', linker === null ? 'wasm-ld (the lld package)' : ''].filter(Boolean);
  return missing.length > 0 ? { missing } : { clang: clang!, linker: linker! };
}

function run(command: string[]): void {
  const done = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'pipe' });
  if (done.exitCode !== 0) throw new Error(`${command.slice(0, 3).join(' ')} failed:\n${done.stdout.toString()}${done.stderr.toString()}`);
}

/** Builds the module at `out`; throws when a tool is missing or a step fails. */
export function buildCoreWasm(out: string): void {
  const tools = toolchain();
  if ('missing' in tools) throw new Error(`cannot build the WebAssembly core: ${tools.missing.join(' and ')} not found on the PATH`);
  const work = mkdtempSync(join(tmpdir(), 'zplc-wasm-core-'));
  try {
    const objects = [...SOURCES, ...SHIM].map((source, index) => {
      const object = join(work, `${index}.o`);
      run([tools.clang, '--target=wasm32', '-ffreestanding', '-fno-builtin', '-O2', '-std=c99', '-Wall', '-I', join(core, 'include'), '-I', join(here, 'shim'), '-c', source, '-o', object]);
      return object;
    });
    mkdirSync(dirname(resolve(out)), { recursive: true });
    run([tools.linker, '--no-entry', '--export-all', '-z', 'stack-size=65536', '--initial-memory=2097152', '-o', resolve(out), ...objects]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { out: { type: 'string' } } });
  if (!values.out) {
    console.error('usage: bun tools/wasm-core/build.ts --out <file.wasm>');
    process.exit(2);
  }
  buildCoreWasm(values.out);
  console.log(`wasm-core: wrote ${values.out}`);
}
