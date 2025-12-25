# Context for Agents & Contributors

This file provides context for AI agents and human contributors working on ZPLC.

## Project Identity

| Field | Value |
|-------|-------|
| **Name** | ZPLC (Zephyr PLC) |
| **Goal** | Create a robust, open-source industrial PLC runtime |
| **Primary Target** | Zephyr RTOS (500+ boards) |
| **Dev Platforms** | macOS, Linux, Windows (via POSIX HAL) |
| **Language** | ANSI C99 (strict compliance) |
| **Architecture** | Zephyr Module with POSIX fallback |

## Core Philosophy

1. **Strict ANSI C99**: The core (`src/core`) must compile with any standard C99 compiler. No GCC extensions, no stdlib dependencies that aren't abstractable.
2. **HAL Abstraction**: The core *never* touches hardware directly. All IO, Timing, and Persistence go through `zplc_hal.h`.
3. **Test-Driven**: Every feature must have a corresponding test case in `tests/`.
4. **Zephyr First**: The primary target is Zephyr RTOS. POSIX is for development/testing.
5. **No Feature Creep**: Stick to the [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md).

## Development Rules

### Code Style (C)
- **Indentation**: 4 spaces (no tabs)
- **Naming**: `snake_case` for functions/variables, `zplc_` prefix for public API
- **Constants**: `ZPLC_UPPER_CASE` for macros and constants
- **Comments**: Doxygen style `/** ... */` for public headers
- **Line Length**: 80 characters soft limit, 100 hard limit

### Directory Structure

```
ZPLC/
├── .github/                # GitHub Actions CI/CD workflows
├── apps/                   # Runtime applications (POSIX & Zephyr)
├── dts/                    # DeviceTree bindings for hardware mapping
├── ide/                    # Web-based IDE (React + TypeScript)
│   ├── src/compiler/       # ST Compiler & Transpilers
│   └── src/editors/        # LD, FBD, SFC Visual Editors
├── include/                # Public C headers (VM and HAL API)
├── src/                    # Implementation of VM Core and HALs
├── tests/                  # C unit tests for VM components
├── tools/                  # Python-based Assembler and utilities
├── zephyr/                 # Zephyr Module configuration files
├── examples/               # Assembly and ST example programs
├── TECHNICAL_SPEC.md       # Technical architecture specification
└── README.md               # Main project overview

```

## Key Documents

| Document | Purpose |
|----------|---------|
| [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md) | Complete architecture, binary format, and roadmap |
| [docs/ISA.md](docs/ISA.md) | Instruction Set Architecture specification |
| [zephyr/Kconfig](zephyr/Kconfig) | Zephyr configuration options |
| [include/zplc_isa.h](include/zplc_isa.h) | Binary format structures and opcodes |

---

## Build Workflows

### POSIX Build (Development)

Quick build for development and testing on your host machine:

```bash
cd /path/to/ZPLC
mkdir build_posix && cd build_posix
cmake .. -DZEPHYR_BUILD=OFF
make

# Run tests (79 assertions across 2 test suites)
ctest --output-on-failure

# Run the demo runtime
./zplc_runtime
```

**Expected output:**
```
================================================
  ZPLC Runtime - POSIX Host
  Core Version: 0.2.0
================================================
[HAL] POSIX HAL initialized.
Tick at 0 ms (cycle #0)
Tick at 100 ms (cycle #1)
...
```

---

### Zephyr Build (macOS Development Setup)

A complete Zephyr workspace is configured at `~/zephyrproject`.

#### Environment Activation

```bash
source ~/zephyrproject/activate.sh
```

This sets up:
- `ZEPHYR_BASE` pointing to Zephyr v4.0.0
- `ZEPHYR_SDK_INSTALL_DIR` pointing to SDK 0.17.0
- `ZEPLC_PATH` pointing to this repository
- `ZEPHYR_EXTRA_MODULES` for automatic module inclusion
- Python virtualenv with all dependencies

#### Build for QEMU (Cortex-M3 Emulator)

