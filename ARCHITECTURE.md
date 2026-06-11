# Architecture: ZPLC (Zephyr PLC)

## Structure

```
ZPLC/
├── firmware/                         # C99 runtime (Zephyr module)
│   ├── app/                          # Zephyr application entry points
│   │   ├── src/
│   │   │   ├── main.c                # Board init + startup
│   │   │   ├── shell_cmds.c          # Debug shell (serial console)
│   │   │   ├── zplc_modbus.c         # Modbus RTU/TCP integration
│   │   │   ├── zplc_modbus_client.c  # Modbus client operations
│   │   │   ├── zplc_mqtt.c           # MQTT (Sparkplug B) integration
│   │   │   └── zplc_comm_modbus_handler.c  # Comm FB Modbus handler
│   │   ├── boards/                   # Board overlays & Kconfig per target
│   │   ├── build_disco/              # ⚠️ 1,132 committed build artifacts
│   │   ├── build_esp32s3/            # ⚠️ more committed build artifacts
│   │   └── build_giga/               # ⚠️ more committed build artifacts
│   ├── apps/posix_host/              # POSIX dev runtime (native simulation)
│   │   └── src/
│   │       ├── main.c                # POSIX main
│   │       ├── host_stdio.c          # stdio transport for native sim
│   │       └── native_runtime_session.c  # Electron supervision protocol
│   ├── lib/zplc_core/                # ⭐ Core library — the VM
│   │   ├── include/                  # 7 public headers
│   │   │   ├── zplc_hal.h            # HAL contract (330 lines, clean)
│   │   │   ├── zplc_isa.h            # ISA + binary format (705 lines)
│   │   │   ├── zplc_core.h           # VM instance API (700 lines)
│   │   │   ├── zplc_scheduler.h      # Multitask scheduler (292 lines)
│   │   │   ├── zplc_loader.h         # Binary loader
│   │   │   ├── zplc_debug.h          # Debug API
│   │   │   └── zplc_comm_dispatch.h  # Comm FB dispatch
│   │   ├── src/
│   │   │   ├── core/                 # ⚠️ VM heart with technical debt
│   │   │   │   ├── zplc_core.c       # 2,498 lines, ~87 functions ⚠️ MONOLITH
│   │   │   │   ├── zplc_loader.c     # Binary loader (overflow-prone bounds)
│   │   │   │   ├── zplc_debug.c      # Debug support
│   │   │   │   └── zplc_comm_dispatch.c  # Comm FB dispatch
│   │   │   └── hal/                  # HAL implementations (clean)
│   │   │       ├── posix/zplc_hal_posix.c     # ⚠️ fake mutexes (returns (void*)1)
│   │   │       ├── zephyr/zplc_hal_zephyr.c   # Zephyr HAL
│   │   │       ├── zephyr/zplc_scheduler_zephyr.c  # ⚠️ holds mutex across scan+I/O
│   │   │       └── wasm/zplc_hal_wasm.c       # WASM HAL
│   │   ├── tests/                    # 6 test files, 3,882 lines
│   │   │   ├── test_vm_core.c        # 2,507 lines (largest)
│   │   │   ├── test_native_runtime_session.c  # 686 lines
│   │   │   ├── test_isa.c            # 315 lines
│   │   │   └── test_comm_dispatch.c, test_hal_posix_persist.c, test_host_stdio.c
│   │   └── build/                    # POSIX build dir (not committed)
│   ├── CMakeLists.txt                # Zephyr module CMake
│   ├── Kconfig                       # Zephyr Kconfig options
│   └── module.yml                    # Zephyr module manifest
├── packages/                         # TypeScript monorepo
│   ├── zplc-compiler/                # ST Compiler + Assembler
│   │   └── src/
│   │       ├── compiler/             # Compiler pipeline
│   │       │   ├── lexer.ts          # Lexer
│   │       │   ├── parser.ts         # Parser
│   │       │   ├── codegen.ts        # ⚠️ "unreviewable monolith"
│   │       │   ├── symbol-table.ts   # Symbol table
│   │       │   ├── debug-map.ts      # ⚠️ unindexed sequential lookups
│   │       │   └── stdlib/           # Standard library (well-organized)
│   │       └── assembler/            # Assembler layer
│   │           ├── codegen.ts        # ⚠️ address truncation: operand & 0xFFFF
│   │           ├── parser.ts         # IL assembler parser
│   │           └── opcodes.ts        # Opcode table
│   ├── zplc-ide/                     # React + Electron IDE
│   │   └── src/
│   │       ├── components/           # UI components (LD, FBD, SFC editors)
│   │       ├── runtime/              # ⚠️ multiple polling loops
│   │       │   ├── serialAdapter.ts  # Serial command queue
│   │       │   ├── wasmAdapter.ts    # WASM simulation adapter
│   │       │   ├── nativeAdapter.ts  # Native runtime adapter
│   │       │   └── debugAdapter.ts   # ⚠️ unchecked memory addresses
│   │       ├── hooks/                # React hooks
│   │       │   └── useDebugController.ts  # ⚠️ large mixed-concern hook
│   │       ├── store/useIDEStore.ts  # ⚠️ large Zustand store
│   │       ├── transpiler/           # LD→ST, FBD→ST, SFC→ST
│   │       └── electron/             # Electron main process
│   │           └── main.ts           # ⚠️ default-allow permissions
│   └── zplc-hil/                     # HIL test utilities (shared)
├── tools/
│   ├── hil/                          # 50+ Python test scripts (strong)
│   ├── connectivity/                 # Board shell, MQTT, cloud sims
│   └── docs/                         # Doc generation scripts
├── specs/                            # 9 specification directories (001-009)
│   ├── 008-release-foundation/       # v1.5 release evidence
│   └── 009-native-runtime-sim/       # Native simulation supervision
├── docs/                             # Docusaurus site (English + Spanish)
├── examples/                         # 10 assembly examples with .zplc binaries
└── anti-bullshit-remediation-specs.md  # ⚠️ 551 lines of catalogued defects
```

