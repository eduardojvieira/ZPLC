# Feature Specification: Hardware-in-the-Loop Testing System

**Feature Branch**: `002-hil-testing`  
**Created**: 2026-01-22  
**Status**: Draft  
**Input**: Hardware-in-the-loop testing for ZPLC runtime validation using Raspberry Pi Pico with serial debug reporting. Full verification of runtime functions, function blocks, programs, tasks, and all instructions across all languages.

## User Scenarios & Testing

### User Story 1 - Automated Runtime Instruction Verification (Priority: P1)

As a QA Engineer, I want an automated test suite that compiles test programs, uploads them to a physical Raspberry Pi Pico, and verifies correct execution via serial debug output, so that I can validate every VM instruction (75 opcodes) executes correctly on real hardware.

**Why this priority**: The VM instruction set is the foundation of ZPLC. If opcodes behave differently on hardware vs simulation, all higher-level functionality is compromised. This is the atomic unit of correctness.

**Independent Test**: Run a single opcode test (e.g., `OP_ADD`): compile a minimal ST program that adds two numbers, upload to Pico, capture serial output, verify the result matches expected value.

**Acceptance Scenarios**:

1. **Given** a test case for `OP_ADD`, **When** the test runner executes, **Then** the Pico outputs `[DEBUG] OP_ADD: result=7` (for 3+4) and the test passes.
2. **Given** an instruction that causes a runtime error (e.g., `OP_DIV` by zero), **When** the test runs, **Then** the Pico outputs `[ERROR] ZPLC_VM_DIV_BY_ZERO` and the test correctly expects this error.
3. **Given** all 75 opcodes, **When** the full test suite runs, **Then** each opcode has at least one passing test case with documented expected behavior.

---

### User Story 2 - Function Block Validation (Priority: P1)

As a QA Engineer, I want to verify that all 22 standard function blocks (TON, TOF, CTU, CTD, R_TRIG, etc.) execute correctly on hardware with proper timing behavior, so that users can trust timer and counter behavior in production.

**Why this priority**: Function blocks involve time-dependent behavior that may differ between WASM simulation and real RTOS timing. Critical for industrial control applications.

**Independent Test**: Run a TON timer test: set PT to 100ms, verify Q becomes TRUE after ~100ms (within acceptable tolerance), capture timing data via serial.

**Acceptance Scenarios**:

1. **Given** a TON timer with PT=100ms, **When** IN goes TRUE, **Then** serial output shows Q becomes TRUE within 90-110ms (10% tolerance).
2. **Given** a CTU counter with PV=5, **When** CU is pulsed 5 times, **Then** Q becomes TRUE and CV=5 is reported via serial.
3. **Given** R_TRIG edge detector, **When** input transitions from FALSE to TRUE, **Then** Q pulses TRUE for exactly one scan cycle.

---

### User Story 3 - Multi-Task Scheduling Verification (Priority: P1)

As a QA Engineer, I want to verify that the scheduler correctly executes multiple tasks with different priorities and intervals on hardware, so that I can guarantee deterministic multi-task behavior in production PLCs.

**Why this priority**: The scheduler is critical for real-time control. Any timing deviation or priority inversion could cause safety issues in industrial applications.

**Independent Test**: Create a program with 3 tasks at different intervals (10ms, 50ms, 100ms), verify via serial that each task fires at the correct frequency.

**Acceptance Scenarios**:

1. **Given** Task1 at 10ms interval, **When** running for 1 second, **Then** serial shows Task1 executed 100 times (±5%).
2. **Given** Task1 (high priority) and Task2 (low priority) both ready, **When** scheduler runs, **Then** Task1 always executes first.
3. **Given** a task that takes longer than its interval, **Then** runtime reports watchdog warning via serial.

---

### User Story 4 - IDE-to-Hardware Integration Test (Priority: P2)

As a Developer, I want the test framework to use the actual IDE compile and upload workflow so that any integration issues between IDE, compiler, and hardware are caught automatically.

**Why this priority**: The HIL tests should exercise the real deployment path, not a bypassed test-only path. This catches integration bugs.

