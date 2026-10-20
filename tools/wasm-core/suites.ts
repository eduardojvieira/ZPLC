// The port conformance suite on WebAssembly (IO-013): the C test suites of firmware/lib/zplc_core/tests, the same files
// that ctest runs on the POSIX port and Twister runs on Zephyr, each built as a WebAssembly module with the HAL port of
// the runtime (src/hal/wasm) in place of the POSIX one, and run with the host imports that the IDE gives the runtime.
//
//   bun tools/wasm-core/suites.ts [--only <suite>]   build and run every suite; exit 1 when one fails, 3 without clang
//
// A suite is built the way the module of tools/wasm-core/build.ts is (clang --target=wasm32, wasm-ld, no C library,
// the shim of tools/wasm-core/shim) plus shim/suite_libc.c for the printf of the checks. Its main() is renamed and
// exported, as firmware/tests/core_suites renames it for Zephyr, and it reads no file (ZPLC_TEST_NO_FILE_IO, the
// loader fixture compiled in). The sources of each suite are the ones of its CMake target, with the WebAssembly HAL
// port where that target links the POSIX one.
import { cpus, tmpdir } from 'node:os';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { EXIT_TOOLCHAIN_MISSING, identityHeader, productVersion, toolchain, treeIdentity, type Toolchain } from './build';

const here = import.meta.dir;
const root = resolve(here, '../..');
const core = join(root, 'firmware/lib/zplc_core');
const session = join(root, 'firmware/apps/posix_host/src');
const tests = join(core, 'tests');

const src = (name: string) => join(core, `src/core/${name}.c`);
const HAL = join(core, 'src/hal/wasm/zplc_hal_wasm.c');
const VM = [src('zplc_core'), src('zplc_loader'), src('zplc_comm_dispatch')];
const TESTING = ['ZPLC_CORE_TESTING'];

export type Category = 'opcodes' | 'loader' | 'scheduler' | 'timing' | 'io-table' | 'storage';

export interface Suite {
  /** The name of the CMake target and of its ctest test. */
  name: string;
  category: Category;
  /** The suite's file under firmware/lib/zplc_core/tests. */
  file: string;
  /** What it links besides the suite: the sources of its CMake target, the WebAssembly HAL for the POSIX one. */
  sources: string[];
  /** The definitions of its CMake target that change the code, besides those every suite gets. */
  defines?: string[];
}

export const SUITES: Suite[] = [
  { name: 'test_isa', category: 'opcodes', file: 'test_isa.c', sources: [] },
  { name: 'test_vm_core', category: 'opcodes', file: 'test_vm_core.c', sources: [...VM, HAL], defines: TESTING },
  { name: 'test_vm_arith_edges', category: 'opcodes', file: 'test_vm_arith_edges.c', sources: [...VM, HAL], defines: TESTING },
  { name: 'test_opcode_coverage', category: 'opcodes', file: 'test_opcode_coverage.c', sources: [...VM, HAL], defines: TESTING },
  { name: 'test_loader_verify', category: 'loader', file: 'test_loader_verify.c', sources: [src('zplc_loader'), HAL] },
  { name: 'test_sandbox', category: 'loader', file: 'test_sandbox.c', sources: [...VM, HAL], defines: TESTING },
  {
    name: 'test_sandbox_regions', category: 'loader', file: 'test_sandbox.c', sources: [...VM, HAL],
    defines: [...TESTING, 'CONFIG_ZPLC_WORK_MEMORY_SIZE=0x3000U', 'CONFIG_ZPLC_RETAIN_MEMORY_SIZE=0x2000U'],
  },
  { name: 'test_sched_core', category: 'scheduler', file: 'test_sched_core.c', sources: [src('zplc_sched_core'), ...VM, HAL], defines: TESTING },
  {
    name: 'test_sched_equivalence', category: 'scheduler', file: 'test_sched_equivalence.c',
    sources: [
      join(session, 'native_runtime_session.c'), join(session, 'native_program_store.c'), ...VM,
      ...['zplc_retain', 'zplc_program_store', 'zplc_sched_core', 'zplc_exchange', 'zplc_failsafe', 'zplc_io_trace'].map(src), HAL,
    ],
  },
  {
    name: 'test_single_task', category: 'scheduler', file: 'test_single_task.c',
    sources: [src('zplc_single_task'), src('zplc_sched_core'), src('zplc_exchange'), ...VM, HAL], defines: TESTING,
  },
  { name: 'test_failsafe', category: 'scheduler', file: 'test_failsafe.c', sources: [src('zplc_failsafe'), src('zplc_sched_core'), ...VM, HAL] },
  { name: 'test_port_timing', category: 'timing', file: 'test_port_timing.c', sources: [HAL], defines: ['ZPLC_TEST_PORT_NAME="WebAssembly"'] },
  { name: 'test_io_table', category: 'io-table', file: 'test_io_table.c', sources: [] },
  {
    name: 'test_hal_posix_io_table', category: 'io-table', file: 'test_hal_posix_io_table.c', sources: [HAL],
    defines: ['ZPLC_TEST_PORT_ID="wasm"'],
  },
];

