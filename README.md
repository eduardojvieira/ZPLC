# ZPLC (Zephyr PLC)

**One Execution Core, Any Runtime.**

ZPLC is a portable, deterministic PLC runtime environment powered by [Zephyr RTOS](https://zephyrproject.org/) for embedded targets and native OS layers for desktop/server hosting. It brings modern software development practices to industrial automation.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Zephyr 4.0](https://img.shields.io/badge/Zephyr-4.0.0-blue.svg)](https://zephyrproject.org/)
[![C99](https://img.shields.io/badge/C-C99-green.svg)](https://en.wikipedia.org/wiki/C99)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

[![Website](https://img.shields.io/badge/Website-Live-brightgreen)](https://eduardojvieira.github.io/ZPLC/)

## Features

- **Portable Core**: ANSI C99 compliant core, running on 500+ microcontrollers (via Zephyr), Linux, macOS, Windows, and WebAssembly.
- **Cross-Platform Desktop App**: Electron-based IDE for Windows, macOS, and Linux with native serial support.
- **Visual IDE**: Powerful editor for Ladder Diagrams (LD), Function Block Diagrams (FBD), and Sequential Function Charts (SFC).
- **Unified Architecture**: Hardware-agnostic `.zplc` bytecode allows you to "compile once, run anywhere."
- **IEC 61131-3 Support**: First-class support for Structured Text (ST) with 45+ standard functions and 22 function blocks.
- **Industrial Grade**: Deterministic execution, retentive memory, multitask scheduling, and sub-millisecond jitter on RTOS targets.
- **Advanced Debugging**: Breakpoints, step execution, variable watch, and real-time memory inspection.
- **Modern Tooling**: TypeScript compiler, WebAssembly simulation, and comprehensive test suite.

## Current Status: v1.4.x (Released)

| Version | Status | Description |
|---------|--------|-------------|
| Phase 1 | Complete | VM Core (75 opcodes) & ISA Definition |
| Phase 2 | Complete | Visual IDE (LD, FBD, SFC) & ST Compiler |
| Phase 3 | Complete | Hardware Integration (Zephyr Serial Loader) |
| Phase 4 | Complete | Debugging & Simulation (WASM + Hardware) |
| Phase 5 | Complete | Final Polish & Release v1.0.0 |
| **v1.1** | Complete | Multitask Scheduler + NVS Persistence |
| **v1.2** | Complete | STRING Type + Indirect Memory + Standard Library |
| **v1.3** | Complete | Advanced Debugging + Professional IDE |
| **v1.4** | Complete | **Cross-Platform Desktop App (Electron)** |

---

## Quick Start

### Option 1: Desktop App (Recommended)

Download the pre-built desktop application for your platform:

```bash
bun install
cd packages/zplc-ide
bun run electron:dev    # Development mode
bun run electron:build  # Build distributable
```

### Option 2: Web IDE (Development)

Run the IDE in your browser:

```bash
bun install
cd packages/zplc-ide
bun run dev
# Open http://localhost:5173
```

### Option 3: POSIX Build (Core Development)

Build and test the C runtime on your host machine:

```bash
# Clone the repository
git clone https://github.com/eduardojvieira/ZPLC.git
cd ZPLC/firmware/lib/zplc_core

# Build
mkdir build && cd build
cmake ..
make

# Run tests
ctest --output-on-failure

# Run the demo runtime
./zplc_runtime
```

### Option 4: Zephyr Build (Embedded Hardware)

Run on real hardware or the QEMU emulator:

```bash
# Activate Zephyr environment
source ~/zephyrproject/activate.sh

# Build for QEMU Cortex-M3 emulator
cd ~/zephyrproject
west build -b mps2/an385 $ZEPLC_PATH/firmware/app --pristine

# Run in QEMU
west build -t run

# Or build for Raspberry Pi Pico
west build -b rpi_pico $ZEPLC_PATH/firmware/app --pristine
cp build/zephyr/zephyr.uf2 /Volumes/RPI-RP2/
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Development Host (IDE)                    │
│  ┌─────────┐    ┌──────────┐    ┌────────┐    ┌──────────┐ │
│  │ ST/LD/  │───▶│ Compiler │───▶│ Linker │───▶│  .zplc   │ │
│  │ FBD/SFC │    │          │    │        │    │ bytecode │ │
│  └─────────┘    └──────────┘    └────────┘    └────┬─────┘ │
└────────────────────────────────────────────────────│───────┘
                                                     │ Deploy
┌────────────────────────────────────────────────────▼───────┐
│                    Target Runtime                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    ZPLC Core (C99)                    │  │
│  │  ┌──────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │ Loader   │  │ VM (75 ops) │  │ Process Image   │  │  │
│  │  └──────────┘  └─────────────┘  └─────────────────┘  │  │
│  └──────────────────────────┬───────────────────────────┘  │
│                             │ HAL Interface                 │
│  ┌──────────────────────────▼───────────────────────────┐  │
│  │ ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │  │
│  │ │  Zephyr  │  │  POSIX   │  │ Windows  │  │  WASM  │ │  │
│  │ │   HAL    │  │   HAL    │  │   HAL    │  │  HAL   │ │  │
│  │ └──────────┘  └──────────┘  └──────────┘  └────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Standard Library

ZPLC includes a comprehensive IEC 61131-3 standard library:

### Functions (45+)

| Category | Functions |
|----------|-----------|
| **Math** | ABS, SQRT, LN, LOG, EXP, SIN, COS, TAN, ASIN, ACOS, ATAN, EXPT |
| **Arithmetic** | ADD, SUB, MUL, DIV, MOD, MIN, MAX, LIMIT, SEL, MUX |
| **Bitwise** | AND, OR, XOR, NOT, SHL, SHR, ROL, ROR |
| **Comparison** | EQ, NE, LT, LE, GT, GE |
| **Type Conversion** | INT_TO_REAL, REAL_TO_INT, BOOL_TO_INT, etc. |
| **String** | LEN, CONCAT, LEFT, RIGHT, MID, FIND, INSERT, DELETE, REPLACE |

### Function Blocks (22)

| Category | Blocks |
|----------|--------|
| **Timers** | TON, TOF, TP, TONR |
| **Counters** | CTU, CTD, CTUD |
| **Edge Detection** | R_TRIG, F_TRIG |
| **Bistables** | SR, RS |

---

## Supported Platforms

### Embedded (Zephyr RTOS)
ZPLC is a Zephyr Module, supporting 500+ boards including:
- **Raspberry Pi**: Pico (RP2040)
- **STMicroelectronics**: STM32F4, STM32L4, STM32H7, Nucleo boards
- **Arduino**: Giga R1 (STM32H747)
- **Espressif**: ESP32, ESP32-S2, ESP32-S3, ESP32-C3
- **Nordic**: nRF52840, nRF5340, nRF9160
- **NXP**: i.MX RT, LPC, Kinetis

### Desktop & Development
- **Desktop App**: Windows, macOS, Linux (Electron)
- **POSIX**: Linux/macOS for development and unit testing
- **QEMU**: Cortex-M3 emulation for CI/CD pipelines
- **WASM**: Browser-based simulation

---

## Project Structure

```
ZPLC/
├── firmware/                      # Standalone Zephyr project
│   ├── app/                       # Zephyr application (main target)
│   │   ├── src/main.c
│   │   ├── src/shell_cmds.c
│   │   ├── boards/                # Board overlays & configs
│   │   └── prj.conf
│   ├── apps/posix_host/           # POSIX development runtime
│   ├── lib/zplc_core/             # Core library (C99)
│   │   ├── include/               # Public headers
│   │   ├── src/core/              # VM implementation
│   │   ├── src/hal/               # HAL implementations
│   │   └── tests/                 # C unit tests
│   ├── CMakeLists.txt             # Zephyr module CMake
│   ├── Kconfig                    # Zephyr Kconfig
│   └── module.yml                 # Zephyr module definition
├── packages/                      # Monorepo packages
│   ├── zplc-compiler/             # ST Compiler & Code Generator
│   ├── zplc-ide/                  # Desktop & Web IDE (React + Electron)
│   └── ...
├── docs/                          # Documentation (Docusaurus)
├── AGENTS.md                      # AI agent & contributor guide
└── TECHNICAL_SPEC.md              # Full technical specification
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md) | Complete architecture, binary format, and roadmap |
| [AGENTS.md](AGENTS.md) | Context for AI agents and contributors |
| [docs/](docs/) | Full documentation site (Docusaurus) |

---

## Using ZPLC in Your Zephyr Project

### Via West Manifest

Add to your `west.yml`:

```yaml
manifest:
  projects:
    - name: zplc
      url: https://github.com/eduardojvieira/ZPLC
      revision: main
      path: modules/lib/zplc
      import:
        path-prefix: firmware
```

### Via ZEPHYR_EXTRA_MODULES

```bash
west build -b <board> <app> -- -DZEPHYR_EXTRA_MODULES=/path/to/zplc/firmware
```

### Application Configuration

In your `prj.conf`:

```ini
CONFIG_ZPLC=y
CONFIG_ZPLC_STACK_DEPTH=256
CONFIG_ZPLC_WORK_MEMORY_SIZE=8192
CONFIG_ZPLC_SCHEDULER=y
CONFIG_ZPLC_MAX_TASKS=4
```

---

## Key Features

### Visual IDE
- **Ladder Diagram (LD)**: Interactive editor with nested branches and real-time animation
- **Function Block Diagram (FBD)**: Modular logic design with standard IEC blocks
- **Sequential Function Chart (SFC)**: Visual state machine design
- **Structured Text (ST)**: Full compiler with syntax highlighting and error reporting

### Simulation & Debugging
- **WebAssembly Simulation**: Run PLC logic in browser, no hardware required
- **Hardware Debugging**: Serial connection for real-time variable inspection
- **Breakpoints**: Pause execution at specific lines
- **Step Execution**: Execute one cycle at a time
- **Watch Window**: Monitor variables in real-time

### Hardware Integration
- **Serial Uploader**: One-click upload to Zephyr boards
- **NVS Persistence**: Programs survive power cycles
- **Multitask Scheduling**: Priority-based concurrent task execution
- **Deterministic Execution**: Fixed cycle times for critical control

---

## Contributing

See [AGENTS.md](AGENTS.md) for detailed contribution guidelines, coding standards, and development workflows.

### Quick Commands

```bash
# C Runtime (from firmware/lib/zplc_core/build)
cmake .. && make && ctest --output-on-failure

# TypeScript (Monorepo)
bun install
bun test

# Single test file (Compiler)
cd packages/zplc-compiler
bun test compiler.test.ts
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Zephyr Project](https://zephyrproject.org/) - The RTOS that makes this possible
- [React Flow](https://reactflow.dev/) - Powering our visual editors
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editing experience
- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
- [Emscripten](https://emscripten.org/) - WebAssembly compilation
- [IEC 61131-3](https://en.wikipedia.org/wiki/IEC_61131-3) - The standard we implement
