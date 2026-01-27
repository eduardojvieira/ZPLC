# HIL Testing System - Ready for Use

The Hardware-in-the-Loop (HIL) testing system is now fully implemented and ready to validate the ZPLC runtime on physical hardware.

## Quick Start

### 1. Requirements
- Raspberry Pi Pico (RP2040) with ZPLC Firmware
- Node.js / Bun installed
- USB connection to the Pico

### 2. Environment Setup
```bash
bun install
```

### 3. Running a Single Test
Use the `zplc-cli` to run the "Hello HIL" example:
```bash
bun packages/zplc-ide/src/cli/index.ts hil packages/zplc-hil/tests/examples/hello.ts --port /dev/tty.usbmodem1234
```

### 4. Running the Full Suite
```bash
# Opcode Arithmetic tests
bun packages/zplc-ide/src/cli/index.ts hil opcodes --port /dev/tty.usbmodem1234
```

## System Components

### 1. Firmware Extension (C)
- JSON debug output via serial (shell)
- Microsecond-accurate task timing
- Opcode-level tracing (VERBOSE mode)
- Cycle summaries (SUMMARY mode)

### 2. Test Framework (@zplc/hil)
- Serial port orchestrator
- Pattern and timing assertions
- JUnit XML reporter
- Automatic retries for flaky hardware connections

### 3. CLI Tool (zplc-cli)
- `compile`: ST -> Bytecode
- `upload`: Bytecode -> Pico
- `run`: One-shot execution
- `devices`: Pico discovery
- `hil`: Test suite runner

## CI Integration
The `.github/workflows/hil-tests.yml` is configured to run these tests automatically on a self-hosted runner tagged with `pico`.

## Ongoing Development
To add more tests, create new files in `packages/zplc-hil/tests/` following the `HILTestCase` format.