/** The linear memory of a suite: the stack, and the static data that wasm-ld places below it. */
const STACK_BYTES = 1024 * 1024;

function spawn(command: string[]): Promise<void> {
  const child = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' });
  return child.exited.then(async (code) => {
    if (code !== 0) throw new Error(`${command.slice(0, 3).join(' ')} ${command.at(-3)} failed:\n${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}`);
  });
}

/** At most `limit` of the jobs at a time. */
async function inParallel<T>(jobs: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++;
      results[index] = await jobs[index]!();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
}

export interface BuiltSuite { suite: Suite; bytes: Uint8Array }

/** Builds the suites (all of them by default) into modules; throws when a tool is missing or a step fails. */
export async function buildSuites(selected: Suite[] = SUITES): Promise<BuiltSuite[]> {
  const tools = toolchain();
  if ('missing' in tools) throw new Error(`cannot build the WebAssembly suites: ${tools.missing.join(' and ')} not found on the PATH`);
  const version = productVersion();
  const { commit, dirty } = treeIdentity();
  const work = mkdtempSync(join(tmpdir(), 'zplc-wasm-suites-'));
  try {
    const generated = join(work, 'include');
    mkdirSync(generated, { recursive: true });
    writeFileSync(join(generated, 'zplc_fw_identity.h'), identityHeader(commit, dirty, version));
    const fixture = readFileSync(join(tests, 'fixtures/zplc-v1-code-task-tags.hex'), 'utf8').trim();
    // the same object for the same source and definitions, compiled once for every suite that links it
    const objects = new Map<string, { source: string; defines: string[]; object: string }>();
    const objectOf = (source: string, defines: string[]): string => {
      const key = `${source}|${defines.join('|')}`;
      if (!objects.has(key)) objects.set(key, { source, defines, object: join(work, `${objects.size}.o`) });
      return objects.get(key)!.object;
    };
    const plans = selected.map((suite) => {
      const defines = [`ZPLC_CORE_VERSION_STR="${version}"`, 'ZPLC_TEST_NO_FILE_IO', ...(suite.defines ?? [])];
      const own = [...defines, 'main=zplc_wasm_suite_main', ...(suite.file === 'test_loader_verify.c' ? [`ZPLC_LOADER_FIXTURE_HEX="${fixture}"`] : [])];
      return {
        suite,
        objects: [
          objectOf(join(tests, suite.file), own),
          ...suite.sources.map((source) => objectOf(source, defines)),
          objectOf(join(here, 'shim/libc.c'), []),
          objectOf(join(here, 'shim/suite_libc.c'), []),
        ],
        out: join(work, `${suite.name}.wasm`),
      };
    });
    const compile = (clang: string, { source, defines, object }: { source: string; defines: string[]; object: string }) => spawn([
      clang, '--target=wasm32', '-ffreestanding', '-fno-builtin', '-O2', '-std=c99', '-Wall', '-Werror',
      ...defines.map((define) => `-D${define}`),
      '-I', join(core, 'include'), '-I', join(tests, 'include'), '-I', join(here, 'shim'), '-I', generated, '-I', session,
      '-c', source, '-o', object,
    ]);
    const limit = Math.max(1, cpus().length);
    await inParallel([...objects.values()].map((entry) => () => compile((tools as Toolchain).clang, entry)), limit);
    await inParallel(plans.map((plan) => () => spawn([
      (tools as Toolchain).linker, '--no-entry', '--export=zplc_wasm_suite_main', '--export=zplc_wasm_suite_flush',
      '-z', `stack-size=${STACK_BYTES}`, '-o', plan.out, ...plan.objects,
    ])), limit);
    return plans.map((plan) => ({ suite: plan.suite, bytes: new Uint8Array(readFileSync(plan.out)) }));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export interface SuiteRun {
  /** What the suite's main() returned: 0 when every check passed. A trap of the module is reported as -1. */
  code: number;
  /** The lines the suite printed, in order. */
  output: string[];
}

/** The result codes of zplc_hal_result_t that the persistence imports return, as the IDE's host does (wasmRuntime.ts). */
const HAL_OK = 0;
const HAL_NOT_FOUND = -4;
const HAL_CORRUPT = -5;

/**
 * Runs one suite with the imports of the HAL port: the clock of the host (milliseconds of performance.now, as the IDE
 * gives the runtime), a record store in memory and the log, which collects what the suite prints.
 */
export async function runSuite(bytes: Uint8Array): Promise<SuiteRun> {
  const output: string[] = [];
  const records = new Map<string, Uint8Array>();
  const linear: { memory?: WebAssembly.Memory } = {};
  const heap = () => new Uint8Array(linear.memory!.buffer);
  const text = (pointer: number) => {
    const view = heap();
    let end = pointer;
    while (view[end] !== 0) end += 1;
    return new TextDecoder().decode(view.subarray(pointer, end));
  };
  const imports = {
    zplc_host: {
      clock_ms: () => Math.trunc(performance.now()) >>> 0,
      persist_save: (key: number, data: number, length: number) => {
        records.set(text(key), heap().slice(data, data + length));
        return HAL_OK;
      },
      persist_load: (key: number, data: number, length: number) => {
        const record = records.get(text(key));
        if (record === undefined) return HAL_NOT_FOUND;
        if (record.byteLength === 0 || record.byteLength > length) return HAL_CORRUPT;
        heap().set(record, data);
        return HAL_OK;
      },
      persist_delete: (key: number) => (records.delete(text(key)) ? HAL_OK : HAL_NOT_FOUND),
      log: (line: number) => {
        output.push(...text(line).replace(/\n$/, '').split('\n'));
      },
    },
  };
  const { instance } = await WebAssembly.instantiate(bytes, imports);
  const exports = instance.exports as { memory: WebAssembly.Memory; zplc_wasm_suite_main(): number; zplc_wasm_suite_flush(): void };
  linear.memory = exports.memory;
  let code: number;
  try {
    code = exports.zplc_wasm_suite_main();
  } catch (error) {
    output.push(`the module trapped: ${error instanceof Error ? error.message : String(error)}`);
    code = -1;
  }
  exports.zplc_wasm_suite_flush();
  return { code, output };
}

if (import.meta.main) {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { only: { type: 'string' } } });
  const tools = toolchain();
  if ('missing' in tools) {
    console.error(`wasm-core: cannot build the WebAssembly suites: ${tools.missing.join(' and ')} not found on the PATH`);
    process.exit(EXIT_TOOLCHAIN_MISSING);
  }
  const selected = values.only ? SUITES.filter((suite) => suite.name === values.only) : SUITES;
  if (selected.length === 0) {
    console.error(`wasm-core: no suite is called ${values.only}`);
    process.exit(2);
  }
  let failed = 0;
  for (const { suite, bytes } of await buildSuites(selected)) {
    const run = await runSuite(bytes);
    const summary = run.output.filter((line) => /^\d+ (tests|checks)|passed|failed/i.test(line)).at(-1) ?? '';
    console.log(`${run.code === 0 ? 'PASS' : 'FAIL'} ${suite.category.padEnd(9)} ${suite.name.padEnd(24)} ${summary.trim()}`);
    if (run.code !== 0) {
      failed += 1;
      console.log(run.output.filter((line) => /FAIL|trapped/.test(line)).slice(0, 20).map((line) => `    ${line}`).join('\n'));
    }
  }
  console.log(`wasm-core: ${selected.length - failed} of ${selected.length} suites passed on the WebAssembly port`);
  process.exit(failed === 0 ? 0 : 1);
}
