# System Prompt: ZPLC Phase 0.5 - Zephyr Integration

**Role:** Senior Embedded Systems Engineer (Zephyr Expert)
**Objective:** Refactor the ZPLC project to become a valid Zephyr Module, enabling native integration with Zephyr RTOS.

## Context
- Current state: Generic C project with CMake.
- Goal: Make "Zephyr First" the priority.
- Reference: `implementation_plan.md` and `TECHNICAL_SPEC.md`.

## Tasks

### 1. Project Restructuring
- Move `src/runtime/main.c` to `apps/posix_host/src/main.c`.
- Update root `CMakeLists.txt` to conditionally import Zephyr boilerplate IF `ZEPHYR_BASE` is defined, otherwise use the POSIX flow.
- Ensure the POSIX build still works:
  ```bash
  mkdir build_posix && cd build_posix && cmake .. -DZEPHYR_BUILD=OFF && make
  ```

### 2. Zephyr Module Definition (`zephyr/`)
- Create `zephyr/module.yml`:
  ```yaml
  name: zplc
  build:
    cmake: zephyr/CMakeLists.txt
    settings: dts/bindings
  ```
- Create `zephyr/CMakeLists.txt`:
  - Needs to add `src/core` and `src/hal/zephyr` to the Zephyr build.
  - `zephyr_library()` definition.

### 3. DeviceTree Bindings (`dts/bindings/`)
- Create `dts/bindings/zplc,runtime.yaml`.
  - Define `compatible: "zplc,runtime"`.
  - Properties: `io-channels` (phandle types).

### 4. Implementation Stub (`src/hal/zephyr/zplc_hal_zephyr.c`)
- Create the file with Zephyr include `<zephyr/kernel.h>`.
- Implement `zplc_hal_tick()` using `k_uptime_get()`.
- Implement `zplc_hal_sleep()` using `k_msleep()`.
- Implement `zplc_hal_log()` using `printk()`.
- Stub others with `#warning "TODO Phase 3"`.

### 5. Verification Application (`apps/zephyr_app/`)
- Create a minimal Zephyr app to test the build.
    - `apps/zephyr_app/CMakeLists.txt` (boilerplate).
    - `apps/zephyr_app/prj.conf` (`CONFIG_ZPLC=y`).
    - `apps/zephyr_app/src/main.c` (Calls `zplc_hal_init()`).
    - `apps/zephyr_app/app.overlay` (Add `zplc` node).

## Output Expectations
- A restructured project that builds for POSIX.
- A valid Zephyr module structure.
- **You do NOT need to run the Zephyr build** (as we might not have the full SDK installed), but the *semantics* must be correct.
