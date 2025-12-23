# ZPLC (Zephyr PLC)

**One Execution Core, Any Runtime.**

ZPLC is a portable, deterministic PLC runtime environment powered by [Zephyr RTOS](https://zephyrproject.org/) for embedded targets and native OS layers for desktop/server hosting. It brings modern software development practices to industrial automation.

## Features

- **Portable Core**: ANSI C99 compliant core, running on generic microcontrollers (via Zephyr), Linux, Windows, and WebAssembly.
- **Unified Architecture**: A single "Compiler-VM" architecture where the IDE produces hardware-agnostic `.zplc` bytecode.
- **IEC 61131-3 Support**: Designed to support all 5 languages (ST, LD, FBD, SFC, IL).
- **Industrial Grade**: Deterministic execution, retentive memory support, and strict timing control.
- **Modern Tooling**: CI/CD ready, text-based formats (PLCopen XML), and open interoperability.

## Documentation

- [Technical Specification](TECHNICAL_SPEC.md): Detailed architecture, binary format, and roadmap.
- [Agents / Contribution Context](AGENTS.md): Context for AI agents and contributors.

## Quick Start (Phase 0)

*Note: This project is currently in early development (Phase 0).*

### Prerequisites
- CMake (3.20+)
- C Compiler (GCC/Clang)
- Zephyr SDK (for embedded targets)

### Building the Core (Host)
```bash
mkdir build && cd build
cmake ..
make
./tests/zplc_test_suite
```
