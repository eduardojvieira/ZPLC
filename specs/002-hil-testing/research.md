# Research: Hardware-in-the-Loop Testing System

**Feature**: 002-hil-testing  
**Date**: 2026-01-22

## 1. Serial Port Library Selection

### Decision: `serialport` (Node.js native module)

### Rationale
- **Mature & stable**: 10+ years of development, widely used in production
- **Cross-platform**: macOS, Linux, Windows support
- **Bun compatible**: Works with Bun via Node.js compatibility layer
- **Stream-based**: Easy to pipe into line-based parser
- **Auto-detection**: Can list available ports for device discovery

### Alternatives Considered
| Library | Rejected Because |
|---------|-----------------|
| `web-serial` | Browser-only, requires user gesture for connection |
| `usb` (libusb) | Too low-level, would need CDC-ACM implementation |
| `node-serialport-bindings-cpp` | Same as serialport, just lower level |

### Integration Pattern
```typescript
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

const port = new SerialPort({ path: '/dev/tty.usbmodem*', baudRate: 115200 });
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

parser.on('data', (line: string) => {
  const frame = parseDebugFrame(line);
  // Handle frame...
});
```

---

## 2. Debug Protocol Design

### Decision: Line-based JSON protocol with message types

### Rationale
- **Machine-parseable**: JSON is universal, easy to parse in any language
- **Human-readable**: Can still read raw serial output for debugging
- **Extensible**: Add new fields without breaking existing parsers
- **Line-based**: One complete message per line, easy framing

### Format Specification

#### Message Types

```
{"t":"opcode","op":"ADD","pc":18,"sp":2,"tos":7}
{"t":"fb","name":"TON","id":0,"q":true,"et":100}
{"t":"task","id":1,"start":1000,"end":1045,"us":45}
{"t":"error","code":3,"msg":"DIV_BY_ZERO"}
{"t":"cycle","n":100,"us":850}
{"t":"ack","cmd":"mode","val":"verbose"}
```

| Field | Description |
|-------|-------------|
| `t` | Message type: `opcode`, `fb`, `task`, `error`, `cycle`, `ack` |
| `op` | Opcode name (for opcode messages) |
| `pc` | Program counter |
| `sp` | Stack pointer |
| `tos` | Top of stack value |
| `name` | Function block name |
| `id` | Instance/task ID |
| `q` | FB output Q |
| `et` | FB elapsed time |
| `us` | Execution time in microseconds |
| `code` | Error code |
| `msg` | Human-readable message |

#### Debug Commands (Host → Device)

```
DBG:MODE:OFF
DBG:MODE:SUMMARY
DBG:MODE:VERBOSE
DBG:WATCH:0x2000:u32
DBG:BREAK:0x0012
DBG:STEP
DBG:RESUME
```

### Alternatives Considered
| Format | Rejected Because |
|--------|-----------------|
| Binary protocol | Harder to debug, no human readability |
| `[LEVEL] CATEGORY: k=v` | Harder to parse, no structure |
| Protobuf | Overkill, requires codegen, not human-readable |

---

## 3. Zephyr Shell Extension Patterns

### Decision: Add new `hil` subcommand group to existing `zplc` command

### Rationale
- **Non-invasive**: Doesn't modify existing commands
- **Conditional**: Can be disabled via Kconfig for production
- **Consistent**: Follows existing `zplc dbg` pattern

### Implementation Pattern

```c
// In shell_cmds.c or new hil_debug.c

#ifdef CONFIG_ZPLC_HIL_DEBUG

static int cmd_hil_mode(const struct shell *sh, size_t argc, char **argv) {
    if (argc < 2) {
        shell_error(sh, "Usage: zplc hil mode <off|summary|verbose>");
        return -EINVAL;
    }
    
    if (strcmp(argv[1], "off") == 0) {
        hil_set_mode(HIL_MODE_OFF);
    } else if (strcmp(argv[1], "summary") == 0) {
        hil_set_mode(HIL_MODE_SUMMARY);
    } else if (strcmp(argv[1], "verbose") == 0) {
        hil_set_mode(HIL_MODE_VERBOSE);
    }
    
    // Output JSON ack
    shell_print(sh, "{\"t\":\"ack\",\"cmd\":\"mode\",\"val\":\"%s\"}", argv[1]);
    return 0;
}

SHELL_STATIC_SUBCMD_SET_CREATE(sub_hil,
    SHELL_CMD(mode, NULL, "Set debug output mode", cmd_hil_mode),
    SHELL_CMD(watch, NULL, "Watch variable", cmd_hil_watch),
    SHELL_SUBCMD_SET_END
);

#endif /* CONFIG_ZPLC_HIL_DEBUG */
```

