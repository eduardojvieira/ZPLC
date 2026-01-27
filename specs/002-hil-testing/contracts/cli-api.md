# CLI API Specification

**Feature**: 002-hil-testing  
**Version**: 1.0  
**Date**: 2026-01-22

## Overview

The ZPLC CLI (`zplc-cli`) provides headless access to compilation, upload, and debugging operations. This enables CI/CD automation and HIL test orchestration without requiring the Electron IDE.

## Installation

```bash
# From monorepo root
bun run build:cli

# Binary location
./packages/zplc-ide/dist/zplc-cli
```

## Global Options

| Option | Short | Description |
|--------|-------|-------------|
| `--help` | `-h` | Show help for command |
| `--version` | `-v` | Print CLI version |
| `--verbose` | `-V` | Enable verbose output |
| `--json` | | Output results as JSON |
| `--quiet` | `-q` | Suppress non-error output |

---

## Commands

### `compile` - Compile PLC source

Compiles IEC 61131-3 source code to ZPLC bytecode.

```bash
zplc-cli compile [options] <input>
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `<input>` | Source file path (`.st`, `.ld`, `.fbd`, `.sfc`) |

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--output, -o` | Output file path | `<input>.zplc` |
| `--language, -l` | Force language: `st`, `ld`, `fbd`, `sfc` | Auto-detect |
| `--debug, -d` | Include debug symbols | `false` |
| `--optimize, -O` | Optimization level: 0, 1, 2 | `1` |
| `--map` | Generate source map (`.zplc.map`) | `false` |
| `--check` | Syntax check only, don't generate output | `false` |

#### Examples

```bash
# Basic compilation
zplc-cli compile program.st

# With debug symbols and source map
zplc-cli compile -d --map program.st -o debug/program.zplc

# Syntax check only
zplc-cli compile --check program.st
```

#### Output (JSON mode)

```json
{
  "success": true,
  "input": "program.st",
  "output": "program.zplc",
  "size": 1024,
  "opcodes": 75,
  "variables": 12,
  "warnings": [],
  "duration": 45
}
```

#### Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | Compilation error (syntax, type, etc.) |
| 2 | File not found |
| 3 | Invalid arguments |

---

### `upload` - Upload bytecode to device

Uploads compiled bytecode to a connected ZPLC device.

```bash
zplc-cli upload [options] <file>
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `<file>` | Bytecode file path (`.zplc`) |

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--port, -p` | Serial port path | Auto-detect |
| `--baud, -b` | Baud rate | `115200` |
| `--timeout, -t` | Upload timeout (ms) | `10000` |
| `--verify` | Verify after upload | `true` |
| `--run` | Start execution after upload | `true` |

#### Examples

```bash
# Auto-detect port
zplc-cli upload program.zplc

# Explicit port
zplc-cli upload -p /dev/tty.usbmodem1234 program.zplc

# Upload without running
zplc-cli upload --no-run program.zplc
```

#### Output (JSON mode)

```json
{
  "success": true,
  "file": "program.zplc",
  "port": "/dev/tty.usbmodem1234",
  "size": 1024,
  "duration": 2340,
  "verified": true,
  "running": true
}
```

#### Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | Upload failed |
| 2 | File not found |
| 3 | Device not found |
| 4 | Verification failed |
| 5 | Timeout |

---

### `run` - Compile, upload, and execute

One-shot command that compiles, uploads, and captures output.

```bash
zplc-cli run [options] <input>
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `<input>` | Source file path |

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--port, -p` | Serial port path | Auto-detect |
| `--timeout, -t` | Execution timeout (ms) | `5000` |
| `--cycles, -c` | Number of cycles to run | `1` |
| `--debug-mode, -D` | Debug mode: `off`, `summary`, `verbose` | `off` |
| `--capture` | Capture serial output to file | - |

#### Examples

```bash
# Run for 5 seconds
zplc-cli run program.st --timeout 5000

# Run with verbose debug output
zplc-cli run program.st -D verbose --capture output.log

# Run 100 cycles
zplc-cli run program.st --cycles 100
```

#### Output (JSON mode)

```json
{
  "success": true,
  "compiled": true,
  "uploaded": true,
  "executed": true,
  "cycles": 100,
  "duration": 5230,
  "output": [
    {"t":"cycle","n":1,"us":850},
    {"t":"cycle","n":2,"us":823}
  ],
  "errors": []
}
```

