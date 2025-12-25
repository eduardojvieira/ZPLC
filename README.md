# ZPLC (Zephyr PLC)

**One Execution Core, Any Runtime.**

ZPLC is a portable, deterministic PLC runtime environment powered by [Zephyr RTOS](https://zephyrproject.org/) for embedded targets and native OS layers for desktop/server hosting. It brings modern software development practices to industrial automation.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Zephyr 4.0](https://img.shields.io/badge/Zephyr-4.0.0-blue.svg)](https://zephyrproject.org/)
[![C99](https://img.shields.io/badge/C-C99-green.svg)](https://en.wikipedia.org/wiki/C99)

## Features

- **Portable Core**: ANSI C99 compliant core, running on 500+ microcontrollers (via Zephyr), Linux, Windows, and WebAssembly.
- **Visual IDE**: Powerful web-based editor for Ladder Diagrams (LD), Function Block Diagrams (FBD), and Sequential Function Charts (SFC).
- **Unified Architecture**: Hardware-agnostic `.zplc` bytecode allows you to "compile once, run anywhere."
- **IEC 61131-3 Support**: First-class support for Structured Text (ST) and visual logic languages.
- **Industrial Grade**: Deterministic execution, retentive memory support, and sub-millisecond jitter on RTOS targets.
- **Modern Tooling**: TS-based compiler, Python assembler, and built-in unit testing framework.

## Current Status: v1.0.0 (Released) 🚀

ZPLC has reached its first major milestone. All core development phases are complete, providing a functional end-to-end PLC ecosystem.

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0 | ✅ Complete | Build System & HAL Abstraction |
| Phase 1 | ✅ Complete | VM Core (62 opcodes) & ISA Definition |
| Phase 2 | ✅ Complete | Visual IDE (LD, FBD, SFC) & ST Compiler |
| Phase 3 | ✅ Complete | Hardware Integration (Zephyr Serial Loader) |
| Phase 4 | ✅ Complete | Debugging & Simulation (WASM + HW) |
| Phase 5 | ✅ Complete | Final Polish & Release v1.0.0 |

---

## 🚀 Roadmap (v1.1+)

The focus for the next version is expanding industrial connectivity and persistence.

- [ ] **Modbus TCP/RTU**: Native support for industrial fieldbus.
- [ ] **MQTT Integration**: First-class support for IIoT/Cloud connectivity.
- [ ] **Retentive Memory**: Support for flash-backed variables across power cycles.
- [ ] **Distributed Control**: Peer-to-peer PLC communication.
- [ ] **OPC UA Server**: Enterprise-level interoperability.



## Quick Start

### Option 1: POSIX Build (Development/Testing)

Build and test the core on your host machine:

```bash
# Clone the repository
git clone https://github.com/your/zplc.git
cd zplc

# Build
mkdir build_posix && cd build_posix
cmake .. -DZEPHYR_BUILD=OFF
make

# Run tests (109 assertions across 2 test suites)
ctest --output-on-failure

# Run the demo runtime
./zplc_runtime
```

### Option 2: Zephyr Build (Embedded/QEMU)

Run on real hardware or the QEMU emulator:

```bash
# Activate Zephyr environment (see Setup section below)
source ~/zephyrproject/activate.sh

# Build for QEMU Cortex-M3 emulator
cd ~/zephyrproject
west build -b mps2/an385 $ZEPLC_PATH/apps/zephyr_app

# Run in QEMU
west build -t run
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
...
Tick 990 ms (cycle #9)

[MAIN] Verification complete: 10 cycles.
[MAIN] ZPLC module is working on Zephyr!
```

## Documentation

| Document | Description |
|----------|-------------|
| [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md) | Complete architecture, binary format, and roadmap |
| [AGENTS.md](AGENTS.md) | Context for AI agents and contributors |
| [docs/ISA.md](docs/ISA.md) | Instruction Set Architecture specification |

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
│  │  │ Loader   │  │ VM (62 ops) │  │ Process Image   │  │  │
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

## Supported Platforms

### Primary Target: Zephyr RTOS
ZPLC is a Zephyr Module, supporting 500+ boards including:
- **Nordic**: nRF52840, nRF5340, nRF9160
- **STMicroelectronics**: STM32F4, STM32L4, STM32H7
- **Espressif**: ESP32, ESP32-S2, ESP32-C3
- **NXP**: i.MX RT, LPC, Kinetis
- **And many more...**

### Development Targets
- **POSIX** (Linux/macOS): For development and unit testing
- **QEMU**: Cortex-M3 emulation for CI/CD pipelines
- **WASM**: Browser-based simulation (fully supported in IDE)

## Project Structure

```
ZPLC/
├── apps/                       # Application targets (POSIX & Zephyr)
├── dts/bindings/               # DeviceTree bindings for Zephyr
├── ide/                        # Web-based IDE (React + TypeScript)
│   ├── src/compiler/           # ST Compiler & Transpilers
│   └── src/editors/            # LD, FBD, SFC Visual Editors
├── include/                    # Public C headers (VM API & ISA)
├── src/                        # VM Core and HAL implementations
├── tests/                      # Unit tests (109 assertions)
├── tools/                      # CLI tools (Python Assembler)
├── zephyr/                     # Zephyr module definition files
├── CMakeLists.txt              # Root build configuration
├── TECHNICAL_SPEC.md           # Full technical specification
└── AGENTS.md                   # Contributor guide

```

## Using ZPLC in Your Zephyr Project

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
CONFIG_ZPLC=y
CONFIG_ZPLC_STACK_DEPTH=256
CONFIG_ZPLC_WORK_MEMORY_SIZE=8192
```

## Contributing

See [AGENTS.md](AGENTS.md) for detailed contribution guidelines, coding standards, and development workflows.

### Key Features in Detail

### Visual IDE
The ZPLC IDE is a modern, web-browser-based environment for programming PLCs.
- **Ladder Diagram (LD)**: Interactive editor with support for nested branches and real-time animation.
- **Function Block Diagram (FBD)**: Modular logic design with standard IEC 61131-3 blocks.
- **Sequential Function Chart (SFC)**: Visual state machine design for complex process control.
- **Structured Text (ST)**: High-level language with a robust compiler and standard library.

### Simulation & Debugging
- **Local Simulation**: Run your PLC logic directly in the browser using WebAssembly. No hardware required for testing.
- **Hardware Debugging**: Connect to a running PLC over serial to watch variables and inspect the VM state in real-time.
- **Visual Watch**: Active wires and steps are highlighted in the editors during execution.

### Hardware Integration
- **WebSerial Uploader**: One-click upload from the browser to your Zephyr-enabled board.
- **Deterministic Execution**: The runtime ensures fixed cycle times (e.g., 100ms) for critical control tasks.

## Quick Start (IDE)

1.  **Open the IDE**:
    ```bash
    cd ide
    bun install
    bun run dev
    ```
2.  **Create a New Program**: Use the sidebar to add an `LD` or `FBD` file.
3.  **Simulate**: Click the **Simulate** button in the top toolbar to run the logic in your browser.
4.  **Connect Hardware**: Plug in your Zephyr board, click **Connect**, select the serial port, and then **Upload**.

## Quick Start (Runtime)

To build the runtime for your board:
1.  **Environment**: Ensure you have the [Zephyr SDK](https://docs.zephyrproject.org/latest/develop/getting_started/index.html) installed.
2.  **Compile**:
    ```bash
    cd apps/zephyr_app
    west build -b <your_board_alias>
    west flash
    ```

## Key Principles

1.  **Strict ANSI C99**: No GCC extensions in core code to ensure maximum portability.
2.  **HAL Abstraction**: The VM core never touches hardware directly, enabling simulation on any platform.
3.  **Test-Driven**: Every instruction and feature is backed by C unit tests.
4.  **IEC 61131-3 Compliance**: Aiming for full compatibility with international PLC standards.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Zephyr Project](https://zephyrproject.org/) - The RTOS that makes this possible
- [React Flow](https://reactflow.dev/) - Powering our highly interactive visual editors
- [Emscripten](https://emscripten.org/) - Enabling high-performance PLC simulation in the browser
- [IEC 61131-3](https://en.wikipedia.org/wiki/IEC_61131-3) - The standard we aim to support