```bash
cd ~/zephyrproject
west build -b mps2/an385 $ZEPLC_PATH/apps/zephyr_app
```

#### Run in QEMU

```bash
# Via west
west build -t run

# Or manually (with Ctrl+A, X to exit)
cd build && qemu-system-arm -cpu cortex-m3 -machine mps2-an385 \
  -nographic -serial mon:stdio -kernel zephyr/zephyr.elf
```

**Expected output:**
```
*** Booting Zephyr OS build v4.0.0 ***
================================================
  ZPLC Runtime - Zephyr Target
  Core Version: 0.2.0
  Phase 0.5: Module Verification
================================================
[HAL] Zephyr HAL initializing...
[HAL] Zephyr HAL ready (Phase 0.5 stub)
[MAIN] Initialization complete.
[MAIN] Starting verification loop...

Tick 0 ms (cycle #0)
Tick 110 ms (cycle #1)
Tick 220 ms (cycle #2)
...
Tick 990 ms (cycle #9)

[MAIN] Verification complete: 10 cycles.
[MAIN] ZPLC module is working on Zephyr!
```

#### Build for Real Hardware

```bash
# Nordic nRF52840 DK
west build -b nrf52840dk/nrf52840 $ZEPLC_PATH/apps/zephyr_app
west flash

# STM32 Nucleo-F446RE
west build -b nucleo_f446re $ZEPLC_PATH/apps/zephyr_app
west flash

# ESP32 DevKit (requires espressif HAL)
west build -b esp32_devkitc_wroom $ZEPLC_PATH/apps/zephyr_app
west flash
```

#### Clean Build

```bash
cd ~/zephyrproject
rm -rf build
west build -b mps2/an385 $ZEPLC_PATH/apps/zephyr_app --pristine
```

---

## ZPLC Assembler Tool

The assembler (`tools/zplc_asm.py`) converts human-readable assembly into ZPLC bytecode. It supports labels, comments, and produces both raw bytecode and full `.zplc` files with headers.

### Quick Start

```bash
# Assemble a program
python3 tools/zplc_asm.py examples/02_addition.asm

# Show disassembly
python3 tools/zplc_asm.py examples/02_addition.asm --disasm

# Raw bytecode (no header)
python3 tools/zplc_asm.py examples/01_hello.asm --raw -o hello.bin

# Verbose mode
python3 tools/zplc_asm.py examples/04_loop.asm -v --disasm
```

### Assembly Syntax

```asm
; Comments start with semicolon
label_name:             ; Labels end with colon
    PUSH8   10          ; Instructions are case-insensitive
    LOAD16  0x1000      ; Hex addresses supported
    ADD                 ; Stack operations
    JZ      label_name  ; Jump to label
    HALT                ; End program
```

### Supported Instructions

