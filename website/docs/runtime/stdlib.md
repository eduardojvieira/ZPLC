# ZPLC Standard Library Reference

ZPLC provides a suite of standard function blocks (FBs) and functions compliant with IEC 61131-3. These are available in both the Structured Text (ST) compiler and the visual editors (LD/FBD).

## 1. Timers

### TON (On-Delay Timer)
Delays a rising edge.
- **Inputs:**
  - `IN` (BOOL): Trigger.
  - `PT` (TIME): Preset Time.
- **Outputs:**
  - `Q` (BOOL): High if `IN` has been high for `PT`.
  - `ET` (TIME): Elapsed Time.

### TOF (Off-Delay Timer)
Preserves a high state for a duration after falling edge.
- **Inputs:**
  - `IN` (BOOL): Trigger.
  - `PT` (TIME): Preset Time.
- **Outputs:**
  - `Q` (BOOL): True while `IN` is true, plus `PT` duration after `IN` goes false.
  - `ET` (TIME): Elapsed Time.

### TP (Pulse Timer)
Generates a pulse of fixed duration.
- **Inputs:**
  - `IN` (BOOL): Trigger.
  - `PT` (TIME): Preset Time.
- **Outputs:**
  - `Q` (BOOL): Pulses true for `PT` duration on `IN` rising edge.
  - `ET` (TIME): Elapsed Time.

---

## 2. Counters

### CTU (Count Up)
- **Inputs:**
  - `CU` (BOOL): Count up trigger (rising edge).
  - `R` (BOOL): Reset count to 0.
  - `PV` (INT): Preset Value.
- **Outputs:**
  - `Q` (BOOL): True if `CV >= PV`.
  - `CV` (INT): Current Value.

### CTD (Count Down)
- **Inputs:**
  - `CD` (BOOL): Count down trigger (rising edge).
  - `LD` (BOOL): Load `PV` into `CV`.
  - `PV` (INT): Preset Value.
- **Outputs:**
  - `Q` (BOOL): True if `CV <= 0`.
  - `CV` (INT): Current Value.

### CTUD (Count Up/Down)
Combines CTU and CTD.

---

## 3. Bistable Elements

### RS (Reset-Dominant Flip-Flop)
- **Inputs:** `S` (Set), `R1` (Reset).
- **Behavior:** If both high, output is reset.

### SR (Set-Dominant Flip-Flop)
- **Inputs:** `S1` (Set), `R` (Reset).
- **Behavior:** If both high, output is set.

---

## 4. Edge Detection

### R_TRIG (Rising Edge Detector)
- **Output:** `Q` is true for exactly one cycle on rising edge of `CLK`.

### F_TRIG (Falling Edge Detector)
- **Output:** `Q` is true for exactly one cycle on falling edge of `CLK`.

---

## 5. Math Functions

Standard operators `ADD`, `SUB`, `MUL`, `DIV`, `MOD` are supported for both Integer and Real types.

### ABS
Absolute value.

### SQRT
Square root (REAL only).

### SIN / COS / TAN
Trigonometric functions (REAL only).

---

## 6. Type Conversions

- `REAL_TO_INT` / `INT_TO_REAL`
- `BOOL_TO_INT` / `INT_TO_BOOL`
- `TIME_TO_DINT` / `DINT_TO_TIME`
