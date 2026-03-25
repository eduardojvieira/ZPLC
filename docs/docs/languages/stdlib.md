---
sidebar_position: 3
---

# Standard Library

The authoritative release-facing source for the language standard library is the compiler
stdlib registry in `packages/zplc-compiler/src/compiler/stdlib/index.ts`.

That registry is what the IDE/compiler uses to resolve built-in functions and function blocks.

## High-value categories

| Category | Grounding source | Examples |
|---|---|---|
| Timers | `stdlib/timers.ts` | `TON`, `TOF`, `TP` |
| Counters | `stdlib/counters.ts` | `CTU`, `CTD`, `CTUD` |
| Bistables and triggers | `stdlib/bistables.ts` | `R_TRIG`, `F_TRIG`, `RS`, `SR` |
| System buffers | `stdlib/system.ts` | `FIFO`, `LIFO` |
| Strings | `stdlib/strings.ts` | `LEN`, `CONCAT`, `LEFT`, `RIGHT`, `MID`, `FIND`, `INSERT`, `DELETE`, `REPLACE`, `STRCMP` |
| Math and logic | `stdlib/math.ts`, `stdlib/functions.ts`, `stdlib/bitwise.ts` | `ABS`, `SQRT`, `LIMIT`, `SEL`, `MUX`, `SHL`, `SHR` |
| Process helpers | `stdlib/process.ts` | `HYSTERESIS`, `DEADBAND`, `PID_Compact`, `NORM_X`, `SCALE_X` |
| Communication FBs | `stdlib/communication.ts` | `MB_READ_HREG`, `MB_WRITE_COIL`, `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE` |

## Timer and counter blocks

The timer and counter definitions are not just names in a list.

The compiler stdlib files define their member layouts and code-generation behavior, which is
why these blocks are safe to document as part of the public language contract.

Examples:

- timers: `TON`, `TOF`, `TP`
- counters: `CTU`, `CTD`, `CTUD`

## String functions

The current string surface in `stdlib/strings.ts` includes:

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

Additional utility string functions in the same file include:

- `COPY`
- `CLEAR`
- `STRCMP`
- `EQ_STRING`
- `NE_STRING`

## Math, logic, and selection functions

Examples directly registered in the stdlib include:

- arithmetic and conversion: `ABS`, `ABSF`, `NEG`, `NEGF`, `MOD`, `SQRT`, `EXPT`, `INT_TO_REAL`, `REAL_TO_INT`
- trigonometry and logs: `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `LN`, `LOG`, `EXP`
- selection helpers: `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`
- bitwise helpers: `ROL`, `ROR`, `SHL`, `SHR`, `AND_WORD`, `OR_WORD`, `XOR_WORD`, `NOT_WORD`

## Communication function blocks

Communication blocks are part of the compiler stdlib surface too.

The current repo registers blocks such as:

- Modbus: `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL`, `MB_WRITE_COIL`
- MQTT: `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE`
- cloud wrappers: `AZURE_C2D_RECV`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV`, `SPB_REBIRTH`

For the runtime-side details and release constraints, continue with:

- [Communication Function Blocks](/runtime/communication-function-blocks)
- [Connectivity](/runtime/connectivity)

## Practical rule

If a built-in function or block is not registered in the compiler stdlib or justified by the
runtime contract, it should not be documented as a firm v1.5 capability.

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
