// The runtime of the browser simulation: the session of the native runtime, the scheduler core, the retain rules and
// the core with the loader's verifier, as one WebAssembly module built with clang and wasm-ld and no C library
// (IDE-025, VF-005).
//
//   bun tools/wasm-core/build.ts --out <file.wasm> [--manifest <file.json>]
//
// It is the same source files as the native runtime and the firmware: firmware/lib/zplc_core/src/core (the VM, the loader
// with its verifier, the communication dispatcher, the scheduler core, the retain module and the program store), the
// session of firmware/apps/posix_host, and the WebAssembly port of the HAL (src/hal/wasm). What the module is not: it is
// not an Emscripten build, it has no C library of its own (tools/wasm-core/shim is the part the sources call), and its
// only imports are the five of the module "zplc_host" that the HAL port lists.
//
// A machine without clang and wasm-ld cannot build it, and the command says so with exit code 3, which is not a failure of
// the build itself (exit code 1): the Vite plugin of the IDE (packages/zplc-ide/vite.config.ts) turns 3 into an explicit
// "the browser runtime is not built here" on a developer machine, and into a failed build where CI is set.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const here = import.meta.dir;
const root = resolve(here, '../..');
const core = join(root, 'firmware/lib/zplc_core');
const session = join(root, 'firmware/apps/posix_host/src');

/** The sources of the module, by directory. The embedder and the libc shim come last. */
const SOURCES = [
  ...['zplc_core', 'zplc_loader', 'zplc_comm_dispatch', 'zplc_retain', 'zplc_program_store', 'zplc_sched_core', 'zplc_exchange', 'zplc_failsafe', 'zplc_io_trace'].map((name) => join(core, `src/core/${name}.c`)),
  join(core, 'src/hal/wasm/zplc_hal_wasm.c'),
  join(session, 'native_runtime_session.c'),
  join(session, 'native_program_store.c'),
  join(here, 'shim/embed.c'),
  join(here, 'shim/libc.c'),
];

/** The linear memory of the module, which does not grow: the stack, the session and its buffers, and the allocator. */
const STACK_BYTES = 1024 * 1024;
const MEMORY_BYTES = 4 * 1024 * 1024;

export interface Toolchain { clang: string; linker: string }

export interface ModuleManifest {
  /** The file name of the module, as the IDE ships it. */
  file: string;
  bytes: number;
  sha256: string;
  /** The commit the module was built from (40 hex digits), or "unknown" for a tree with no git. */
  commit: string;
  /** True when tracked files differed from that commit at build time. */
  dirty: boolean;
  /** The ZPLC product version of package.json. */
  version: string;
  /** The first line of `clang --version`. */
  toolchain: string;
}

/** The tools that the build needs, or what is missing. */
export function toolchain(): Toolchain | { missing: string[] } {
  // an unversioned name first; distributions that install only the versioned tools are found by their version
  const first = (names: string[]) => names.map((name) => Bun.which(name)).find((found) => found !== null) ?? null;
  const versions = [23, 22, 21, 20, 19, 18, 17, 16, 15, 14];
  const clang = first(['clang', ...versions.map((version) => `clang-${version}`)]);
  const linker = first(['wasm-ld', ...versions.map((version) => `wasm-ld-${version}`)]);
  const missing = [clang === null ? 'clang' : '', linker === null ? 'wasm-ld (the lld package)' : ''].filter(Boolean);
  return missing.length > 0 ? { missing } : { clang: clang!, linker: linker! };
}

function run(command: string[]): string {
  const done = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'pipe' });
  if (done.exitCode !== 0) throw new Error(`${command.slice(0, 3).join(' ')} failed:\n${done.stdout.toString()}${done.stderr.toString()}`);
  return done.stdout.toString();
}

