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

```st runnable expect="Out1=TRUE" scans=30 scan_ms=10
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

`Out1` is `FALSE` until the timer has counted 250 ms and `TRUE` from then on. CI compiles this
program, runs it for 30 scans of 10 ms and checks that `Out1` is `TRUE`.

## Common ST building blocks in the current repo

The compiler and stdlib surfaces show ST being used with:

- variables and task-oriented program bodies
- timers such as `TON`, `TOF`, and `TP`
- counters such as `CTU`, `CTD`, and `CTUD`
- string functions such as `LEN`, `CONCAT`, `LEFT`, `RIGHT`, and `MID`
- communication FB calls where the runtime/compiler contract supports them

## Numeric types

The case named next to a row or a rule is a conformance program under `conformance/cmp/` that runs on the native runtime. A case marked "fails today" is on the expected-failures list in `tools/ci/expected-failures.json`. The cases of the 64-bit types and `LREAL` give the same results on a 64-bit and on a 32-bit build of the runtime (VF-005).

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
| `LREAL` | 64 | IEEE 754 double precision | IEEE order, NaN unordered | `cmp-015-lreal-comparisons-and-nan` |

### Arithmetic, wrap and division

- **Width of a computation.** Operands of 8 and 16 bits are widened to 32 bits for the operation, and the result is cut to its width only when it is stored. With `i : INT := 32767`, `i + 1` is 32768 inside an expression and -32768 once it is stored in an `INT`; `UINT` 65535 plus 1 stored in a `UINT` is 0 (`cmp-012-uint-65535`), and `SINT`, `USINT` and `BYTE` behave the same.
- **32 and 64 bits wrap in two's complement.** `DINT` 2147483647 plus 1 is -2147483648, and subtraction and multiplication wrap the same way. The most negative `DINT`, negated, passed to `ABS` or divided by -1, stays the most negative `DINT`, and that value `MOD` -1 is 0 (`cmp-016-dint-add-wraps`, `cmp-016-dint-sub-wraps`, `cmp-016-dint-mul-wraps`, `cmp-016-dint-negate-min`, `cmp-016-dint-abs-min`, `cmp-016-dint-min-divided-by-minus-one`, `cmp-016-dint-min-modulo-minus-one`). `LINT` addition wraps the same way (`cmp-015-lint-extreme-values`), and so does its multiplication, which is the low 64 bits of the product (`cmp-015-lint-multiplication-wraps-at-64-bits`, `cmp-015-ulint-multiplication-is-unsigned`).
- **Division truncates toward zero, and `MOD` takes the sign of the dividend.** -8 / 2 is -4 (`cmp-011-int-divide-negative`) and -7 / 2 is -3 with -7 `MOD` 2 equal to -1, as in C. `UDINT` division and `MOD` are unsigned over the whole range (`cmp-012-udint-divide-and-modulo`), and so are `ULINT` and `LWORD` (`cmp-015-ulint-division-above-2-63`). `LINT` follows the same rule, and the most negative `LINT` divided by -1 stays the most negative `LINT` and `MOD` -1 is 0 (`cmp-015-lint-division-truncates-toward-zero`).
- **Division or `MOD` by zero ends the scan with the VM fault `ZPLC_VM_DIV_BY_ZERO` (code 0x03).** The same happens for a `REAL` or `LREAL` division by 0.0 or -0.0, and for a `LINT` or `ULINT` division or `MOD` by zero (`cmp-015-lint-division-by-zero-faults`, `cmp-015-lint-modulo-by-zero-faults`, `cmp-015-ulint-division-by-zero-faults`, `cmp-015-ulint-modulo-by-zero-faults`, `cmp-015-lreal-division-by-zero-faults`). The VM tests are `test_vm_arith_edges.c` and `test_vm_core.c` under `firmware/lib/zplc_core/tests/`; for what a fault does to the outputs, see [Pause, resume, step and stop](../runtime/scheduler.md#pause-resume-step-and-stop).

### Shifts, rotations and bit logic

- `SHL(IN, N)`, `SHR(IN, N)`, `ROL(IN, N)` and `ROR(IN, N)` are functions. A shift by 32 or more, or by a negative count, gives 0 (`cmp-016-shift-by-the-width-or-more`). `SHR` is logical: zeros enter on the left. On a 64-bit value (`LWORD`, `LINT`, `ULINT`) the width is 64: a shift by 64 or more gives 0, and a rotation takes its count modulo 64 and keeps every bit (`cmp-015-lword-shifts-and-rotates-use-64-bits`).
- A `BYTE`, a `WORD` and the 8-bit and 16-bit integer types shift and rotate inside their own width: `SHL` drops the bits shifted past bit 7 or bit 15 (`cmp-014-shl-byte-keeps-8-bits`), and `ROL` and `ROR` wrap inside 8 or 16 bits (`cmp-014-rol-byte-rotates-within-8-bits`, `cmp-014-ror-word-rotates-within-16-bits`).
- `AND`, `OR`, `XOR` and `NOT` work on the full declared width (`cmp-014-not-byte`, `cmp-014-not-word`, `cmp-014-not-dword`, `cmp-014-and-or-xor-word`), and on 64 bits for `LWORD` (`cmp-015-ulint-compares-unsigned`).

### Conversions

- **Widening keeps the value.** A signed type is sign-extended and an unsigned type or bit string is zero-extended: `INT` -5 becomes `DINT` -5 (`cmp-011-int-widens-to-dint`), `UINT` 65535 becomes `UDINT` 65535 (`cmp-012-uint-65535`), and a `LINT` takes a `DINT` with its sign and a `UDINT` without one (`cmp-015-lint-widens-and-narrows`).
- **Narrowing on assignment keeps the low bits, and the build warns.** A `LINT` 5000000000 stored in a `DINT` is 705032704 (`cmp-015-lint-widens-and-narrows`), and a `DINT` 70000 stored in an `INT` is 4464 (`cmp-005-integer-narrowing-keeps-the-low-bits-and-warns`). The build succeeds and reports the warning `IMPLICIT_NARROWING` at the value, naming both types; Studio, the CLI (`Warning:`) and the Tool API show it. A constant is checked instead (a constant that does not fit is an error, CMP-018), and `x AND mask` or `x MOD n` with a mask or divisor that fits the destination does not warn (`cmp-005-widening-masks-and-constants-do-not-warn`). Mask the value or declare the destination wide enough to remove the warning.
- **An integer is converted to `REAL`** when it is assigned to one or mixed with one: `INT` times `REAL` is a `REAL` (`cmp-013-int-times-real`, `cmp-013-real-assigned-from-integer`). A 64-bit integer is converted with one rounding to the nearest `REAL` (`LINT_TO_REAL`, `ULINT_TO_REAL`: `cmp-015-lreal-conversion-functions`).
- **`LREAL` is the widest numeric type.** An integer of any width and a `REAL` convert to `LREAL` when they are assigned to one or mixed with one, without a word: `LREAL` times `DINT` is an `LREAL` (`cmp-015-lreal-mixed-with-integers-and-real`). A 64-bit integer above 2^53 is rounded to the nearest `LREAL`. A real literal in an `LREAL` expression is the double it writes: `x := 0.1 + 0.2` is 0.30000000000000004 (`cmp-015-lreal-literal-takes-the-type-of-its-context`), while an expression of `REAL` values is computed in single precision and widened (`r + r`). `REAL#0.1` and `LREAL#0.1` name the type.
- **`LREAL` to `REAL` narrows and warns.** `r := d;` with an `LREAL` `d` builds and reports `IMPLICIT_NARROWING` at the value: the result is rounded to single precision (about 7 significant digits) and a magnitude above 3.4e38 becomes an infinity (`cmp-015-lreal-narrowed-to-real-is-reported`). Write `LREAL_TO_REAL(d)` to say so. An `LREAL` does not convert to an integer implicitly: write `LREAL_TO_DINT(d)`.
- **The reverse is an error.** `i := r` with a `REAL` `r`, and an integer expression assigned to a `BOOL`, are build errors that name both types (`cmp-005-int-assigned-from-real`, `cmp-005-bool-assigned-from-int`). Write `REAL_TO_INT(r)` and `i <> 0` instead.
- **`REAL_TO_INT` rounds to the nearest integer**, an exact half to the even integer, saturates at the limits of the destination type and gives 0 for a NaN (`cmp-057-real-to-int-rounds`, `cmp-057-real-to-int-ties-go-to-even`, `cmp-057-real-to-integer-saturates-at-the-destination-range`, `cmp-016-real-nan-to-dint`); `REAL_TO_DINT` is the 32-bit form (`cmp-016-real-out-of-range-to-dint`) and `REAL_TO_DINT(TRUNC(x))` truncates toward zero (`cmp-016-real-to-dint-truncates-toward-zero`). `TRUNC` and `ROUND` return a `REAL` (`cmp-057-trunc-truncates`, `cmp-057-bool-and-round-conversions`).
- A conversion function `<FROM>_TO_<TO>` exists for every pair of different types among `BOOL`, `SINT`, `USINT`, `BYTE`, `INT`, `UINT`, `WORD`, `DINT`, `UDINT`, `DWORD`, `LINT`, `ULINT`, `LWORD`, `REAL`, `LREAL` and `TIME` (CMP-057, CMP-015, `cmp-057-integer-conversion-functions`, `cmp-015-integer-width-conversion-functions`, `cmp-015-lreal-conversion-functions`); an integer that does not fit keeps its low bits, a `REAL` or an `LREAL` outside the destination saturates, rounds to the nearest integer with an exact half to the even one, and gives 0 for a NaN. `DATE`, `TOD` and `DT` have none yet.

