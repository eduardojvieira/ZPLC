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

## Numeric types

The case named next to a row or a rule is a conformance program under `conformance/cmp/` that runs on the native runtime. A case marked "fails today" is on the expected-failures list in `tools/ci/expected-failures.json`.

| Type | Bits | Range | Ordered as | Conformance case |
|---|---|---|---|---|
| `BOOL` | 8 | `FALSE`, `TRUE` | not ordered | `harness/vf-001-bool-output-toggles` |
| `SINT` | 8 | -128 to 127 | signed | `cmp-011-sint-limits` |
| `USINT` | 8 | 0 to 255 | unsigned | `cmp-012-usint-holds-0-to-255` |
| `BYTE` | 8 | bit string, 0 to 255 | unsigned | `cmp-014-not-byte` |
| `INT` | 16 | -32768 to 32767 | signed | `cmp-011-int-limits` |
| `UINT` | 16 | 0 to 65535 | unsigned | `cmp-012-uint-65535` |
| `WORD` | 16 | bit string, 0 to 65535 | unsigned | `cmp-014-not-word` |
| `DINT` | 32 | -2147483648 to 2147483647 | signed | `cmp-011-dint-limits` |
| `UDINT` | 32 | 0 to 4294967295 | unsigned | `cmp-012-udint-max` |
| `DWORD` | 32 | bit string, 0 to 4294967295 | unsigned | `cmp-014-not-dword` |
| `LINT` | 64 | -9223372036854775808 to 9223372036854775807 | signed | `cmp-015-lint-extreme-values` |
| `ULINT` | 64 | 0 to 18446744073709551615 | unsigned | `cmp-015-ulint-compares-unsigned` |
| `LWORD` | 64 | bit string, 0 to 18446744073709551615 | unsigned | `cmp-015-ulint-compares-unsigned` |
| `REAL` | 32 | IEEE 754 single precision | IEEE order, NaN unordered | `cmp-013-real-nan-is-unordered` |
| `LREAL` | 64 | IEEE 754 double precision, declaration only | not supported | `cmp-015-lreal-double-precision` (fails today) |

### Arithmetic, wrap and division

