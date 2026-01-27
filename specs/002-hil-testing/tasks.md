# Implementation Tasks: Hardware-in-the-Loop Testing System

**Feature**: 002-hil-testing  
**Date**: 2026-01-22  
**Estimated Total**: 8-12 days

---

## Phase 1: Runtime Debug Infrastructure (C)

### T1.1: Debug API Header
**File**: `firmware/lib/zplc_core/include/zplc_debug.h`  
**Estimate**: 2h  
**Dependencies**: None  

- [x] Define `hil_mode_t` enum: `HIL_MODE_OFF`, `HIL_MODE_SUMMARY`, `HIL_MODE_VERBOSE`
- [x] Declare `hil_set_mode(hil_mode_t mode)`
- [x] Declare `hil_get_mode(void)` → `hil_mode_t`
- [x] Declare `hil_trace_opcode(uint8_t op, uint16_t pc, uint8_t sp, int32_t tos)`
- [x] Declare `hil_trace_fb(const char *name, uint8_t id, bool q, int32_t et_or_cv)`
- [x] Declare `hil_trace_task(uint8_t id, uint32_t start_ms, uint32_t end_ms, uint32_t us, bool overrun)`
- [x] Declare `hil_trace_cycle(uint32_t n, uint32_t us, uint8_t tasks)`
- [x] Declare `hil_trace_error(uint8_t code, const char *msg, uint16_t pc)`
- [x] Guard with `#ifdef CONFIG_ZPLC_HIL_DEBUG`

**Acceptance**: Header compiles with no warnings, all declarations documented.

---

### T1.2: Debug Implementation
**File**: `firmware/lib/zplc_core/src/core/zplc_debug.c`  
**Estimate**: 4h  
**Dependencies**: T1.1  

- [x] Static buffer `hil_buf[256]` for JSON formatting
- [x] Static `hil_mode` variable, default `HIL_MODE_OFF`
- [x] Implement `hil_set_mode()` with shell pointer storage
- [x] Implement `hil_get_mode()`
- [x] Implement `hil_trace_opcode()` with JSON output via `shell_print`
- [x] Implement `hil_trace_fb()` with conditional `et`/`cv` fields
- [x] Implement `hil_trace_task()` with `ovr` field
- [x] Implement `hil_trace_cycle()`
- [x] Implement `hil_trace_error()`
- [x] Add opcode name lookup table from ISA

**Acceptance**: All trace functions output valid JSON, mode switching works.

---

### T1.3: Shell Commands
**File**: `firmware/app/src/shell_cmds.c` (extend)  
**Estimate**: 3h  
**Dependencies**: T1.2  

- [x] Add `hil` subcommand group under `zplc`
- [x] Implement `zplc hil mode <off|summary|verbose>`
- [x] Implement `zplc hil status` (current mode, cycle count)
- [x] Implement `zplc hil watch add <addr> <type>`
- [x] Implement `zplc hil watch del <addr>`
- [x] Implement `zplc hil watch clear`
- [x] Implement `zplc hil reset` (VM reset)
- [x] All commands return JSON ack

**Acceptance**: All commands respond with valid JSON ack, mode persists.

---

### T1.4: VM Integration
**File**: `firmware/lib/zplc_core/src/core/zplc_vm.c` (extend)  
**Estimate**: 4h  
**Dependencies**: T1.2  

- [x] Add `hil_trace_opcode()` call after each opcode execution (guarded by mode)
- [ ] Add `hil_trace_fb()` call after each FB execution (DEFERRED: compiler support needed)
- [x] Add `hil_trace_error()` call on VM errors
- [x] Ensure trace calls don't affect timing in `HIL_MODE_OFF`

**Acceptance**: Verbose mode produces per-opcode output, OFF mode has zero overhead.

---

### T1.5: Scheduler Integration
**File**: `firmware/lib/zplc_scheduler/src/scheduler.c` (extend)  
**Estimate**: 2h  
**Dependencies**: T1.2  

- [x] Add `hil_trace_task()` call after each task completes
- [x] Add `hil_trace_cycle()` call at end of scheduler cycle
- [x] Track task start/end times with `k_uptime_get_32()`

**Acceptance**: Summary mode produces per-cycle output with task timing.

---

### T1.6: Kconfig and Board Config
**Files**: `firmware/app/Kconfig`, `firmware/app/boards/rpi_pico_rp2040.conf`  
**Estimate**: 1h  
**Dependencies**: T1.2  

- [x] Add `CONFIG_ZPLC_HIL_DEBUG` bool with `default y`
- [x] Add help text explaining purpose
- [x] Enable in `rpi_pico_rp2040.conf`

**Acceptance**: Build with/without HIL works, disabled build has no HIL code.

---

### T1.7: Ready Signal
**File**: `firmware/app/src/main.c` (extend)  
**Estimate**: 1h  
**Dependencies**: T1.2  

