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
  - `ET` (TIME): Elapsed Time since `IN` went high. It keeps counting while `IN` stays high, where IEC 61131-3 stops it at `PT` (see section 11).

### TOF (Off-Delay Timer)
Preserves a high state for a duration after a falling edge. `Q` follows `IN` to TRUE immediately, but delays going FALSE until `PT` has elapsed.
- **Inputs:**
  - `IN` (BOOL): Trigger condition.
  - `PT` (TIME): Preset Time (duration to keep high).
- **Outputs:**
  - `Q` (BOOL): True while `IN` is true, plus `PT` duration after `IN` goes false (`cmp-058-tof-holds-output`).
  - `ET` (TIME): Elapsed Time since `IN` went low.

### TP (Pulse Timer)
Generates a pulse of fixed duration regardless of how long the input stays high.
- **Inputs:**
  - `IN` (BOOL): Trigger condition (rising edge starts the pulse).
  - `PT` (TIME): Preset Time (pulse width).
- **Outputs:**
  - `Q` (BOOL): True for `PT` after a rising edge of `IN`, whatever `IN` does meanwhile (`cmp-057-tp-pulse-ignores-the-input-falling`). While `IN` stays high the pulse starts again after `PT`, where IEC 61131-3 gives one pulse (see section 11).
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
- **`+`, `-`, `*`, `/`**: addition, subtraction, multiplication and division of the numeric types. Integer division truncates toward zero.
- **`a MOD b`**: the integer remainder, with the sign of `a`. It is an operator: the form `MOD(a, b)` does not parse.
- The function forms `ADD(a, b)`, `SUB`, `MUL` and `DIV` do not exist; the build rejects them and names the function (`cmp-006-operator-function-form-is-rejected`).

The widths, the wrap and the behaviour at the limits are in the [numeric types](../languages/st.md#numeric-types) of Structured Text.

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
- **Outputs:** (REAL) Sine, Cosine, or Tangent of IN (`cmp-058-trigonometric-functions`).

`ASIN`, `ACOS`, `ATAN`, `ATAN2`, `LN`, `LOG` and `EXP` are also registered. They are approximations today and some are off by more than 0.05 (see section 11).

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

Six conversion functions exist. Every other `X_TO_Y` name, such as `DINT_TO_REAL`, `SINT_TO_INT`, `TIME_TO_DINT` or `DINT_TO_TIME`, is a build error that names the function (requirement CMP-057).

- **INT_TO_REAL(IN)**: converts an integer to `REAL`.
- **REAL_TO_INT(IN)**: converts a `REAL` to an integer. It truncates toward zero, saturates at the `DINT` limits and gives 0 for a NaN (`cmp-016-real-to-dint-truncates-toward-zero`, `cmp-016-real-out-of-range-to-dint`, `cmp-016-real-nan-to-dint`).
- **BOOL_TO_INT(IN)** / **INT_TO_BOOL(IN)**: TRUE becomes 1 and FALSE becomes 0; a non-zero integer becomes TRUE (`cmp-057-bool-and-round-conversions`).
- **TRUNC(IN)** / **ROUND(IN)**: return a `REAL` holding the integer part toward zero or the nearest integer (`cmp-057-trunc-truncates`, `cmp-057-bool-and-round-conversions`).

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
Compatibility stub only. It compiles to `NOP` today and does not feed, reset, or validate a hardware or software watchdog.
- **Inputs:** None.
- **Outputs:** None.

It must not be used as a safety control.

---

## 11. Known differences from IEC 61131-3

The table is generated from the conformance cases that expect IEC 61131-3 behaviour and fail today (`tools/ci/expected-failures.json`) and from the description of each requirement in `docs/known-limits.json`. A row disappears when the last case of its requirement passes.

{/* >>> GENERATED (tools/docs/generate_known_limits.py): known-limits-library. Do not edit. >>> */}
| Requirement | What happens today | Cases that fail today |
|---|---|---|
| CMP-025 | A `FIFO` called without `SIZE` faults the VM: the documented default of eight items is not applied. | `a FIFO called without SIZE holds its documented default of eight items` |
| CMP-057 | Some standard blocks and conversion functions differ from IEC 61131-3. Only six conversion functions exist (`INT_TO_REAL`, `REAL_TO_INT`, `BOOL_TO_INT`, `INT_TO_BOOL`, `TRUNC`, `ROUND`); any other `X_TO_Y` name is a build error (`Unknown function`). `REAL_TO_INT` truncates toward zero, where IEC 61131-3 rounds to the nearest integer. `TON.ET` keeps counting after it reaches `PT`. `TP` starts its pulse again after `PT` while `IN` stays TRUE. | `DINT_TO_REAL exists`<br />`INT_TO_DINT exists`<br />`REAL_TO_INT rounds to the nearest integer`<br />`TON elapsed time stops at the preset`<br />`TP is not retriggered while its input stays true`<br />`conversion functions between integer types keep an in-range value` |
| CMP-058 | Some standard functions and blocks differ from IEC 61131-3. `ASIN`, `ACOS`, `ATAN` and `ATAN2` are approximations: `ASIN(0.5)` gives 0.5259 (exact 0.5236) and `ATAN(1.0)` gives 0.7238 (exact 0.7854). `BLINK` (not an IEC block) starts in its OFF phase, so `Q` rises one `T_OFF` after `ENABLE`. `LN`, `LOG` and `EXP` are approximations: `LN(10.0)` gives 2.2183 (exact 2.3026), `EXP(1.0)` gives 2.7167 (exact 2.7183) and `LOG(1000.0)` gives 1.449 where the answer is 3.0. `SQRT` is within 0.001 on the checked values. | `ASIN, ACOS and ATAN return radians`<br />`BLINK is on for T_ON and off for T_OFF while ENABLE holds`<br />`LN, LOG, EXP and SQRT` |
{/* <<< END GENERATED: known-limits-library <<< */}

Two limits have no conformance case yet, so the table cannot show them; each appears in the table once a case exists:

- A program that calls `EXPT` is refused by the loader. Requirement CMP-058 asks for an executed case of every standard function.
- `CTUD` counting below zero and negative presets differ from IEC 61131-3: see section 2 (requirement CMP-011).

A block or function that is neither in the table nor in this list is not known to differ. That is not the same as having an executed case: requirement CMP-058 asks for one case for each standard function and block, and the repository does not have all of them yet.