- **Width of a computation.** Operands of 8 and 16 bits are widened to 32 bits for the operation, and the result is cut to its width only when it is stored. With `i : INT := 32767`, `i + 1` is 32768 inside an expression and -32768 once it is stored in an `INT`; `UINT` 65535 plus 1 stored in a `UINT` is 0 (`cmp-012-uint-65535`), and `SINT`, `USINT` and `BYTE` behave the same.
- **32 and 64 bits wrap in two's complement.** `DINT` 2147483647 plus 1 is -2147483648, and subtraction and multiplication wrap the same way. The most negative `DINT`, negated, passed to `ABS` or divided by -1, stays the most negative `DINT`, and that value `MOD` -1 is 0 (`cmp-016-dint-add-wraps`, `cmp-016-dint-sub-wraps`, `cmp-016-dint-mul-wraps`, `cmp-016-dint-negate-min`, `cmp-016-dint-abs-min`, `cmp-016-dint-min-divided-by-minus-one`, `cmp-016-dint-min-modulo-minus-one`). `LINT` addition wraps the same way (`cmp-015-lint-extreme-values`).
- **Division truncates toward zero, and `MOD` takes the sign of the dividend.** -8 / 2 is -4 (`cmp-011-int-divide-negative`) and -7 / 2 is -3 with -7 `MOD` 2 equal to -1, as in C. `UDINT` division and `MOD` are unsigned over the whole range (`cmp-012-udint-divide-and-modulo`).
- **Division or `MOD` by zero ends the scan with the VM fault `ZPLC_VM_DIV_BY_ZERO` (code 0x03).** The same happens for a `REAL` division by zero. The VM tests are `test_vm_arith_edges.c` and `test_vm_core.c` under `firmware/lib/zplc_core/tests/`; for what a fault does to the outputs, see [Pause, resume, step and stop](../runtime/scheduler.md#pause-resume-step-and-stop).

### Shifts, rotations and bit logic

- `SHL(IN, N)`, `SHR(IN, N)`, `ROL(IN, N)` and `ROR(IN, N)` are functions. A shift by 32 or more, or by a negative count, gives 0 (`cmp-016-shift-by-the-width-or-more`). `SHR` is logical: zeros enter on the left.
- A `BYTE`, a `WORD` and the 8-bit and 16-bit integer types shift and rotate inside their own width: `SHL` drops the bits shifted past bit 7 or bit 15 (`cmp-014-shl-byte-keeps-8-bits`), and `ROL` and `ROR` wrap inside 8 or 16 bits (`cmp-014-rol-byte-rotates-within-8-bits`, `cmp-014-ror-word-rotates-within-16-bits`).
- `AND`, `OR`, `XOR` and `NOT` work on the full declared width (`cmp-014-not-byte`, `cmp-014-not-word`, `cmp-014-not-dword`, `cmp-014-and-or-xor-word`), and on 64 bits for `LWORD` (`cmp-015-ulint-compares-unsigned`).

### Conversions

- **Widening keeps the value.** A signed type is sign-extended and an unsigned type or bit string is zero-extended: `INT` -5 becomes `DINT` -5 (`cmp-011-int-widens-to-dint`), `UINT` 65535 becomes `UDINT` 65535 (`cmp-012-uint-65535`), and a `LINT` takes a `DINT` with its sign and a `UDINT` without one (`cmp-015-lint-widens-and-narrows`).
- **Narrowing on assignment keeps the low bits and gives no warning.** A `LINT` 5000000000 stored in a `DINT` is 705032704 (`cmp-015-lint-widens-and-narrows`), and a `DINT` 70000 stored in an `INT` is 4464.
- **An integer is converted to `REAL`** when it is assigned to one or mixed with one: `INT` times `REAL` is a `REAL` (`cmp-013-int-times-real`, `cmp-013-real-assigned-from-integer`).
- **The reverse is not a conversion yet.** `i := r` is accepted and stores the low bits of the bit pattern of the `REAL`, not its value, and an integer expression assigned to a `BOOL` is not reduced to `FALSE` or `TRUE`: requirement CMP-005, and the two cases `cmp-005-int-assigned-from-real` and `cmp-005-bool-assigned-from-int` fail today. Write `REAL_TO_INT(r)` and `i <> 0` instead.
- **`REAL_TO_INT` truncates toward zero**, saturates at the `DINT` limits and gives 0 for a NaN (`cmp-016-real-to-dint-truncates-toward-zero`, `cmp-016-real-out-of-range-to-dint`, `cmp-016-real-nan-to-dint`). Rounding to the nearest integer, as IEC 61131-3 defines it, is requirement CMP-057 and is not true yet (`cmp-057-real-to-int-rounds` fails today). `TRUNC` and `ROUND` return a `REAL` (`cmp-057-trunc-truncates`, `cmp-057-bool-and-round-conversions`).
- Only `INT_TO_REAL`, `REAL_TO_INT`, `BOOL_TO_INT`, `INT_TO_BOOL`, `TRUNC` and `ROUND` exist as conversion functions. The other `X_TO_Y` pairs are a build error today (CMP-057; `cmp-057-integer-conversion-functions` fails today).

### Mixed operands and comparison

- **The type of an operation is the wider operand, `REAL` wins over every integer, and between two types of the same width the unsigned one wins** (the C rule). `DINT` -1 compared with `UDINT` 5 is therefore an unsigned comparison and `-1 < 5` is FALSE, while `INT` -1 compared with `UINT` 5 is TRUE because both are widened to 32 bits first. The rule is `commonType` in `packages/zplc-compiler/src/compiler/numeric.ts`, covered by `numeric.test.ts`.
- **Unsigned types compare unsigned over their whole range**: `UDINT` 4294967295 is the largest value in every comparison (`cmp-012-udint-max`, `cmp-012-udint-around-2-31`, `cmp-012-udint-compare-unsigned`), and so is `ULINT` (`cmp-015-ulint-compares-unsigned`).
- **`REAL` compares by IEEE 754 order.** -0.0 equals 0.0, the infinities order beyond every finite value, and a NaN is neither equal, less nor greater than anything, itself included (`cmp-013-real-negative-zero-equals-zero`, `cmp-013-real-infinities-order`, `cmp-013-real-nan-is-unordered`).

### 64-bit types

| On `LINT`, `ULINT` or `LWORD` | Today | Conformance case |
|---|---|---|
| `+`, `-`, comparison, `AND`, `OR`, `XOR`, `NOT`, negation | Works | `cmp-015-lint-add-and-subtract-carry`, `cmp-015-lint-extreme-values`, `cmp-015-ulint-compares-unsigned` |
| `*`, `/`, `MOD`, `SHL`, `SHR`, `ROL`, `ROR`, `ABS` and the other standard functions, conversion to or from `REAL`, a `CASE` selector, a `FOR` counter | Build error that names CMP-015 | `cmp-015-lint-multiplication-is-refused`; `numeric.test.ts` for the rest |
| `LREAL` assignment or arithmetic | The build succeeds and the loader refuses the program | `cmp-015-lreal-double-precision` (fails today) |

Requirement CMP-015 asks for all of these. Until then a refusal at build time is the intended behaviour; the loader refusal for `LREAL` is not.

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
- A literal that is not a whole number of milliseconds (`T#1.5ms`), is above 4294967295 ms (`T#50d`) or is negative (`T#-5s`) is a build error that names the literal (`cmp-017-time-literal-below-a-millisecond`, `cmp-017-time-literal-above-the-range`, `cmp-017-time-literal-negative`). Units out of order (`T#30m1h`) are refused too (`cmp-017-time-literal-units-out-of-order`).
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

Evidence level: host. The cases `cmp-017-*` and `cmp-015-dt-plus-time-and-difference` build with the repository compiler and run the program on the native runtime, and `packages/zplc-compiler/src/compiler/time.test.ts` covers the literal grammar and its refusals. The wrap below zero, the time zone of `DT#` and the display in Studio were observed or read from the code (`numeric.ts`, `codegen.ts`, `debugAdapter.ts`) and no case pins them yet.

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

## Known limits

This section lists what the compiler, the loader and the debug map do not do as IEC 61131-3 asks. The table is generated from the conformance cases that are expected to fail (`tools/ci/expected-failures.json`) and from the description of each requirement in `docs/known-limits.json`: a row exists while at least one case of its requirement fails, and it disappears when the last one passes. The standard blocks and functions have their own table in [section 11 of the Standard Library reference](../runtime/stdlib.md#11-known-differences-from-iec-61131-3).

{/* >>> GENERATED (tools/docs/generate_known_limits.py): known-limits-language. Do not edit. >>> */}
| Requirement | What happens today | Cases that fail today |
|---|---|---|
| CMP-003 | `LTIME`, `LDATE`, `LTOD`, `LDT`, `CHAR`, `WCHAR` and any unknown type name build without a message and take size 0, so the variable shares its address with the next one. | `a declaration of type CHAR is rejected naming the type`<br />`a declaration of type LDATE is rejected naming the type`<br />`a declaration of type LDT is rejected naming the type`<br />`a declaration of type LTIME is rejected naming the type`<br />`a declaration of type LTOD is rejected naming the type`<br />`a declaration of type WCHAR is rejected naming the type`<br />`a declaration with an unknown type name is rejected` |
| CMP-004 | Names are matched with their exact case. An identifier written in another case is a build error (`Unknown identifier`), and so is a direct address such as `%ix0.0`. The parameter names `in :=` and `pt :=` on a standard block are accepted and ignored, so the timer never starts. The type names `byte`, `word`, `dword`, `lword`, `date`, `tod`, `dt`, `time_of_day` and `date_and_time` in lower case take size 0. Keywords are not affected. | `direct address written in lower case`<br />`identifiers are matched without regard to case`<br />`standard block parameters are matched without regard to case`<br />`type names are matched without regard to case` |
| CMP-005 | A `REAL` assigned to an integer variable is accepted and stores the low bits of its bit pattern, not its value, and an integer expression assigned to a `BOOL` is accepted and is not reduced to `FALSE` or `TRUE`. | `assigning a REAL to an INT is rejected`<br />`assigning an INT expression to a BOOL is rejected` |
| CMP-006 | A `PERSISTENT` variable block is rejected, and the diagnostic points at the declaration that follows `PERSISTENT`, one line after the construct. | `a PERSISTENT variable block is rejected` |
| CMP-012 | A literal above 2147483647 is refused as the argument of a function whose parameter is a `DWORD` (`XOR_DWORD(d, 4294967295)` fails with `Integer literal 4294967295 does not fit a signed 32-bit integer`). Assigned to a `UDINT` or a `DWORD` variable it works. | `a literal above 2147483647 is accepted as the argument of a DWORD parameter` |
| CMP-015 | `LINT`, `ULINT` and `LWORD` have no `*`, `/`, `MOD`, `SHL`, `SHR`, `ROL`, `ROR`, `ABS`, conversion to or from `REAL`, `CASE` selector or `FOR` counter: each is a build error that names CMP-015. A program that assigns or computes with an `LREAL` builds and is then refused by the loader. | `LREAL keeps double precision` |
| CMP-018 | A constant that does not fit its type (`small : SINT := 300`) is accepted without a message and stored truncated (300 is stored as 44). | `a constant that does not fit its type is rejected` |
| CMP-034 | A function parameter named like a program variable, or like a parameter of another function, is a build error (`Symbol 'a' already defined`): the symbols of a program share one table. | `a function parameter named like a program variable`<br />`two functions with a parameter of the same name` |
| CMP-035 | Function calls differ from IEC 61131-3. A call with a missing required argument is accepted. A function call used as a statement is a build error. A recursive function is accepted. Named arguments bind by position, not by name: `Sub(b := 1, a := 10)` computes `Sub(1, 10)`. | `a call with a missing required argument is rejected`<br />`a function call used as a statement`<br />`a recursive function is rejected`<br />`named arguments bind by name` |
| CMP-037 | Function-block calls differ from IEC 61131-3. An unknown parameter name on a standard block (`BOGUS := 5`) is accepted and ignored. A function-block call with an output binding (`Q => variable`) is a build error. | `an unknown parameter of a standard block is rejected`<br />`function-block call with an output binding =>` |
| CMP-041 | Methods and inheritance differ from IEC 61131-3. A `SUPER^` call is a build error (`Complex method call targets not supported yet`). A call of a `PRIVATE` method from outside its block is accepted: access specifiers are parsed and not enforced. A call of a `PROTECTED` method from outside its block is accepted: access specifiers are parsed and not enforced. A variable of an interface type is a build error (`Unknown FB type`). | `SUPER^ calls the method of the base block`<br />`a PRIVATE method called from outside its function block is rejected`<br />`a PROTECTED method called from outside its function block is rejected`<br />`a variable of an interface type calls the method of its instance` |
| CMP-042 | A function block or a global declared in another file is not found (`Unknown FB type`, `Unknown identifier`). | `a function block declared in another file`<br />`a global declared in another file` |
| CMP-043 | With the profile of the `posix` target a program may use 256 bytes of WORK memory (variables, string literals and work buffers, one byte of it for the initialization flag). A 400-byte array, three `STRING` variables or an SFC chart of twenty steps is a build error. | `a program with a 400-byte array`<br />`a program with three STRING variables`<br />`an SFC chart of twenty steps runs every step once, one per scan` |
| CMP-051 | The loader refuses the artifact that the compiler builds for a program with an `LREAL` and for two cyclic tasks with different intervals. | `the loader accepts every artifact the compiler produced for a conformance case` |
| CMP-053 | The debug map records the literal version `1.2.0` instead of the version of the compiler package and carries the time of the build, so two builds of one project give two different maps. The bytecode of the two builds is identical. | `the debug map records the version of the compiler package`<br />`two builds of one project produce the same debug map` |
| CMP-055 | The statements of the debug map do not cover all their instructions: a statement ends before the next one starts, so some program counters resolve to no statement. | `every instruction of a statement resolves to that statement in the debug map` |
| LNG-008 | An FBD block that is a user function block from another file is refused (`Invalid FBD connection … unknown destination input port`): the FBD transpiler does not know its ports. | `an FBD block that is a user function block from another file runs` |
| RT-015 | A task with `trigger: event` is accepted by the compiler and refused later, and a program with two cyclic tasks of different intervals is refused by the native simulation. | `an event-triggered task is rejected by the build`<br />`two cyclic tasks with different intervals load in simulation and each runs at its own interval` |
{/* <<< END GENERATED: known-limits-language <<< */}

Not supported in this release and rejected with a message, by decision D-04: arrays of arrays, enumerations with a base type, subranges, `POINTER TO` and `ADR` (use `REF_TO` and `REF()`), `VAR_ACCESS`, a textual `CONFIGURATION`, `NAMESPACE`, `PROPERTY`, `ACTION` blocks in a program, positional function-block calls and the function forms of operators such as `ADD(a, b)`. The cases `cmp-006-*-is-rejected` pass: they pin the rejection, so a program that uses one fails to build.