**Independent Test**: From the IDE, compile a simple program, upload to Pico, verify execution - all triggered by a single test command.

**Acceptance Scenarios**:

1. **Given** an ST program in the test suite, **When** the test runner invokes IDE compilation, **Then** a valid `.zplc` binary is produced.
2. **Given** a compiled `.zplc` file, **When** the test runner invokes serial upload, **Then** the Pico ACKs successful reception.
3. **Given** a complete test, **When** it runs end-to-end, **Then** the entire compile-upload-verify cycle completes in under 30 seconds.

---

### User Story 5 - Visual Language Verification (Priority: P2)

As a QA Engineer, I want to verify that Ladder Diagram (LD), Function Block Diagram (FBD), and Sequential Function Chart (SFC) programs compile and execute correctly on hardware, so that visual programming has the same reliability as Structured Text.

**Why this priority**: Visual languages are a key differentiator for ZPLC. They must produce identical bytecode behavior to ST equivalents.

**Independent Test**: Create equivalent programs in ST and LD (e.g., a simple AND gate), verify both produce identical output on hardware.

**Acceptance Scenarios**:

1. **Given** an LD program with 2 contacts in series, **When** both inputs are TRUE, **Then** output is TRUE on hardware.
2. **Given** an FBD program with a TON block, **When** executed, **Then** timing behavior matches ST equivalent.
3. **Given** an SFC with 3 steps, **When** transitions fire, **Then** step changes are reported correctly via serial.

---

### User Story 6 - Debug Protocol Verification (Priority: P2)

As a Developer, I want to verify that the debug protocol (breakpoints, single-step, variable watch) works correctly over serial between IDE and hardware, so that developers can debug programs running on real PLCs.

**Why this priority**: The debug features are essential for professional use. They must work reliably on hardware, not just in simulation.

**Independent Test**: Set a breakpoint, run until hit, read variable values, single-step, verify all responses via serial.

**Acceptance Scenarios**:

1. **Given** a breakpoint at line 5, **When** program runs, **Then** execution pauses and serial reports `[DEBUG] PAUSED at PC=0x0012`.
2. **Given** a paused VM, **When** single-step command is sent, **Then** exactly one instruction executes and new PC is reported.
3. **Given** a watch request for variable `counter`, **Then** current value is returned via serial within 50ms.

---

### User Story 7 - Regression Test Suite (Priority: P3)

As a Maintainer, I want the HIL test suite to run as part of CI/CD so that hardware regressions are caught automatically before release.

**Why this priority**: Prevents shipping broken hardware support. Requires physical hardware connected to CI runner.

**Independent Test**: Configure GitHub Actions self-hosted runner with connected Pico, verify tests run automatically on push.

**Acceptance Scenarios**:

1. **Given** a push to `main`, **When** CI runs, **Then** HIL tests execute on physical hardware.
2. **Given** a failing test, **When** CI completes, **Then** PR is blocked with clear failure report.
3. **Given** a test flake (timing variance), **Then** test is automatically retried up to 3 times before failing.

---

### Edge Cases

- What happens when the Pico is not connected or unresponsive? (Test framework must timeout gracefully and report connection failure)
- What happens when serial output is garbled or incomplete? (Framework must detect corruption and retry/fail clearly)
- What happens when a test exceeds the watchdog timeout? (Runtime must report watchdog error, test must capture it)
- How do we handle timing variance in RTOS scheduling? (Define acceptable tolerance per test, typically 5-10%)
- What happens when flash storage is full? (Pico must report error, framework must catch it)

## Requirements

### Functional Requirements

#### Runtime Debug Infrastructure

- **FR-001**: Runtime MUST implement a serial debug output system that reports VM execution state in a parseable format.
- **FR-002**: Debug output format MUST be `[LEVEL] CATEGORY: key1=value1, key2=value2\n` for machine parsing.
- **FR-003**: Runtime MUST support two debug verbosity modes: "verbose" (reports each opcode with stack state) for instruction-level tests, and "summary" (reports per-cycle results only) for timing tests.
- **FR-004**: Runtime MUST report function block state changes including FB name, instance ID, and relevant outputs.
- **FR-005**: Runtime MUST report task scheduling events including task ID, execution time, and any deadline violations.
- **FR-006**: Debug output MUST be controllable at runtime (not compile-time) to allow field debugging of PLC programs in production deployments.
- **FR-006b**: IDE MUST provide UI control to select debug mode (off, summary, verbose) and send mode changes to connected hardware at runtime.

