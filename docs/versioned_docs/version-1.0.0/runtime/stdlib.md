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

---

## 7. String Functions

ZPLC provides full IEC 61131-3 compliant string manipulation. All strings use bounded buffers with automatic overflow protection.

### Memory Layout

```
┌───────────────┬───────────────┬──────────────────────┐
│ current_len   │ max_capacity  │      data[]          │
│   (2 bytes)   │   (2 bytes)   │  (max_capacity + 1)  │
└───────────────┴───────────────┴──────────────────────┘
     Offset 0        Offset 2         Offset 4
```

Default `STRING` = `STRING[80]` = 85 bytes total.

### Basic Operations

#### LEN(s)
Returns the current length of a string.
- **Input:** `s` (STRING)
- **Output:** (INT) Number of characters

```st
VAR
    msg : STRING := 'Hello';
    length : INT;
END_VAR

length := LEN(msg);  (* length = 5 *)
```

#### CONCAT(s1, s2)
Appends s2 to the end of s1 (modifies s1 in place).
- **Input:** `s1` (STRING), `s2` (STRING)
- **Output:** None (s1 is modified)

```st
VAR
    greeting : STRING := 'Hello';
    name : STRING := ' World';
END_VAR

CONCAT(greeting, name);  (* greeting = 'Hello World' *)
```

#### COPY(src, dst)
Copies the contents of src into dst.
- **Input:** `src` (STRING), `dst` (STRING)
- **Output:** None (dst is modified)

```st
VAR
    original : STRING := 'Test';
    backup : STRING;
END_VAR

COPY(original, backup);  (* backup = 'Test' *)
```

#### CLEAR(s)
Clears a string to empty.
- **Input:** `s` (STRING)
- **Output:** None (s is modified)

```st
VAR
    buffer : STRING := 'Data';
END_VAR

CLEAR(buffer);  (* buffer = '' *)
```

### Substring Extraction

#### LEFT(s, n)
Keeps only the leftmost n characters (modifies s in place).
- **Input:** `s` (STRING), `n` (INT)
- **Output:** None (s is modified)

```st
VAR
    text : STRING := 'Hello World';
END_VAR

LEFT(text, 5);  (* text = 'Hello' *)
```

#### RIGHT(s, n)
Keeps only the rightmost n characters (modifies s in place).
- **Input:** `s` (STRING), `n` (INT)
- **Output:** None (s is modified)

```st
VAR
    text : STRING := 'Hello World';
END_VAR

RIGHT(text, 5);  (* text = 'World' *)
```

#### MID(s, pos, n)
Keeps only n characters starting at position pos (1-based, modifies s in place).
- **Input:** `s` (STRING), `pos` (INT), `n` (INT)
- **Output:** None (s is modified)

```st
VAR
    text : STRING := 'Hello World';
END_VAR

MID(text, 7, 5);  (* text = 'World' *)
```

### Search and Manipulation

#### FIND(s1, s2)
Finds the position of s2 within s1.
- **Input:** `s1` (STRING), `s2` (STRING)
- **Output:** (INT) 1-based position, or 0 if not found

```st
VAR
    text : STRING := 'Hello World';
    search : STRING := 'World';
    pos : INT;
END_VAR

pos := FIND(text, search);  (* pos = 7 *)
```

#### INSERT(s1, s2, pos)
Inserts s2 into s1 at position pos.
- **Input:** `s1` (STRING), `s2` (STRING), `pos` (INT)
- **Output:** None (s1 is modified)

```st
VAR
    text : STRING := 'Hello!';
    insert : STRING := ' World';
END_VAR

INSERT(text, insert, 6);  (* text = 'Hello World!' *)
```

#### DELETE(s, pos, n)
Deletes n characters from s starting at position pos.
- **Input:** `s` (STRING), `pos` (INT), `n` (INT)
- **Output:** None (s is modified)

```st
VAR
    text : STRING := 'Hello World';
END_VAR

DELETE(text, 6, 6);  (* text = 'Hello' *)
```

#### REPLACE(s1, s2, pos, n)
Replaces n characters in s1 starting at pos with s2.
- **Input:** `s1` (STRING), `s2` (STRING), `pos` (INT), `n` (INT)
- **Output:** None (s1 is modified)

```st
VAR
    text : STRING := 'Hello World';
    replacement : STRING := 'ZPLC';
END_VAR

REPLACE(text, replacement, 7, 5);  (* text = 'Hello ZPLC' *)
```

### Comparison

#### STRCMP(s1, s2)
Compares two strings lexicographically.
- **Input:** `s1` (STRING), `s2` (STRING)
- **Output:** (INT) -1 if s1 < s2, 0 if equal, 1 if s1 > s2

```st
VAR
    a : STRING := 'Apple';
    b : STRING := 'Banana';
    result : INT;
END_VAR

result := STRCMP(a, b);  (* result = -1 *)
```

#### EQ_STRING(s1, s2)
Tests if two strings are equal.
- **Input:** `s1` (STRING), `s2` (STRING)
- **Output:** (BOOL) TRUE if equal

```st
VAR
    password : STRING := 'secret';
    input : STRING := 'secret';
    match : BOOL;
END_VAR

match := EQ_STRING(password, input);  (* match = TRUE *)
```

#### NE_STRING(s1, s2)
Tests if two strings are different.
- **Input:** `s1` (STRING), `s2` (STRING)
- **Output:** (BOOL) TRUE if not equal

### Operator Overloading

The compiler automatically uses string comparison for `=` and `<>` operators when both operands are STRING type:

```st
VAR
    status : STRING := 'OK';
    is_ok : BOOL;
END_VAR

(* These are equivalent: *)
is_ok := status = 'OK';           (* Uses STRCMP internally *)
is_ok := EQ_STRING(status, 'OK'); (* Explicit function call *)
```

---

## 8. Selection Functions

### MAX / MIN
Returns the maximum or minimum of two values.

### LIMIT
Constrains a value within bounds: `LIMIT(low, val, high)`

### SEL
Binary selection: `SEL(cond, val_false, val_true)`

### MUX
Multiplexer: Selects one of N values based on index.

---

## 9. Bitwise Functions

### SHL / SHR
Shift left/right by n bits.

### ROL / ROR
Rotate left/right by n bits.

---

## 10. System Functions

### UPTIME
Returns system uptime in milliseconds.

### CYCLE_TIME
Returns last cycle execution time.

### WATCHDOG_RESET
Resets the watchdog timer (prevents system reset).