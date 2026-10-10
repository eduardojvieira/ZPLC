---
slug: /runtime/stdlib
id: stdlib
title: Standard Library Reference
sidebar_label: Standard Library
description: Reference for the ZPLC standard-library functions and function blocks currently documented here.
tags: [reference, stdlib, iec61131-3]
---

# ZPLC Standard Library Reference

ZPLC documents the standard-library functions and function blocks implemented by its compiler/runtime paths. Availability depends on the language workflow and target capability profile; ST is the central frontend.

This page describes the functions currently covered by this reference. Validate a project against its selected workflow and profile.

---

## 1. Timers

`PT` and `ET` are `TIME` values: an unsigned 32-bit count of milliseconds, from 0 to 4294967295 (about 49.7 days). See [Time and date types](../languages/st.md#time-and-date-types).

### TON (On-Delay Timer)
Delays a rising edge. The output `Q` goes TRUE only after `IN` has been TRUE for the duration of `PT`.
- **Inputs:**
  - `IN` (BOOL): Trigger condition.
  - `PT` (TIME): Preset Time (duration to wait).
- **Outputs:**
  - `Q` (BOOL): High if `IN` has been continuously high for `PT` (`cmp-058-ton-delays-output`).
  - `ET` (TIME): Elapsed Time since `IN` went high. It counts up to `PT` and stops there; it is 0 while `IN` is low (`cmp-057-ton-elapsed-stops-at-preset`).
- **Behavior:** `IN` low resets `Q` and `ET` at once. A preset of `T#0ms` makes `Q` follow `IN` in the same scan (`cmp-057-ton-zero-preset-follows-the-input`).

### TOF (Off-Delay Timer)
Preserves a high state for a duration after a falling edge. `Q` follows `IN` to TRUE immediately, but delays going FALSE until `PT` has elapsed.
- **Inputs:**
  - `IN` (BOOL): Trigger condition.
  - `PT` (TIME): Preset Time (duration to keep high).
- **Outputs:**
  - `Q` (BOOL): True while `IN` is true, plus `PT` duration after `IN` goes false (`cmp-058-tof-holds-output`).
  - `ET` (TIME): Elapsed Time since `IN` went low. It counts up to `PT` and stays at `PT` until `IN` goes high again; it is 0 while `IN` is high (`cmp-057-tof-elapsed-stops-at-preset`).

### TP (Pulse Timer)
Generates a pulse of fixed duration regardless of how long the input stays high.
- **Inputs:**
  - `IN` (BOOL): Trigger condition (rising edge starts the pulse).
  - `PT` (TIME): Preset Time (pulse width).
- **Outputs:**
  - `Q` (BOOL): True for `PT` after a rising edge of `IN`, whatever `IN` does meanwhile (`cmp-057-tp-pulse-ignores-the-input-falling`).
  - `ET` (TIME): Elapsed Time since pulse started. It counts up to `PT` and stops there; it holds `PT` while `IN` stays high after the pulse and is 0 once the pulse is over and `IN` is low (`cmp-057-tp-elapsed-resets-when-the-pulse-ends-with-input-low`).
- **Behavior:** The pulse runs to its end whatever `IN` does and cannot be retriggered: a level that stays high does not start a second pulse, a new pulse needs a new rising edge after the pulse has ended (`cmp-057-tp-not-retriggered`, `cmp-057-tp-new-edge-starts-a-new-pulse`). A preset of `T#0ms` gives no pulse.

---

## 2. Counters

`CTU`, `CTD` and `CTUD` keep their count in `CV` and take their preset from `PV`. Both are `INT`: 16 bits, from -32768 to 32767. The rules in this list apply to all three blocks, and each block below adds its own.

- **Counting is edge-triggered.** A count happens when the input is TRUE in this call and was FALSE in the previous call of the same instance. An input that stays TRUE counts once, and an input that is already TRUE in the first call counts once. The edge is seen between two calls, not between two scans, so a call that an `IF` skips does not see an edge that rose and fell in between.
- **Reset and load are levels and come first.** While `R` (`CTU`, `CTUD`) or `LD` (`CTD`, `CTUD`) is TRUE, nothing is counted. In `CTUD`, `R` wins over `LD`.
- **The edge detector keeps running during reset and load.** A pulse that rises while `R` or `LD` is TRUE is not counted when `R` or `LD` is released. A pulse that rises on the call in which `R` or `LD` is released is counted, provided the input was FALSE in the call before.
- **The outputs are recomputed on every call** from `CV` and `PV`, after the reset, load or count of that call.

### CTU (Count Up)
Adds 1 on every rising edge of `CU`.
- **Inputs:**
  - `CU` (BOOL): Count-up input.
  - `R` (BOOL): Reset; while TRUE, `CV` is 0.
  - `PV` (INT): Preset value.
- **Outputs:**
  - `Q` (BOOL): TRUE when `CV >= PV`.
  - `CV` (INT): Current value. It stops at 32767: an edge there is not counted, and `CV` does not wrap to -32768.

### CTD (Count Down)
Subtracts 1 on every rising edge of `CD`.
- **Inputs:**
  - `CD` (BOOL): Count-down input.
  - `LD` (BOOL): Load; while TRUE, `CV` is `PV`.
  - `PV` (INT): Preset value.
- **Outputs:**
  - `Q` (BOOL): TRUE when `CV <= 0`. A new instance starts with `CV` at 0, so `Q` is TRUE until the first load.
  - `CV` (INT): Current value. It counts below 0 and stops at -32768: an edge there is not counted, and `CV` does not wrap to 32767 (`cmp-058-ctd-counts-below-zero`, `cmp-058-ctd-stops-at-the-int-minimum`).

### CTUD (Count Up/Down)
Adds 1 on a rising edge of `CU` and subtracts 1 on a rising edge of `CD`.
- **Inputs:**
  - `CU` (BOOL): Count-up input.
  - `CD` (BOOL): Count-down input.
  - `R` (BOOL): Reset; while TRUE, `CV` is 0.
  - `LD` (BOOL): Load; while TRUE and `R` is FALSE, `CV` is `PV`.
  - `PV` (INT): Preset value.
- **Outputs:**
  - `QU` (BOOL): TRUE when `CV >= PV`.
  - `QD` (BOOL): TRUE when `CV <= 0`.
  - `CV` (INT): Current value. It stops at 32767 as `CTU` does and at -32768 counting down. A rising edge of `CU` and one of `CD` in the same call cancel each other.

### Signed values

`CV` and `PV` are signed 16-bit values and every comparison is signed: a negative `PV` is a negative preset (a `CTU` with `PV := -3` has `Q` TRUE from the first call, `cmp-058-ctu-with-a-negative-preset`), and `QU` and `QD` of `CTUD` compare `CV` with `PV` and with 0 as signed numbers below zero (`cmp-058-ctud-counts-down-through-zero-and-back`).

Evidence level: host. The cases `cmp-058-ctu-*`, `cmp-058-ctd-*` and `cmp-058-ctud-*` under `conformance/cmp/` run on the native runtime, and `packages/zplc-compiler/src/compiler/stdlib/counters.test.ts` replays the generated code scan by scan, including the stops at 32767 and at -32768.

---

## 3. Bistable (Flip-Flop) Elements

### RS (Reset-Dominant Flip-Flop)
- **Inputs:** `S` (BOOL, Set), `R1` (BOOL, Reset).
- **Outputs:** `Q1` (BOOL).
- **Behavior:** Latches `Q1` to TRUE when `S` is TRUE. Resets `Q1` to FALSE when `R1` is TRUE. *If both `S` and `R1` are TRUE, the output is FALSE (Reset wins).*

### SR (Set-Dominant Flip-Flop)
- **Inputs:** `S1` (BOOL, Set), `R` (BOOL, Reset).
- **Outputs:** `Q1` (BOOL).
- **Behavior:** Latches `Q1` to TRUE when `S1` is TRUE. Resets `Q1` to FALSE when `R` is TRUE. *If both `S1` and `R` are TRUE, the output is TRUE (Set wins).*

---

## 4. Edge Detection

### R_TRIG (Rising Edge Detector)
- **Inputs:** `CLK` (BOOL).
- **Outputs:** `Q` (BOOL).
- **Behavior:** `Q` is TRUE for exactly one execution cycle when `CLK` transitions from FALSE to TRUE.

### F_TRIG (Falling Edge Detector)
- **Inputs:** `CLK` (BOOL).
- **Outputs:** `Q` (BOOL).
- **Behavior:** `Q` is TRUE for exactly one execution cycle when `CLK` transitions from TRUE to FALSE.

---

## 5. Math Functions

### Arithmetic Operators
- **`+`, `-`, `*`, `/`**: addition, subtraction, multiplication and division of the numeric types. Integer division truncates toward zero.
- **`a MOD b`**: the integer remainder, with the sign of `a`. It is an operator: the form `MOD(a, b)` does not parse.
- The function forms `ADD(a, b)`, `SUB`, `MUL` and `DIV` do not exist; the build rejects them and names the function (`cmp-006-operator-function-form-is-rejected`).

The widths, the wrap and the behaviour at the limits are in the [numeric types](../languages/st.md#numeric-types) of Structured Text.

### Advanced Math
### ABS
Calculates the absolute value.
- **Inputs:** `IN` (ANY_NUM).
- **Outputs:** (ANY_NUM) Absolute value of IN. The most negative `DINT` and `LINT` stay as they are; an `LREAL` has its sign bit cleared (`ABS(-0.0)` is 0.0).

### SQRT
Calculates the square root of a number.
- **Inputs:** `IN` (REAL or LREAL).
- **Outputs:** (the type of IN) Square root of IN; 0.0 for an `IN` of 0.0 or below. For an `LREAL` it is the correctly rounded double (`SQRTD`).

### SIN / COS / TAN
Standard trigonometric functions (evaluated in radians).
- **Inputs:** `IN` (REAL, or LREAL: the argument is rounded to REAL, the function computes in REAL and the result is widened back, so an LREAL result has the accuracy of a REAL, about seven significant digits).
- **Outputs:** (REAL) Sine, Cosine, or Tangent of IN (`cmp-058-trigonometric-functions`).
- **Domain:** every finite `IN`. A NaN or an infinity gives a NaN (`cmp-058-sine-of-infinity-and-not-a-number`). An angle of 100000 or more is reduced modulo 2 pi before the sine is taken, with 2 pi held to 36 bits in three parts that multiply exactly and a correction applied once, so the result is the sine of the REAL itself: as accurate as for a small angle up to 2^40, and with an error that grows as `IN` times 1e-19 above it (1e-4 at 2^48). A REAL of 2 pi times 2^48 (1.8e15) or more has a spacing above 2^25 radians: the angle carries no information, the reduction does not hold it and the function gives the value for an angle of 0.0, finite, without an error (`cmp-058-trigonometric-functions-of-negative-and-large-angles`).

### EXP / LN / LOG
The natural exponential, the natural logarithm and the logarithm to base 10.
- **Inputs:** `IN` (REAL; an integer is converted; an LREAL is rounded to REAL and the result widened back, with the accuracy of a REAL).
- **Outputs:** (REAL) `e ** IN`, `ln(IN)` or `log10(IN)`.
- **Range:** `EXP` gives +infinity above 88.72284 and 0.0 below -103.28. `LN` and `LOG` give -infinity for 0.0 and a NaN for a negative number.

### ASIN / ACOS / ATAN / ATAN2
Inverse trigonometric functions, in radians.
- **Inputs:** `IN` (REAL) for `ASIN`, `ACOS` and `ATAN`; `ATAN2(Y, X)` takes two REAL values.
- **Outputs:** (REAL) `ASIN` in [-pi/2, pi/2] and `ACOS` in [0, pi] for an `IN` from -1.0 to 1.0, a NaN outside it; `ATAN` in (-pi/2, pi/2) for any `IN`; `ATAN2` in (-pi, pi], the angle of the point (`X`, `Y`) measured from the positive X axis, and 0.0 for (0.0, 0.0).

### NORM_X / SCALE_X
Map a value between a range and 0.0 to 1.0.
- **NORM_X(MIN, X, MAX)**: `(X - MIN) / (MAX - MIN)`, a REAL; 0.0 when `MAX` equals `MIN`. A value outside the range is not clamped (`NORM_X(0.0, 30.0, 20.0)` is 1.5).
- **SCALE_X(MIN, X, MAX)**: `MIN + X * (MAX - MIN)`, a REAL. The bounds may be negative; integer arguments are converted.

### EXPT
`EXPT(BASE, EXP)` raises `BASE` to `EXP`; it is the operator `**` in function form. Both arguments are converted to REAL and the result is a REAL. An integer exponent, negative and 0 included, is computed by repeated squaring (`EXPT(2.0, -2.0)` is 0.25 and `EXPT(x, 0.0)` is 1.0); any other exponent as `2 ** (EXP * log2(BASE))`, a NaN for a negative base.

### Accuracy of the REAL functions
The functions above are subroutines in single-precision arithmetic, measured against `Math.*` over dense grids in the compiler test suite (`stdlib/mathlib.test.ts`). The error never exceeds:

| Function | Range | Error |
|---|---|---|
| `SQRT` | all positive REAL, subnormals included | relative 1.3e-7 |
| `EXP` | -87 to 88 | relative 1.3e-7 |
| `LN`, `LOG` | all positive REAL, subnormals included | relative 3e-7 |
| `SIN`, `COS` | magnitude up to 1000 | absolute 2e-7 |
| `SIN`, `COS` | magnitude below 2^40 (1.1e12) | absolute 2e-6 |
| `SIN`, `COS` | magnitude from 2^40 to 2^48 (2.8e14) | absolute 1e-4 |
| `TAN` | magnitude up to 1000 | relative 3e-7 |
| `TAN` | magnitude up to 2^40 | the error of the angle times `1 + TAN(x)^2`, plus 5e-7 of the result |
| `ATAN` | all REAL | absolute 2e-7 |
| `ASIN`, `ACOS` | -1.0 to 1.0 | absolute 4e-7 |
| `ATAN2` | all REAL pairs | absolute 4e-7 |

None of them faults the VM for any argument: a division by zero is replaced by the value the function defines, and a NaN argument gives a NaN.

Cost: no loop depends on the argument, so the number of instructions executed has a fixed bound: at most 40 for `SQRT`, 90 for `EXP`, `LN` and `LOG`, 105 for `ASIN` and `ACOS`, 165 for `TAN` and 75 for `SIN` and `COS` up to 100000. An angle of 100000 or more is reduced first, in 190 to 355 more instructions by its size: `SIN` and `COS` at most 430, `TAN` at most 520.

---

## 6. Selection Functions

### MAX
Returns the maximum of two values.
- **Inputs:** `IN1` (ANY_NUM), `IN2` (ANY_NUM).
- **Outputs:** (ANY_NUM) The larger of the two inputs.

### MIN
Returns the minimum of two values.
- **Inputs:** `IN1` (ANY_NUM), `IN2` (ANY_NUM).
- **Outputs:** (ANY_NUM) The smaller of the two inputs.

### LIMIT
Constrains a value within a specified range.
- **Inputs:** `MN` (ANY_NUM, minimum), `IN` (ANY_NUM, input), `MX` (ANY_NUM, maximum).
- **Outputs:** (ANY_NUM) Returns `MN` if `IN < MN`, returns `MX` if `IN > MX`, otherwise returns `IN`.

### SEL
Selects one of two values based on a boolean condition.
- **Inputs:** `G` (BOOL, condition), `IN0` (ANY, returned if G is FALSE), `IN1` (ANY, returned if G is TRUE).
- **Outputs:** (ANY) `IN0` or `IN1`.

### MUX
Multiplexer. Selects one of N inputs based on an integer index.
- **Inputs:** `K` (INT, selector index), `IN0`, `IN1`, `...` (ANY).
- **Outputs:** (ANY) Returns `INk`.

---

## 7. Bitwise Functions

### Logical Operators
- **`a AND b`, `a OR b`, `a XOR b`, `NOT a`**: operators on `BOOL`, `BYTE`, `WORD`, `DWORD` and `LWORD`, on the full declared width. The function forms `AND(a, b)`, `OR(a, b)` and `XOR(a, b)` do not parse.
- **NAND(IN1, IN2)** / **NOR(IN1, IN2)**: The negation of AND and of OR of two `BOOL` values, 0 or 1 (`cmp-058-nand-and-nor-truth-tables`).
- **AND_WORD, OR_WORD, XOR_WORD, NOT_WORD** and **AND_DWORD, OR_DWORD, XOR_DWORD, NOT_DWORD**: the same operations as functions on `WORD` and `DWORD` (`cmp-014-shr-and-word-logic-functions`).

### Shifting and Rotating
### SHL
Shift Left mathematically multiplies by 2 for each shifted bit.
- **Inputs:** `IN` (ANY_BIT), `N` (INT, number of bits to shift).
- **Outputs:** (ANY_BIT) `IN` shifted left. Rightmost bits filled with 0. A shift by 32 or more, or by a negative count, gives 0 (`cmp-016-shift-by-the-width-or-more`), and a `BYTE` or `WORD` drops the bits shifted past its width (`cmp-014-shl-byte-keeps-8-bits`).

### SHR
Shift Right mathematically divides by 2 for each shifted bit.
- **Inputs:** `IN` (ANY_BIT), `N` (INT, number of bits to shift).
- **Outputs:** (ANY_BIT) `IN` shifted right. Leftmost bits filled with 0. A shift by 32 or more, or by a negative count, gives 0.

### ROL
Rotate Left. Shift bits out of the left side re-enter on the right side.
- **Inputs:** `IN` (ANY_BIT), `N` (INT).
- **Outputs:** (ANY_BIT) Rotated value.

### ROR
Rotate Right. Shift bits out of the right side re-enter on the left side.
- **Inputs:** `IN` (ANY_BIT), `N` (INT).
- **Outputs:** (ANY_BIT) Rotated value.

---

## 8. String Functions

ZPLC strings use bounded buffers: `STRING` holds 80 characters, `STRING[n]` holds `n`. Memory holds the current length and the maximum capacity, and an assignment copies as many characters as fit.

A function that builds a string (`CONCAT`, `LEFT`, `RIGHT`, `MID`, `INSERT`, `DELETE`, `REPLACE`) returns a new string and never changes its arguments. Positions are 1-based.

- **LEN(s)**: Returns `INT` representing current character count of string `s`.
- **CONCAT(s1, s2)**: Returns `s1` followed by `s2`.
- **COPY(src, dst)**: Copies `src` string into `dst` (it writes to `dst`, as its name says).
- **CLEAR(s)**: Empties string `s` to 0 length (it writes to `s`).
- **LEFT(s, n)**: Returns the leftmost `n` characters of `s`.
- **RIGHT(s, n)**: Returns the rightmost `n` characters of `s`.
- **MID(s, pos, n)**: Returns `n` characters of `s` starting at 1-based index `pos`.
- **FIND(s1, s2)**: Returns `INT` position (1-based) of `s2` within `s1`, or 0 if not found.
- **INSERT(s1, s2, pos)**: Returns `s1` with `s2` inserted after its `pos`-th character (`pos` 0 inserts in front).
- **DELETE(s, pos, n)**: Returns `s` without the `n` characters that start at index `pos`.
- **REPLACE(s1, s2, pos, n)**: Returns `s1` with the `n` characters that start at index `pos` replaced by `s2`.
- **STRCMP(s1, s2)**: Lexicographical comparison. Returns `INT` (-1 if s1 < s2, 0 if s1 == s2, 1 if s1 > s2).

The position comes before the count in `MID`, `DELETE` and `REPLACE`. IEC 61131-3 writes the length first (`MID(IN, L, P)`): a program written to that order must swap the two arguments.

*Note: You can also use standard `=` and `< >` operators directly on STRING variables to compare them for equality.*

---

## 9. Type Conversions

Use type conversion functions to move values between types. A function `<FROM>_TO_<TO>` exists for every ordered pair of different types among `BOOL`, `SINT`, `USINT`, `BYTE`, `INT`, `UINT`, `WORD`, `DINT`, `UDINT`, `DWORD`, `LINT`, `ULINT`, `LWORD`, `REAL`, `LREAL` and `TIME`: `INT_TO_DINT`, `DINT_TO_REAL`, `SINT_TO_INT`, `REAL_TO_USINT`, `TIME_TO_DINT`, `LINT_TO_LREAL`, `LREAL_TO_ULINT` and so on (240 functions). `DATE`, `TOD` and `DT` have no conversion functions yet.

| Conversion | Result |
|---|---|
| Integer to a wider integer or one of the same width | The same value. |
| Integer to a narrower integer, or to the other signedness | The low bits of the value in the width of the destination (two's complement wrap): `INT_TO_SINT(300)` is 44, `INT_TO_UINT(-1)` is 65535, `DINT_TO_UDINT(-1)` is 4294967295. |
| Integer or `TIME` to `BOOL` | FALSE for 0, TRUE for any other value. |
| `BOOL` to a number | 0 or 1. |
| Integer to `REAL` | The nearest `REAL`, with one rounding (also for a 64-bit integer); a value above 2^24 may lose its lowest bits. |
| Integer to `LREAL` | The nearest `LREAL`; exact up to 2^53, one rounding above. |
| `REAL` to `LREAL`, `LREAL` to `REAL` | Exact widening; the nearest `REAL` (an overflow is an infinity) when narrowing. |
| `REAL` to an integer | The nearest integer, an exact half to the even integer (`REAL_TO_INT(2.5)` is 2, `REAL_TO_INT(3.5)` is 4, `REAL_TO_INT(-2.5)` is -2). A value outside the range of the destination gives its nearest limit (`REAL_TO_INT(40000.0)` is 32767, `REAL_TO_USINT(-5.0)` is 0, infinity gives the limit of its sign) and a NaN gives 0. |
| `LREAL` to an integer | As `REAL`: the nearest integer, an exact half to the even integer, the nearest limit of the destination outside its range (`LREAL_TO_LINT(1.0E30)` is 9223372036854775807, `LREAL_TO_ULINT(-2.5)` is 0), 0 for a NaN. |
| `REAL` or `LREAL` to `BOOL` | FALSE for 0.0 and -0.0, TRUE for any other value, a NaN included. |
| `TIME` | Its count of milliseconds as an unsigned 32-bit integer: `TIME_TO_DINT(T#2s)` is 2000. |

- **TRUNC(IN)**: Removes the fractional part of a `REAL` toward zero and returns a `REAL` (`TRUNC(-3.7)` is -3.0). A magnitude of 2^23 or more has no fraction and is returned as it is. For the integer, use `REAL_TO_DINT(TRUNC(x))`. For an `LREAL` the result is an `LREAL`, exact, with the limit at 2^63 (`TRUNC(-0.4)` is +0.0).
- **ROUND(IN)**: Not an IEC function. The nearest whole number as a `REAL`, an exact half away from zero (`ROUND(2.5)` is 3.0, `ROUND(-2.5)` is -3.0). For an `LREAL` the result is an `LREAL` and it is exact where adding 0.5 would not be (`ROUND(0.49999999999999994)` is 0.0).

---

## 10. System Functions

### UPTIME
Returns the runtime uptime field in milliseconds (`cmp-058-uptime-follows-the-clock`).
- **Inputs:** None.
- **Outputs:** (UDINT / TIME) Uptime in milliseconds.

### CYCLE_TIME
Reads the runtime `ZPLC_SYS_CYCLE_TIME` field for the previous cycle as exposed by the active runtime.
- **Inputs:** None.
- **Outputs:** (UDINT / TIME) Last reported cycle value. Its unit, resolution, update point, and relation to physical time are runtime/profile-specific; do not use it as a hardware timing guarantee.

### WATCHDOG_RESET
Compatibility stub only. It compiles to `NOP` and does not feed, reset, or validate a hardware or software watchdog: no opcode does, and the runtime feeds the hardware watchdog itself after each completed scan (`rt-034-watchdog-reset-is-reported-and-changes-nothing`).
- **Inputs:** None.
- **Outputs:** None.

Every call is reported by the build with the warning `WATCHDOG_RESET_NO_EFFECT` at the call (`cmp-058-uptime-follows-the-clock`); `compiler.warnings` selects it like any other warning. Remove the call: the program runs as if the line were absent. It must not be used as a safety control.

---

## 11. Known differences from IEC 61131-3

The table is generated from the conformance cases that expect IEC 61131-3 behaviour and fail today (`tools/ci/expected-failures.json`) and from the description of each requirement in `docs/known-limits.json`. A row disappears when the last case of its requirement passes.

{/* >>> GENERATED (tools/docs/generate_known_limits.py): known-limits-library. Do not edit. >>> */}
No conformance case of this area is on the expected-failures list: no limit is recorded.
{/* <<< END GENERATED: known-limits-library <<< */}

A block or function that is not in the table is not known to differ. Every standard function and every library block outside the communication blocks has an executed case under `conformance/cmp/` (requirement CMP-058).

---

## 12. Library Blocks Outside the Standard

These blocks belong to the ZPLC library and are not IEC 61131-3 blocks.

### BLINK (Asymmetric Pulse Generator)
Generates a pulse train with separate ON and OFF times.
- **Inputs:**
  - `ENABLE` (BOOL): Runs the generator while TRUE.
  - `T_ON` (TIME): Time `Q` is TRUE in each cycle.
  - `T_OFF` (TIME): Time `Q` is FALSE in each cycle.
- **Outputs:**
  - `Q` (BOOL): The pulse train.
- **Behavior:** The cycle starts with the ON phase in the scan where `ENABLE` rises: `Q` is TRUE at once, for `T_ON`, then FALSE for `T_OFF`, and so on. `ENABLE` FALSE makes `Q` FALSE at once, and the next `ENABLE` starts a new cycle with the ON phase. A phase ends at the first scan at which its time has elapsed, so with a scan period longer than `T_ON` or `T_OFF` the phase lasts one scan.

```text
ENABLE: __/¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯\____
Q:      __/¯¯¯\______/¯¯¯\______/¯¯¯\___
          |300|  700 |300|  700 |        (T_ON = 300 ms, T_OFF = 700 ms)
```

### PWM (Pulse Width Modulation)
- **Inputs:** `ENABLE` (BOOL), `PERIOD` (TIME), `DUTY` (REAL, 0.0 to 1.0).
- **Outputs:** `Q` (BOOL).
- **Behavior:** While `ENABLE` is TRUE, `Q` is TRUE for `PERIOD * DUTY` at the start of each `PERIOD`. A `DUTY` of 0.0 keeps `Q` FALSE and 1.0 keeps it TRUE. `ENABLE` FALSE makes `Q` FALSE, and the next `ENABLE` starts a new period.

### PULSE (Single Pulse Generator)
- **Inputs:** `TRIG` (BOOL), `PT` (TIME).
- **Outputs:** `Q` (BOOL).
- **Behavior:** A rising edge of `TRIG` starts a pulse of `PT`. A rising edge during the pulse is ignored, and a level that stays TRUE after it starts nothing.

### HYSTERESIS
- **Inputs:** `IN`, `HIGH`, `LOW` (REAL).
- **Outputs:** `Q` (BOOL).
- **Behavior:** `Q` becomes TRUE when `IN` is above `HIGH` and FALSE when `IN` is below `LOW`; between them it keeps its value. Negative thresholds work like any other.

### DEADBAND
- **Inputs:** `IN`, `WIDTH` (REAL).
- **Outputs:** `OUT` (REAL).
- **Behavior:** `OUT` takes the value of `IN` when `IN` differs from the last value of `OUT` by more than `WIDTH`, and keeps its value otherwise.

### LAG_FILTER
- **Inputs:** `IN` (REAL), `GAIN` (REAL, 0.0 to 1.0).
- **Outputs:** `OUT` (REAL).
- **Behavior:** `OUT := OUT + GAIN * (IN - OUT)` at each call: `GAIN` 1.0 follows `IN`, 0.0 never moves.

### RAMP_REAL
- **Inputs:** `IN` (REAL), `RATE` (REAL, the largest change for each call).
- **Outputs:** `OUT` (REAL).
- **Behavior:** `OUT` moves toward `IN` by at most `RATE` at each call, up or down, and is `IN` once it is within `RATE` of it.

### INTEGRAL
- **Inputs:** `IN` (REAL), `DT` (REAL, seconds), `RESET` (BOOL).
- **Outputs:** `OUT` (REAL).
- **Behavior:** `OUT := OUT + IN * DT` at each call; `RESET` TRUE sets `OUT` to 0.0. A negative `IN` counts down.

### DERIVATIVE
- **Inputs:** `IN` (REAL), `DT` (REAL, seconds).
- **Outputs:** `OUT` (REAL).
- **Behavior:** `OUT := (IN - previous IN) / DT`; 0.0 when `DT` is 0.0. The first call compares with an `IN` of 0.0.

### PID_Compact
A discrete PID controller.
- **Inputs:** `SP` (setpoint), `PV` (process value), `KP`, `KI`, `KD` (gains), `DT` (sample time in seconds), `OUT_MIN`, `OUT_MAX` (REAL).
- **Outputs:** `OUT` (REAL).
- **Behavior:** With `e = SP - PV`, `OUT = KP * e + KI * sum(e * DT) + KD * (e - previous e) / DT`, limited to `OUT_MIN` to `OUT_MAX`. A `DT` that is 0.0 (left out) leaves the integral and derivative terms at 0.0. The integral accumulator is not clamped while the output is limited. The first call takes the previous error as the current one, so it has no derivative step.

### FIFO (First-In, First-Out Buffer)
Holds up to 8 `DINT` values; they leave in the order they entered.
- **Inputs:**
  - `PUSH` (BOOL): A rising edge stores `DATA_IN`.
  - `POP` (BOOL): A rising edge moves the oldest value to `DATA_OUT`.
  - `RST` (BOOL): Empties the buffer.
  - `DATA_IN` (DINT): The value to store.
  - `SIZE` (DINT): Capacity, 1 to 8. A call that leaves it out gets 8, and so does a value outside 1 to 8: an instance has room for 8 values.
- **Outputs:**
  - `DATA_OUT` (DINT): The value of the last pop.
  - `COUNT` (DINT): Values held.
  - `EMPTY` (BOOL): TRUE when `COUNT` is 0.
  - `FULL` (BOOL): TRUE when `COUNT` has reached the capacity.
- **Behavior:** A push into a full buffer and a pop of an empty one do nothing.

### LIFO (Last-In, First-Out Buffer)
A stack of up to 8 `DINT` values; the last value stored leaves first. Its inputs and outputs are those of `FIFO`, with the same capacity rules.