- [x] Add `hil_send_ready()` call after boot complete
- [x] Include firmware version and capabilities in JSON

**Acceptance**: Device emits `{"t":"ready",...}` on boot.

---

## Phase 2: Test Framework (TypeScript)

### T2.1: Package Scaffold
**Directory**: `packages/zplc-hil/`  
**Estimate**: 1h  
**Dependencies**: None  

- [x] Create `package.json` with name `@zplc/hil`
- [x] Add dependencies: `serialport`, `@serialport/parser-readline`
- [x] Add devDependencies: `bun-types`, `@types/node`
- [x] Create `tsconfig.json` with strict mode
- [x] Create `src/index.ts` with placeholder exports
- [x] Add to workspace `bun.lockb`

**Acceptance**: `bun install` succeeds, `bun run typecheck` passes.

---

### T2.2: Device Connection
**File**: `packages/zplc-hil/src/device.ts`  
**Estimate**: 4h  
**Dependencies**: T2.1  

- [x] Define `DeviceConnection` interface matching data model
- [x] Implement `connect(port: string, options?: ConnectionOptions): Promise<Device>`
- [x] Implement `Device.send(cmd: string): void`
- [x] Implement `Device.waitFor(pattern: RegExp, timeout: number): Promise<DebugFrame>`
- [x] Implement `Device.onFrame(handler: (frame: DebugFrame) => void): void`
- [x] Implement `Device.close(): Promise<void>`
- [x] Implement `listDevices(): Promise<DeviceInfo[]>`
- [x] Handle serial errors with proper cleanup

**Acceptance**: Can connect, send commands, receive frames, disconnect cleanly.

---

### T2.3: Protocol Parser
**File**: `packages/zplc-hil/src/protocol.ts`  
**Estimate**: 3h  
**Dependencies**: T2.1  

- [x] Define all `DebugFrame` payload types (TypeScript interfaces)
- [x] Implement `parseFrame(line: string): DebugFrame | null`
- [x] Handle all message types: `opcode`, `fb`, `task`, `cycle`, `error`, `ack`, `watch`, `ready`
- [x] Ignore non-JSON lines (shell prompts, etc.)
- [x] Add timestamp on parse

**Acceptance**: All protocol messages parse correctly, invalid input returns null.

---

### T2.4: Test Runner
**File**: `packages/zplc-hil/src/runner.ts`  
**Estimate**: 6h  
**Dependencies**: T2.2, T2.3  

- [x] Define `HILTestCase` interface matching data model
- [x] Implement `runTest(device: Device, test: HILTestCase): Promise<TestResult>`
- [x] Implement compile step (call CLI or library)
- [x] Implement upload step
- [x] Implement execution with frame capture
- [x] Implement assertion checking
- [x] Implement retry logic for flaky tests
- [x] Implement timeout handling

**Acceptance**: Can run a test case end-to-end, returns structured result.

---

### T2.5: Assertions
**File**: `packages/zplc-hil/src/assertions.ts`  
**Estimate**: 3h  
**Dependencies**: T2.3  

- [x] Implement `assertPattern(frames: DebugFrame[], pattern: RegExp): boolean`
- [x] Implement `assertTiming(frames: DebugFrame[], spec: TimingSpec): boolean`
- [x] Implement `assertValue(frames: DebugFrame[], addr: number, expected: any): boolean`
- [x] Implement `assertError(frames: DebugFrame[], code: number): boolean`
- [x] Implement `assertNoError(frames: DebugFrame[]): boolean`
- [x] Return detailed failure messages

**Acceptance**: All assertion types work, failures include diagnostic info.

---

### T2.6: JUnit Reporter
**File**: `packages/zplc-hil/src/reporter.ts`  
**Estimate**: 2h  
**Dependencies**: T2.4  

- [x] Implement `generateJunitXml(results: TestResult[]): string`
- [x] Include `<testsuite>` with counts and timing
- [x] Include `<testcase>` for each result
- [x] Include `<failure>` with message for failed tests
- [x] Include `<properties>` with device info
- [x] Write to file

**Acceptance**: Output validates against JUnit XSD, GitHub Actions parses it.

---

### T2.7: Main Orchestrator
**File**: `packages/zplc-hil/src/index.ts`  
**Estimate**: 3h  
**Dependencies**: T2.2, T2.4, T2.6  

- [x] Export `hil.run()` for single test execution
- [x] Export `hil.runSuite()` for suite execution
- [x] Export `hil.connect()` for manual device access
- [ ] Implement suite discovery from test files
- [ ] Implement parallel test execution (future: multiple devices)
- [ ] Implement progress output

**Acceptance**: Can run tests programmatically and from CLI.

---

## Phase 3: CLI Interface

