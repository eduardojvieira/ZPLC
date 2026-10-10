---
sidebar_position: 1
---

# Structured Text (ST)

Structured Text (ST) is the canonical semantic baseline for ZPLC.

## Role in ZPLC 2.0

For ZPLC 2.0:

- `ST` is the direct path into the shared compiler backend
- `IL`, `LD`, `FBD`, and `SFC` are workflow paths when their editor, transpiler, and compiler contracts accept them
- the runtime still executes `.zplc`, not source-language-specific code

The [historical language suite](./examples/v1-5-language-suite.md) is compatibility evidence. It does not prove universal parity, target timing, hardware, or HIL behavior.

## Why ST matters architecturally

`packages/zplc-ide/src/compiler/index.ts` treats ST differently from the other language paths:

- `ST` bypasses the transpilation stage
- the other languages normalize into ST before compilation

That makes ST the best place to understand the public automation semantics that the runtime is expected to execute.

## Typical usage in ZPLC

ST is the natural fit for:

- textual control logic
- arithmetic and data manipulation
- calling stdlib functions and function blocks directly
- action bodies that originate from higher-level visual flows

## Minimal canonical example

```st
PROGRAM WorkflowST
VAR
    Start : BOOL := TRUE;
    Timer : TON;
    Out1 : BOOL := FALSE;
END_VAR
Timer(IN := Start, PT := T#250ms);
Out1 := Timer.Q;
END_PROGRAM
```

## Common ST building blocks in the current repo

The compiler and stdlib surfaces show ST being used with:

- variables and task-oriented program bodies
- timers such as `TON`, `TOF`, and `TP`
- counters such as `CTU`, `CTD`, and `CTUD`
- string functions such as `LEN`, `CONCAT`, `LEFT`, `RIGHT`, and `MID`
- communication FB calls where the runtime/compiler contract supports them

## Time and date types

| Type | Width | What it holds | Literal |
|---|---|---|---|
| `TIME` | 32 bits, unsigned | A duration in milliseconds, 0 to 4294967295 (`T#49d17h2m47s295ms`) | `T#1h30m`, `T#1.5s`, `TIME#250ms` |
| `DATE` | 32 bits, signed | Seconds since 1970-01-01; earlier dates are negative | `D#2024-01-01` |
| `TOD` (`TIME_OF_DAY`) | 32 bits, unsigned | Milliseconds since midnight | `TOD#12:30:00` |
| `DT` (`DATE_AND_TIME`) | 64 bits, signed | Milliseconds since 1970-01-01 00:00:00 | `DT#2024-01-01-12:00:00` |

### TIME

This is the current behaviour. The sign and the width of `TIME` are an open owner decision, described at the end of this list.

- A literal has days, hours, minutes, seconds and milliseconds, each at most once and in that order, with an optional `_` between them (`T#1d_2h_3m_4s_5ms`). `us` and `ns` are accepted when the whole literal is a whole number of milliseconds (`T#1000us` is 1 ms), and the last component may have a fraction (`T#1h30.5m`, `T#1.5s`).
- A literal that is not a whole number of milliseconds (`T#1.5ms`), is above 4294967295 ms (`T#50d`) or is negative (`T#-5s`) is a build error that names the literal.
- Comparison, addition, subtraction and division are unsigned 32-bit: `T#30d > T#1d` is TRUE and `T#30d + T#10d` is 3456000000 ms. A timer preset above 24.8 days works: a `TON` with `PT := T#30d` is not done after 20 ms.
- A negative duration cannot be represented. A subtraction below zero wraps modulo 2^32: `T#0s - T#1s` is 4294966296 ms (`T#49d17h2m46s296ms`), and the build gives no warning. Check that the minuend is not smaller before subtracting.
- Studio's Watch shows a `TIME` above 2147483647 ms (24d20h31m23s647ms) as a negative number, because the watch adapters read its 32 bits as signed. The value the program holds is the unsigned count.
- Whether `TIME` stays an unsigned 32-bit count or becomes a signed 64-bit value, which would allow negative durations and ranges beyond 49 days, is an open owner decision tracked under requirement CMP-017. This page announces no change.

### DATE, TOD and DT

- `TOD` and `DT` hold milliseconds, the unit of `TIME`. `TOD#12:30:00 + T#1h` is 48600000 ms (13:30:00), `TOD#13:00:00 - T#30m` is 12:30:00, and the difference of two `DT` values is a `TIME`: `DT#2024-01-01-01:00:00 - DT#2024-01-01-00:00:00` is 3600000 ms. All three types assign and compare, and `DT` compares across the 32-bit word boundary.
- `DATE` counts seconds, not milliseconds. It assigns and compares (`D#2024-01-01 < D#2025-06-30`), but `DATE + TIME` adds milliseconds to a count of seconds: do not add a `TIME` to a `DATE`. No conformance case covers arithmetic on `DATE`; its unit is the one the code gives it (`emitDateLiteral` in `packages/zplc-compiler/src/compiler/codegen.ts`). The unit of `DATE` and the range of these types are part of requirement CMP-017, which is not closed.
- A `DT#` literal is read in the time zone of the machine that compiles, while `D#` and `TOD#` are read as UTC. The same source built in two time zones gives two different `DT` constants. This is a defect, not a design, and no conformance case pins it yet.

