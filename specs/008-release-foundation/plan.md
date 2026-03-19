# Implementation Plan: ZPLC v1.5.0 Release Foundation

**Branch**: `008-release-foundation` | **Date**: 2026-03-13 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-release-foundation/spec.md`

---

## Summary

Deliver a truth-based `v1.5.0` foundation release by aligning repository state, runtime
claims, IEC language workflows, protocol behavior, board support, desktop validation, and
 bilingual documentation around one evidence-driven release contract.

The plan is intentionally release-first rather than feature-first:

1. Remove hidden build artifacts, placeholder specs, and stale claims from the source of
   truth.
2. Normalize support claims around one canonical board list, one canonical docs set, and
   one release evidence model.
3. Prove end-to-end IDE workflow for every claimed IEC language and prove protocol
   behavior at compiler, IDE, runtime, and HIL layers.
4. Separate AI-deliverable automation from human-owned desktop and hardware validation so
   sign-off is auditable.

Design decisions are documented in [research.md](research.md). Data entities are defined in
[data-model.md](data-model.md). Operational contracts are defined under
[`contracts/`](contracts/). Execution steps for maintainers are captured in
[quickstart.md](quickstart.md).

---

## Technical Context

**Language/Version**: ANSI C99 (`firmware/lib/zplc_core`), TypeScript 5.9, React 19,
Electron, Markdown/MDX, Bun runtime, Python 3 for HIL tooling  
**Primary Dependencies**: Zephyr RTOS 4.0, west/CMake toolchain, Docusaurus v3,
Electron + Vite, Monaco/React Flow editor stack, existing HIL scripts under `tools/hil/`  
**Storage**: Git-tracked Markdown/JSON/YAML release artifacts and documentation; no new
runtime database  
**Testing**: `ctest`, `bun test`, `tsc --noEmit`, `eslint`, docs static build, west
cross-build matrix, HIL scripts, human desktop smoke validation  
**Target Platform**: Zephyr embedded boards, POSIX/WASM simulation, Electron desktop on
macOS/Linux/Windows, GitHub Pages docs hosting  
**Project Type**: Monorepo release-foundation effort spanning firmware runtime,
compiler/IDE, documentation site, CI, and release governance assets  
**Performance Goals**: Preserve deterministic non-blocking scan behavior for protocol FBs;
maintain 60 fps IDE interaction; complete docs build and release validation within normal
CI/release cadence  
**Constraints**: No dynamic allocation in C Core; no HAL bypass; warnings-as-errors for C
and TS; no unsupported claims in release materials; English/Spanish parity for canonical
docs; human evidence mandatory for human-owned gates  
**Scale/Scope**: Repo-wide cleanup across `firmware/`, `packages/`, `docs/`, `tools/`,
and `specs/`; supported-board claims limited to boards with maintained assets and release
evidence

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | What the plan must prove | Status | Evidence |
|------|--------------------------|--------|----------|
| Spec First | Active `spec.md` and `plan.md` exist before implementation begins | ✅ PASS | `specs/008-release-foundation/spec.md`, `specs/008-release-foundation/plan.md` |
| HAL Abstraction | Core changes stay out of platform APIs and go through `zplc_hal_*` | ✅ PASS | Plan constrains runtime changes to existing core/HAL boundaries; no direct hardware access is introduced in Core |
| Static Memory | `firmware/lib/zplc_core/src/core/` avoids dynamic allocation and keeps bounded memory | ✅ PASS | Protocol/runtime completion work keeps existing static-memory rule; no new heap-backed core design is allowed |
| ISA / `.zplc` Contract | Opcode, bytecode, or IR changes are defined first and include version/migration impact | ✅ PASS | Any language/protocol claim changes that require compiler/runtime contract changes are gated by explicit contract docs and release-note updates |
| Test-First | Tests are identified before implementation; failing-test step is called out explicitly | ✅ PASS | Verification plan names host tests, IDE tests, docs checks, cross-builds, HIL, and human smoke evidence before release sign-off |
| Industrial Quality | `clang-tidy`, `-Werror`, `eslint`, and `tsc --noEmit` coverage is identified where applicable | ✅ PASS | Quality gates are included in verification plan and quickstart commands |
| Verification Coverage | Host tests, cross-compilation, and HIL validation are listed when the affected surface requires them | ✅ PASS | Release matrix explicitly separates automated, HIL, and human desktop validation |
| Documentation Parity | If docs change, both `docs/docs/` and `docs/i18n/es/` update together or a tracked follow-up is recorded | ✅ PASS | Canonical docs manifest and parity contract are included as release-blocking artifacts |
| Dependency Discipline | Any new dependency or Zephyr module has explicit justification and review impact | ✅ PASS | Plan assumes reuse of existing repo tooling; no new dependency is required for the foundation release |

**Post-Design Re-check**: ✅ PASS. Phase 0 research and Phase 1 design keep the work
inside the constitution: one supported-board truth source, explicit evidence records,
docs parity, host/cross/HIL validation, and no unjustified new dependencies.

---

## Project Structure

### Documentation (this feature)

```text
specs/008-release-foundation/
├── plan.md                         # This file
├── research.md                     # Phase 0 decisions and rationale
├── data-model.md                   # Release entities and validation rules
├── quickstart.md                   # Maintainer execution walkthrough
├── contracts/
│   ├── canonical-docs-manifest.md  # Release-blocking docs surface
│   ├── release-evidence-contract.md# Gate matrix + evidence record contract
│   └── supported-board-manifest.md # Canonical supported-board list contract
└── tasks.md                        # Next phase (/speckit.tasks)
```

### Source Code (repository root)

```text
firmware/
├── app/
│   ├── boards/                     # Board overlays/configs and future board manifest source
│   └── src/                        # Runtime/protocol handlers and app integration
├── apps/posix_host/                # Host runtime validation path
└── lib/zplc_core/
    ├── include/                   # ISA and runtime contracts
    ├── src/core/                  # Deterministic VM core (must remain heap-free)
    ├── src/hal/                   # Platform boundaries
    └── tests/                     # C host tests

