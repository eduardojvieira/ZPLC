# context for Agents & Contributors

This file provides context for AI agents and human contributors working on ZPLC.

## Project Identity
**Name:** ZPLC (Zephyr PLC)
**Goal:** Create a robust, open-source industrial PLC runtime.
**OS:** macOS (Dev), Zephyr/Linux/Windows (Target).

## Core Philosophy
1.  **Strict ANSI C99**: The core (`src/core`) must compile with any standard C99 compiler. No GCC extensions, no stdlib dependencies that aren't abstractable.
2.  **HAL Abstraction**: The core *never* touches hardware directly. All IO, Timing, and Persistence go through `zplc_hal.h`.
3.  **Test-Driven**: Every feature must have a corresponding test case in `tests/`.
4.  **No Feature Creep**: Stick to the [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md).

## Development Rules

### Code Style (C)
- **Indentation**: 4 spaces.
- **Naming**: `snake_case` for functions/variables. `zplc_` prefix for public API.
- **Comments**: Doxygen style `/** ... */` for public headers.

### Directory Structure
- `src/`: Source code.
    - `core/`: The platform-independent VM and logic.
    - `hal/`: Hardware Abstraction Layer implementations.
    - `loader/`: `.zplc` binary loader.
- `include/`: Public headers.
- `tests/`: Unit and integration tests.
- `tools/`: Helper scripts and compilers.

## Key Documents
- **[TECHNICAL_SPEC.md](TECHNICAL_SPEC.md)**: The bible for this project. If it conflicts with this file, the Spec wins.
- **[task.md](task.md)**: Current progress tracking.

## Common Tasks (Workflows)
- **Build**: `mkdir build && cd build && cmake .. && make`
- **Test**: `ctest` inside build directory.
