# Phase 0: Research & Decisions

**Feature**: Agents Infrastructure
**Date**: 2026-01-20

## 1. Zephyr Build Strategy (`zephyr-build` skill)

**Decision**: Use `west build` with explicit board targeting and pristine options.
**Rationale**: 
- `west` is the official Zephyr meta-tool.
- `--pristine` is required to ensure clean builds when switching boards or configuration, which agents often do.
- `-b` (board) is mandatory.

**Command Template**:
```bash
west build -b <BOARD_NAME> <APP_DIR> --pristine
```

**Boards to Support (from README)**:
- `mps2/an385` (QEMU)
- `rpi_pico` (RP2040)
- `native_posix` (Testing)

## 2. Code Analysis Strategy (`code-analysis` skill)

**Decision**: Use `cppcheck` with MISRA-like strictness.
**Rationale**:
- `cppcheck` is lightweight and effective for C.
- "Industrial Quality" constitution requires no silent failures.

**Command Template**:
```bash
cppcheck --enable=all --inconclusive --error-exitcode=1 <FILES>
```

## 3. Module Scaffolding & `zplc_result_t`

**Observation**: The Project Spec and `AGENTS.md` reference `zplc_result_t`, but it is NOT defined in `zplc_core.h` (which uses `int`) or `zplc_hal.h` (which uses `zplc_hal_result_t`).

**Decision**: The scaffolding skill will strictly use `int` for Core functions (matching `zplc_core.h`) OR `zplc_hal_result_t` for HAL functions.
**Correction**: I will add a `typedef int zplc_result_t;` to the scaffold's private header or recommend usage of `int` to match existing codebase until a global refactor occurs.
**Better approach**: The `agents.md` context implies `zplc_result_t` is desired. I will generate code that uses `int` but comments that it follows the `zplc_core` convention (0 = Success), effectively treating it as a result type.

## 4. Agents Structure (`agents.md`)

**Decision**: Define roles as requested.
- `FirmwareEngineer`: Focus on C99, pointers, static memory.
- `QA_Industrial`: Focus on test coverage, boundary analysis.
- `ArchitectureKeeper`: Focus on constitutional compliance (HAL abstraction).

## 5. Directory Structure

```text
/
├── agents.md
└── skills/
    ├── zephyr-build/
    │   └── skill.md
    ├── code-analysis/
    │   └── skill.md
    └── zplc-module/
        └── skill.md
```
