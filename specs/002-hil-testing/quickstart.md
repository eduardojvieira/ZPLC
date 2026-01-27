# HIL Testing Quickstart

**Feature**: 002-hil-testing  
**Date**: 2026-01-22

## Prerequisites

- Raspberry Pi Pico with ZPLC firmware (v1.4.0+)
- USB cable (data-capable, not charge-only)
- macOS or Linux (Windows WSL2 supported)
- Bun 1.1+ installed
- Zephyr SDK 0.17.0+ (for firmware builds)

## Quick Setup (5 minutes)

### 1. Clone and Install

```bash
git clone https://github.com/yourorg/zplc.git
cd zplc
bun install
```

### 2. Build HIL-enabled Firmware

```bash
# From repo root
cd firmware
west build -b rpi_pico_rp2040 app -- -DCONFIG_ZPLC_HIL_DEBUG=y

# Flash to Pico (hold BOOTSEL, plug USB, release)
cp build/zephyr/zephyr.uf2 /Volumes/RPI-RP2/
```

### 3. Verify Connection

```bash
# Find your device
bun run zplc-cli devices --probe

# Expected output:
# ✓ /dev/tty.usbmodem1234
#   Firmware: 1.4.0
#   Capabilities: sched, hil, sfc
```

### 4. Run Your First Test

```bash
# Run a single opcode test
bun run zplc-cli hil "opcodes.add.basic"

# Run all opcode tests
bun run zplc-cli hil --suite opcodes
```

---

## Development Workflow

### Running Tests Locally

```bash
# All tests (takes ~30 minutes)
bun run hil:test

# Specific suite
bun run hil:test -- --suite opcodes
bun run hil:test -- --suite blocks
bun run hil:test -- --suite scheduler
bun run hil:test -- --suite languages

# Specific test pattern
bun run hil:test -- "opcodes.add.*"

# With verbose output
bun run hil:test -- --verbose "blocks.ton.*"
```

### Writing a New Test

Tests live in `packages/zplc-hil/tests/`. Create a new file:

```typescript
// packages/zplc-hil/tests/opcodes/my-test.ts
import { test, expect } from 'bun:test';
import { hil } from '../../src';

test('OP_ADD: 3 + 4 = 7', async () => {
  const result = await hil.run({
    source: `
      PROGRAM Test
      VAR
        a : INT := 3;
        b : INT := 4;
        result : INT;
      END_VAR
      result := a + b;
      END_PROGRAM
    `,
    debugMode: 'verbose',
  });

  // Assert opcode was executed with correct result
  expect(result.frames).toContainEqual(
    expect.objectContaining({
      t: 'opcode',
      op: 'ADD',
      tos: 7,
    })
  );
});
```

### Test Structure

```
packages/zplc-hil/
├── src/
│   ├── index.ts          # Main exports
│   ├── device.ts         # Serial connection
│   ├── protocol.ts       # JSON parser
│   ├── runner.ts         # Test orchestrator
│   └── assertions.ts     # Timing helpers
├── tests/
│   ├── opcodes/          # 75 opcode tests
│   │   ├── arithmetic.test.ts
│   │   ├── stack.test.ts
│   │   └── jump.test.ts
│   ├── blocks/           # 22 FB tests
│   │   ├── timers.test.ts
│   │   └── counters.test.ts
│   ├── scheduler/        # Multi-task tests
│   └── languages/        # ST/LD/FBD/SFC
└── fixtures/             # Shared test programs
```

---

## Debugging Failed Tests

### 1. Capture Raw Output

```bash
bun run zplc-cli run program.st -D verbose --capture debug.log
cat debug.log
```

### 2. Interactive Debug Session

```bash
bun run zplc-cli debug

# In debug session:
> mode verbose
> watch 8192 i32
> step
> step
> regs
> quit
```

### 3. Check Device Logs

```bash
# Open serial terminal
screen /dev/tty.usbmodem1234 115200

# Or with picocom (better line editing)
picocom -b 115200 /dev/tty.usbmodem1234
```

### 4. Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Device not found" | Wrong port or no USB connection | Check `devices` output |
| "Upload timeout" | Firmware crashed or hung | Replug Pico, reflash |
| Test timeouts | Infinite loop in program | Check program logic |
| Timing assertion fails | RTOS jitter | Increase tolerance or retries |
| "Serial port busy" | Another process using port | Close screen/picocom |

---

## CI Integration

### Self-Hosted Runner Setup

1. Connect Pico to CI machine via USB
2. Install runner with `./config.sh --labels pico,hil`
3. Add workflow:

```yaml
# .github/workflows/hil-tests.yml
name: HIL Tests
on:
  push:
    branches: [main]
  pull_request:
    paths:
      - 'firmware/**'
      - 'packages/zplc-compiler/**'
      - 'packages/zplc-hil/**'

jobs:
  hil:
    runs-on: [self-hosted, pico]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run hil:test -- --junit results.xml
      - uses: mikepenz/action-junit-report@v4
        if: always()
        with:
          report_paths: results.xml
```

### JUnit Output

```bash
bun run hil:test -- --junit results.xml
```

Generates standard JUnit XML for CI integration:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="ZPLC HIL" tests="75" failures="0" time="1234.5">
  <testsuite name="opcodes" tests="75" failures="0" time="450.2">
    <testcase name="OP_ADD" classname="opcodes.arithmetic" time="12.3"/>
    ...
  </testsuite>
</testsuites>
```

---

## Firmware Development

### Rebuilding with HIL Changes

```bash
cd firmware

# Clean rebuild
west build -p -b rpi_pico_rp2040 app -- -DCONFIG_ZPLC_HIL_DEBUG=y

# Flash
cp build/zephyr/zephyr.uf2 /Volumes/RPI-RP2/
```

### Debugging Firmware

```bash
# Build with debug symbols
west build -b rpi_pico_rp2040 app -- -DCONFIG_ZPLC_HIL_DEBUG=y -DCONFIG_DEBUG_OPTIMIZATIONS=y

# OpenOCD + GDB (requires debug probe)
west debug
```

### Key Files

| File | Purpose |
|------|---------|
| `firmware/app/src/hil_debug.c` | HIL debug output |
| `firmware/lib/zplc_core/include/zplc_debug.h` | Debug API |
| `firmware/app/boards/rpi_pico_rp2040.conf` | HIL Kconfig |

---

## Troubleshooting

### Serial Port Permissions (Linux)

```bash
sudo usermod -a -G dialout $USER
# Log out and back in
```

### USB Device Not Recognized (macOS)

1. Check System Information → USB
2. Try different USB port/cable
3. Reset SMC (Intel Macs) or restart

### Test Flakiness

If tests pass sometimes and fail others:

1. Increase retry count: `--retries 5`
2. Increase timeout: `--timeout 10000`
3. Check for race conditions in test setup
4. Ensure device is fully reset between tests

---

## Next Steps

- [Debug Protocol Specification](./contracts/debug-protocol.md)
- [CLI API Reference](./contracts/cli-api.md)
- [Data Model](./data-model.md)
- [Research Decisions](./research.md)