### Mixed operands and comparison

- **The type of an operation is the wider operand, `REAL` wins over every integer, `LREAL` wins over `REAL`, and between two types of the same width the unsigned one wins** (the C rule). `DINT` -1 compared with `UDINT` 5 is therefore an unsigned comparison and `-1 < 5` is FALSE, while `INT` -1 compared with `UINT` 5 is TRUE because both are widened to 32 bits first. The rule is `commonType` in `packages/zplc-compiler/src/compiler/numeric.ts`, covered by `numeric.test.ts`.
- **Unsigned types compare unsigned over their whole range**: `UDINT` 4294967295 is the largest value in every comparison (`cmp-012-udint-max`, `cmp-012-udint-around-2-31`, `cmp-012-udint-compare-unsigned`), and so is `ULINT` (`cmp-015-ulint-compares-unsigned`).
- **`REAL` compares by IEEE 754 order.** -0.0 equals 0.0, the infinities order beyond every finite value, and a NaN is neither equal, less nor greater than anything, itself included (`cmp-013-real-negative-zero-equals-zero`, `cmp-013-real-infinities-order`, `cmp-013-real-nan-is-unordered`). So does `LREAL`, with one opcode for each operator (`cmp-015-lreal-comparisons-and-nan`); a `LINT` compares as signed and a `ULINT` or `LWORD` as unsigned over their 64 bits (`cmp-015-lint-compare-signed-and-unsigned-order`).