## Pattern

- **Primary**: Hexagonal / ports-and-adapters with clean HAL separation
- **Consistent**: mostly — the HAL layer is well-designed; the IDE layer violates its own boundaries

### Architecture Layers

```
┌──────────────────────────────────────┐
│  IDE Surface (React + Electron)      │  packages/zplc-ide
│  LD/FBD/SFC editors, Monaco, Store   │
├──────────────────────────────────────┤
│  Compiler (TypeScript)               │  packages/zplc-compiler
│  Lexer → Parser → Codegen → Assembler│
├──────────────────────────────────────┤
│  Core VM (C99)                       │  firmware/lib/zplc_core/src/core
│  Stack machine, 75 opcodes           │  ⚠️ 2,498-line monolith
├──────────────────────────────────────┤
│  HAL (C99 interface)                 │  firmware/lib/zplc_core/include/zplc_hal.h
│  ⚡ POSIX | Zephyr | WASM | Windows  │  firmware/lib/zplc_core/src/hal/
├──────────────────────────────────────┤
│  RTOS / OS / Browser                 │  Zephyr, Linux, WASM, Electron
└──────────────────────────────────────┘
```

### Positive Patterns
- **Clean HAL**: One interface (`zplc_hal.h`), four implementations. Core never touches hardware directly. This is the strongest architectural decision in the project.
- **Instance-based VM**: `zplc_vm_t` per task — private stack/callstack/PC, shared IPI/OPI/Work/Retain. Supports multi-task scheduling.
- **Binary ABI**: `zplc_isa.h` defines packed structs, little-endian bytecode, magic number, versioning. Compiler and runtime share one contract.
- **Test culture exists**: 3,882 C test lines + 8,225 TS test lines. 50+ HIL Python test scripts. Not a testless project.

### Smells

| Issue | Severity | Detail |
|-------|----------|--------|
| Build artifacts committed | CRITICAL | `firmware/app/build_disco/` (1,132 files) committed to git. `.gitignore` only excludes `build/` not `build_disco/`. Also `build_esp32s3/`, `build_giga/`, `build_verify_esp32s3/`. |
| Legacy + Instance API coexistence | HIGH | `zplc_core_*` singleton functions wrap `zplc_vm_*`. Adds surface area and confuses callers. |
| Codegen monolith | HIGH | `zplc_core.c` at 2,498 lines. Compiler `codegen.ts` described as "unreviewable." |
| Fake POSIX mutexes | HIGH | `zplc_hal_mutex_create()` returns `(zplc_hal_mutex_t)1`. All lock/unlock are no-ops. Process image "protection" is a lie. |
| Loader overflow-prone bounds | HIGH | Segment checks use `offset + size` arithmetic — wraparound bypass possible. |
| CI is documentation-only | HIGH | `ci.yml` validates board lists and release evidence. No C compilation, no C tests, no TS tests, no linting. |
| CRC32 is hardcoded zero | HIGH | `.zplc` binary integrity field is always 0. Firmware cannot detect corruption. **FIXED in assemblers — firmware loader still needs verification.** |
| Multiple polling loops in IDE | MEDIUM | `TerminalTab` polls via `requestAnimationFrame`, `WatchWindow` duplicates `useDebugController` polling, serial command queue contention. |
| Electron default-allow | MEDIUM | Permission handler returns `true` for everything. No CSP enforcement in production. |
| Scheduler holds mutex across scan+I/O | MEDIUM | Zephyr scheduler locks `mem_mutex` for entire VM execution + I/O sync, blocking comm/debug threads. |
| Unchecked debug memory access | MEDIUM | `peek`/`poke` accept any address without region validation in IDE adapters. |
| Sequential debug map lookups | LOW | Debug variable resolution scans the full map linearly with no index. |
| `OP_COMM_EXEC` unchecked operand | LOW | Communication FB dispatch accepts any `operand32` value as a kind. |

