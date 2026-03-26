---
slug: /runtime/stdlib
id: stdlib
title: Standard Library Reference
sidebar_label: Standard Library
description: Complete reference of all ZPLC standard functions and function blocks (Timers, Math, Bitwise, Strings, System).
tags: [reference, stdlib, iec61131-3]
---

# ZPLC Standard Library Reference

ZPLC provides a complete suite of standard function blocks (FBs) and functions compliant with IEC 61131-3. These are available across all editors (ST, IL, LD, FBD, SFC).

Below is the exhaustive reference to every standard function available in the ZPLC runtime.

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

ZPLC strings use bounded buffers (`STRING[80]`) with built-in overflow protection. Memory holds current length and maximum capacity.

- **LEN(s)**: Returns `INT` representing current character count of string `s`.
- **CONCAT(s1, s2)**: Appends `s2` to `s1` (modifies `s1`).
- **COPY(src, dst)**: Copies `src` string into `dst`.
- **CLEAR(s)**: Empties string `s` to 0 length.
- **LEFT(s, n)**: Modifies `s` to keep only the leftmost `n` characters.
- **RIGHT(s, n)**: Modifies `s` to keep only the rightmost `n` characters.
- **MID(s, pos, n)**: Modifies `s` to keep `n` characters starting at 1-based index `pos`.
- **FIND(s1, s2)**: Returns `INT` position (1-based) of `s2` within `s1`, or 0 if not found.
- **INSERT(s1, s2, pos)**: Inserts `s2` into `s1` starting at index `pos`.
- **DELETE(s, pos, n)**: Removes `n` characters from `s` starting at index `pos`.
- **REPLACE(s1, s2, pos, n)**: Overwrites `n` characters in `s1` starting at index `pos` using `s2`.
- **STRCMP(s1, s2)**: Lexicographical comparison. Returns `INT` (-1 if s1 < s2, 0 if s1 == s2, 1 if s1 > s2).

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
Returns the millisecond representation of the hardware/processor uptime.
- **Inputs:** None.
- **Outputs:** (UDINT / TIME) Uptime in milliseconds.

### CYCLE_TIME
Retrieves the execution time taken for the previous complete PLC scheduling scan.
- **Inputs:** None.
- **Outputs:** (UDINT / TIME) Last cycle duration in milliseconds. useful for profiling cyclic logic.

### WATCHDOG_RESET
Forces a clear on the hardware/software task watchdog. Use internally inside extended loops.
- **Inputs:** None.
- **Outputs:** (BOOL) `TRUE` if successful.