### T3.1: CLI Scaffold
**Directory**: `packages/zplc-ide/src/cli/`  
**Estimate**: 2h  
**Dependencies**: None  

- [x] Create `index.ts` with argument parser (Bun.argv)
- [x] Implement command routing: `compile`, `upload`, `run`, `devices`, `debug`, `hil`
- [x] Implement global options: `--help`, `--version`, `--json`, `--verbose`
- [x] Add to `package.json` as `bin` entry

**Acceptance**: `zplc-cli --help` shows all commands.

---

### T3.2: Compile Command
**File**: `packages/zplc-ide/src/cli/compile.ts`  
**Estimate**: 3h  
**Dependencies**: T3.1  

- [x] Import existing compiler from `@zplc/compiler`
- [x] Implement `--output`, `--language`, `--debug`, `--optimize`, `--map`, `--check`
- [x] Output JSON on `--json`
- [x] Proper exit codes

**Acceptance**: Can compile all 4 languages, output matches spec.

---

### T3.3: Upload Command
**File**: `packages/zplc-ide/src/cli/upload.ts`  
**Estimate**: 3h  
**Dependencies**: T3.1, T2.2  

- [x] Reuse upload logic from IDE or implement fresh
- [x] Implement `--port`, `--baud`, `--timeout`, `--verify`, `--run`
- [x] Auto-detect port if not specified
- [x] Output JSON on `--json`

**Acceptance**: Can upload and verify bytecode, proper error messages.

---

### T3.4: Run Command
**File**: `packages/zplc-ide/src/cli/run.ts`  
**Estimate**: 2h  
**Dependencies**: T3.2, T3.3  

- [x] Combine compile + upload
- [ ] Implement `--timeout`, `--cycles`, `--debug-mode`, `--capture`
- [ ] Stream output or capture to file

**Acceptance**: One-shot compile→upload→run works.

---

### T3.5: Devices Command
**File**: `packages/zplc-ide/src/cli/devices.ts`  
**Estimate**: 1h  
**Dependencies**: T2.2  

- [x] List connected devices
- [x] Implement `--probe` for firmware version
- [x] Implement `--wait` for device connection

**Acceptance**: Lists devices, probe shows version.

---

### T3.6: HIL Command
**File**: `packages/zplc-ide/src/cli/hil.ts`  
**Estimate**: 2h  
**Dependencies**: T2.7  

- [x] Implement `--suite`, `--timeout`, `--retries`, `--junit`, `--fail-fast`
- [ ] Support test pattern arguments
- [ ] Output progress and summary

**Acceptance**: Can run full test suite from CLI.

---

### T3.7: Bun Compile
**File**: `packages/zplc-ide/scripts/build-cli.ts`  
**Estimate**: 1h  
**Dependencies**: T3.1-T3.6  

- [x] Create build script using `bun build --compile`
- [x] Output to `dist/zplc-cli`
- [x] Test on macOS and Linux

**Acceptance**: Standalone binary works without Bun installed.

---

## Phase 4: Test Definitions

### T4.1: Opcode Tests - Arithmetic
**Directory**: `packages/zplc-hil/tests/opcodes/arithmetic.test.ts`  
**Estimate**: 4h  
**Dependencies**: T2.7  

- [x] `OP_ADD`: basic, overflow, negative
- [x] `OP_SUB`: basic, underflow, negative
- [x] `OP_MUL`: basic, overflow
- [x] `OP_DIV`: basic, by zero (error expected)
- [x] `OP_MOD`: basic, by zero
- [x] `OP_NEG`: positive to negative, double negation

**Acceptance**: All arithmetic opcodes tested with edge cases.

---

### T4.2: Opcode Tests - Stack
**Directory**: `packages/zplc-hil/tests/opcodes/stack.test.ts`  
**Estimate**: 3h  
**Dependencies**: T2.7  

- [x] `OP_PUSH_*`: all literal types
- [x] `OP_POP`: basic, underflow
- [x] `OP_DUP`: basic
- [x] `OP_SWAP`: basic
- [ ] `OP_ROT`: basic
- [ ] Stack depth tracking

**Acceptance**: Stack operations tested, overflow/underflow handled.

---

### T4.3: Opcode Tests - Memory
**Directory**: `packages/zplc-hil/tests/opcodes/memory.test.ts`  
**Estimate**: 3h  
**Dependencies**: T2.7  

- [x] `OP_LD_*`: all types (I8, I16, I32, U8, U16, U32, F32)
- [x] `OP_ST_*`: all types
- [x] Out of bounds (error expected)

**Acceptance**: All memory access opcodes tested.

---

### T4.4: Opcode Tests - Control Flow
**Directory**: `packages/zplc-hil/tests/opcodes/control.test.ts`  
**Estimate**: 3h  
**Dependencies**: T2.7  