| Category | Instructions |
|----------|--------------|
| System | `NOP`, `HALT`, `BREAK` |
| Stack | `DUP`, `DROP`, `SWAP`, `OVER`, `ROT` |
| Arithmetic | `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `NEG`, `ABS` |
| Float | `ADDF`, `SUBF`, `MULF`, `DIVF`, `NEGF`, `ABSF` |
| Logic | `AND`, `OR`, `XOR`, `NOT`, `SHL`, `SHR`, `SAR` |
| Compare | `EQ`, `NE`, `LT`, `LE`, `GT`, `GE`, `LTU`, `GTU` |
| Memory | `LOAD8/16/32`, `STORE8/16/32`, `PUSH8/16/32` |
| Control | `JMP`, `JZ`, `JNZ`, `JR`, `JRZ`, `JRNZ`, `CALL`, `RET` |
| Convert | `I2F`, `F2I`, `I2B`, `EXT8`, `EXT16`, `ZEXT8`, `ZEXT16` |

### Example Programs

| File | Description |
|------|-------------|
| `01_hello.asm` | Minimal program (NOP + HALT) |
| `02_addition.asm` | Load from IPI, add, store to OPI |
| `03_conditional.asm` | IF/ELSE using JZ |
| `04_loop.asm` | FOR loop with counter |
| `05_function_call.asm` | CALL/RET subroutines |
| `06_bitwise.asm` | AND/OR/XOR bit manipulation |
| `07_stack_ops.asm` | DUP/SWAP/OVER/ROT examples |
| `08_float_math.asm` | Celsius to Fahrenheit (I2F, MULF, DIVF, ADDF, F2I) |
| `09_type_conversions.asm` | EXT8/ZEXT8 sign/zero extension |
| `10_64bit_operations.asm` | LOAD64/STORE64 for counters |

---

### Development Environment Details

| Component | Location | Version |
|-----------|----------|---------|
| Zephyr Workspace | `~/zephyrproject` | - |
| Zephyr Base | `~/zephyrproject/zephyr` | v4.0.0 |
| Zephyr SDK | `~/zephyr-sdk-0.17.0` | 0.17.0 |
| Python venv | `~/zephyrproject/.venv` | Python 3.14 |
| ZPLC Source | `~/Documents/Repos/ZPLC` | - |
| ZPLC Symlink | `~/zephyrproject/modules/lib/zplc` | → Source |
| Activation Script | `~/zephyrproject/activate.sh` | - |

### Required Tools (macOS)

Installed via Homebrew:
```bash
brew install cmake ninja gperf python3 ccache qemu dtc wget xz
```

---

## Using ZPLC in External Projects

### Via West Manifest

Add to your `west.yml`:
```yaml
manifest:
  projects:
    - name: zplc
      url: https://github.com/your/zplc
      revision: main
      path: modules/lib/zplc
```

### Via ZEPHYR_EXTRA_MODULES

```bash
west build -b <board> <app> -- -DZEPHYR_EXTRA_MODULES=/path/to/zplc
```

### Application Configuration

In your `prj.conf`:
```ini
# Enable ZPLC
CONFIG_ZPLC=y

# Optional: Configure memory sizes
CONFIG_ZPLC_STACK_DEPTH=256
CONFIG_ZPLC_CALL_STACK_DEPTH=32
CONFIG_ZPLC_WORK_MEMORY_SIZE=8192
CONFIG_ZPLC_RETAIN_MEMORY_SIZE=4096
CONFIG_ZPLC_CODE_SIZE_MAX=45056

