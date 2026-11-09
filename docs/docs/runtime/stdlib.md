---
slug: /runtime/stdlib
id: stdlib
title: Standard library
sidebar_label: Standard library
description: 'What the ZPLC library contains, how to use a function block, the rules that apply across the library (time, edges, numbers, strings, conversions), and where the full tables of every function and block are.'
tags: [reference, stdlib, iec61131-3]
---

# Standard library

ZPLC ships the functions and function blocks that IEC 61131-3 programs rely on, plus a few of its own for process control and pulse generation. This page explains what is in the library, how a block behaves when you call it, and the rules that hold across it. For the signature, the pins and a worked example of any single function or block, go to the generated tables: the [function reference](../reference/functions.md) and the [function block reference](../reference/function-blocks.md).

The compiler registry in `packages/zplc-compiler/src/compiler/stdlib/index.ts` is the source of truth. A function or block exists for your program only if that registry registers it. It holds 297 functions (57 named, and 240 type conversions) and 34 function blocks.

## What is in the library

| Group                                 | Source file in `stdlib/`                              | Examples                                                                                                |
| ------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Timers                                | `timers.ts`                                           | `TON`, `TOF`, `TP`                                                                                      |
| Counters                              | `counters.ts`                                         | `CTU`, `CTD`, `CTUD`                                                                                    |
| Bistables and edge detectors          | `bistables.ts`                                        | `RS`, `SR`, `R_TRIG`, `F_TRIG`                                                                          |
| Pulse generators                      | `generators.ts`                                       | `BLINK`, `PWM`, `PULSE`                                                                                 |
| Process control                       | `process.ts`                                          | `HYSTERESIS`, `DEADBAND`, `LAG_FILTER`, `RAMP_REAL`, `INTEGRAL`, `DERIVATIVE`, `PID_Compact`            |
| Buffers                               | `system.ts`                                           | `FIFO`, `LIFO`                                                                                          |
| Math, selection and bitwise functions | `math.ts`, `functions.ts`, `bitwise.ts`, `mathlib.ts` | `ABS`, `SQRT`, `SIN`, `LIMIT`, `SEL`, `MUX`, `SHL`, `ROL`                                               |
| Strings                               | `strings.ts`                                          | `LEN`, `CONCAT`, `LEFT`, `MID`, `FIND`, `REPLACE`                                                       |
| Conversions                           | `conversions.ts`                                      | `INT_TO_REAL`, `REAL_TO_INT`, `LINT_TO_LREAL`                                                           |
| System                                | `system.ts`                                           | `UPTIME`, `CYCLE_TIME`, `WATCHDOG_RESET`                                                                |
| Communication blocks                  | `communication.ts`                                    | `MB_READ_HREG`, `MQTT_PUBLISH`; see [Communication function blocks](./communication-function-blocks.md) |

The timers, bistables, counters and edge detectors are the standard IEC blocks. `BLINK`, `PWM`, `PULSE`, the process-control blocks and the buffers belong to the ZPLC library and are not IEC 61131-3 blocks.

## Using a block

A function block keeps state, so you declare it as a variable, which is its **instance**, and call it every scan with its inputs. You read its outputs as members of the instance. A new instance starts with every pin at the zero of its type.

```st runnable expect="Done=TRUE Elapsed=50 Pulses=8 Held=1" scans=15 scan_ms=10
PROGRAM Example
VAR
    Delay : TON;
    Rising : CTU;
    Level : CTU;
    Tick : INT;
    Pulse : BOOL;
    Done : BOOL;
    Elapsed : UDINT;
    Pulses : INT;
    Held : INT;
END_VAR

Delay(IN := TRUE, PT := T#50ms);
Done := Delay.Q;
Elapsed := TIME_TO_UDINT(Delay.ET);

Tick := Tick + 1;
Pulse := (Tick MOD 2) = 1;
Rising(CU := Pulse, R := FALSE, PV := 100);
Pulses := Rising.CV;

Level(CU := TRUE, R := FALSE, PV := 100);
Held := Level.CV;
END_PROGRAM
```

After 15 scans of 10 ms, `Done` is TRUE and `Elapsed` stopped at the preset, 50. `Pulses` is 8 because `Pulse` rose on every odd scan, 1 to 15, and a counter counts rising edges, and `Held` is 1 because an input that stays TRUE counts once.

## Rules that hold across the library

### Time

