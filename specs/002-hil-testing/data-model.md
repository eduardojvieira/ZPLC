# Data Model: Hardware-in-the-Loop Testing System

**Feature**: 002-hil-testing  
**Date**: 2026-01-22

## Entities

### 1. HILTestCase

A definition of a single hardware test.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique test identifier (e.g., `opcodes.add.basic`) |
| `name` | string | Human-readable test name |
| `category` | enum | `opcode`, `fb`, `scheduler`, `language`, `debug` |
| `language` | enum | `ST`, `LD`, `FBD`, `SFC` |
| `source` | string | Source code or path to source file |
| `debugMode` | enum | `off`, `summary`, `verbose` |
| `timeout` | number | Max test duration in ms (default: 5000) |
| `retries` | number | Max retry attempts (default: 3) |
| `assertions` | Assertion[] | List of expected outcomes |

### 2. Assertion

A single expected outcome within a test.

| Field | Type | Description |
|-------|------|-------------|
| `type` | enum | `pattern`, `timing`, `error`, `value` |
| `pattern` | RegExp? | Expected serial output pattern |
| `timing` | TimingSpec? | Timing constraints |
| `address` | number? | Memory address for value assertions |
| `expected` | any? | Expected value |
| `tolerance` | number? | Tolerance percentage (default: 10) |

### 3. TimingSpec

Timing constraints for time-sensitive assertions.

| Field | Type | Description |
|-------|------|-------------|
| `afterMs` | number | Expected time in milliseconds |
| `tolerancePercent` | number | Acceptable variance (default: 10) |

### 4. DebugFrame

A parsed line of debug output from the runtime.

| Field | Type | Description |
|-------|------|-------------|
| `type` | enum | `opcode`, `fb`, `task`, `error`, `cycle`, `ack` |
| `timestamp` | number | Host-side timestamp (ms) |
| `raw` | string | Original line |
| `payload` | object | Type-specific data (see protocol) |

#### DebugFrame Payload Types

```typescript
type OpcodePayload = {
  op: string;      // e.g., "ADD"
  pc: number;      // Program counter
  sp: number;      // Stack pointer
  tos: number;     // Top of stack
};

type FBPayload = {
  name: string;    // e.g., "TON"
  id: number;      // Instance ID
  q: boolean;      // Q output
  et?: number;     // Elapsed time (timers)
  cv?: number;     // Current value (counters)
};

type TaskPayload = {
  id: number;      // Task ID
  start: number;   // Start time (ms)
  end: number;     // End time (ms)
  us: number;      // Execution time (µs)
  overrun: boolean;
};

type ErrorPayload = {
  code: number;    // VM error code
  msg: string;     // Human-readable message
};

type CyclePayload = {
  n: number;       // Cycle number
  us: number;      // Cycle time (µs)
};

type AckPayload = {
  cmd: string;     // Command acknowledged
  val: string;     // Value set
};
```

### 5. TestResult

The outcome of executing a test case.

| Field | Type | Description |
|-------|------|-------------|
| `testId` | string | Reference to HILTestCase.id |
| `status` | enum | `pass`, `fail`, `skip`, `error` |
| `duration` | number | Total test time (ms) |
| `attempts` | number | Number of attempts (1 = no retries) |
| `frames` | DebugFrame[] | All captured debug output |
| `error` | string? | Error message if failed |
| `failedAssertion` | Assertion? | Which assertion failed |

### 6. DeviceConnection

Serial connection state.

| Field | Type | Description |
|-------|------|-------------|
| `port` | string | Serial port path (e.g., `/dev/tty.usbmodem1234`) |
| `baudRate` | number | Baud rate (default: 115200) |
| `status` | enum | `disconnected`, `connecting`, `connected`, `error` |
| `firmwareVersion` | string? | Detected firmware version |
| `capabilities` | string[] | Detected capabilities (e.g., `scheduler`, `hil`) |

### 7. TestSuite

A collection of test cases.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Suite name (e.g., `opcodes`) |
| `tests` | HILTestCase[] | Tests in this suite |
| `setup` | string? | Setup code to run before suite |
| `teardown` | string? | Teardown code after suite |

### 8. TestRun

A complete execution of one or more suites.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique run ID (timestamp-based) |
| `startTime` | Date | Run start time |
| `endTime` | Date? | Run end time |
| `device` | DeviceConnection | Device used |
| `suites` | string[] | Suite names executed |
| `results` | TestResult[] | All test results |
| `summary` | RunSummary | Aggregate statistics |

### 9. RunSummary

Aggregate statistics for a test run.

| Field | Type | Description |
|-------|------|-------------|
| `total` | number | Total tests |
| `passed` | number | Passed tests |
| `failed` | number | Failed tests |
| `skipped` | number | Skipped tests |
| `errors` | number | Error tests (infra failures) |
| `duration` | number | Total duration (ms) |
| `flakeRate` | number | Percentage of tests that required retries |

---

## Relationships

```
TestRun 1──* TestResult
TestResult *──1 HILTestCase
HILTestCase 1──* Assertion
TestResult 1──* DebugFrame
TestSuite 1──* HILTestCase
TestRun *──1 DeviceConnection
```

---

## State Transitions

### DeviceConnection States

```
disconnected ──(open)──> connecting ──(ready)──> connected
     ^                       |                      |
     |                       v                      v
     └────────(error)────── error <────(error)──────┘
     ^                                              |
     └──────────────────(close)─────────────────────┘
```

### TestResult States

```
pending ──(start)──> running ──(pass)──> pass
                        |
                        ├──(fail)──> fail
                        |
                        ├──(error)──> error
                        |
                        └──(skip)──> skip
```

---

## Validation Rules

1. **HILTestCase.id**: Must be unique within a suite, format `category.name.variant`
2. **HILTestCase.timeout**: Must be > 0, max 60000ms
3. **HILTestCase.retries**: Must be 0-10
4. **Assertion.tolerance**: Must be 0-100 (percentage)
5. **TimingSpec.afterMs**: Must be > 0
6. **DeviceConnection.baudRate**: Must be one of: 9600, 19200, 38400, 57600, 115200

---

## Example Test Case Definition

```typescript
const addTest: HILTestCase = {
  id: 'opcodes.add.basic',
  name: 'OP_ADD: Basic integer addition',
  category: 'opcode',
  language: 'ST',
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
  timeout: 5000,
  retries: 3,
  assertions: [
    {
      type: 'pattern',
      pattern: /\{"t":"opcode","op":"ADD".*"tos":7\}/
    },
    {
      type: 'value',
      address: 0x2004, // result variable
      expected: 7
    }
  ]
};
```