- [x] `OP_JMP`: forward, backward
- [x] `OP_JMPC`: true path, false path
- [x] `OP_JMPNC`: true path, false path
- [ ] `OP_CALL` / `OP_RET`: basic, nested
- [ ] `OP_END`: program termination

**Acceptance**: All control flow opcodes tested.

---

### T4.5: Opcode Tests - Logic & Comparison
**Directory**: `packages/zplc-hil/tests/opcodes/logic.test.ts`  
**Estimate**: 3h  
**Dependencies**: T2.7  

- [x] `OP_AND`, `OP_OR`, `OP_XOR`, `OP_NOT`
- [x] `OP_EQ`, `OP_NE`, `OP_LT`, `OP_LE`, `OP_GT`, `OP_GE`
- [x] Boolean edge cases

**Acceptance**: All logic/comparison opcodes tested.

---

### T4.6: Function Block Tests - Timers
**Directory**: `packages/zplc-hil/tests/blocks/timers.test.ts`  
**Estimate**: 4h  
**Dependencies**: T2.7  

- [x] `TON`: delayed on, reset, retriggered
- [ ] `TOF`: delayed off, reset
- [ ] `TP`: pulse, retriggered during pulse
- [x] Timing assertions with tolerance

**Acceptance**: Timer blocks tested with timing verification.

---

### T4.7: Function Block Tests - Counters & Triggers
**Directory**: `packages/zplc-hil/tests/blocks/counters.test.ts`  
**Estimate**: 3h  
**Dependencies**: T2.7  

- [ ] `CTU`: count up, reset, overflow
- [ ] `CTD`: count down, reset, underflow
- [ ] `CTUD`: combined
- [ ] `R_TRIG`: rising edge detection
- [ ] `F_TRIG`: falling edge detection

**Acceptance**: Counter and trigger blocks tested.

---

### T4.8: Scheduler Tests
**Directory**: `packages/zplc-hil/tests/scheduler/`  
**Estimate**: 4h  
**Dependencies**: T2.7  

- [ ] Single task execution
- [ ] Multiple tasks, priority order
- [ ] Task periods respected
- [ ] Overrun detection
- [ ] Task timing assertions

**Acceptance**: Multi-task scheduling verified.

---

### T4.9: Language Tests
**Directory**: `packages/zplc-hil/tests/languages/`  
**Estimate**: 4h  
**Dependencies**: T2.7  

- [ ] ST: basic program, FBs, loops
- [ ] LD: contacts, coils, FBs
- [ ] FBD: blocks, connections
- [ ] SFC: steps, transitions

**Acceptance**: All 4 languages compile and execute correctly.

---

## Phase 5: CI Integration

### T5.1: GitHub Actions Workflow
**File**: `.github/workflows/hil-tests.yml`  
**Estimate**: 2h  
**Dependencies**: T4.*  

- [x] Trigger on push/PR to relevant paths
- [x] Use `runs-on: [self-hosted, pico]`
- [x] Checkout, install, build, test
- [x] Upload JUnit results
- [x] Fail on test failures

**Acceptance**: CI runs HIL tests on self-hosted runner.

---

### T5.2: Runner Setup Documentation
**File**: `docs/ci/hil-runner-setup.md`  
**Estimate**: 1h  
**Dependencies**: T5.1  

- [ ] Hardware requirements
- [ ] Runner installation
- [ ] USB permissions
- [ ] Troubleshooting

**Acceptance**: New CI machine can be set up from docs.

---

## Summary

| Phase | Tasks | Estimate |
|-------|-------|----------|
| Phase 1: Runtime | T1.1-T1.7 | 17h |
| Phase 2: Framework | T2.1-T2.7 | 22h |
| Phase 3: CLI | T3.1-T3.7 | 14h |
| Phase 4: Tests | T4.1-T4.9 | 31h |
| Phase 5: CI | T5.1-T5.2 | 3h |
| **Total** | **30 tasks** | **~87h (11 days)** |

## Suggested Order

1. **T1.1 → T1.2 → T1.3** (Debug API, can test manually)
2. **T2.1 → T2.2 → T2.3** (Connect and parse)
3. **T1.4 → T1.5 → T1.6 → T1.7** (VM integration)
4. **T2.4 → T2.5 → T2.6 → T2.7** (Runner complete)
5. **T3.1 → T3.2 → T3.3 → T3.4 → T3.5 → T3.6 → T3.7** (CLI complete)
6. **T4.1** (First opcode test as proof of concept)
7. **T4.2-T4.9** (Remaining tests)
8. **T5.1 → T5.2** (CI integration)

## First Milestone: "Hello HIL"

Complete: T1.1, T1.2, T1.3, T2.1, T2.2, T2.3, T4.1 (partial)

**Goal**: Run a single `OP_ADD` test manually and see JSON output.

**Estimated Time**: 3 days