### Kconfig Entry

```kconfig
config ZPLC_HIL_DEBUG
    bool "Enable HIL debug output"
    default y
    help
      Enables JSON-formatted debug output for Hardware-in-the-Loop testing.
      Can be disabled to reduce code size in production builds.
```

---

## 4. JUnit XML Format

### Decision: Standard JUnit XML with custom properties for timing

### Rationale
- **Universal**: Supported by GitHub Actions, Jenkins, Azure DevOps, etc.
- **Well-documented**: XSD schema available
- **Extensible**: `<properties>` element for custom data

### Format Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="ZPLC HIL Tests" tests="75" failures="2" time="1234.5">
  <testsuite name="opcodes" tests="75" failures="2" time="450.2">
    <testcase name="OP_ADD" classname="opcodes.arithmetic" time="12.3">
      <properties>
        <property name="device" value="/dev/tty.usbmodem1234"/>
        <property name="firmware" value="1.4.0"/>
      </properties>
    </testcase>
    <testcase name="OP_DIV_zero" classname="opcodes.arithmetic" time="11.8">
      <failure message="Expected error DIV_BY_ZERO, got OK">
        Expected: {"t":"error","code":3}
        Actual: {"t":"cycle","n":1,"us":50}
      </failure>
    </testcase>
  </testsuite>
</testsuites>
```

### Library: Custom implementation (simple XML generation)

No external library needed - JUnit XML is simple enough to generate with template strings.

---

## 5. Timing Assertion Patterns

### Decision: Tolerance-based assertions with retry support

### Rationale
- **RTOS reality**: Zephyr scheduling has inherent jitter
- **Deterministic enough**: RP2040 at 125MHz is consistent within 5-10%
- **Retry mitigates flakes**: Transient delays shouldn't fail tests

### Implementation Pattern

```typescript
interface TimingAssertion {
  expectedMs: number;
  tolerancePercent: number;  // Default 10%
  maxRetries: number;        // Default 3
}

async function assertTiming(
  device: Device,
  trigger: () => Promise<void>,
  expectedPattern: RegExp,
  timing: TimingAssertion
): Promise<void> {
  const minMs = timing.expectedMs * (1 - timing.tolerancePercent / 100);
  const maxMs = timing.expectedMs * (1 + timing.tolerancePercent / 100);
  
  for (let attempt = 0; attempt < timing.maxRetries; attempt++) {
    const start = performance.now();
    await trigger();
    
    const result = await device.waitFor(expectedPattern, maxMs + 100);
    const elapsed = performance.now() - start;
    
    if (elapsed >= minMs && elapsed <= maxMs) {
      return; // Success
    }
    
    if (attempt < timing.maxRetries - 1) {
      await device.reset(); // Retry
    }
  }
  
  throw new Error(`Timing assertion failed: expected ${timing.expectedMs}ms ±${timing.tolerancePercent}%`);
}
```

### Tolerance Guidelines

| Test Type | Default Tolerance |
|-----------|------------------|
| Opcode execution | N/A (instant) |
| Timer (TON/TOF) | 10% |
| Task scheduling | 5% |
| Debug response | 50ms absolute max |

---

## 6. IDE CLI Interface Design

### Decision: Standalone CLI binary via Bun compile

### Rationale
- **Headless operation**: No Electron required for CI
- **Fast startup**: Bun binary is fast
- **Same codebase**: Reuses compiler and uploader code

### Commands

```bash
# Compile ST to .zplc
zplc-cli compile --input program.st --output program.zplc --debug

# Upload to device
zplc-cli upload --port /dev/tty.usbmodem1234 --file program.zplc

# Full cycle (compile + upload + run)
zplc-cli run --input program.st --port /dev/tty.usbmodem1234 --timeout 5000

# List connected devices
zplc-cli devices
```

### Implementation: Export existing compiler/uploader as library functions

```typescript
// packages/zplc-ide/src/cli/index.ts
import { compile } from '../compiler';
import { SerialUploader } from '../uploader';

export async function cliCompile(input: string, output: string, debug: boolean) {
  const source = await Bun.file(input).text();
  const result = compile(source, { debug });
  await Bun.write(output, result.binary);
}
```

---

## Summary of Decisions

| Topic | Decision | Key Reason |
|-------|----------|------------|
| Serial Library | `serialport` | Mature, cross-platform, stream-based |
| Debug Protocol | Line-based JSON | Parseable + human-readable |
| Shell Extension | `zplc hil` subgroup | Non-invasive, Kconfig-guarded |
| CI Output | JUnit XML | Universal CI support |
| Timing Tolerance | 5-10% with retries | RTOS jitter reality |
| IDE CLI | Bun-compiled binary | Fast, headless, same codebase |
