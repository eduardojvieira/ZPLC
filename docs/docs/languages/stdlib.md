---
sidebar_position: 3
---

# Standard Library

The authoritative source for the language standard library is the compiler
stdlib registry in `packages/zplc-compiler/src/compiler/stdlib/index.ts`.

That registry is what the ZPLC application and the compiler use to resolve built-in functions and function blocks.

Every registered function and function block, with its signature or pin table and an example that CI runs, is in the generated [function reference](../reference/functions.md) and [function block reference](../reference/function-blocks.md).

## High-value categories

| Category               | Grounding source                                             | Examples                                                                                 |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Timers                 | `stdlib/timers.ts`                                           | `TON`, `TOF`, `TP`                                                                       |
| Counters               | `stdlib/counters.ts`                                         | `CTU`, `CTD`, `CTUD`                                                                     |
| Bistables and triggers | `stdlib/bistables.ts`                                        | `R_TRIG`, `F_TRIG`, `RS`, `SR`                                                           |
| System buffers         | `stdlib/system.ts`                                           | `FIFO`, `LIFO`                                                                           |
| Strings                | `stdlib/strings.ts`                                          | `LEN`, `CONCAT`, `LEFT`, `RIGHT`, `MID`, `FIND`, `INSERT`, `DELETE`, `REPLACE`, `STRCMP` |
| Math and logic         | `stdlib/math.ts`, `stdlib/functions.ts`, `stdlib/bitwise.ts` | `ABS`, `SQRT`, `LIMIT`, `SEL`, `MUX`, `SHL`, `SHR`                                       |
| Process helpers        | `stdlib/process.ts`                                          | `HYSTERESIS`, `DEADBAND`, `PID_Compact`, `NORM_X`, `SCALE_X`                             |
| Communication FBs      | `stdlib/communication.ts`                                    | `MB_READ_HREG`, `MB_WRITE_COIL`, `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE`        |

## Timer and counter blocks

The timer and counter definitions are not just names in a list.

The compiler stdlib files define their member layouts and code-generation behavior, which is
why these blocks are safe to document as part of the public language contract.

Examples:

- timers: `TON`, `TOF`, `TP`
- counters: `CTU`, `CTD`, `CTUD`

The counters count rising edges and keep `CV` and `PV` as `INT`. What each block does today:

| Block  | Count                                                 | Priority                       | `CV` limit                   | Outputs                               |
| ------ | ----------------------------------------------------- | ------------------------------ | ---------------------------- | ------------------------------------- |
| `CTU`  | +1 on a rising edge of `CU`                           | `R` sets `CV` to 0             | stops at 32767               | `Q` is `CV >= PV`                     |
| `CTD`  | -1 on a rising edge of `CD`                           | `LD` sets `CV` to `PV`         | stops at -32768              | `Q` is `CV <= 0`                      |
| `CTUD` | +1 on `CU`, -1 on `CD`; both edges in one call cancel | `R`, then `LD`, then the edges | stops at 32767 and at -32768 | `QU` is `CV >= PV`, `QD` is `CV <= 0` |

The edge detector runs on every call, also while `R` or `LD` is TRUE. The comparisons are signed, so a counter counts below zero and takes a negative preset. The full rules and the evidence are in [section 2 of the runtime reference](../runtime/stdlib.md#2-counters).

## String functions

The current string surface in `stdlib/strings.ts` includes:

| Function                | Description                           | Example                                  |
| ----------------------- | ------------------------------------- | ---------------------------------------- |
| `LEN(STR)`              | Returns length of string              | `LEN('ABC')` -> 3                        |
| `LEFT(STR, N)`          | First N characters                    | `LEFT('HELLO', 2)` -> 'HE'               |
| `RIGHT(STR, N)`         | Last N characters                     | `RIGHT('HELLO', 2)` -> 'LO'              |
| `MID(STR, P, N)`        | N chars starting at P                 | `MID('HELLO', 2, 3)` -> 'ELL'            |
| `CONCAT(S1, S2)`        | Join two strings                      | `CONCAT('A', 'B')` -> 'AB'               |
| `INSERT(S1, S2, P)`     | Insert S2 into S1 after the P-th char | `INSERT('AB', 'X', 1)` -> 'AXB'          |
| `DELETE(S1, P, N)`      | Delete N chars starting at P          | `DELETE('HELLO', 2, 2)` -> 'HLO'         |
| `REPLACE(S1, S2, P, N)` | Replace N chars starting at P with S2 | `REPLACE('HELLO', 'AB', 2, 3)` -> 'HABO' |
| `FIND(S1, S2)`          | Find position of S2 in S1             | `FIND('HELLO', 'L')` -> 3                |

None of these changes its arguments: each returns a new string. In `MID`, `DELETE` and
`REPLACE` the position comes before the count; IEC 61131-3 writes the length first, so a
program written to that order must swap the two arguments.

Additional utility string functions in the same file include:

- `COPY`
- `CLEAR`
- `STRCMP`
- `EQ_STRING`
- `NE_STRING`

## Math, logic, and selection functions

Examples directly registered in the stdlib include:

- arithmetic: `ABS`, `ABSF`, `NEG`, `NEGF`, `SQRT`, `EXPT`, `TRUNC`, `ROUND`
- conversion: `<FROM>_TO_<TO>` for every pair of different types among `BOOL`, `SINT`, `USINT`, `BYTE`, `INT`, `UINT`, `WORD`, `DINT`, `UDINT`, `DWORD`, `LINT`, `ULINT`, `LWORD`, `REAL`, `LREAL` and `TIME` (`INT_TO_REAL`, `REAL_TO_INT`, `UDINT_TO_DINT`, `LINT_TO_LREAL`...), see [Type conversions](../runtime/stdlib.md#9-type-conversions)
- trigonometry and logs: `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `LN`, `LOG`, `EXP`
- selection helpers: `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`
- bitwise helpers: `ROL`, `ROR`, `SHL`, `SHR`, `AND_WORD`, `OR_WORD`, `XOR_WORD`, `NOT_WORD`

One thing in the registry cannot be used as the list suggests. `MOD` and the logic operators are operators (`a MOD b`, `a AND b`), and the forms `MOD(a, b)` and `AND(a, b)` do not parse. `DATE`, `TOD` and `DT` have no conversion functions yet. `ABS`, `NEG`, `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`, `SQRT`, `TRUNC`, `ROUND`, `SHL`, `SHR`, `ROL` and `ROR` take the 64-bit integers and `LREAL`; the other functions refuse them with a message. The table of [known differences](../runtime/stdlib.md#11-known-differences-from-iec-61131-3) lists the cases that fail today, with their requirement ids.

## Communication function blocks

Communication blocks are part of the compiler stdlib surface too.

The current repo registers blocks such as:

- Modbus: `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL`, `MB_WRITE_COIL`
- MQTT: `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE`
- cloud wrappers: `AZURE_C2D_RECV`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV`, `SPB_REBIRTH`

For the runtime-side details and release constraints, continue with:

- [Communication Function Blocks](../runtime/communication-function-blocks.md)
- [Connectivity](../runtime/connectivity.md)

## Availability

A built-in function or block is available to your programs only if the compiler stdlib registers it.

For runtime and profile-specific semantics, see [Runtime Standard Library](../runtime/stdlib.md).