### 64-bit types and `LREAL`

`LINT`, `ULINT`, `LWORD` and `LREAL` are two cells of the evaluation stack, the low word deeper. Every operation below is one VM instruction (or a fixed short sequence), the same on every platform: the double-precision opcodes are computed in integer arithmetic, so a result is the same bit pattern on a 64-bit host, a 32-bit host and a target. The results the VM defines are in the [runtime ISA](../runtime/isa.md#two-word-values-64-bit-integers-and-lreal).

| On `LINT`, `ULINT`, `LWORD` or `LREAL` | Result | Conformance case |
|---|---|---|
| `+`, `-`, comparison, `AND`, `OR`, `XOR`, `NOT`, negation of the integers | Works | `cmp-015-lint-add-and-subtract-carry`, `cmp-015-lint-extreme-values`, `cmp-015-ulint-compares-unsigned` |
| `*`, `/`, `MOD` of `LINT`, `ULINT` and `LWORD` | Works: the low 64 bits of the product; truncating division, `MOD` with the sign of the dividend; unsigned for `ULINT` and `LWORD`; a zero divisor is a VM fault | `cmp-015-lint-multiplication-wraps-at-64-bits`, `cmp-015-lint-division-truncates-toward-zero`, `cmp-015-ulint-division-above-2-63` |
| `SHL`, `SHR`, `ROL`, `ROR`, `ABS` and negation of the integers | Works on 64 bits | `cmp-015-lword-shifts-and-rotates-use-64-bits`, `cmp-015-lint-abs-and-negate` |
| a `FOR` counter, a `CASE` selector with 64-bit labels and ranges | Works | `cmp-015-lint-for-counter-crosses-32-bits`, `cmp-015-ulint-for-counter-up-to-the-top`, `cmp-015-lint-case-selector-and-labels`, `cmp-015-ulint-case-label-above-2-63` |
| literals over the whole range, in any base, typed (`LINT#-9`) or not | Works | `cmp-015-lint-literals-over-the-full-range` |
| `LREAL` `+`, `-`, `*`, `/`, negation, comparison | Works: IEEE 754 binary64, nearest even, overflow is an infinity, a NaN propagates | `cmp-015-lreal-addition-subtraction-keep-52-bits`, `cmp-015-lreal-multiplication-and-division`, `cmp-015-lreal-nan-and-infinity-propagate`, `cmp-015-lreal-comparisons-and-nan` |
| `LREAL` literals, exponent forms and initial values | Works | `cmp-015-lreal-literals-with-exponent`, `cmp-015-lreal-double-precision` |
| `LREAL` and `LINT` in arrays, structures, function parameters and results, `RETAIN` | Works | `cmp-015-lreal-and-lint-in-arrays-structures-and-calls`, `cmp-015-lreal-keeps-its-value-between-scans` |
| `ABS`, `NEG`, `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`, `SQRT`, `TRUNC`, `ROUND` | Works; exact for an `LREAL` (`SQRT` is correctly rounded, 0.0 at or below 0.0) | `cmp-015-lreal-abs-sqrt-limit-select`, `cmp-015-lreal-trunc-and-round` |
| `SIN`, `COS`, `TAN`, `EXP`, `LN`, `LOG`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `EXPT`, `**` of an `LREAL` | Works, in single precision: the argument is rounded to `REAL`, the function computes in `REAL` and the result is widened back, so it has about seven significant digits | `cmp-015-lreal-transcendental-functions-compute-in-real` |
| conversion functions, and the implicit conversion of an integer or a `REAL` to `LREAL` | Works | `cmp-015-lreal-conversion-functions`, `cmp-015-integer-width-conversion-functions`, `cmp-015-lreal-mixed-with-integers-and-real` |

What is still refused, with a message that says why: a 64-bit or `LREAL` argument of the string functions, of `AND_WORD` and its relatives and of the communication blocks; a 64-bit value as an array index (convert it with `LINT_TO_DINT`); an `LREAL` as a `FOR` counter or a `CASE` selector; `AND`, `OR`, `XOR`, `NOT` and `MOD` on an `LREAL`. `TRUNC` of an `LREAL` returns +0.0 for a result of zero (the sign of a zero is not kept), and `ROUND` of a value between -0.5 and 0 is +0.0.

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

`LTIME`, `LDATE`, `LTOD`, `LDT`, `CHAR` and `WCHAR` are not part of ZPLC 2.0. A declaration of one of them, like a declaration of any unknown type name, is a build error that names the type and its position (`cmp-003-*` in `conformance/cmp/`).

Evidence level: host. The cases `cmp-017-*` and `cmp-015-dt-plus-time-and-difference` build with the repository compiler and run the program on the native runtime, and `packages/zplc-compiler/src/compiler/time.test.ts` covers the literal grammar and its refusals. The wrap below zero, the time zone of `DT#` and the display in Studio were observed or read from the code (`numeric.ts`, `codegen.ts`, `debugAdapter.ts`) and no case pins them yet.

## Literals, operators and declarations

These forms build and run. Each bullet names the conformance cases under `conformance/cmp/` that pin it, and all of them pass.

- **Number literals.** Based literals `2#1010`, `8#17` and `16#FF` (`cmp-031-binary-literal`, `cmp-031-octal-literal`, `cmp-031-hexadecimal-literal`), also with a minus sign and with digit separators (`cmp-031-negative-based-literal`, `cmp-031-separator-in-based-literal`); `1_000` (`cmp-031-digit-separator`); and typed literals such as `INT#5` of the integer, bit string, `BOOL` and `REAL` types (`cmp-031-typed-literal`, `cmp-031-typed-literals-of-each-kind`). A number base other than 2, 8 and 16, and a typed literal outside the range of its type, are build errors (`cmp-031-base-not-supported`, `cmp-031-typed-literal-out-of-range`). The older `0xFF` form still builds and the build reports it as the warning `NON_IEC_HEX_LITERAL` (`cmp-031-0x-form-still-works`). A real literal with an exponent and no fraction, `1e3`, builds too and is reported as `NON_IEC_REAL_LITERAL` (`cmp-008-real-literal-without-fraction-warns`); the other warnings and the option that selects them are on the [compiler page](../ide/compiler.md#warnings).
- **Operators.** `&` has the precedence of `AND` (`cmp-032-ampersand-operator`, `cmp-032-ampersand-binds-tighter-than-or`). `**` is the power: integer operands are converted to `REAL`, it binds tighter than the minus sign and the multiplication, and a fractional exponent is accurate to about one part in a hundred thousand (`cmp-032-exponent-operator`, `cmp-032-power-of-integers`, `cmp-032-power-precedence`, `cmp-032-power-fractional-exponent`). `0.0 ** -1.0` faults like a division by zero (`cmp-032-power-zero-base-negative-exponent-faults`).
- **Bit access.** `w.0` reads and writes one bit of a `BYTE`, `WORD`, `INT`, `DWORD` or `LWORD`, of a structure member and of an array element, and a write leaves the other bits alone (`cmp-032-bit-access`, `cmp-032-bit-set-and-clear`, `cmp-032-bit-write-in-each-width`, `cmp-032-bit-of-lword`, `cmp-032-bit-of-member-and-element`). A bit number beyond the width of the type and a bit of a `BOOL` are build errors (`cmp-032-bit-number-out-of-range`, `cmp-032-bit-access-of-bool-rejected`).
- **Comments and the empty statement.** `(* *)` and `/* */` comments, and a lone `;`, also inside `IF` and `CASE` (`cmp-032-block-comment`, `cmp-032-empty-statement`, `cmp-032-empty-statements-inside-blocks`). An unterminated comment is reported where it opens (`cmp-009-unterminated-comment-position`).
- **Declarations.** `VAR RETAIN`, `VAR NON_RETAIN` and `VAR_GLOBAL RETAIN` (`cmp-029-var-retain-accepted`, `cmp-029-var-non-retain-is-accepted`, `cmp-029-var-global-retain`). A retained variable takes its declared initial value only when the retentive region holds no saved state, so a restored region keeps its values (`packages/zplc-ide/src/cli/retainedInitialValues.test.ts`). Several names in one declaration share its initial value (`cmp-030-several-names-one-declaration`, `cmp-030-several-names-with-initial-value`). `VAR_EXTERNAL` must name a global of the same type (`cmp-030-var-external`, `cmp-030-var-external-type-differs`, `cmp-030-var-external-without-global`). `VAR_TEMP` is accepted in a program and `VAR_OUTPUT` in a function (`cmp-030-var-temp-in-program`, `cmp-030-function-var-output`). A type alias, also of a structure or an array, and several types in one `TYPE` block are accepted, and aliases that refer to each other are rejected (`cmp-030-type-alias`, `cmp-030-alias-of-array-and-structure`, `cmp-030-several-types-one-block`, `cmp-030-alias-refers-to-itself`).
- **Function blocks.** An instance can be declared inside a function block, and arrays of instances are called with a constant or a run-time index, each element with its own state (`cmp-038-instance-inside-function-block`, `cmp-038-array-of-instances`, `cmp-038-array-of-user-blocks`, `cmp-038-array-run-time-index`). A constant index outside the array is a build error (`cmp-038-constant-index-out-of-bounds`). The names of the library blocks are not reserved words: a block that the program declares wins over the library block of the same name (`cmp-033-library-block-name-as-variable`, `cmp-033-user-block-named-like-a-library-block`).
- **Diagnostics.** A file with several independent errors reports each of them, in order, without the false errors that a broken `IF` used to leave (`cmp-007-three-errors-three-diagnostics`, `cmp-007-no-error-after-a-broken-if`). A duplicate declaration and an unknown member are reported at their own line (`cmp-006-duplicate-variable-position`, `cmp-006-unknown-member-position`), and a call that passes an argument no `VAR_INPUT` takes is rejected (`cmp-035-unknown-argument-name`).

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

## Names and types

Each rule below is covered by a conformance case under `conformance/cmp` (CMP-003, CMP-004, CMP-006).

- Names are not case sensitive, as IEC 61131-3 says: variables, functions, function blocks, structure members, enumeration values, parameter names, type names and direct addresses. `MyVar`, `myvar` and `MYVAR` are one variable, `byte` is `BYTE` and `%ix0.0` is `%IX0.0`. Two declarations whose names differ only by case are a duplicate and a compile error.
- A declaration whose type is not a type is a compile error that names the type and its position. That covers a misspelt name and the types that ZPLC 2.0 does not have: `LTIME`, `LDATE`, `LTOD`, `LDT`, `CHAR` and `WCHAR` (planned for 2.x).
- `VAR PERSISTENT` is a compile error at the word `PERSISTENT`. Declare the variables `RETAIN` to keep their value across a restart.

## Types of values

Each rule below is covered by a conformance case under `conformance/cmp` (CMP-005, CMP-012, CMP-018).

- Every value that goes into a place of a type is checked against that type: the right side of an assignment, an initial value, an argument of a function or of a function block, the value of a function, and an output bound with `=>`. A value of a type that does not convert is a compile error that names both types.
- Integers, bit strings and `REAL` form one family. An integer type, `BYTE`, `WORD` and `DWORD` convert to each other, and a value that does not fit the destination keeps its low bits and the build warns (`IMPLICIT_NARROWING`, see [Conversions](#conversions)). An integer converts to `REAL` and `LREAL`, and `REAL` to `LREAL`; an `LREAL` narrows to `REAL` with the `IMPLICIT_NARROWING` warning. A `REAL` or an `LREAL` does not convert to an integer: write `REAL_TO_INT(x)` or `LREAL_TO_DINT(x)`. A `STRING` or `WSTRING` is text and converts to no number, `BOOL` or time, and none converts to it: assigning one, passing it as an argument, returning it, giving it as an initial value, comparing it with a number or using it as a condition is a build error that names both types (`cmp-005-string-assigned-to-int`, `cmp-005-string-assigned-to-bool`, `cmp-005-wstring-assigned-to-real`, `cmp-005-string-literal-assigned-to-time`, `cmp-005-string-as-initial-value-of-an-int`, `cmp-005-string-passed-to-a-numeric-parameter`, `cmp-005-string-returned-from-a-numeric-function`, `cmp-005-string-compared-with-a-number`, `cmp-005-string-as-a-condition`). `LEN` and `FIND` give an `INT` and go to a number (`cmp-005-string-length-goes-to-a-number`).
- `BOOL` converts to and from nothing else, and neither do `TIME`, `DATE`, `TOD` and `DT`: `i := b;`, `b := 1;` and `n := t;` are compile errors. The difference of two `DT`, `TOD` or `DATE` values is a `TIME`.
- The condition of `IF`, `ELSIF`, `WHILE` and `UNTIL` is a `BOOL`: write `IF count <> 0 THEN`, not `IF count THEN`. Arithmetic does not take a `BOOL`, `MOD` takes integers, and `AND`, `OR`, `XOR` and `NOT` take `BOOL` or bit strings, not `REAL`; a `BOOL` is not compared with a number.
- A constant expression (literals, named constants, `+ - * /` and `MOD` of them) must fit the type it goes into: `small : SINT := 300;`, `level := -1;` for a `USINT` and `doubled := limit * 2;` with a constant `limit` of 20000 are compile errors. A variable is checked by its type, not by its value.
- A literal above 2147483647 is an unsigned 32-bit value: it goes to a `UDINT` or `DWORD` variable, to a `UDINT` parameter and to `AND_DWORD`, `OR_DWORD`, `XOR_DWORD` and `NOT_DWORD`; a literal beyond the range of a `WORD` parameter is an error.

## Functions and function blocks

Each rule below is covered by a conformance case under `conformance/cmp` (CMP-034, CMP-035, CMP-037).

- Each function is a scope of its own: two functions may declare parameters and locals with the same names, and a parameter may be named like a variable of a program. Inside a function, a name is its own variable first and then a `VAR_GLOBAL` one (a program's variables are not visible there). The name of the function is its result variable.
- A function is called with the arguments by position, `Sub(10, 2)`, or by name in any order, `Sub(b := 2, a := 10)`. Positional arguments come first. A parameter given twice, a name the function does not have, one argument too many and a required parameter with no argument are compile errors; a parameter that declares an initial value (`factor : INT := 10;`) may be left out and holds that value.
- A call may be a statement: `Bump(amount := 2);` runs the function and discards its result. A function may be declared before or after the ones that call it, and none may call itself, directly or through other functions: that is a compile error at the call that closes the cycle.
- A function block is called with named parameters. `IN := x` gives an input, and `Q => y` copies the output `Q` into the variable `y` after the call (`y` may be a member or an element). The names are matched without regard to case. A name the block does not have, a local of a block, an output given a value with `:=` and an input bound with `=>` are compile errors. The positional call of a function block is left to 2.x.

## Methods, inheritance and interfaces

Each rule below is covered by a conformance case under `conformance/cmp` (CMP-041).

- **Methods.** A method is called on an instance, `valve.Open()`, or by its name inside the block, `Open()` or `THIS.Open()`. A method has its own inputs and locals, and its value is what it assigns to its own name (`cmp-041-this-member-in-method`, `cmp-041-method-with-several-assignments-called-in-a-loop`). The arguments of a call are values of the caller: a name in them is the caller's, whatever the method declares.
- **Inheritance.** `EXTENDS` gives the derived block the variables and methods of its base. `OVERRIDE` replaces a method and is required to do so; `FINAL` on a method forbids overriding it, and `FUNCTION_BLOCK FINAL` forbids extending the block (`cmp-041-override-and-inherited-method`, `cmp-041-final-method-cannot-be-overridden`, `cmp-041-final-block-cannot-be-extended`).
- **SUPER^.** `SUPER^.Method()` calls the method of the base of the block that declares the code that is running, and `SUPER^();` runs the body of that base block, on the same instance. A derived block does not run the body of its base by itself. With three levels, each `SUPER^` is the level above it, not the base of the instance (`cmp-041-super-call`, `cmp-041-super-call-runs-the-base-body`, `cmp-041-super-call-through-three-levels`).
- **ABSTRACT.** A method declared `ABSTRACT` has no body, and the block that declares one is `FUNCTION_BLOCK ABSTRACT`. An abstract block has no instances, and a block that is not abstract implements every abstract method it inherits. A method of the base may call the abstract method: the one that runs is the one of the instance's block (`cmp-041-abstract-method-is-run-by-the-derived-block`, `cmp-041-abstract-block-cannot-be-instantiated`, `cmp-041-abstract-method-left-unimplemented-is-rejected`).
- **Access.** A `PRIVATE` method is called only inside the block that declares it, and a `PROTECTED` one inside that block and the blocks that extend it; `PUBLIC` is the default. A call from a program, a function or another block is a build error that names the method and where it can be called (`cmp-041-private-method-is-not-callable-from-outside`, `cmp-041-protected-method-is-not-callable-from-outside`, `cmp-041-protected-method-is-callable-from-a-derived-block`, `cmp-041-private-method-is-not-callable-from-a-derived-block`).
- **Interfaces.** A variable of an interface type holds a reference to an instance, `NULL` until one is assigned. It takes an instance of a block that declares `IMPLEMENTS` for the interface (or extends one that does), another variable of the interface, or `NULL`; anything else is a build error. `shape.Area()` runs the method of the instance the variable refers to, whichever block it is of, including an element of an array chosen at run time and an instance of a derived block (`cmp-041-interface-dispatch`, `cmp-041-interface-dispatch-by-the-instance-assigned`, `cmp-041-interface-variable-as-an-input-of-a-block`, `cmp-041-interface-through-inheritance-and-array-elements`). A call through a variable that holds no instance ends the scan with a VM fault (`cmp-041-interface-call-of-a-null-reference-faults`).

How an interface call is built: a function block is built into the code at each place it is called, with the addresses of its instance. The reference of an interface variable is the address of the instance in the low 16 bits and the tag of its block type in the high 16 bits. For each call the compiler lists every instance, in the whole project, of a block that implements the interface (variables, array elements, instances inside other blocks and structures), and writes a comparison of the reference with each one, with the method inlined on that instance behind it. A reference that matches none is a VM fault. The cost is code, not run time: a call through an interface is as large as the sum of the methods of every instance that can answer it, so an interface implemented by blocks of which the project has many instances is better called from a function block than from many places.

## Projects, files and memory

Each rule below is covered by a conformance case under `conformance/cmp` (CMP-042, CMP-043) and by `packages/zplc-compiler/src/compiler/unit.test.ts`.

- **One unit.** All the Structured Text files of a project (`src/*.st`) are built as one unit, whether or not a task runs a program that is in them. A type, a function, a function block, an interface or a `VAR_GLOBAL` declared in any file is visible to every program, and the file that uses a type may come before the file that declares it (`cmp-042-function-block-in-another-file`, `cmp-042-global-in-another-file`, `cmp-042-type-from-another-file-in-a-structure`). A `PROGRAM` that no task runs is not built. The graphical languages and Instruction List are built when a task runs them.
- **A global is one variable.** A `VAR_GLOBAL` has one address, shared by every program and every task, and one initial value that is applied once, before the first scan of whichever task runs first (`cmp-042-two-tasks-share-a-global`). A function is built once, and the programs of both tasks call it (`cmp-042-function-from-another-file-in-two-programs`). Two programs may declare variables of the same name: each keeps its own.
- **A declaration made twice is an error at both places.** A type, a function, a function block or an interface declared in two files, or a global declared twice, is reported at each declaration, and the message names both files and lines (`cmp-042-function-block-declared-in-two-files-is-rejected`). An error in a file is reported in that file, whichever program uses what the file declares.
- **One memory.** The variables of the globals, the functions, the function-block instances, the programs, the string literals and the work buffers of the string functions of the whole project share the WORK memory of the target profile: 8192 bytes on the `posix` target. There is no limit per program or per task (`cmp-043-programs-share-the-region`, `cmp-043-program-that-fills-the-region`). One byte of it, the last, is the initialization flag.
- **Layout.** The compiler places, in this order: the globals, the variables of each function, the variables of the methods, the variables of each program in task order, the string literals, and the work buffers. Each variable is aligned to its size up to 4 bytes, so the same project always gives the same addresses. A program that moves because another file was added is read by the debug map, which lists each address (see [Memory Model](../runtime/memory-model.md)).
- **An allocation failure names what it needs.** A project that does not fit is a build error at the declaration that crosses the end of the region, and the message states the bytes required, the bytes available and the three largest consumers: `WORK allocation exceeds the target memory profile: 9005 bytes required, 8192 bytes available (...). Largest consumers: Overflow.Table (9000 bytes), Overflow.Gain (4 bytes)` (`cmp-043-allocation-failure-states-bytes-and-consumers`). A target with a smaller WORK memory has a smaller limit: the project is built against the profile of the board it names.

- **Where the map and the tools find a global.** The debug map lists a global once, in the POU of the file that declares it (a file with no program is a POU named by its file name, `globals.st`), marked `scope: "global"`, with the one address every program uses. A scenario signal names it as `Program.Global`, for any program of the project, or by its name alone, which is read as seen from the first program; the trace and the evidence call it `Program.Global`. A watch in Studio takes the name of the global and shows that address. A variable that belongs to another program is not a signal of this one (`packages/zplc-ide/src/test-engine/globals.test.ts`, `packages/zplc-ide/src/hooks/globalWatch.test.ts`).

## Standard library entry point

See [Standard Library](./stdlib.md) for the built-in functions and function blocks grounded in
`packages/zplc-compiler/src/compiler/stdlib/index.ts`.

## Known limits

This section lists what the compiler, the loader and the debug map do not do as IEC 61131-3 asks. The table is generated from the conformance cases that are expected to fail (`tools/ci/expected-failures.json`) and from the description of each requirement in `docs/known-limits.json`: a row exists while at least one case of its requirement fails, and it disappears when the last one passes. The standard blocks and functions have their own table in [section 11 of the Standard Library reference](../runtime/stdlib.md#11-known-differences-from-iec-61131-3).

{/* >>> GENERATED (tools/docs/generate_known_limits.py): known-limits-language. Do not edit. >>> */}
No conformance case of this area is on the expected-failures list: no limit is recorded.
{/* <<< END GENERATED: known-limits-language <<< */}

Not supported in this release and rejected with a message, by decision D-04: arrays of arrays, enumerations with a base type, subranges, `POINTER TO` and `ADR` (use `REF_TO` and `REF()`), `VAR_ACCESS`, a textual `CONFIGURATION`, `NAMESPACE`, `PROPERTY`, `ACTION` blocks in a program, positional function-block calls and the function forms of operators such as `ADD(a, b)`. The cases `cmp-006-*-is-rejected` pass: they pin the rejection, so a program that uses one fails to build.
