---
sidebar_position: 3
---

# Standard Library

ZPLC comes with a comprehensive Standard Library compliant with IEC 61131-3. These functions and function blocks are built-in and available to all programs.

## String Functions (v1.2+)

| Function | Description | Example |
|---|---|---|
| `LEN(STR)` | Returns length of string | `LEN('ABC')` -> 3 |
| `LEFT(STR, N)` | First N characters | `LEFT('HELLO', 2)` -> 'HE' |
| `RIGHT(STR, N)` | Last N characters | `RIGHT('HELLO', 2)` -> 'LO' |
| `MID(STR, L, P)` | L chars starting at P | `MID('HELLO', 2, 2)` -> 'EL' |
| `CONCAT(S1, S2)` | Join two strings | `CONCAT('A', 'B')` -> 'AB' |
| `INSERT(S1, S2, P)` | Insert S2 into S1 at P | `INSERT('AB', 'X', 1)` -> 'AXB' |
| `DELETE(S1, L, P)` | Delete L chars at P | `DELETE('HELLO', 2, 2)` -> 'HLO' |
| `REPLACE(S1, S2, L, P)` | Replace L chars at P with S2 | |
| `FIND(S1, S2)` | Find position of S2 in S1 | `FIND('HELLO', 'L')` -> 3 |

## Mathematical Functions

*   **Trigonometry**: `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`
*   **Logarithmic**: `LN`, `LOG`, `EXP`
*   **Arithmetic**: `ABS`, `SQRT`, `EXPT` (Power), `TRUNC` (Float to Int), `ROUND`

## Timers

### `TON` (Timer On-Delay)
Output `Q` goes TRUE after `IN` has been TRUE for `PT` time.

```st
VAR
    MyTimer : TON;
END_VAR

MyTimer(IN := StartBtn, PT := T#2s);
IF MyTimer.Q THEN ... END_IF;
```

### `TOF` (Timer Off-Delay)
Output `Q` stays TRUE for `PT` time after `IN` goes FALSE.

### `TP` (Pulse Timer)
Generates a pulse of length `PT` when `IN` goes TRUE.

## Counters

*   **`CTU`**: Count Up.
*   **`CTD`**: Count Down.
*   **`CTUD`**: Count Up/Down.

## Bistables (Flip-Flops)

*   **`SR`**: Set Dominant (Set takes priority).
*   **`RS`**: Reset Dominant.

## Edge Detection

*   **`R_TRIG`**: Rising Edge Detector (FALSE -> TRUE).
*   **`F_TRIG`**: Falling Edge Detector (TRUE -> FALSE).

## Control Functions

*   **`PID_Compact`**: Basic PID controller.
*   **`HYSTERESIS`**: Two-point controller with deadband.
*   **`LIMIT`**: Clamp value between Min and Max.
*   **`MUX`**: Multiplexer (Select one of N inputs).
*   **`SEL`**: Select one of two inputs.
*   **`MAX`**, **`MIN`**: Maximum/Minimum of two values.

## System Functions

*   **`GET_TICKS()`**: Returns system uptime in milliseconds.
*   **`CYCLE_TIME()`**: Returns last scan cycle duration in microseconds.
