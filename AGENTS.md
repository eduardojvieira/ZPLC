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
| **Current Version** | v1.1.0 (Multitask + Persistence) |

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
├── apps/                   # Runtime applications (POSIX & Zephyr)
│   ├── posix_host/         # Desktop development build
│   └── zephyr_app/         # Zephyr application with shell
├── ide/                    # Web-based IDE (React + TypeScript)
│   ├── src/compiler/       # ST Compiler & Transpilers
│   ├── src/editors/        # LD, FBD, SFC Visual Editors
│   ├── src/assembler/      # Bytecode assembler with relocation
│   └── projects/           # Example projects (blinky, multitask)
├── include/                # Public C headers (VM and HAL API)
│   ├── zplc_core.h         # VM Core API
│   ├── zplc_hal.h          # Hardware Abstraction Layer
│   ├── zplc_isa.h          # Instruction Set Architecture
│   └── zplc_scheduler.h    # Multitask Scheduler API
├── src/                    # Implementation
│   ├── core/               # VM Core (C99, portable)
│   └── hal/                # HAL implementations (posix, zephyr, wasm)
├── tests/                  # C unit tests for VM components
├── tools/                  # Python-based Assembler and utilities
├── zephyr/                 # Zephyr Module configuration files
├── examples/               # Assembly and ST example programs
├── prompts/                # Development session prompts
├── TECHNICAL_SPEC.md       # Technical architecture specification
└── README.md               # Main project overview
```

## Key Documents

| Document | Purpose |
|----------|---------|
| [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md) | Complete architecture, binary format, and roadmap |
| [docs/docs/runtime/isa.md](docs/docs/runtime/isa.md) | Instruction Set Architecture specification |
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

# Run tests (105+ assertions across test suites)
ctest --output-on-failure

# Run the demo runtime
./zplc_runtime
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
west build -t run
```

#### Build for Real Hardware

```bash
# Raspberry Pi Pico (RP2040)
west build -b rpi_pico $ZEPLC_PATH/apps/zephyr_app --pristine
# Flash via BOOTSEL: cp build/zephyr/zephyr.uf2 /Volumes/RPI-RP2/

# STM32 Nucleo-H743ZI
west build -b nucleo_h743zi $ZEPLC_PATH/apps/zephyr_app
west flash

# Arduino Giga R1 (STM32H747)
west build -b arduino_giga_r1/stm32h747xx/m7 $ZEPLC_PATH/apps/zephyr_app
west flash

# ESP32-S3 DevKit
west build -b esp32s3_devkitc $ZEPLC_PATH/apps/zephyr_app
west flash
```

---

## Serial Shell Commands

Once the Zephyr app is running, connect via serial (115200 baud) and use:

### Program Management
```bash
zplc load <size>      # Prepare to receive <size> bytes
zplc data <hex>       # Send hex-encoded bytecode chunk (64 chars max)
zplc start            # Start execution (auto-saves to Flash)
zplc stop             # Stop execution
zplc status           # Show VM/scheduler state
zplc reset            # Reset VM to initial state
```

### Persistence (NVS)
```bash
zplc persist info     # Show saved program info
zplc persist clear    # Erase saved program from Flash
```

### Debugging
```bash
zplc dbg pause        # Pause at next cycle
zplc dbg resume       # Resume execution
zplc dbg step         # Execute one cycle
zplc dbg peek <addr>  # Read memory (hex dump)
zplc dbg poke <addr> <val>  # Write byte to IPI
zplc dbg info         # Detailed VM state
```

### Scheduler (Multitask)
```bash
zplc sched status     # Scheduler statistics
zplc sched tasks      # List all registered tasks
```

---

## Program Persistence (NVS)

ZPLC programs are automatically saved to Flash and restored on boot.

### How It Works

1. **On Upload**: When you run `zplc start`, the program is saved to NVS
2. **On Boot**: The runtime checks NVS and auto-loads any saved program
3. **Storage**: Uses Zephyr NVS with a dedicated `storage_partition`

### Configuration Requirements

In `prj.conf`:
```ini
CONFIG_FLASH=y
CONFIG_FLASH_PAGE_LAYOUT=y
CONFIG_FLASH_MAP=y
CONFIG_NVS=y
```