#### IDE/Compiler Extensions

- **FR-007**: IDE MUST support a "test mode" compilation that enables debug output in the generated bytecode.
- **FR-008**: IDE MUST expose a programmatic API (CLI or library) for compiling programs without GUI interaction.
- **FR-009**: IDE MUST expose a programmatic API for uploading `.zplc` files to connected hardware.
- **FR-010**: Compiler MUST generate source-line-to-PC mapping for correlating debug output with source code.

#### Test Framework

- **FR-011**: Test framework MUST support defining test cases in a declarative format (input conditions, expected serial output patterns).
- **FR-012**: Test framework MUST handle serial port communication including connection, baud rate configuration, and timeout handling.
- **FR-013**: Test framework MUST support regex matching for flexible serial output verification.
- **FR-014**: Test framework MUST provide timing assertions with configurable tolerance (e.g., "value changes after 100ms ±10%").
- **FR-015**: Test framework MUST generate JUnit-compatible XML reports for CI integration.
- **FR-016**: Test framework MUST support test retries for handling transient timing issues.

#### Test Coverage

- **FR-017**: Test suite MUST include at least one test case for each of the 75 VM opcodes.
- **FR-018**: Test suite MUST include test cases for all 22 standard function blocks.
- **FR-019**: Test suite MUST include test cases for multi-task scheduling with at least 3 concurrent tasks.
- **FR-020**: Test suite MUST include test cases for each IEC 61131-3 language (ST, LD, FBD, SFC).
- **FR-021**: Test suite MUST include error condition tests (div by zero, stack overflow, invalid opcode).

### Key Entities

- **HIL Test Case**: A definition of a single hardware test including source program, input setup, expected serial output, and timing constraints.
- **Debug Frame**: A single line of debug output from the runtime, parsed into structured data.
- **Test Result**: The outcome of a test case including pass/fail status, captured output, and timing metrics.
- **Device Connection**: The serial connection state between test host and Raspberry Pi Pico.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Test suite achieves 100% opcode coverage (75/75 opcodes have passing tests).
- **SC-002**: Test suite achieves 100% function block coverage (22/22 FBs have passing tests).
- **SC-003**: Multi-task tests verify timing accuracy within 5% of specified intervals.
- **SC-004**: End-to-end test cycle (compile + upload + verify) completes in under 30 seconds per test.
- **SC-005**: Test suite runs reliably on CI with less than 2% flake rate.
- **SC-006**: All 4 visual languages (ST, LD, FBD, SFC) have equivalent test coverage.
- **SC-007**: Debug protocol commands (breakpoint, step, watch) succeed in 95%+ of attempts.

## Clarifications

### Session 2026-01-22

- Q: Single vs dual USB port for debug/upload? → A: Single port only (Pico hardware constraint)
- Q: Debug output verbosity levels? → A: Two modes (verbose per-opcode, summary per-cycle) plus ability to disable completely from both IDE and runtime
- Q: HIL firmware build strategy? → A: Same build as production; debug is a runtime feature always available (useful for field debugging of PLC programs, not just HIL testing)

## Assumptions

- Raspberry Pi Pico is the reference hardware target for HIL testing (RP2040 based).
- Single USB serial port is used for both program upload and debug output (Pico has only one USB port; protocol must multiplex both functions).
- Same firmware build is used for HIL testing and production; debug features are always available and controlled at runtime (enables field debugging of PLC programs).
- Zephyr RTOS timing accuracy is sufficient for 5-10% tolerance on scheduling tests.
- Test host machine (CI runner) has reliable USB connectivity.
- Debug output overhead is acceptable during testing (not optimized for production performance).
- The existing serial upload protocol in ZPLC is used for program deployment.
- Baud rate of 115200 is sufficient for debug output throughput.
