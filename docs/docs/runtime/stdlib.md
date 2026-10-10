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

### TON (On-Delay Timer)
Delays a rising edge. The output `Q` goes TRUE only after `IN` has been TRUE for the duration of `PT`.
- **Inputs:**
  - `IN` (BOOL): Trigger condition.
  - `PT` (TIME): Preset Time (duration to wait).
- **Outputs:**
  - `Q` (BOOL): High if `IN` has been continuously high for `PT`.
  - `ET` (TIME): Elapsed Time since `IN` went high.

### TOF (Off-Delay Timer)
Preserves a high state for a duration after a falling edge. `Q` follows `IN` to TRUE immediately, but delays going FALSE until `PT` has elapsed.
- **Inputs:**
  - `IN` (BOOL): Trigger condition.
  - `PT` (TIME): Preset Time (duration to keep high).
- **Outputs:**
  - `Q` (BOOL): True while `IN` is true, plus `PT` duration after `IN` goes false.
  - `ET` (TIME): Elapsed Time since `IN` went low.

### TP (Pulse Timer)
Generates a pulse of fixed duration regardless of how long the input stays high.
- **Inputs:**
  - `IN` (BOOL): Trigger condition (rising edge starts the pulse).
  - `PT` (TIME): Preset Time (pulse width).
- **Outputs:**
  - `Q` (BOOL): Pulses true for exactly `PT` duration upon `IN` rising edge.
  - `ET` (TIME): Elapsed Time since pulse started.

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
  - `CV` (INT): Current value. It stops at 0: an edge there is not counted.

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
  - `CV` (INT): Current value. It stops at 32767 as `CTU` does. A rising edge of `CU` and one of `CD` in the same call cancel each other.

### Counting below zero and negative presets (open requirement)

IEC 61131-3 lets a counter go down to -32768 and compares signed values. ZPLC does not follow it there yet. Today:

- `CTD` stops at 0, as listed above.
- `CTUD` has no lower limit: `CV` goes on to -1, -2 and so on, but `QU` and `QD` compare `CV` and `PV` as unsigned 16-bit numbers. With a negative `CV`, `QU` is TRUE and `QD` is FALSE, where IEC 61131-3 gives `QU` FALSE and `QD` TRUE.
- A negative `PV` is read as 65536 plus `PV`. A `CTU` with `PV := -1` never sets `Q`, and a `CTD` that loads a negative `PV` goes on counting down below zero with `Q` FALSE.

This is requirement CMP-011 (comparison on `INT` with negative values) and, for the boundary values of the standard blocks, CMP-058. Use a preset of 0 or more, and do not rely on `QU` or `QD` below zero.

Evidence level: host. The cases `cmp-058-ctu-*`, `cmp-058-ctd-*` and `cmp-058-ctud-*` under `conformance/cmp/` run on the native runtime, and `packages/zplc-compiler/src/compiler/stdlib/counters.test.ts` replays the generated code scan by scan, including the stop of `CTD` at 0. The behaviour below zero and with a negative preset was observed on the native runtime and is recorded in the comments of `packages/zplc-compiler/src/compiler/stdlib/counters.ts`; no conformance case pins it yet.

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
- **ADD(IN1, IN2)**: Returns `IN1 + IN2`. Supports ANY_NUM (INT, REAL).
- **SUB(IN1, IN2)**: Returns `IN1 - IN2`. Supports ANY_NUM.
- **MUL(IN1, IN2)**: Returns `IN1 * IN2`. Supports ANY_NUM.
- **DIV(IN1, IN2)**: Returns `IN1 / IN2`. Supports ANY_NUM.
- **MOD(IN1, IN2)**: Returns the integer remainder of `IN1 / IN2`. Supports ANY_INT.

### Advanced Math
### ABS
Calculates the absolute value.
- **Inputs:** `IN` (ANY_NUM).
- **Outputs:** (ANY_NUM) Absolute value of IN.

### SQRT
Calculates the square root of a number.
- **Inputs:** `IN` (REAL).
- **Outputs:** (REAL) Square root of IN.

### SIN / COS / TAN
Standard trigonometric functions (evaluated in radians).
- **Inputs:** `IN` (REAL).
- **Outputs:** (REAL) Sine, Cosine, or Tangent of IN.

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
- **AND(IN1, IN2)**: Bitwise AND. Supports ANY_BIT (BYTE, WORD, DWORD).
- **OR(IN1, IN2)**: Bitwise OR. Supports ANY_BIT.
- **XOR(IN1, IN2)**: Bitwise Exclusive OR. Supports ANY_BIT.
- **NOT(IN)**: Bitwise Inversion. Supports ANY_BIT.

### Shifting and Rotating
### SHL
Shift Left mathematically multiplies by 2 for each shifted bit.
- **Inputs:** `IN` (ANY_BIT), `N` (INT, number of bits to shift).
- **Outputs:** (ANY_BIT) `IN` shifted left. Rightmost bits filled with 0.

### SHR
Shift Right mathematically divides by 2 for each shifted bit.
- **Inputs:** `IN` (ANY_BIT), `N` (INT, number of bits to shift).
- **Outputs:** (ANY_BIT) `IN` shifted right. Leftmost bits filled with 0.

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

Use type conversion functions to safely move payloads between memory classes.

- **REAL_TO_INT(IN)** / **INT_TO_REAL(IN)**: Input INT or REAL, outputs corresponding conversion.
- **BOOL_TO_INT(IN)** / **INT_TO_BOOL(IN)**: TRUE becomes 1; FALSE becomes 0.
- **TIME_TO_DINT(IN)** / **DINT_TO_TIME(IN)**: Conversion between milliseconds integer and IEC TIME definitions.

---

## 10. System Functions

### UPTIME
Returns the runtime uptime field in milliseconds.
- **Inputs:** None.
- **Outputs:** (UDINT / TIME) Uptime in milliseconds.

### CYCLE_TIME
Reads the runtime `ZPLC_SYS_CYCLE_TIME` field for the previous cycle as exposed by the active runtime.
- **Inputs:** None.
- **Outputs:** (UDINT / TIME) Last reported cycle value. Its unit, resolution, update point, and relation to physical time are runtime/profile-specific; do not use it as a hardware timing guarantee.

### WATCHDOG_RESET
Compatibility stub only. It compiles to `NOP` today and does not feed, reset, or validate a hardware or software watchdog.
- **Inputs:** None.
- **Outputs:** None.

It must not be used as a safety control.