In board overlay (e.g., `rpi_pico_rp2040.overlay`):
```dts
&flash0 {
    partitions {
        compatible = "fixed-partitions";
        #address-cells = <1>;
        #size-cells = <1>;

        storage_partition: partition@1f0000 {
            label = "storage";
            reg = <0x1f0000 0x10000>;  /* 64KB at end of flash */
        };
    };
};
```

### HAL API

```c
// Save data to NVS
zplc_hal_result_t zplc_hal_persist_save(const char *key, const void *data, size_t len);

// Load data from NVS  
zplc_hal_result_t zplc_hal_persist_load(const char *key, void *data, size_t len);

// Delete key from NVS
zplc_hal_result_t zplc_hal_persist_delete(const char *key);
```

Keys used:
- `"code_len"` - Program length (4 bytes)
- `"code"` - Program bytecode (up to 4KB)
- `"retain"` - Retentive memory (future)

---

## Multitask Scheduler

The scheduler supports multiple concurrent tasks with different intervals.

### Task Definition (in .zplc header)

```c
typedef struct {
    uint8_t  id;           // Unique task ID
    uint8_t  type;         // 0=CYCLIC, 1=EVENT
    uint8_t  priority;     // 0=highest, 255=lowest
    uint8_t  reserved;
    uint32_t interval_us;  // Cycle time in microseconds
    uint32_t entry_point;  // Bytecode offset
    uint32_t stack_size;   // Per-task stack (words)
} zplc_task_def_t;
```

### Configuration

In `prj.conf`:
```ini
CONFIG_ZPLC_SCHEDULER=y
CONFIG_ZPLC_MAX_TASKS=4
CONFIG_ZPLC_SCHED_WORKQ_STACK_SIZE=2048
CONFIG_ZPLC_SCHED_WORKQ_PRIORITY=5
```

### Example: Two-Task Program

```
Task 0: FastCounter (10ms interval, priority 0)
Task 1: SlowBlink (100ms interval, priority 2)
```

Each task has isolated work memory but shares IPI/OPI for I/O.

---

## IDE Compiler Workflow

### Compiling a Project

```bash
cd ide
bun run test_multitask.ts   # Compile multitask_demo project
bun run test_pico_persist.ts  # Compile pico_persist_test project
```

### Project Structure (`zplc.json`)

```json
{
  "name": "My Project",
  "version": "1.0.0",
  "target": "rpi_pico",
  "tasks": [
    {
      "name": "MainTask",
      "file": "main.st",
      "type": "CYCLIC",
      "interval_ms": 100,
      "priority": 1
    }
  ]
}
```

### Uploading via Serial

```python
# Using pyserial
import serial
ser = serial.Serial('/dev/cu.usbmodem11401', 115200)

# 1. Load
ser.write(b'zplc load 167\r\n')

# 2. Send data in 64-char chunks
hex_data = "5a504c43..."
for i in range(0, len(hex_data), 64):
    ser.write(f'zplc data {hex_data[i:i+64]}\r\n'.encode())
    time.sleep(0.3)

# 3. Start
ser.write(b'zplc start\r\n')
```

---

## HAL Interface Summary

The HAL (`zplc_hal.h`) defines the contract between core and platform:

| Category | Functions |
|----------|-----------|
| **Timing** | `zplc_hal_tick()`, `zplc_hal_sleep()` |
| **GPIO** | `zplc_hal_gpio_read()`, `zplc_hal_gpio_write()` |
| **Analog** | `zplc_hal_adc_read()`, `zplc_hal_dac_write()` |
| **Persistence** | `zplc_hal_persist_save()`, `zplc_hal_persist_load()`, `zplc_hal_persist_delete()` |
| **Network** | `zplc_hal_socket_*()` (4 functions) |
| **Logging** | `zplc_hal_log()` |
| **Lifecycle** | `zplc_hal_init()`, `zplc_hal_shutdown()` |

### Implementation Status

| HAL | Timing | GPIO | Analog | Persist | Network |
|-----|--------|------|--------|---------|---------|
| POSIX | ✅ | Stub | Stub | ✅ (file) | Stub |
| Zephyr | ✅ | ✅ | Stub | ✅ (NVS) | Stub |
| WASM | ✅ | ✅ | Stub | Stub | Stub |

