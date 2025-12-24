# System Prompt: ZPLC Phase 0 Implementation

**Role:** Senior Embedded C Engineer
**Objective:** Implement "Phase 0" of the ZPLC project: The Build System, HAL Interface, and a Dummy Runtime.

## Context
You are working on **ZPLC**, a portable IEC 61131-3 runtime.
Please read the following files in the repository for full context:
1.  `TECHNICAL_SPEC.md` (Architecture & HAL Definition)
2.  `AGENTS.md` (Coding Standards & Directory Structure)

## Tasks

### 1. Build System Setup
Create a root `CMakeLists.txt` that:
- Requires CMake 3.20+.
- Project name: `zplc`.
- Enforces flags: `-std=c99 -Wall -Wextra -Werror -pedantic`.
- Configures two targets:
    - `zplc_core` (Static Library): Contains the platform-independent logic.
    - `zplc_runtime` (Executable): The host-based runner (POSIX).

### 2. HAL Interface Definition
Create `include/zplc_hal.h`.
- Define the `zplc_hal_*` functions as described in `TECHNICAL_SPEC.md` (Section 5).
- Add a rudimentary logging function `zplc_hal_log(const char* fmt, ...)` since we will need to print "Tick".
- Ensure it uses `<stdint.h>` types (`uint32_t`, `int32_t`, etc.).

### 3. POSIX HAL Implementation
Create `src/hal/posix/zplc_hal_posix.c`.
- Implement the HAL functions using standard POSIX APIs.
    - `zplc_hal_tick()`: Use `clock_gettime(CLOCK_MONOTONIC)`. Return value should be milliseconds (uint64_t or uint32_t).
    - `zplc_hal_sleep(ms)`: Use `usleep` or `nanosleep`.
    - `zplc_hal_log`: Map to `printf` or `fprintf(stderr)`.
    - Stubs: `gpio`, `socket`, `persist` can be empty stubs returning 0/NULL for now.

### 4. Dummy Runtime Loop
Create `src/runtime/main.c`.
- Include `zplc_hal.h`.
- In `main()`:
    1. Initialize any necessary systems.
    2. Enter a `while(1)` loop.
    3. Call `zplc_hal_tick()`.
    4. Call `zplc_hal_log("Tick at %d ms\n", time)`.
    5. Call `zplc_hal_sleep(100)`.

## Output Expectations
- Provide the full content of all created files.
- Run the build commands to verify:
  ```bash
  mkdir -p build && cd build
  cmake ..
  make
  ./zplc_runtime
  ```
- Show the output proving it works (prints "Tick" repeatedly).