# Optional: Log level (0=OFF, 1=ERR, 2=WRN, 3=INF, 4=DBG)
CONFIG_ZPLC_LOG_LEVEL=3
```

---

## Phase Status (v1.0 Complete)

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | VM Core, ISA, and C99 Runtime |
| Phase 2 | ✅ Complete | Visual Editors (React) & ST Compiler (TS) |
| Phase 3 | ✅ Complete | Zephyr Integration & Serial Loader |
| Phase 4 | ✅ Complete | Simulation (WASM) & Debugging UI |
| Phase 5 | ✅ Complete | Polish & Release v1.0.0 |

---

## VM Architecture Summary

### Memory Map

| Region | Base Address | Size | Purpose |
|--------|--------------|------|---------|
| IPI (Input Process Image) | `0x0000` | 4 KB | Input snapshots from HAL |
| OPI (Output Process Image) | `0x1000` | 4 KB | Output buffer to HAL |
| Work Memory | `0x2000` | 8 KB | Temporary variables |
| Retentive Memory | `0x4000` | 4 KB | Persisted across power cycles |
| Code Segment | `0x5000` | 44 KB | Bytecode storage |

### Opcode Categories

| Range | Category | Examples |
|-------|----------|----------|
| `0x00-0x0F` | System | NOP, HALT, BREAK |
| `0x10-0x1F` | Stack | DUP, DROP, SWAP, OVER, ROT |
| `0x20-0x2F` | Arithmetic | ADD, SUB, MUL, DIV, ADDF, SUBF |
| `0x30-0x3F` | Logic/Compare | AND, OR, XOR, EQ, LT, GT |
| `0x40-0x5F` | 8-bit operand | PUSH8, JR, JRZ, JRNZ |
| `0x80-0x9F` | 16-bit operand | LOAD/STORE, JMP, CALL, RET |
| `0xA0-0xAF` | Conversion | I2F, F2I, EXT8, ZEXT16 |
| `0xC0-0xCF` | 32-bit operand | PUSH32 |

---

## HAL Interface Summary

The HAL (`zplc_hal.h`) defines 17 functions that must be implemented per platform:

| Category | Functions |
|----------|-----------|
| **Timing** | `zplc_hal_tick()`, `zplc_hal_sleep()` |
| **GPIO** | `zplc_hal_gpio_read()`, `zplc_hal_gpio_write()` |
| **Analog** | `zplc_hal_adc_read()`, `zplc_hal_dac_write()` |
| **Persistence** | `zplc_hal_persist_save()`, `zplc_hal_persist_load()` |
| **Network** | `zplc_hal_socket_*()` (4 functions) |
| **Logging** | `zplc_hal_log()` |
| **Lifecycle** | `zplc_hal_init()`, `zplc_hal_shutdown()` |

### Implementation Status

| HAL | Timing | GPIO | Analog | Persist | Network |
|-----|--------|------|--------|---------|---------|
| POSIX | ✅ | Stub | Stub | Stub | Stub |
| Zephyr | ✅ | TODO | TODO | TODO | TODO |
| WASM | - | - | - | - | - |

---

## Troubleshooting

### "POSIX architecture only works on Linux"

On macOS, use QEMU targets instead of `native_sim`:
```bash
west build -b mps2/an385 ...  # Instead of -b native_sim
```

### "RAM overflowed by X bytes"

The target board has insufficient RAM. Solutions:
1. Use a board with more RAM (e.g., `mps2/an385` has 4MB)
2. Reduce ZPLC memory sizes in `prj.conf`:
   ```ini
   CONFIG_ZPLC_WORK_MEMORY_SIZE=4096
   CONFIG_ZPLC_RETAIN_MEMORY_SIZE=2048
   ```

### "module.yml cmake key error"

Ensure `zephyr/module.yml` has correct paths:
```yaml
name: zplc
build:
  cmake: zephyr
  kconfig: zephyr/Kconfig
  settings:
    dts_root: .
```

### IDE shows "file not found" errors

These are Language Server errors due to missing include paths. The actual build works correctly. Configure your IDE's include paths to include the `include/` directory.

---

## Next Steps (Version 1.1)

1. **Modbus Implementation**
   - Implement `zplc_modbus_server` in `src/comms/`.
   - Add HAL socket abstractions to `zplc_hal_zephyr.c`.

2. **Retentive Memory (NVS)**
   - Wire `zplc_hal_persist_*` to Zephyr's NVS or Settings subsystem.

3. **MQTT Integration**
   - Use Zephyr's MQTT client to sync variables with an IIoT broker.

4. **IDE Enhancements**
   - Implement online-editing (partial code updates).
   - Add a logic analyzer view for variable tracing.

---

## Session Continuation Prompt

When continuing development in a new session, use this context:

```
Continue developing ZPLC - the Zephyr-first PLC runtime.

COMPLETED:
- Phase 0: Build system, POSIX HAL
- Phase 0.5: Zephyr module integration
- Phase 1: VM core with 62 opcodes, 79 passing tests

DEVELOPMENT ENVIRONMENT:
- Zephyr workspace: ~/zephyrproject (v4.0.0)
- Zephyr SDK: ~/zephyr-sdk-0.17.0
- ZPLC source: ~/Documents/Repos/ZPLC
- Activation: source ~/zephyrproject/activate.sh

QUICK BUILD COMMANDS:
  POSIX: cd build_posix && make && ctest
  Zephyr: west build -b mps2/an385 $ZEPLC_PATH/apps/zephyr_app
  Run QEMU: west build -t run

KEY FILES:
- src/hal/zephyr/zplc_hal_zephyr.c (Zephyr HAL, TODOs for Phase 3)
- zephyr/Kconfig (configuration options)
- include/zplc_isa.h (62 opcodes defined)
- TECHNICAL_SPEC.md (full specification)

What would you like to work on?
```