## Technical Debt Heatmap

| Area | Debt | Risk | Why |
|------|------|------|-----|
| POSIX HAL mutexes | CRITICAL | HIGH | All process image "locking" is fake. Race conditions in native sim and any POSIX deployment. Affects all shared-memory correctness. |
| Build artifacts in git | CRITICAL | MEDIUM | 1,132+ object files, cmake caches, ninja logs in repo. Bloat. Merge conflicts on generated files. `.gitignore` gap. |
| `zplc_core.c` size | HIGH | HIGH | 2,498 lines, ~87 functions. Single-point failure. Any change risks the entire VM. Hard to review, hard to test in isolation. |
| Loader bound checks | HIGH | HIGH | `offset + size` overflow allows malformed binaries to bypass validation. Remote code execution surface on embedded target. |
| CRC32 always zero | HIGH | MEDIUM | No integrity verification on bytecode. Corrupt flash / partial uploads detected only at runtime via undefined behavior. |
| CRC32 implemented (assembler half) | FIXED | LOW | Both TypeScript (`codegen.ts`) and Python (`zplc_asm.py`) assemblers now compute IEEE 802.3 CRC32 over the full file excluding the crc32 field itself. Firmware loader verification is the remaining half (see R2 spec). |
| CI gap | HIGH | MEDIUM | No automated C compilation, C unit tests, TS unit tests, or linting on push/PR. Regression risk on every merge. |
| Compiler codegen monolith | HIGH | MEDIUM | Unreviewable, hard to test edge cases. Bytecode validator doesn't exist yet. |
| IDE polling contention | MEDIUM | MEDIUM | Dual polling (`WatchWindow` + `useDebugController`), rAF-based terminal read. Burns CPU, delays debug updates. |
| Electron security | MEDIUM | LOW | Default-allow permissions, no CSP. Dev-only risk today, blocks production sign-off. |
| Legacy API layer | MEDIUM | LOW | `zplc_core_*` wrappers add no value but increase API surface. Only `test_vm_core.c` still uses them heavily. |
| Modbus force bypass | MEDIUM | MEDIUM | Modbus writes directly to memory, bypassing force overrides. Forced values silently lost on Modbus poll. |
| Unbounded native sim stdout | LOW | LOW | Buffer grows without limit, can crash Electron host on verbose programs. |
| SFC editor | LOW | LOW | Only 2 sample SFC test files (`single_step`, `two_states`). Thin coverage vs LD/FBD/ST. |

## Constraints for Explorer

These are non-negotiable for any downstream work:

1. **HAL separation is sacred.** Firmware code (`zplc_core.c`, `zplc_loader.c`) must never call hardware directly. All I/O goes through `zplc_hal_*` functions. Adding a direct HW call is an architectural regression.

2. **The .zplc binary format is a contract.** `zplc_isa.h` defines the wire format. Any change to packed structs, opcodes, or memory layout MUST be reflected in both the C header AND the TypeScript assembler (`packages/zplc-compiler/src/assembler/`). Breaking this breaks "compile once, run anywhere."

3. **C99 only in core.** `firmware/lib/zplc_core/src/core/` must remain strict ANSI C99. No VLAs, no C11 threads, no GCC extensions. The HAL implementations can use platform-specific APIs.

4. **No new dependencies without architectural review.** The `anti-bullshit-remediation-specs.md` explicitly forbids unapproved dependencies. This applies to both npm/bun packages and Zephyr modules.

5. **Dual-language docs.** English (`docs/docs/`) and Spanish (`docs/i18n/es/`) documentation must stay in sync. The constitution mandates parallel updates.

6. **Tests are required.** Any C change needs a C unit test or HIL test. Any TS change needs a test. The constitution mandates TDD. Exceptions need a written justification.

7. **The five remediation specs have priority.** `anti-bullshit-remediation-specs.md` defines 5 specs in dependency order. Specs 1 (Runtime Safety) and 2 (Compiler Safety) must be addressed before Specs 3-5. Breaking the dependency chain creates false confidence.

## File Counts for Reference

| Category | Count | Lines |
|----------|-------|-------|
| C source files (core + HAL) | 9 | — |
| C headers | 7 | — |
| C tests | 6 | 3,882 |
| TS compiler source | 40 | — |
| TS compiler tests | 14 | — |
| TS IDE source | Many | — |
| TS IDE tests | 31 | — |
| TS total test lines | — | 8,225 |
| HIL Python scripts | 50+ | — |
| Committed build artifacts | 1,132 | N/A |
| Spec documents | 9 dirs | — |
| Assembly examples | 10 | — |

---

*Generated by nocturnal-architect, 2026-06-07. This file is an architectural analysis, not executable documentation. See AGENTS.md for contribution rules and .specify/ for formal specs.*
