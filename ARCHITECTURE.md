# ZPLC architecture

A map of the repository for someone who is about to change it. It states what
each part does and where the facts live; it does not repeat what the generated
reference pages already say.

- Generated runtime API: [`docs/docs/reference/runtime-api.md`](docs/docs/reference/runtime-api.md)
- Generated board profiles: [`docs/docs/reference/boards.md`](docs/docs/reference/boards.md)
- Concepts for readers who are not contributors: [`docs/docs/architecture/index.md`](docs/docs/architecture/index.md)
- The rules a change must respect: [engineering principles](docs/docs/contributing/principles.md)

## How a program travels

```text
 Studio editors (ST, IL, LD, FBD, SFC)
        |  LD, FBD and SFC are transpiled to ST; IL has its own parser
        v
 compiler  (packages/zplc-compiler)   lexer, parser, code generator, assembler
        |  .zplc file: header, CRC32, CODE / TASK / TAGS segments, plus a debug map
        v
 loader    (zplc_loader.c)            verifies the file before anything runs
        v
 VM        (zplc_core.c)              stack machine, one instance per task
        v
 HAL       (zplc_hal.h)               time, I/O, persistence, mutexes, network
        v
 Zephyr board  |  POSIX host (the simulator)  |  WASM (disabled in Studio)
```

## Parts

| Part | Where | What it is |
|---|---|---|
| Core | `firmware/lib/zplc_core/` | Strict ANSI C99, no hardware calls. `src/core/` holds the VM (`zplc_core.c`), the loader (`zplc_loader.c`), the communication-block dispatch (`zplc_comm_dispatch.c`) and the debug output (`zplc_debug.c`). Public headers are in `include/`. |
| HAL implementations | `firmware/lib/zplc_core/src/hal/` | `posix/` (also built for Windows), `zephyr/` (the HAL and the multitask scheduler) and `wasm/`. The core calls only `zplc_hal_*`. |
| Zephyr application | `firmware/app/` | The firmware image: the `zplc` shell, program upload and admission, the persistent program store with boot restore, GPIO mapping from the device tree, Modbus RTU and TCP, MQTT with Sparkplug B, and the Azure and AWS cloud handlers. Board overlays and configuration are in `boards/`. |
| Zephyr module | `firmware/zephyr/`, `firmware/CMakeLists.txt`, `west.yml` | Declares the core and the application as a Zephyr module; `west.yml` pins the Zephyr revision. |
| Native runtime | `firmware/apps/posix_host/` | The `zplc_runtime` executable that Studio uses as its simulator. It reads one JSON request per line on stdin and writes one JSON response per line, plus asynchronous events, on stdout. It is built from the same core and the POSIX HAL. |
| Compiler | `packages/zplc-compiler/` | Structured Text to `.zplc`: `compiler/` (lexer, parser, AST, symbol table, code generator, standard library, debug map) and `assembler/`. It also compiles several programs and tasks into one artifact. |
| Studio | `packages/zplc-ide/` | The Electron desktop application. `electron/` is the main process (project files, native simulator supervision, serial, firmware build, security), `src/` the renderer, `src/runtime/` the adapters that talk to the native simulator or to a serial device, `src/cli/` the command line and Tool API, `src/mcp/` the MCP server, `src/test-engine/` the scenario engine. |
| Hardware-in-the-loop | `tools/hil/`, `packages/zplc-hil/` | Python and TypeScript tools that drive a board on a bench. They need hardware and do not run in CI. |
| Binary contract | `tools/contract/` | `contract.json` is the one source of the opcodes, the container layout, sizes, error codes and communication-block identifiers. |
| Conformance | `conformance/` | Structured Text programs with expected results, run through the compiler and the real VM. |
| Firmware test method | `tools/firmware-test/` | Runs the firmware suites on Linux: `native_sim` in 64 and 32 bits, QEMU Cortex-M3 and M0, and the flash and RAM budget of each board. |
| Documentation | `docs/`, `tools/docs/` | The Docusaurus site in English and Spanish, and the generators and validators for it. |

## The binary contract

The opcodes, the `.zplc` container, the memory sizes, the loader error codes and
the communication-block kinds are defined once, in `tools/contract/contract.json`.
`tools/contract/generate.py` writes them into the C headers (marked regions of
`zplc_isa.h`, `zplc_loader.h` and `zplc_comm_dispatch.h`), the TypeScript module
`packages/zplc-compiler/src/contract.generated.ts`, the Python module used by
the tools, and the reference tables in the docs. CI fails when a generated file
is stale (`bun run contract:check`).

Until the contract is frozen, every change increments a draft counter that the
compiler stores in header word 28 of each artifact. The loader, the native
runtime, the firmware shell and Studio refuse a program built for another draft
and show both numbers. The procedure is in
[Contributing](docs/docs/contributing/index.md#changing-the-binary-contract).

## Memory and execution

- Five regions in one address space: IPI at `0x0000` (inputs), OPI at `0x1000`
  (outputs), WORK at `0x2000`, RETAIN at `0x4000` and CODE at `0x5000`. The
  sizes of WORK, RETAIN and CODE are configuration; the process images are 4 KB.
- Each task has its own VM instance (stack, call stack, program counter). The
  process images, WORK and RETAIN are shared, and CODE is shared by every
  instance that references it.
- The loader checks structure, bounds, CRC and the bytecode itself before a
  program is accepted. Only a verified program is activated.
- On Zephyr, each task has a timer that only admits a release. One coordinator
  runs each due set as a batch: one input snapshot, tasks ordered by release
  time, priority and task id, and at most one normal output commit. See
  [Scheduler](docs/docs/runtime/scheduler.md) and
  [Memory model](docs/docs/runtime/memory-model.md).

## Studio and the simulator

Studio supervises `zplc_runtime` from the Electron main process. The renderer is
sandboxed and reaches the main process only through a narrow, typed preload API.
The command line (`zplc-cli test`), the MCP server and the scenario engine use
the same runtime contract, so a scenario gives the same result in each. A WASM
build of the core exists (`scripts/build_wasm.sh`), but browser simulation is
disabled in Studio until a verifier-enabled artifact is built.

Studio can also connect to a board over serial and upload a program. Building
firmware, flashing, deploying and running are separate operations, and the AI
assistant and MCP start none of them (see the
[principles](docs/docs/contributing/principles.md)).

## Where each layer is tested

| Layer | Suite | Command |
|---|---|---|
| Core, loader, host runtime (C) | `firmware/lib/zplc_core/tests/`, run by ctest | `bun run test:core` |
| Compiler and assembler | `packages/zplc-compiler/src/**/*.test.ts` | `bun run test:compiler` |
| Language conformance | `conformance/`, runner `packages/zplc-ide/src/conformance/conformance.test.ts` | `bun run test:ide` |
| Studio, CLI, MCP, scenario engine | `packages/zplc-ide/**/*.test.ts` | `bun run test:ide` |
| Studio on the real application | `packages/zplc-ide/scripts/journeys.ts` | `bun run test:journeys` |
| Firmware on Linux (Zephyr) | `firmware/tests/` | `bun run test:firmware` |
| Binary contract | `tools/contract/` | `bun run contract:check` |
| Documentation | `tools/docs/`, `tools/hil/validate_docs_parity.py` | `bun run check:docs` |

[CONTRIBUTING.md](CONTRIBUTING.md) lists the durations and what a pass proves.
Host, QEMU, target-build, bench and manual results are different evidence
levels, and a lower level never proves a higher one.