A `TIME` value, such as the `PT` of a timer and its `ET`, is an unsigned 32-bit count of milliseconds, from 0 to 4294967295 (about 49.7 days). See [Time and date types](../languages/st.md#time-and-date-types).

- **TON** delays a rising edge: `Q` goes TRUE after `IN` has been TRUE for `PT`. `IN` low resets `Q` and `ET` at once, and a preset of `T#0ms` makes `Q` follow `IN` in the same scan.
- **TOF** holds a high output for `PT` after `IN` falls. `Q` follows `IN` to TRUE at once.
- **TP** gives a pulse of `PT` after a rising edge, whatever `IN` does meanwhile. It cannot be retriggered: a level that stays high does not start a second pulse, and a new pulse needs a new rising edge after the first has ended.
- In all three, `ET` counts up to `PT` and stops there.

### Edges and counters

`CTU`, `CTD` and `CTUD` keep their count in `CV` and take their preset from `PV`. Both are `INT`: 16 bits, from -32768 to 32767, and every comparison is signed, so a counter takes a negative preset and `CTD` counts below zero.

- **Counting is edge-triggered.** A count happens when the input is TRUE in this call and was FALSE in the previous call of the same instance. The edge is seen between two calls, not between two scans, so a call that an `IF` skips does not see an edge that rose and fell in between.
- **Reset and load are levels and come first.** While `R` (`CTU`, `CTUD`) or `LD` (`CTD`, `CTUD`) is TRUE, nothing is counted. In `CTUD`, `R` wins over `LD`.
- **The edge detector keeps running during reset and load.** A pulse that rises while `R` or `LD` is TRUE is not counted when it is released; one that rises on the call in which it is released is counted, if the input was FALSE in the call before.
- **The outputs are recomputed on every call** from `CV` and `PV`, after the reset, load or count of that call.

| Block  | Count                                                 | Priority                       | `CV` limit                                   | Outputs                                              |
| ------ | ----------------------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------------------- |
| `CTU`  | +1 on a rising edge of `CU`                           | `R` sets `CV` to 0             | Stops at 32767; an edge there is not counted | `Q` is `CV >= PV`                                    |
| `CTD`  | -1 on a rising edge of `CD`                           | `LD` sets `CV` to `PV`         | Stops at -32768                              | `Q` is `CV <= 0`, so it is TRUE until the first load |
| `CTUD` | +1 on `CU`, -1 on `CD`; both edges in one call cancel | `R`, then `LD`, then the edges | Stops at 32767 and at -32768                 | `QU` is `CV >= PV`, `QD` is `CV <= 0`                |

The bistables resolve a tie by their name: `RS` is reset-dominant, so `Q1` is FALSE when `S` and `R1` are both TRUE, and `SR` is set-dominant. `R_TRIG` and `F_TRIG` give `Q` for exactly one scan on a rising or falling edge of `CLK`.

Evidence level: host. The cases `cmp-058-ctu-*`, `cmp-058-ctd-*` and `cmp-058-ctud-*` under `conformance/cmp/` run on the native runtime, and `packages/zplc-compiler/src/compiler/stdlib/counters.test.ts` replays the generated code scan by scan, including the stops at 32767 and at -32768.

### Operators are not functions

`+`, `-`, `*`, `/`, `MOD`, `AND`, `OR`, `XOR` and `NOT` are operators: write `a MOD b` and `a AND b`. The call forms `MOD(a, b)` and `AND(a, b)`, and the function forms `ADD(a, b)`, `SUB`, `MUL` and `DIV`, do not parse, and the build names the function it rejects. Integer division truncates toward zero, and `MOD` has the sign of its left operand. The widths, the wrap and the behaviour at the limits are in the [numeric types](../languages/st.md#numeric-types) of Structured Text.

### REAL functions and their accuracy

The trigonometric, exponential and logarithmic functions are subroutines in single-precision arithmetic, measured against `Math.*` over dense grids in the compiler test suite (`stdlib/mathlib.test.ts`). An `LREAL` argument is rounded to `REAL` and the result widened back, so an `LREAL` result has the accuracy of a `REAL`, about seven significant digits. The error never exceeds:

| Function       | Range                                  | Error           |
| -------------- | -------------------------------------- | --------------- |
| `SQRT`         | all positive REAL, subnormals included | relative 1.3e-7 |
| `EXP`          | -87 to 88                              | relative 1.3e-7 |
| `LN`, `LOG`    | all positive REAL, subnormals included | relative 3e-7   |
| `SIN`, `COS`   | magnitude up to 1000                   | absolute 2e-7   |
| `SIN`, `COS`   | magnitude below 2^40 (1.1e12)          | absolute 2e-6   |
| `SIN`, `COS`   | magnitude from 2^40 to 2^48 (2.8e14)   | absolute 1e-4   |
| `TAN`          | magnitude up to 1000                   | relative 3e-7   |
| `ATAN`         | all REAL                               | absolute 2e-7   |
| `ASIN`, `ACOS` | -1.0 to 1.0                            | absolute 4e-7   |
| `ATAN2`        | all REAL pairs                         | absolute 4e-7   |

None of them faults the VM for any argument: a division by zero is replaced by the value the function defines, and a NaN argument gives a NaN. No loop depends on the argument, so the number of instructions has a fixed bound. A REAL of 2 pi times 2^48 or more carries no angle information, and the sine functions then give the value for an angle of 0.0, finite, without an error.

### Strings

A `STRING` holds 80 characters and `STRING[n]` holds `n`. The buffer keeps the current length and the maximum capacity, and an assignment copies as many characters as fit. A function that builds a string (`CONCAT`, `LEFT`, `RIGHT`, `MID`, `INSERT`, `DELETE`, `REPLACE`) returns a new string and never changes its arguments, and positions are 1-based. `COPY` and `CLEAR` write to their argument, as their names say.

The position comes before the count in `MID`, `DELETE` and `REPLACE`, while IEC 61131-3 writes the length first (`MID(IN, L, P)`): a program written to that order must swap the two arguments. The operators `=` and `<>` compare two `STRING` variables for equality, and `STRCMP` gives -1, 0 or 1.

### Conversions

A function `<FROM>_TO_<TO>` exists for every ordered pair of different types among `BOOL`, `SINT`, `USINT`, `BYTE`, `INT`, `UINT`, `WORD`, `DINT`, `UDINT`, `DWORD`, `LINT`, `ULINT`, `LWORD`, `REAL`, `LREAL` and `TIME`: 240 functions. `DATE`, `TOD` and `DT` have none yet. The rules in short:

| Conversion                                             | Result                                                                                                                                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integer to a wider integer or the same width           | The same value.                                                                                                                                                                                           |
| Integer to a narrower integer, or the other signedness | The low bits in the width of the destination: `INT_TO_SINT(300)` is 44, `INT_TO_UINT(-1)` is 65535.                                                                                                       |
| `REAL` or `LREAL` to an integer                        | The nearest integer, an exact half to the even one (`REAL_TO_INT(2.5)` is 2, `REAL_TO_INT(3.5)` is 4). Outside the range it gives the nearest limit (`REAL_TO_INT(40000.0)` is 32767), and a NaN gives 0. |
| Integer or `TIME` to `BOOL`                            | FALSE for 0, TRUE for any other value.                                                                                                                                                                    |
| `TIME` to a number                                     | Its count of milliseconds: `TIME_TO_DINT(T#2s)` is 2000.                                                                                                                                                  |

The full table, with an example for each source type, is in the [function reference](../reference/functions.md). `TRUNC` removes the fraction toward zero and returns a `REAL`; `ROUND` is not an IEC function and rounds a half away from zero.

### 64-bit integers

`ABS`, `NEG`, `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`, `SQRT`, `TRUNC`, `ROUND`, `SHL`, `SHR`, `ROL` and `ROR` take the 64-bit integers and `LREAL`. The other functions refuse them with a message.

## System functions

`UPTIME` returns the runtime uptime in milliseconds. `CYCLE_TIME` reads the cycle-time field of the runtime for the previous scan; its unit, resolution and relation to physical time depend on the runtime and the profile, so do not use it as a hardware timing guarantee.

`WATCHDOG_RESET` is a compatibility stub. It compiles to `NOP` and does not feed, reset or validate any watchdog: the runtime feeds the hardware watchdog itself after each completed scan. The build reports every call with the warning `WATCHDOG_RESET_NO_EFFECT` (selectable with `compiler.warnings`). Remove the call, and never use it as a safety control.

## Known differences from IEC 61131-3 {#11-known-differences-from-iec-61131-3}

The table is generated from the conformance cases that expect IEC 61131-3 behaviour and fail today (`tools/ci/expected-failures.json`) and from the description of each requirement in `docs/known-limits.json`. A row disappears when the last case of its requirement passes.

{/* >>> GENERATED (tools/docs/generate_known_limits.py): known-limits-library. Do not edit. >>> */}
No conformance case of this area is on the expected-failures list: no limit is recorded.
{/* <<< END GENERATED: known-limits-library <<< */}

A block or function that is not in the table is not known to differ. Every standard function and every library block outside the communication blocks has an executed case under `conformance/cmp/`.