function git(...args: string[]): string | null {
  const done = Bun.spawnSync(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe' });
  return done.exitCode === 0 ? done.stdout.toString().trim() : null;
}

/** The commit and the dirty flag of the tree, as the firmware identity of a CMake build reads them (REL-023). */
export function treeIdentity(): { commit: string; dirty: boolean } {
  const forced = process.env.ZPLC_BUILD_COMMIT;
  const head = forced !== undefined && forced !== '' ? forced : git('rev-parse', 'HEAD');
  const commit = head !== null && /^[0-9a-f]{40}$/.test(head) ? head : 'unknown';
  const changes = git('status', '--porcelain', '--untracked-files=no');
  const dirtyFlag = process.env.ZPLC_BUILD_DIRTY;
  const dirty = dirtyFlag !== undefined && dirtyFlag !== '' ? dirtyFlag !== '0' : commit !== 'unknown' && (changes === null || changes !== '');
  return { commit, dirty };
}

export function productVersion(): string {
  return (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;
}

/** The generated header of the firmware identity, from the same template that the CMake build fills (REL-023). */
export function identityHeader(commit: string, dirty: boolean, version: string): string {
  const options = 'build_type=wasm-freestanding';
  const optionsHash = createHash('sha256').update(options).digest('hex').slice(0, 8);
  const values: Record<string, string> = {
    ZPLC_FW_VERSION: version,
    ZPLC_FW_COMMIT: commit,
    ZPLC_FW_DIRTY: dirty ? '1' : '0',
    ZPLC_FW_BOARD: 'wasm',
    ZPLC_FW_OPTIONS: options,
    ZPLC_FW_OPTIONS_HASH: optionsHash,
  };
  const template = readFileSync(join(root, 'scripts/release/zplc_fw_identity.h.in'), 'utf8');
  return template.replace(/@([A-Z_]+)@/g, (_all, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`the firmware identity template names ${name}, which the WebAssembly build does not know`);
    return value;
  });
}

/** Builds the module at `out`, and returns what it is; throws when a tool is missing or a step fails. */
export function buildCoreWasm(out: string): ModuleManifest {
  const tools = toolchain();
  if ('missing' in tools) throw new Error(`cannot build the WebAssembly runtime: ${tools.missing.join(' and ')} not found on the PATH`);
  const { commit, dirty } = treeIdentity();
  const version = productVersion();
  const work = mkdtempSync(join(tmpdir(), 'zplc-wasm-core-'));
  try {
    const generated = join(work, 'include');
    mkdirSync(generated, { recursive: true });
    writeFileSync(join(generated, 'zplc_fw_identity.h'), identityHeader(commit, dirty, version));
    const objects = SOURCES.map((source, index) => {
      const object = join(work, `${index}.o`);
      run([
        tools.clang, '--target=wasm32', '-ffreestanding', '-fno-builtin', '-O2', '-std=c99', '-Wall',
        `-DZPLC_CORE_VERSION_STR="${version}"`,
        '-I', join(core, 'include'), '-I', join(here, 'shim'), '-I', generated, '-I', session,
        '-c', source, '-o', object,
      ]);
      return object;
    });
    mkdirSync(dirname(resolve(out)), { recursive: true });
    run([
      tools.linker, '--no-entry', '--export-all', '-z', `stack-size=${STACK_BYTES}`,
      `--initial-memory=${MEMORY_BYTES}`, `--max-memory=${MEMORY_BYTES}`, '-o', resolve(out), ...objects,
    ]);
    const bytes = readFileSync(resolve(out));
    return {
      file: basename(out),
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      commit,
      dirty,
      version,
      toolchain: run([tools.clang, '--version']).split('\n')[0]!.trim(),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** The exit code that says "a tool is missing", told apart from a build that failed. */
export const EXIT_TOOLCHAIN_MISSING = 3;

if (import.meta.main) {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { out: { type: 'string' }, manifest: { type: 'string' } } });
  if (!values.out) {
    console.error('usage: bun tools/wasm-core/build.ts --out <file.wasm> [--manifest <file.json>]');
    process.exit(2);
  }
  const tools = toolchain();
  if ('missing' in tools) {
    console.error(`wasm-core: cannot build the WebAssembly runtime: ${tools.missing.join(' and ')} not found on the PATH`);
    process.exit(EXIT_TOOLCHAIN_MISSING);
  }
  const manifest = buildCoreWasm(values.out);
  if (values.manifest) {
    mkdirSync(dirname(resolve(values.manifest)), { recursive: true });
    writeFileSync(resolve(values.manifest), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`wasm-core: wrote ${values.out} (${manifest.bytes} bytes, sha256 ${manifest.sha256.slice(0, 12)}, commit ${manifest.commit.slice(0, 12)}${manifest.dirty ? ' dirty' : ''})`);
}
