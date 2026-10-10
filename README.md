# ZPLC

**An open-source IEC 61131-3 PLC runtime and desktop IDE.**

ZPLC compiles Structured Text, Ladder Diagram, Function Block Diagram,
Sequential Function Chart and Instruction List to one bytecode format. A small
C99 runtime executes it: on microcontroller boards as a Zephyr module, and on
your computer as a simulator. ZPLC Studio, the desktop app, edits, compiles,
tests and simulates projects.

> **Status:** 2.0.0-rc.3 is a preview for evaluation. Six boards cross-build in
> CI and none has been tested on hardware yet. It is not a safety PLC and must
> not be used to control machinery.

[Download ZPLC Studio](https://github.com/eduardojvieira/ZPLC/releases) ·
[Getting started](docs/docs/getting-started/index.md) ·
[Documentation](https://eduardojvieira.github.io/ZPLC/) · MIT licence

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Zephyr: pinned in west.yml](https://img.shields.io/badge/Zephyr-pinned%20in%20west.yml-blue.svg)](west.yml)
[![C99](https://img.shields.io/badge/C-C99-green.svg)](https://en.wikipedia.org/wiki/C99)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

## What you can do today

- Write programs in Structured Text, Instruction List, Ladder, FBD or SFC in Studio.
- Compile them to `.zplc` bytecode and run them in the simulator, with no hardware.
- Test them with scenarios: scripted inputs and timed checks on outputs, run from Studio's Tests tab.
- Start from 16 example projects, such as a tank level controller, a conveyor, motor start/stop and a pedestrian crossing.
- Build the runtime for six Zephyr boards.

## What it runs on

| Part | Runs on |
| --- | --- |
| Studio | Windows, macOS and Linux. The rc.3 installers are unsigned. |
| Simulator | Your computer, as a host build of the same C runtime. Studio bundles it. |
| Boards | Raspberry Pi Pico (RP2040), Arduino GIGA R1, ESP32-S3 DevKitC, STM32F746G Discovery, STM32 Nucleo-H743ZI and Arduino Opta WiFi. All six cross-build only: the firmware builds in CI and has not been run on a board. |

## Try it

1. Download the installer for your system from [GitHub Releases](https://github.com/eduardojvieira/ZPLC/releases).
2. Open it. Windows and macOS warn about unsigned apps; [Getting started](docs/docs/getting-started/index.md) shows how to continue.
3. In Studio, copy the **Blinky** example, compile it, choose **Simulate**, press **Connect** and then **Run**.

## How it compares

Checked on 2026-10-09 against the sources linked in each row. The cells repeat
what each project says about itself; we did not install or test the others.

| Project | Licence and cost | Languages | Where it runs |
| --- | --- | --- | --- |
| ZPLC | MIT ([LICENSE](LICENSE)) | ST, IL, LD, FBD, SFC | Studio on Windows, macOS, Linux. Runtime on six Zephyr boards (cross-build only) and as a host simulator. |
| [OpenPLC](https://github.com/Autonomy-Logic/openplc-runtime) (Editor and Runtime v4) | [Editor](https://github.com/Autonomy-Logic/openplc-editor): GPL-3.0. Runtime: MIT. The v3 runtime repository is [marked end of life](https://github.com/thiagoralves/OpenPLC_v3). | Ladder, Structured Text, Function Block Diagram and other IEC 61131-3 languages | Editor: desktop app for macOS, Windows and Linux. Runtime: Linux on x86_64, ARM64 and ARMv7, or Docker. |
| [Beremiz](https://github.com/beremiz/beremiz) | IDE: GPL v2 or later. Python runtime: LGPL v2 or later. C++ runtime: GPL v3 or later. | LD, FBD, SFC, IL, ST ([Beremiz](https://beremiz.org/)) | Compiles PLC programs to C and then to native code, for a bare-metal microcontroller, an industrial controller or a Linux PC. IDE: Windows installer and Linux Snap package. |
| [CODESYS](https://store.codesys.com/en/codesys.html) | [Development System: free of charge in the CODESYS Store](https://store.codesys.com/en/engineering/ide.html); a licence agreement applies. | FBD, LD, IL, ST, SFC editors (IL is no longer maintained but can be enabled) | Integrated compilers for many CPU platforms. A web-based CODESYS 4 is available for Windows x64, Linux x64 and Linux ARM64. |
| [Arduino PLC IDE](https://docs.arduino.cc/software/plc-ide/) | Free download, Windows only. Compatible devices need a licence activation. | IEC 61131-3 languages | Arduino devices that support it, such as Opta and Portenta Machine Control. |

ZPLC has no hardware test results yet. Beremiz says on its website that it has
been maintained in the open since 2007.

## Documentation

The full documentation, including the runtime architecture, board references and
language references, is on the **[documentation site](https://eduardojvieira.github.io/ZPLC/)**.

- [Getting started](https://eduardojvieira.github.io/ZPLC/docs/getting-started)
- [Platform overview](https://eduardojvieira.github.io/ZPLC/docs/platform-overview)
- [System architecture](https://eduardojvieira.github.io/ZPLC/docs/architecture)
- [Runtime and hardware abstraction layer (HAL)](https://eduardojvieira.github.io/ZPLC/docs/runtime)
- [Languages and Structured Text reference](https://eduardojvieira.github.io/ZPLC/docs/languages)
- [Studio](https://eduardojvieira.github.io/ZPLC/docs/ide)
- [Integration and deployment](https://eduardojvieira.github.io/ZPLC/docs/integration)
- [Release notes](docs/docs/release-notes/index.md)

---

## Build from source

### Studio (Linux and macOS)

You need Bun 1.3.14, CMake and a C compiler. Studio's simulator is a separate
program: build it first and point Studio to it.

```bash
cmake -S firmware/lib/zplc_core -B firmware/lib/zplc_core/build
cmake --build firmware/lib/zplc_core/build
bun install --frozen-lockfile
ZPLC_NATIVE_SIM_BIN="$PWD/firmware/lib/zplc_core/build/zplc_runtime" \
  bun run --cwd=packages/zplc-ide electron:dev
```

`bun run --cwd=packages/zplc-ide electron:build` builds the installers. The
simulator needs the Electron app. `bun run --cwd=packages/zplc-ide dev` starts
the editor in a browser at http://localhost:3000, where the native simulator is
not available.

### Runtime on your computer

```bash
git clone https://github.com/eduardojvieira/ZPLC.git
cd ZPLC/firmware/lib/zplc_core
mkdir build && cd build
cmake ..
make
ctest --output-on-failure   # run the C tests
./zplc_runtime              # run the demo runtime
```

### Firmware for a board

Create a west workspace with `west init -l` on this repository, as the
[Zephyr workspace setup](docs/docs/reference/zephyr-workspace-setup.md) page
describes, then build from the repository root. Each board's command is in
`firmware/app/boards/supported-boards.v1.5.0.json`; for the Raspberry Pi Pico:

```bash
west build -b rpi_pico/rp2040 firmware/app --pristine
```

This is a cross-build: ZPLC has not yet flashed or run it on a Pico. Flashing is
a separate step that a person does with the board's own Zephyr procedure.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Development Host (Studio)                 │
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
│  │  │ Loader   │  │     VM      │  │ Process Image   │  │  │
│  │  └──────────┘  └─────────────┘  └─────────────────┘  │  │
│  └──────────────────────────┬───────────────────────────┘  │
│                             │ HAL Interface                 │
│  ┌──────────────────────────▼───────────────────────────┐  │
│  │ ┌──────────┐  ┌──────────┐  ┌────────────────────┐   │  │
│  │ │  Zephyr  │  │  POSIX   │  │  WASM (not shipped) │   │  │
│  │ │   HAL    │  │   HAL    │  │        HAL          │   │  │
│  │ └──────────┘  └──────────┘  └────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Project structure

```
ZPLC/
├── firmware/                      # Zephyr module root
│   ├── app/                       # Zephyr application (main target)
│   │   ├── src/main.c
│   │   ├── src/shell_cmds.c
│   │   ├── boards/                # Board overlays & configs
│   │   └── prj.conf
│   ├── apps/posix_host/           # POSIX development runtime
│   ├── lib/zplc_core/             # Core library (C99)
│   │   ├── include/               # Public headers
│   │   ├── src/core/              # VM implementation
│   │   ├── src/hal/               # HAL implementations (zephyr, posix, wasm)
│   │   └── tests/                 # C unit tests
│   ├── CMakeLists.txt             # Zephyr module CMake
│   └── zephyr/                    # Kconfig and module.yml
├── packages/                      # Monorepo packages
│   ├── zplc-compiler/             # Compiler & code generator
│   ├── zplc-ide/                  # Studio (React + Electron)
│   └── zplc-hil/                  # Hardware-in-the-loop test runner
├── docs/                          # Documentation (Docusaurus)
└── AGENTS.md                      # Guide for AI-assisted contributions
```

---

## Using ZPLC in your Zephyr project

The module root is the `firmware/` directory. Point `ZEPHYR_EXTRA_MODULES` at it:

```bash
west build -b <board> <app> -- -DZEPHYR_EXTRA_MODULES=/path/to/zplc/firmware
```

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

See [CONTRIBUTING.md](CONTRIBUTING.md). Contributions that use AI assistants
follow [AGENTS.md](AGENTS.md).

```bash
# C runtime (from firmware/lib/zplc_core/build)
cmake .. && make && ctest --output-on-failure

# TypeScript (monorepo)
bun install --frozen-lockfile
bun run test

# One compiler test file
bun test packages/zplc-compiler/src/compiler/compiler.test.ts
```

---

## Licence

ZPLC is licensed under the MIT License. See [LICENSE](LICENSE).

## Acknowledgments

- [Zephyr Project](https://zephyrproject.org/) - The RTOS that makes this possible
- [React Flow](https://reactflow.dev/) - Powering our visual editors
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editing experience
- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
- [Emscripten](https://emscripten.org/) - WebAssembly compilation
- [IEC 61131-3](https://en.wikipedia.org/wiki/IEC_61131-3) - The standard we implement