---

### `devices` - List connected devices

Lists all connected ZPLC-compatible devices.

```bash
zplc-cli devices [options]
```

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--probe` | Query device info (slower) | `false` |
| `--wait, -w` | Wait for device (seconds) | `0` |

#### Examples

```bash
# List devices
zplc-cli devices

# Wait up to 10 seconds for a device
zplc-cli devices --wait 10
```

#### Output (JSON mode)

```json
{
  "devices": [
    {
      "port": "/dev/tty.usbmodem1234",
      "manufacturer": "Raspberry Pi",
      "product": "Pico",
      "serialNumber": "E66038B713596F28",
      "firmware": "1.4.0",
      "capabilities": ["sched", "hil"]
    }
  ]
}
```

---

### `debug` - Interactive debug session

Opens an interactive debug session with a connected device.

```bash
zplc-cli debug [options]
```

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--port, -p` | Serial port path | Auto-detect |
| `--mode, -m` | Initial debug mode | `verbose` |

#### Interactive Commands

Once in debug mode, the following commands are available:

| Command | Description |
|---------|-------------|
| `mode <off\|summary\|verbose>` | Set debug mode |
| `watch <addr> <type>` | Watch variable |
| `unwatch <addr>` | Remove watch |
| `break <pc>` | Set breakpoint |
| `step` | Step one opcode |
| `resume` | Resume execution |
| `halt` | Pause execution |
| `reset` | Reset VM |
| `mem <addr> <len>` | Dump memory |
| `regs` | Show registers |
| `quit` | Exit debug session |

---

### `hil` - Run HIL tests

Runs Hardware-in-the-Loop tests against a connected device.

```bash
zplc-cli hil [options] [tests...]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `[tests...]` | Test patterns to run (glob-style) |

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--port, -p` | Serial port path | Auto-detect |
| `--suite, -s` | Test suite: `opcodes`, `blocks`, `scheduler`, `languages`, `all` | `all` |
| `--timeout, -t` | Per-test timeout (ms) | `5000` |
| `--retries, -r` | Retry count for flaky tests | `3` |
| `--junit` | Output JUnit XML to file | - |
| `--fail-fast` | Stop on first failure | `false` |
| `--parallel` | Number of parallel devices | `1` |

#### Examples

```bash
# Run all tests
zplc-cli hil

# Run opcode tests only
zplc-cli hil --suite opcodes

# Run specific tests
zplc-cli hil "opcodes.add.*" "opcodes.sub.*"

# Output JUnit XML for CI
zplc-cli hil --junit results.xml
```

#### Output (JSON mode)

```json
{
  "success": true,
  "summary": {
    "total": 75,
    "passed": 73,
    "failed": 2,
    "skipped": 0,
    "duration": 45230,
    "flakeRate": 0.05
  },
  "failed": [
    {
      "id": "opcodes.div.zero",
      "error": "Expected error DIV_BY_ZERO, got OK"
    }
  ]
}
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ZPLC_PORT` | Default serial port path |
| `ZPLC_BAUD` | Default baud rate |
| `ZPLC_TIMEOUT` | Default timeout (ms) |
| `ZPLC_LOG_LEVEL` | Log level: `error`, `warn`, `info`, `debug` |

---

## Programmatic API

The CLI functionality is also available as a library:

```typescript
import { compile, upload, run, listDevices } from '@zplc/cli';

// Compile
const result = await compile({
  input: 'program.st',
  debug: true,
  optimize: 1
});

// Upload
await upload({
  file: result.output,
  port: '/dev/tty.usbmodem1234'
});

// Run
const execution = await run({
  input: 'program.st',
  debugMode: 'verbose',
  timeout: 5000
});

// List devices
const devices = await listDevices({ probe: true });
```

---

## Error Messages

| Code | Message | Description |
|------|---------|-------------|
| `E001` | `Syntax error at line {n}` | Parse error in source |
| `E002` | `Type mismatch: expected {a}, got {b}` | Type error |
| `E003` | `Undefined variable: {name}` | Variable not declared |
| `E004` | `Device not found` | No device on specified port |
| `E005` | `Upload timeout` | Device didn't respond in time |
| `E006` | `Verification failed` | Uploaded code doesn't match |
| `E007` | `Device error: {code}` | Runtime error from device |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-22 | Initial specification |