### Types that are not supported

`LTIME`, `LDATE`, `LTOD`, `LDT`, `CHAR` and `WCHAR` are not part of ZPLC 2.0. Today the compiler does not report them: it accepts the declaration without a message and gives the variable size 0, so the variable shares its address with the next one. Do not declare them. Requirement CMP-003 asks the build to reject them, and any unknown type name, with a message that names the type and its position. Its conformance cases (`cmp-003-*` in `conformance/cmp/`) fail today and are listed in `tools/ci/expected-failures.json`.

Evidence level: host. The cases `cmp-017-*` and `cmp-015-dt-plus-time-and-difference` run on the native runtime, and `packages/zplc-compiler/src/compiler/time.test.ts` covers the literal grammar and its refusals. The wrap below zero, the time zone of `DT#` and the display in Studio were observed or read from the code (`numeric.ts`, `codegen.ts`, `debugAdapter.ts`) and no case pins them yet.

## Data, storage and initial values

Each rule below is covered by a conformance case under `conformance/cmp` (CMP-019 to CMP-028).

### Structures, enumerations and arrays

- A member of a structure or of a function block is read and written at its declared width (`BYTE` 1 byte, `INT` 2, `DINT` and `REAL` 4, `LINT` 8). Members nest to any depth: `a.b.c`.
- A whole structure or array is assigned, and passed to a function, by value: every byte is copied, and both sides must be of the same type.
- A structure takes an initial value of the form `(x := 1, y := 2)`. A field left out keeps the default of its declaration (`x : INT := 7;` inside the `TYPE`).
- An enumeration is stored as an `INT`. A value can be written `Type#Value`, which also tells apart a value name that two enumerations share.
- An array has one to three dimensions, negative lower bounds and bounds that are constant expressions (`ARRAY[-N .. N * 2] OF INT`). Its elements can be of any type: a structure, a string, `LINT`. An initial value is a list `[1, 2, 3]`, nested lists for more dimensions, and repeat counts `[100(0)]`.
- A constant index outside the bounds is a compile error. A variable index outside the bounds ends the scan with the VM fault `ZPLC_VM_OUT_OF_BOUNDS` (memory access violation). The check is on by default; the compiler option `arrayBoundsCheck: false` removes it.

### Strings

- `STRING` holds 80 characters, `STRING[n]` holds `n`, `WSTRING[n]` holds `n` 16-bit characters.
- An assignment copies the characters, up to the capacity of the target. A literal longer than the capacity of its variable is a compile error.
- A string function never changes its arguments: `LEFT`, `RIGHT`, `MID`, `CONCAT`, `INSERT`, `DELETE` and `REPLACE` return a new string. `COPY(src, dst)` and `CLEAR(s)` write to their argument, as their names say.
- `s := LEFT(s, n)` (and `RIGHT`, `MID`, `DELETE`, `CONCAT` of the variable itself) works on the variable. Any other string function that builds a string uses a work buffer of the program's WORK memory, which counts against the bytes of the program.
- `WSTRING` can be declared, initialised, assigned and measured with `LEN`. The other string functions and the comparison refuse it with a message.

### Initial values and constants

- At the first scan every variable holds its declared initial value, or the default of its type: zero, `FALSE`, the empty string, `NULL`. That covers the variables of a program, `VAR_GLOBAL`, every member of every function-block instance, structure fields and array elements.
- A function local and a `VAR_TEMP` of a function block hold their declared value again at every call, so a function holds no state. A `VAR` of a function block keeps its value from call to call.
- `VAR CONSTANT` and `VAR_GLOBAL CONSTANT` hold their value, and an assignment to a constant is a compile error.

### VAR_IN_OUT and references

- A `VAR_IN_OUT` of a function block is passed by reference: what the body changes the caller sees. The variable must be of the same type and cannot be a constant. A block called without binding it ends the scan with a VM fault.
- `REF_TO`, `REF()` and `^` are type-checked: `REF(x)` is a reference to the type of `x` and goes only into a `REF_TO` of that type. A `REF_TO` variable is `NULL` until it is assigned, and dereferencing `NULL` ends the scan with the VM fault `ZPLC_VM_OUT_OF_BOUNDS`.

## Standard library entry point

See [Standard Library](./stdlib.md) for the built-in functions and function blocks grounded in
`packages/zplc-compiler/src/compiler/stdlib/index.ts`.
