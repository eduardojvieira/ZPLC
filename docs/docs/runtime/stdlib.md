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
  - `ET` (TIME): Elapsed Time since `IN` went high. It counts up to `PT` and stops there; it is 0 while `IN` is low.
- **Behavior:** `IN` low resets `Q` and `ET` at once. A preset of `T#0ms` makes `Q` follow `IN` in the same scan.

### TOF (Off-Delay Timer)
Preserves a high state for a duration after a falling edge. `Q` follows `IN` to TRUE immediately, but delays going FALSE until `PT` has elapsed.
- **Inputs:**
  - `IN` (BOOL): Trigger condition.
  - `PT` (TIME): Preset Time (duration to keep high).
- **Outputs:**
  - `Q` (BOOL): True while `IN` is true, plus `PT` duration after `IN` goes false.
  - `ET` (TIME): Elapsed Time since `IN` went low. It counts up to `PT` and stays at `PT` until `IN` goes high again; it is 0 while `IN` is high.

### TP (Pulse Timer)
Generates a pulse of fixed duration regardless of how long the input stays high.
- **Inputs:**
  - `IN` (BOOL): Trigger condition (rising edge starts the pulse).
  - `PT` (TIME): Preset Time (pulse width).
- **Outputs:**
  - `Q` (BOOL): Pulses true for exactly `PT` duration upon `IN` rising edge.
  - `ET` (TIME): Elapsed Time since pulse started. It counts up to `PT` and stops there; it holds `PT` while `IN` stays high after the pulse and is 0 once the pulse is over and `IN` is low.
- **Behavior:** The pulse runs to its end whatever `IN` does and cannot be retriggered: a level that stays high does not start a second pulse, a new pulse needs a new rising edge after the pulse has ended. A preset of `T#0ms` gives no pulse.

---

## 2. Counters

### CTU (Count Up)
Increments a value on every rising edge of the input.
- **Inputs:**
  - `CU` (BOOL): Count up trigger (rising edge).
  - `R` (BOOL): Reset input; when TRUE, `CV` resets to 0.
  - `PV` (INT): Preset Value (target).
- **Outputs:**
  - `Q` (BOOL): TRUE if `CV >= PV`.
  - `CV` (INT): Current counter value.

### CTD (Count Down)
Decrements a value on every rising edge of the input.
- **Inputs:**
  - `CD` (BOOL): Count down trigger (rising edge).
  - `LD` (BOOL): Load input; when TRUE, `CV` is set to `PV`.
  - `PV` (INT): Preset Value (initial value).
- **Outputs:**
  - `Q` (BOOL): TRUE if `CV <= 0`.
  - `CV` (INT): Current counter value.

### CTUD (Count Up/Down)
Combines the features of CTU and CTD.
- **Inputs:**
  - `CU` (BOOL): Count up trigger.
  - `CD` (BOOL): Count down trigger.
  - `R` (BOOL): Reset to 0.
  - `LD` (BOOL): Load `PV` to `CV`.
  - `PV` (INT): Preset value.
- **Outputs:**
  - `QU` (BOOL): TRUE if `CV >= PV`.
  - `QD` (BOOL): TRUE if `CV <= 0`.
  - `CV` (INT): Current counter value.

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

Use type conversion functions to move values between types. A function `<FROM>_TO_<TO>` exists for every ordered pair of different types among `BOOL`, `SINT`, `USINT`, `BYTE`, `INT`, `UINT`, `WORD`, `DINT`, `UDINT`, `DWORD`, `REAL` and `TIME`: `INT_TO_DINT`, `DINT_TO_REAL`, `SINT_TO_INT`, `REAL_TO_USINT`, `TIME_TO_DINT`, and so on (132 functions). The 64-bit types and `DATE`, `TOD` and `DT` have no conversion functions yet.

| Conversion | Result |
|---|---|
| Integer to a wider integer or one of the same width | The same value. |
| Integer to a narrower integer, or to the other signedness | The low bits of the value in the width of the destination (two's complement wrap): `INT_TO_SINT(300)` is 44, `INT_TO_UINT(-1)` is 65535, `DINT_TO_UDINT(-1)` is 4294967295. |
| Integer or `TIME` to `BOOL` | FALSE for 0, TRUE for any other value. |
| `BOOL` to a number | 0 or 1. |
| Integer to `REAL` | The nearest `REAL`; a 32-bit value above 2^24 may lose its lowest bits. |
| `REAL` to an integer | The nearest integer, an exact half to the even integer (`REAL_TO_INT(2.5)` is 2, `REAL_TO_INT(3.5)` is 4, `REAL_TO_INT(-2.5)` is -2). A value outside the range of the destination gives its nearest limit (`REAL_TO_INT(40000.0)` is 32767, `REAL_TO_USINT(-5.0)` is 0, infinity gives the limit of its sign) and a NaN gives 0. |
| `REAL` to `BOOL` | FALSE for 0.0 and -0.0, TRUE for any other value. |
| `TIME` | Its count of milliseconds as an unsigned 32-bit integer: `TIME_TO_DINT(T#2s)` is 2000. |

- **TRUNC(IN)**: Removes the fractional part of a `REAL` toward zero and returns a `REAL` (`TRUNC(-3.7)` is -3.0). A magnitude of 2^23 or more has no fraction and is returned as it is. For the integer, use `REAL_TO_DINT(TRUNC(x))`.
- **ROUND(IN)**: Not an IEC function. The nearest whole number as a `REAL`, an exact half away from zero (`ROUND(2.5)` is 3.0, `ROUND(-2.5)` is -3.0).

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