---

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | VM Core, ISA, and C99 Runtime |
| Phase 2 | ✅ Complete | Visual Editors (React) & ST Compiler (TS) |
| Phase 3 | ✅ Complete | Zephyr Integration & Serial Loader |
| Phase 4 | ✅ Complete | Simulation (WASM) & Debugging UI |
| Phase 5 | ✅ Complete | Polish & Release v1.0.0 |
| **v1.1** | ✅ Complete | **Multitask Scheduler + NVS Persistence** |

---

## VM Architecture Summary

### Memory Map

| Region | Base Address | Size | Purpose |
|--------|--------------|------|---------|
| IPI (Input Process Image) | `0x0000` | 4 KB | Input snapshots from HAL |
| OPI (Output Process Image) | `0x1000` | 4 KB | Output buffer to HAL |
| Work Memory | `0x2000` | 8 KB | Per-task temporary variables |
| Retentive Memory | `0x4000` | 4 KB | Persisted across power cycles |
| Code Segment | `0x5000` | 44 KB | Bytecode storage |

### Opcode Categories (63 total)

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

## Troubleshooting

### "POSIX architecture only works on Linux"

On macOS, use QEMU targets instead of `native_sim`:
```bash
west build -b mps2/an385 ...  # Instead of -b native_sim
```

### "RAM overflowed by X bytes"

Reduce ZPLC memory sizes in `prj.conf`:
```ini
CONFIG_ZPLC_WORK_MEMORY_SIZE=4096
CONFIG_ZPLC_RETAIN_MEMORY_SIZE=2048
```

### "RX ring buffer full" during upload

Send hex data in smaller chunks (64 chars) with delays:
```python
for i in range(0, len(hex_data), 64):
    ser.write(f'zplc data {hex_data[i:i+64]}\r\n'.encode())
    time.sleep(0.3)  # Wait between chunks
```

### "No saved program in Flash"

Ensure the board overlay defines a `storage_partition` and NVS is enabled.

### IDE Language Server errors

These are false positives - the Zephyr build system provides headers. Ignore them.

---

## Development Environment Details

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

```bash
brew install cmake ninja gperf python3 ccache qemu dtc wget xz
```

---

## Next Steps (v1.2 Roadmap)

1. **Modbus TCP/RTU**
   - Implement `zplc_modbus_server` in `src/comms/`
   - Add HAL socket abstractions

2. **MQTT Integration**
   - Sparkplug B compliant client
   - Publish-on-change for tagged variables

3. **Retentive Variables**
   - Persist RETAIN memory region to NVS
   - Auto-restore on boot

4. **IDE Enhancements**
   - Online-editing (partial code updates)
   - Logic analyzer view for variable tracing

---

## Session Continuation Prompt

When continuing development in a new session, use this context:

```
Continue developing ZPLC - the Zephyr-first PLC runtime.

COMPLETED (v1.1):
- VM Core with 63 opcodes, 105+ passing tests
- Multitask scheduler with priority-based execution
- NVS persistence (programs survive power cycles)
- Serial loader with chunked upload
- Visual IDE with LD/FBD/SFC editors

DEVELOPMENT ENVIRONMENT:
- Zephyr workspace: ~/zephyrproject (v4.0.0)
- Zephyr SDK: ~/zephyr-sdk-0.17.0
- ZPLC source: ~/Documents/Repos/ZPLC
- Activation: source ~/zephyrproject/activate.sh

QUICK BUILD COMMANDS:
  POSIX: cd build_posix && make && ctest
  Pico: west build -b rpi_pico $ZEPLC_PATH/apps/zephyr_app --pristine
  Flash: cp build/zephyr/zephyr.uf2 /Volumes/RPI-RP2/

KEY FILES:
- src/hal/zephyr/zplc_hal_zephyr.c (NVS persistence)
- src/hal/zephyr/zplc_scheduler_zephyr.c (multitask)
- apps/zephyr_app/src/shell_cmds.c (serial commands)
- ide/src/compiler/index.ts (ST compiler)

What would you like to work on?
```
