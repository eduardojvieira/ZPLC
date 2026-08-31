# ZPLC (Zephyr PLC)

**One execution core, evidence-aware runtimes.**

ZPLC is a portable IEC 61131-3 runtime environment with a C99 core, Zephyr
targets, and native host tooling. Its timing, hardware, and release claims are
limited to recorded evidence rather than inferred from source presence.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Zephyr 4.0](https://img.shields.io/badge/Zephyr-4.0.0-blue.svg)](https://zephyrproject.org/)
[![C99](https://img.shields.io/badge/C-C99-green.svg)](https://en.wikipedia.org/wiki/C99)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

[![Website](https://img.shields.io/badge/Website-Live-brightgreen)](https://eduardojvieira.github.io/ZPLC/)

## Features

- **Portable core**: ANSI C99 runtime separated from its hardware abstraction layer.
- **Language and editor assets**: ST, IL, LD, FBD, and SFC paths exist in the repository; release support is evidence-gated.
- **Desktop tooling**: Electron, native POSIX simulation, and a degraded WASM fallback are available development surfaces.
- **Evidence-aware validation**: Host, QEMU, target build, HIL, and manual checks are distinct evidence levels.

## Documentation

The full documentation for ZPLC, including the runtime architecture, hardware integration guides, and language references, is hosted on our **[Docusaurus Site](https://eduardojvieira.github.io/ZPLC/)**.

- [Getting Started & Platform Overview](https://eduardojvieira.github.io/ZPLC/docs/platform-overview)
- [System Architecture](https://eduardojvieira.github.io/ZPLC/docs/architecture)
- [Runtime & Hardware Abstraction (HAL)](https://eduardojvieira.github.io/ZPLC/docs/runtime)
- [Languages & Structured Text Reference](https://eduardojvieira.github.io/ZPLC/docs/languages)
- [IDE & Tooling](https://eduardojvieira.github.io/ZPLC/docs/ide)
- [Integration & Deployment](https://eduardojvieira.github.io/ZPLC/docs/integration)

*Note for AI Assistants & Contributors: Please refer to [AGENTS.md](AGENTS.md) for contribution guidelines, project architecture rules, and testing requirements before modifying the codebase.*

## Current posture

`v1.5.0` is a release target, not a completed release. Desktop validation, HIL,
and final sign-off remain pending in the [release evidence matrix](specs/008-release-foundation/artifacts/release-evidence-matrix.md).

ZPLC 2.0 is an [approved implementation RFC](specs/010-zplc-2-0-foundation/spec.md),
not a released product. It is an incremental rewrite of Studio and orchestration
around the existing core and compiler assets. See the public [roadmap](docs/docs/runtime/roadmap.md)
and [source-of-truth map](docs/docs/reference/source-of-truth.md) for scope and authority.

---

## Quick Start

### Option 1: Electron Desktop Workflow

Run the desktop app locally from source:

```bash
bun --version  # requires 1.3.14
bun install --frozen-lockfile
cd packages/zplc-ide
bun run electron:dev    # Development mode
bun run electron:build  # Build distributable
```

### Option 2: Web IDE (Development)

Run the IDE in your browser:

```bash
bun --version  # requires 1.3.14
bun install --frozen-lockfile
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

### Option 4: Zephyr Build (Manual or Emulated Hardware)

Run on real hardware or the QEMU emulator:

```bash
# Activate Zephyr environment
source ~/zephyrproject/activate.sh

# Build for QEMU Cortex-M3 emulator
cd ~/zephyrproject
west build -b mps2/an385 $ZEPLC_PATH/firmware/app --pristine

# Run in QEMU (manual/emulated workflow; no CI workflow is claimed yet)
west build -t run

# Or build for Raspberry Pi Pico (manual hardware operation)
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

## Supported Platforms

### Embedded (Zephyr RTOS)
ZPLC is a Zephyr module. Board entries describe repository profiles; their
validation level and evidence determine what can be claimed. Refer to the
board manifest and release evidence before treating any profile as hardware-qualified.

### Desktop & Development
- **Desktop app surface**: Windows, macOS, and Linux source/build workflows; human smoke evidence remains pending.
- **POSIX**: host development and test runtime.
- **QEMU**: emulated target evidence where configured.
- **WASM**: degraded browser fallback, not parity-authoritative evidence.

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
└── AGENTS.md                      # AI agent & contributor guide
```

---

## Using ZPLC in Your Zephyr Project

### Via West Manifest

Add to your `west.yml`:

```yaml
manifest:
  projects:
    - name: zplc
      url: https://github.com/eduardojvieira/ZPLC
      revision: master
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

## Contributing

See [AGENTS.md](AGENTS.md) for detailed contribution guidelines, coding standards, and development workflows.

### Quick Commands

```bash
# C Runtime (from firmware/lib/zplc_core/build)
cmake .. && make && ctest --output-on-failure

# TypeScript (Monorepo)
bun install --frozen-lockfile
bun run test

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