packages/
├── zplc-compiler/                  # IEC language compile path and protocol FB definitions
├── zplc-hil/                       # HIL support package(s)
└── zplc-ide/                       # Electron/Web IDE, board profiles, desktop workflows

docs/
├── docs/                           # Canonical English docs
├── i18n/es/                        # Canonical Spanish docs
├── sidebars.js                     # Navigation contract
└── docusaurus.config.js            # Site/versioning/i18n contract

tools/
└── hil/                            # Hardware-backed protocol and language validation helpers

README.md                           # Human entry point, must stay concise and truthful
AGENTS.md                           # AI/contributor entry point
```

**Structure Decision**: This feature is a repo-wide release hardening effort, not a new
runtime subsystem. Work is organized around existing ownership boundaries: firmware/core,
compiler/IDE, docs, and release governance artifacts under the feature spec directory.

---

## Phase 0: Research Summary

Phase 0 resolved all planning unknowns without leaving `NEEDS CLARIFICATION` markers.

1. **Supported-board truth source**: One machine-readable manifest should live adjacent to
   the real firmware support assets, with docs and IDE derived from it.
2. **Language parity strategy**: `ST` remains the executable baseline; `IL`, `LD`, `FBD`,
   and `SFC` must prove parity by normalizing into that path and still passing full IDE
   workflow validation.
3. **Protocol validation split**: Use host tests for compiler/runtime contracts, IDE tests
   for config/workflow, and HIL for real serial/network/broker behavior.
4. **Docs parity enforcement**: A fixed canonical docs manifest is release-blocking, with
   English/Spanish parity required for every canonical slug.
5. **Human evidence standard**: Every human-owned gate requires a standard evidence record
   and the release matrix must map each gate to `AI`, `Human`, or `Shared` ownership.

---

## Phase 1: Design Artifacts

### Data Model

- [data-model.md](data-model.md) defines the release evidence matrix, evidence record,
  supported-board entry, supported language path, protocol feature contract, canonical
  docs page, and release claim entities.

### Contracts

- [contracts/release-evidence-contract.md](contracts/release-evidence-contract.md) defines
  the machine-readable and human-readable shape of gate ownership and evidence.
- [contracts/supported-board-manifest.md](contracts/supported-board-manifest.md) defines
  the canonical supported-board list contract that firmware, IDE, docs, and release notes
  must share.
- [contracts/canonical-docs-manifest.md](contracts/canonical-docs-manifest.md) defines the
  release-blocking docs slug set and parity requirements.

### Maintainer Execution

- [quickstart.md](quickstart.md) provides the recommended order to generate artifacts,
  validate claims, and capture release evidence.

---

## Verification Plan

### Repository Hygiene

- Audit tracked generated output, temporary artifacts, and stale placeholder specs.
- Verify the build does not depend on checked-in build directories.
- Confirm all release-facing claims are mapped to current evidence artifacts.

### Automated Validation

- **C / Runtime**: `ctest`, static analysis, protocol dispatch/runtime tests.
- **Compiler / IDE**: `bun test`, `tsc --noEmit`, `eslint`, language compile/transpile
  coverage, board profile/config tests.
- **Docs**: Docusaurus build, navigation/link validation, English/Spanish canonical slug
  parity check.
- **Cross-build**: west build for every board that remains in the supported-board list.

### Human Validation

- Desktop smoke validation on macOS, Linux, and Windows.
- HIL validation for at least one serial-focused board and one network-capable board.
- Visual debugging verification: breakpoints, step/continue, watch table, force values.

### Release Evidence Rules

- Every gate in the release matrix has one owner type: `AI`, `Human`, or `Shared`.
- Every `Human` gate uses a standard evidence record.
- `Shared` gates require both automated evidence and a linked human rerun after fixes.

---

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
