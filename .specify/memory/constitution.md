<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 → 1.1.1 (PATCH — clarified compliance workflow and synced
dependent templates/docs with existing constitutional rules)

Modified principles:
  - I. Spec First → unchanged title, wording tightened around active spec/plan usage
  - IV. Industrial Quality (Test-First — NON-NEGOTIABLE) → clarified test/HIL scope
  - V. Direct Communication → unchanged title, wording preserved

Added sections:
  - None

Removed sections:
  - None

Templates requiring updates:
  ✅ `.specify/memory/constitution.md`      — sync report refreshed, governance clarified
  ✅ `.specify/templates/plan-template.md`  — Constitution Check now encodes ZPLC gates
  ✅ `.specify/templates/spec-template.md`  — requirements/testing prompts aligned to determinism and explicit failures
  ✅ `.specify/templates/tasks-template.md` — task flow aligned to test-first, HIL, docs parity, ISA/versioning work
  ✅ `QUICKSTART_AGENTS.md`                 — agent guidance updated to current personas, skills, and paths
  ✅ `AGENTS.md`                            — reviewed; no change required
  ⚠ `.specify/templates/commands/*.md`     — directory not present, no command templates to update

Follow-up TODOs:
  - TODO(SECURITY_REVIEW_CADENCE): Define explicit security compliance review cadence
    before Phase 1.7 (Security & Authentication) work begins.
-->

# ZPLC (Zephyr PLC) Constitution

## Core Principles

### I. Spec First

Before writing a single line of code, look for the active work in `.specify/` and read
`AGENTS.md`. If no spec or plan exists for a non-trivial change, create one via
`/speckit.specify` + `/speckit.plan`. Do not improvise. The `.zplc` binary format is the
canonical contract between IDE and Runtime — changes to it MUST be planned, versioned,
and migration-pathed.

### II. Context Hygiene

Read `AGENTS.md` to adopt the correct persona (FirmwareEngineer, IDE_Craftsman,
QA_Industrial, or ArchitectureKeeper) before any significant work. Do not read the entire
repository unnecessarily. Use `rg`, `fd`, `bat` — never `grep`, `find`, `cat`.

### III. Essentialism & YAGNI

Less code, more robustness, zero technical debt. Every new opcode costs binary size and
determinism budget. Every new npm/bun dependency costs audit surface. Question every
addition: "Does this really need to be done, or are we procrastinating?"

### IV. Industrial Quality (Test-First — NON-NEGOTIABLE)

Code without tests is garbage. Any new or changed behavior MUST have failing tests
BEFORE implementation (Red-Green-Refactor). The verification plan MUST name the exact
test layers involved, and CI MUST enforce:

- **Static analysis**: `clang-tidy` + `-Werror` for C; `eslint` + `tsc --noEmit` for TS.
- **Unit tests**: pass on host (POSIX/Win32) via `ctest` or `bun test`.
- **Cross-compilation**: succeeds for all defined firmware targets:
  - `arduino_giga_r1/stm32h747xx/m7`
  - `esp32s3_devkitc`
  - `nucleo_h743zi`
  - `rpi_pico`
  - `mps2/an385` (QEMU CI default)
- **HIL gate**: firmware/runtime behavior changes are NOT "done" until they run on a
  physical board in the pipeline.

Explicit error handling is mandatory: `Result` patterns in TS, checked return codes in C.
Zero silent failures. `any` in TypeScript and `void*` in C require life-or-death
justification written as a comment.

### V. Direct Communication

Rioplatense tone: direct, cutting, but competent. Cynical about hype, loyal to
architecture. Technical English for all code, commits, and docs.
Preferred CLI toolchain: `bat`, `rg`, `fd`, `eza`, `just`.
Commits MUST follow Conventional Commits format. No AI attribution.

---

## Technical Domain & Stack

**Industrial / Embedded**:

- Zephyr RTOS 4.0, ANSI C99 (`libzplc_core`), Modbus TCP/RTU, MQTT (Sparkplug B), ZPLC ISA.

**Web / Cloud**:

- TypeScript 5.x (strict), React 19, Electron (desktop), Vite, Bun runtime.
- React Flow (visual editors), Zustand (state), Monaco Editor (ST code).

**Simulation**:

- WebAssembly (Emscripten) — browser simulation of the C core.

**Tools & CI**:

- Speckit, TestSprite, GitHub Actions, west (Zephyr), CMake, `clang-tidy`, `eslint`.

---

## Critical Rules & Workflow

### HAL Abstraction (SACRED)

The Core VM (`firmware/lib/zplc_core/src/core/`) MUST NEVER access hardware registers,
Zephyr APIs, POSIX, Win32, or browser APIs directly. All platform calls go through
`zplc_hal_*`. Adding a new target means adding a new HAL implementation — not patching
Core code.

### Memory Management (NO EXCEPTIONS)

- **No Dynamic Allocation**: zero `malloc`/`calloc`/`realloc`/`free` in C Core.
  All memory is statically allocated; sizes are Kconfig-configurable.
- **Exact-Width Types**: `uint8_t`, `uint16_t`, `uint32_t`, `int16_t`, etc. everywhere.
  Bare `int` or `long` without portability justification is forbidden in Core.
- **Bounded Stacks**: every task has isolated, Kconfig-bounded work memory.

### ISA as Single Source of Truth

New opcodes MUST be defined in `zplc_isa.h` BEFORE implementation. The `.zplc` binary
format is the contract; format changes require version increment and migration docs.
All five IEC 61131-3 language frontends (ST, LD, FBD, SFC, IL) MUST unify into the same
internal IR before bytecode emission.

### Code Quality (IDE & Firmware Shared)

- **Strict Types**: No `any` in TypeScript, no untyped `void*` in C.
- **Warnings = Errors**: C builds with `-Werror`. Fix warnings, disable nothing.
- **Comments**: Explain WHY, not WHAT. The code must explain itself.
- **Performance (IDE)**: 60 fps always. The IDE must feel instant.
- **Local First (IDE)**: All project data lives locally. Cloud is optional.

---

## Governance

### Amendment Procedure

1. Propose amendments as a PR modifying `.specify/memory/constitution.md`.
2. The PR MUST include an updated Sync Impact Report (HTML comment at top of this file)
   listing: version change, modified/added/removed sections, templates updated.
3. `CONSTITUTION_VERSION` MUST increment per semantic versioning:
   - **MAJOR**: backward-incompatible principle removal or redefinition.
   - **MINOR**: new principle/section added, or material guidance expansion.
   - **PATCH**: clarifications, wording corrections, typo fixes.
4. Require at least one maintainer review before merging.

### Compliance Review

The `ArchitectureKeeper` agent role (see `AGENTS.md`) is responsible for enforcing
constitutional compliance in all code reviews. Violations are blocking PR comments.
A review is expected for every implementation plan's Constitution Check and at each major
phase release boundary (e.g., before v1.5, v2.0). Reviews MUST explicitly verify:

- spec-first planning exists for the change;
- Core changes preserve HAL abstraction and static memory rules;
- ISA or `.zplc` changes include versioning and migration notes;
- test-first evidence, warnings-as-errors, and required host/cross/HIL verification are
  present;
- documentation changes keep `docs/docs/` and `docs/i18n/es/` in sync, or record a
  tracked follow-up.

TODO(SECURITY_REVIEW_CADENCE): Define explicit security compliance review cadence before
Phase 1.7 (Security & Authentication) work begins.

**Version**: 1.1.1 | **Ratified**: 2026-01-20 | **Last Amended**: 2026-03-12
