---
sidebar_position: 1
---

# Structured Text (ST)

Structured Text is the main language of ZPLC and the one to learn first. This page teaches how to write it and states the rules the compiler applies: types, conversions, time, data, functions, function blocks and project layout. What works, element by element, and the executed cases behind each one, is the generated [Structured Text reference](../reference/language-st.md).

ST is the only language the compiler reads directly. Instruction List, Ladder, Function Block Diagram and Sequential Function Chart are translated to ST first (`packages/zplc-ide/src/compiler/index.ts`), so the rules below are also the rules of every other language. The runtime executes the compiled `.zplc` bytecode, never the source.

## Write and run a program

A program declares its variables and then lists statements. This one counts scans and raises `Output_LED` when the counter reaches the threshold:

```pascal runnable expect="Counter=3 Output_LED=FALSE" scans=3 scan_ms=10
PROGRAM Main
    VAR
        Counter: INT := 0;
        Threshold: INT := 100;
        Output_LED: BOOL := FALSE;
    END_VAR

    Counter := Counter + 1;

    IF Counter >= Threshold THEN
        Output_LED := TRUE;
        Counter := 0;
    ELSE
        Output_LED := FALSE;
    END_IF;
END_PROGRAM
```

Each scan adds 1 to `Counter`, and `Output_LED` stays `FALSE` until `Counter` reaches `Threshold`. After three scans `Counter` is 3. CI compiles the sample, runs it for three scans of 10 ms and checks both values.

Standard function blocks are declared like variables and called with named parameters. This one starts a `TON` timer, and `Out1` becomes `TRUE` once it has counted 250 ms:

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

CI runs it for 30 scans of 10 ms and checks that `Out1` is `TRUE`. The blocks and functions you can call are in [Standard library](../runtime/stdlib.md).

## Syntax at a glance

The elementary types are:

- `BOOL`;
- `SINT`, `INT`, `DINT`, `LINT` (signed integers of 8, 16, 32 and 64 bits) and `USINT`, `UINT`, `UDINT`, `ULINT` (unsigned);
- `BYTE`, `WORD`, `DWORD`, `LWORD` (bit strings of 8, 16, 32 and 64 bits);
- `REAL` (32-bit) and `LREAL` (64-bit, IEEE 754 double precision);
- `TIME`, `DATE`, `TOD`, `DT`, see [Time and date types](#time-and-date-types);
- `STRING` and `WSTRING`.

The control structures are:

- `IF ... THEN ... ELSIF ... ELSE ... END_IF`;
- `CASE ... OF ... ELSE ... END_CASE`;
- `FOR ... TO ... BY ... DO ... END_FOR`;
- `WHILE ... DO ... END_WHILE`;
- `REPEAT ... UNTIL ... END_REPEAT`.

Names are not case sensitive: `MyVar`, `myvar` and `MYVAR` are one variable, `byte` is `BYTE` and `%ix0.0` is `%IX0.0`. Two declarations whose names differ only by case are a duplicate and a build error. `(* *)` and `/* */` comments are accepted, and so is a lone `;` as an empty statement.

## Numeric types

The case named in a row or a rule is a conformance program under `conformance/cmp/` that runs on the native runtime. The cases of the 64-bit types and `LREAL` give the same results on a 64-bit and on a 32-bit build of the runtime.

| Type    | Bits | Range                                       | Ordered as                | Conformance case                     |
| ------- | ---- | ------------------------------------------- | ------------------------- | ------------------------------------ |
| `BOOL`  | 8    | `FALSE`, `TRUE`                             | not ordered               | `harness/vf-001-bool-output-toggles` |
| `SINT`  | 8    | -128 to 127                                 | signed                    | `cmp-011-sint-limits`                |
| `USINT` | 8    | 0 to 255                                    | unsigned                  | `cmp-012-usint-holds-0-to-255`       |
| `BYTE`  | 8    | bit string, 0 to 255                        | unsigned                  | `cmp-014-not-byte`                   |
| `INT`   | 16   | -32768 to 32767                             | signed                    | `cmp-011-int-limits`                 |
| `UINT`  | 16   | 0 to 65535                                  | unsigned                  | `cmp-012-uint-65535`                 |
| `WORD`  | 16   | bit string, 0 to 65535                      | unsigned                  | `cmp-014-not-word`                   |
| `DINT`  | 32   | -2147483648 to 2147483647                   | signed                    | `cmp-011-dint-limits`                |
| `UDINT` | 32   | 0 to 4294967295                             | unsigned                  | `cmp-012-udint-max`                  |
| `DWORD` | 32   | bit string, 0 to 4294967295                 | unsigned                  | `cmp-014-not-dword`                  |
| `LINT`  | 64   | -9223372036854775808 to 9223372036854775807 | signed                    | `cmp-015-lint-extreme-values`        |
| `ULINT` | 64   | 0 to 18446744073709551615                   | unsigned                  | `cmp-015-ulint-compares-unsigned`    |
| `LWORD` | 64   | bit string, 0 to 18446744073709551615       | unsigned                  | `cmp-015-ulint-compares-unsigned`    |
| `REAL`  | 32   | IEEE 754 single precision                   | IEEE order, NaN unordered | `cmp-013-real-nan-is-unordered`      |
| `LREAL` | 64   | IEEE 754 double precision                   | IEEE order, NaN unordered | `cmp-015-lreal-comparisons-and-nan`  |

### Arithmetic, wrap and division

- **Width of a computation.** Operands of 8 and 16 bits are widened to 32 bits for the operation, and the result is cut to its width only when it is stored. With `i : INT := 32767`, `i + 1` is 32768 inside an expression and -32768 once stored in an `INT`; a `UINT` of 65535 plus 1 stored in a `UINT` is 0 (`cmp-012-uint-65535`).
- **32 and 64 bits wrap in two's complement.** `DINT` 2147483647 plus 1 is -2147483648, and subtraction and multiplication wrap the same way. The most negative `DINT`, negated, passed to `ABS` or divided by -1, stays the most negative `DINT`, and that value `MOD` -1 is 0 (`cmp-016-dint-add-wraps`, `cmp-016-dint-min-divided-by-minus-one`). `LINT` wraps the same way, and its product is the low 64 bits (`cmp-015-lint-multiplication-wraps-at-64-bits`).
- **Division truncates toward zero, and `MOD` takes the sign of the dividend**, as in C: -7 / 2 is -3 and -7 `MOD` 2 is -1 (`cmp-011-int-divide-negative`). `UDINT`, `ULINT` and `LWORD` divide and take `MOD` as unsigned over their whole range (`cmp-012-udint-divide-and-modulo`, `cmp-015-ulint-division-above-2-63`).

:::warning
Division or `MOD` by zero ends the scan with the VM fault `ZPLC_VM_DIV_BY_ZERO` (code 0x03). The same happens for a `REAL` or `LREAL` division by 0.0 or -0.0 and for a `LINT` or `ULINT` division or `MOD` by zero (`cmp-015-lint-division-by-zero-faults`). Test the divisor before you divide. What a fault does to the outputs is in [Pause, resume, step and stop](../runtime/scheduler.md#pause-resume-step-and-stop).
:::

### Shifts, rotations and bit logic

- `SHL(IN, N)`, `SHR(IN, N)`, `ROL(IN, N)` and `ROR(IN, N)` are functions. A shift by 32 or more, or by a negative count, gives 0 (`cmp-016-shift-by-the-width-or-more`). `SHR` is logical: zeros enter on the left.
- A `BYTE`, a `WORD` and the 8-bit and 16-bit integers shift and rotate inside their own width (`cmp-014-shl-byte-keeps-8-bits`, `cmp-014-rol-byte-rotates-within-8-bits`). On `LWORD`, `LINT` and `ULINT` the width is 64: a shift by 64 or more gives 0, and a rotation takes its count modulo 64 and keeps every bit (`cmp-015-lword-shifts-and-rotates-use-64-bits`).
- `AND`, `OR`, `XOR` and `NOT` work on the full declared width (`cmp-014-not-byte`, `cmp-014-and-or-xor-word`).
- `w.0` reads and writes one bit of a `BYTE`, `WORD`, `INT`, `DWORD` or `LWORD`, of a structure member and of an array element; a write leaves the other bits alone. A bit number beyond the width and a bit of a `BOOL` are build errors (`cmp-032-bit-access`, `cmp-032-bit-number-out-of-range`).

### Conversions

- **Widening keeps the value.** A signed type is sign-extended and an unsigned type or bit string is zero-extended: `INT` -5 becomes `DINT` -5 (`cmp-011-int-widens-to-dint`).
- **Narrowing on assignment keeps the low bits, and the build warns.** A `DINT` 70000 stored in an `INT` is 4464 (`cmp-005-integer-narrowing-keeps-the-low-bits-and-warns`). The build succeeds and reports the warning `IMPLICIT_NARROWING` at the value, naming both types. A constant that does not fit is an error instead. Mask the value, or declare the destination wide enough, to remove the warning.
- **An integer becomes a `REAL` or an `LREAL` when it is assigned to one or mixed with one**: `INT` times `REAL` is a `REAL` (`cmp-013-int-times-real`). `LREAL` is the widest numeric type. A real literal in an `LREAL` expression is the double it writes, so `0.1 + 0.2` is 0.30000000000000004, while an expression of `REAL` values is computed in single precision and widened (`cmp-015-lreal-literal-takes-the-type-of-its-context`).
- **`LREAL` to `REAL` narrows and warns**: the result is rounded to single precision, about 7 significant digits, and a magnitude above 3.4e38 becomes an infinity. Write `LREAL_TO_REAL(d)` to say so.
- **A real never converts to an integer implicitly.** `i := r` and an integer expression assigned to a `BOOL` are build errors that name both types (`cmp-005-int-assigned-from-real`, `cmp-005-bool-assigned-from-int`). Write `REAL_TO_INT(r)` and `i <> 0` instead.
- **`REAL_TO_INT` rounds to the nearest integer**, an exact half to the even integer, saturates at the limits of the destination and gives 0 for a NaN (`cmp-057-real-to-int-ties-go-to-even`, `cmp-057-real-to-integer-saturates-at-the-destination-range`). `REAL_TO_DINT(TRUNC(x))` truncates toward zero.
- A conversion function `<FROM>_TO_<TO>` exists for every pair of different types among `BOOL`, the integers, the bit strings, `REAL`, `LREAL` and `TIME`. `DATE`, `TOD` and `DT` have none yet.
- `BOOL` converts to and from nothing else, and neither do `TIME`, `DATE`, `TOD` and `DT`: `i := b;`, `b := 1;` and `n := t;` are build errors. A `STRING` or `WSTRING` is text and converts to no number, `BOOL` or time, and none converts to it (`cmp-005-string-assigned-to-int`).
- The condition of `IF`, `ELSIF`, `WHILE` and `UNTIL` is a `BOOL`: write `IF count <> 0 THEN`, not `IF count THEN`. Arithmetic does not take a `BOOL`, and `AND`, `OR`, `XOR` and `NOT` take `BOOL` or bit strings, not `REAL`.
- A constant expression must fit the type it goes into: `small : SINT := 300;` is a build error. A variable is checked by its type, not by its value. A literal above 2147483647 is an unsigned 32-bit value and goes to a `UDINT` or `DWORD`.

Try the rounding rule:

```st runnable expect="Down=3 Tie=2 Up=4" scans=1 scan_ms=10
PROGRAM RoundTrip
VAR
    Down : INT;
    Tie : INT;
    Up : INT;
END_VAR
Down := REAL_TO_INT(2.6);
Tie := REAL_TO_INT(2.5);
Up := REAL_TO_INT(3.5);
END_PROGRAM
```

### Mixed operands and comparison

- **The type of an operation is the wider operand.** `REAL` wins over every integer, `LREAL` wins over `REAL`, and between two types of the same width the unsigned one wins, as in C. `DINT` -1 compared with `UDINT` 5 is an unsigned comparison, so `-1 < 5` is FALSE, while `INT` -1 compared with `UINT` 5 is TRUE because both are widened to 32 bits first. The rule is `commonType` in `packages/zplc-compiler/src/compiler/numeric.ts`.
- **Unsigned types compare unsigned over their whole range**: `UDINT` 4294967295 is the largest value (`cmp-012-udint-max`).
- **`REAL` and `LREAL` compare by IEEE 754 order.** -0.0 equals 0.0, the infinities order beyond every finite value, and a NaN is neither equal, less nor greater than anything, itself included (`cmp-013-real-nan-is-unordered`).

### 64-bit types and `LREAL`

`LINT`, `ULINT`, `LWORD` and `LREAL` take two cells of the evaluation stack. Every operation is one VM instruction, or a fixed short sequence, the same on every platform: the double-precision opcodes are computed in integer arithmetic, so a result is the same bit pattern on a 64-bit host, a 32-bit host and a target. The results the VM defines are in the [runtime ISA](../runtime/isa.md#two-word-values-64-bit-integers-and-lreal).

- **Works:** arithmetic, comparison, shifts, `ABS`, a `FOR` counter and a `CASE` selector with 64-bit labels, literals over the whole range in any base, and `LREAL` in arrays, structures, function parameters, results and `RETAIN` (`cmp-015-lint-extreme-values`, `cmp-015-lint-for-counter-crosses-32-bits`, `cmp-015-lreal-and-lint-in-arrays-structures-and-calls`).
- **`LREAL` functions:** `ABS`, `NEG`, `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`, `SQRT`, `TRUNC` and `ROUND` are exact. `SIN`, `COS`, `TAN`, `EXP`, `LN`, `LOG`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `EXPT` and `**` compute in single precision: the argument is rounded to `REAL` and the result widened back, so they carry about seven significant digits (`cmp-015-lreal-transcendental-functions-compute-in-real`).
- **Still refused, with a message that says why:** a 64-bit or `LREAL` argument of the string functions, of `AND_WORD` and its relatives and of the communication blocks; a 64-bit value as an array index (convert it with `LINT_TO_DINT`); an `LREAL` as a `FOR` counter or a `CASE` selector; and `AND`, `OR`, `XOR`, `NOT` and `MOD` on an `LREAL`.

## Time and date types

| Type                   | Width             | What it holds                                                      | Literal                           |
| ---------------------- | ----------------- | ------------------------------------------------------------------ | --------------------------------- |
| `TIME`                 | 32 bits, unsigned | A duration in milliseconds, 0 to 4294967295 (`T#49d17h2m47s295ms`) | `T#1h30m`, `T#1.5s`, `TIME#250ms` |
| `DATE`                 | 32 bits, signed   | Seconds since 1970-01-01; earlier dates are negative               | `D#2024-01-01`                    |
| `TOD` (`TIME_OF_DAY`)  | 32 bits, unsigned | Milliseconds since midnight                                        | `TOD#12:30:00`                    |
| `DT` (`DATE_AND_TIME`) | 64 bits, signed   | Milliseconds since 1970-01-01 00:00:00                             | `DT#2024-01-01-12:00:00`          |

### TIME

- A literal has days, hours, minutes, seconds and milliseconds, each at most once and in that order, with an optional `_` between them (`T#1d_2h_3m_4s_5ms`). `us` and `ns` are accepted when the whole literal is a whole number of milliseconds, and the last component may have a fraction (`T#1.5s`).
- A literal that is not a whole number of milliseconds (`T#1.5ms`), is above 4294967295 ms (`T#50d`), is negative (`T#-5s`) or has its units out of order (`T#30m1h`) is a build error that names the literal (`cmp-017-time-literal-below-a-millisecond`, `cmp-017-time-literal-above-the-range`).
- Comparison, addition, subtraction and division are unsigned 32-bit: `T#30d > T#1d` is TRUE. A timer preset above 24.8 days works.
- **A negative duration cannot be represented.** A subtraction below zero wraps modulo 2^32: `T#0s - T#1s` is 4294966296 ms, and the build gives no warning. Check that the minuend is not smaller before you subtract.
- The Watch table shows a `TIME` above 2147483647 ms (24d20h31m23s647ms) as a negative number, because the watch adapters read its 32 bits as signed. The value the program holds is the unsigned count.
- Whether `TIME` stays an unsigned 32-bit count or becomes a signed 64-bit value is an open owner decision, tracked under requirement CMP-017. This page announces no change.

### DATE, TOD and DT

- `TOD` and `DT` hold milliseconds, the unit of `TIME`. `TOD#12:30:00 + T#1h` is 13:30:00, and the difference of two `DT` values is a `TIME`. All three types assign and compare.
- `DATE` counts seconds, not milliseconds. It assigns and compares (`D#2024-01-01 < D#2025-06-30`), but adding a `TIME` to a `DATE` adds milliseconds to a count of seconds: do not do it. No conformance case covers arithmetic on `DATE`.
- A `DT#` literal is read in the time zone of the machine that compiles, while `D#` and `TOD#` are read as UTC. The same source built in two time zones gives two different `DT` constants. This is a defect, not a design, and no conformance case pins it yet.

### Types that are not supported

`LTIME`, `LDATE`, `LTOD`, `LDT`, `CHAR` and `WCHAR` are not part of ZPLC 2.0. A declaration of one of them, like a declaration of any unknown type name, is a build error that names the type and its position (`cmp-003-*` in `conformance/cmp/`).

Evidence level: host. The cases `cmp-017-*` build with the repository compiler and run on the native runtime, and `packages/zplc-compiler/src/compiler/time.test.ts` covers the literal grammar and its refusals. The wrap below zero, the time zone of `DT#` and the display in the Watch table were observed or read from the code, and no case pins them yet.

## Literals, operators and declarations

- **Number literals.** Based literals `2#1010`, `8#17` and `16#FF`, with a minus sign and with digit separators; `1_000`; and typed literals such as `INT#5`. A base other than 2, 8 and 16, and a typed literal outside the range of its type, are build errors (`cmp-031-hexadecimal-literal`, `cmp-031-typed-literal-out-of-range`). The older `0xFF` form still builds and the build reports the warning `NON_IEC_HEX_LITERAL`; `1e3`, a real literal with an exponent and no fraction, builds and is reported as `NON_IEC_REAL_LITERAL`. The warnings and the option that selects them are on the [compiler page](../ide/compiler.md#warnings).
- **Operators.** `&` has the precedence of `AND`. `**` is the power: integer operands are converted to `REAL`, it binds tighter than the minus sign and the multiplication, and `0.0 ** -1.0` faults like a division by zero (`cmp-032-ampersand-operator`, `cmp-032-power-precedence`).
- **Declarations.** `VAR RETAIN`, `VAR NON_RETAIN` and `VAR_GLOBAL RETAIN` are accepted. A retained variable takes its declared initial value only when the retentive region holds no saved state, so a restored region keeps its values. Several names in one declaration share its initial value. `VAR_EXTERNAL` must name a global of the same type. `VAR_TEMP` is accepted in a program and `VAR_OUTPUT` in a function. A type alias, also of a structure or an array, is accepted, and aliases that refer to each other are rejected. `VAR PERSISTENT` is a build error: declare the variables `RETAIN` to keep their value across a restart.
- **Diagnostics.** A file with several independent errors reports each of them, in order, without the false errors that a broken `IF` used to leave. A duplicate declaration and an unknown member are reported at their own line, and a call that passes an argument no `VAR_INPUT` takes is rejected (`cmp-007-three-errors-three-diagnostics`, `cmp-035-unknown-argument-name`).

## Data, storage and initial values

### Structures, enumerations and arrays

- A member of a structure or of a function block is read and written at its declared width. Members nest to any depth: `a.b.c`.
- A whole structure or array is assigned, and passed to a function, by value: every byte is copied, and both sides must be of the same type.
- A structure takes an initial value of the form `(x := 1, y := 2)`. A field left out keeps the default of its declaration.
- An enumeration is stored as an `INT`. A value can be written `Type#Value`, which also tells apart a value name that two enumerations share.
- An array has one to three dimensions, negative lower bounds and bounds that are constant expressions (`ARRAY[-N .. N * 2] OF INT`). Its elements can be of any type. An initial value is a list `[1, 2, 3]`, nested lists for more dimensions, and repeat counts `[100(0)]`.
- A constant index outside the bounds is a build error. A variable index outside the bounds ends the scan with the VM fault `ZPLC_VM_OUT_OF_BOUNDS`. The check is on by default; the compiler option `arrayBoundsCheck: false` removes it.

### Strings

- `STRING` holds 80 characters, `STRING[n]` holds `n`, and `WSTRING[n]` holds `n` 16-bit characters.
- An assignment copies the characters, up to the capacity of the target. A literal longer than the capacity of its variable is a build error.
- A string function never changes its arguments: `LEFT`, `RIGHT`, `MID`, `CONCAT`, `INSERT`, `DELETE` and `REPLACE` return a new string. `COPY(src, dst)` and `CLEAR(s)` write to their argument.
- `s := LEFT(s, n)` works on the variable. Any other string function that builds a string uses a work buffer of the program's WORK memory, which counts against the bytes of the program.
- `WSTRING` can be declared, initialised, assigned and measured with `LEN`. The other string functions and the comparison refuse it with a message.

### Initial values and constants

- At the first scan every variable holds its declared initial value, or the default of its type: zero, `FALSE`, the empty string, `NULL`. That covers programs, `VAR_GLOBAL`, every member of every function-block instance, structure fields and array elements.
- A function local and a `VAR_TEMP` of a function block hold their declared value again at every call, so a function holds no state. A `VAR` of a function block keeps its value from call to call.
- `VAR CONSTANT` and `VAR_GLOBAL CONSTANT` hold their value, and an assignment to a constant is a build error.

### VAR_IN_OUT and references

- A `VAR_IN_OUT` of a function block is passed by reference: what the body changes, the caller sees. The variable must be of the same type and cannot be a constant. A block called without binding it ends the scan with a VM fault.
- `REF_TO`, `REF()` and `^` are type-checked: `REF(x)` goes only into a `REF_TO` of the type of `x`. A `REF_TO` variable is `NULL` until it is assigned, and dereferencing `NULL` ends the scan with the VM fault `ZPLC_VM_OUT_OF_BOUNDS`.

## Functions and function blocks

- Each function is a scope of its own. Inside a function a name is its own variable first and then a `VAR_GLOBAL` one; the variables of a program are not visible there. The name of the function is its result variable.
- A function is called with the arguments by position, `Sub(10, 2)`, or by name in any order, `Sub(b := 2, a := 10)`, with the positional ones first. A parameter given twice, a name the function does not have, one argument too many and a required parameter with no argument are build errors. A parameter that declares an initial value (`factor : INT := 10;`) may be left out.
- A call may be a statement, and the result is discarded. A function may be declared before or after the ones that call it, and none may call itself, directly or through others: that is a build error at the call that closes the cycle.
- A function block is called with named parameters. `IN := x` gives an input, and `Q => y` copies the output `Q` into the variable `y` after the call. The names are matched without regard to case. A name the block does not have, an output given a value with `:=` and an input bound with `=>` are build errors. The positional call of a function block is left to 2.x.
- An instance can be declared inside a function block, and arrays of instances are called with a constant or a run-time index, each element with its own state (`cmp-038-array-of-instances`, `cmp-038-array-run-time-index`). The names of the library blocks are not reserved words: a block that the program declares wins over the library block of the same name.

## Methods, inheritance and interfaces

- **Methods.** A method is called on an instance, `valve.Open()`, or by its name inside the block, `Open()` or `THIS.Open()`. A method has its own inputs and locals, and its value is what it assigns to its own name.
- **Inheritance.** `EXTENDS` gives the derived block the variables and methods of its base. `OVERRIDE` replaces a method and is required to do so; `FINAL` on a method forbids overriding it, and `FUNCTION_BLOCK FINAL` forbids extending the block (`cmp-041-override-and-inherited-method`, `cmp-041-final-method-cannot-be-overridden`).
- **`SUPER^`.** `SUPER^.Method()` calls the method of the base of the block that declares the running code, and `SUPER^();` runs the body of that base block on the same instance. A derived block does not run the body of its base by itself.
- **`ABSTRACT`.** A method declared `ABSTRACT` has no body, and the block that declares one is `FUNCTION_BLOCK ABSTRACT`. An abstract block has no instances, and a block that is not abstract implements every abstract method it inherits.
- **Access.** A `PRIVATE` method is called only inside the block that declares it, and a `PROTECTED` one inside that block and the blocks that extend it. `PUBLIC` is the default. A call from elsewhere is a build error that names the method.
- **Interfaces.** A variable of an interface type holds a reference to an instance, `NULL` until one is assigned. It takes an instance of a block that declares `IMPLEMENTS` for the interface, another variable of the interface, or `NULL`. `shape.Area()` runs the method of the instance the variable refers to, whichever block it is of (`cmp-041-interface-dispatch`). A call through a variable that holds no instance ends the scan with a VM fault.

A function block is built into the code at each place it is called. For an interface call, the compiler lists every instance in the project of a block that implements the interface, compares the reference with each one and inlines the method behind each comparison; a reference that matches none is a VM fault. The cost is code, not run time: a call through an interface is as large as the sum of the methods of every instance that can answer it, so an interface implemented by blocks with many instances is better called from a function block than from many places.

## Projects, files and memory

- **One unit.** All the Structured Text files of a project (`src/*.st`) are built as one unit. A type, a function, a function block, an interface or a `VAR_GLOBAL` declared in any file is visible to every program, and the file that uses a type may come before the file that declares it (`cmp-042-function-block-in-another-file`). A `PROGRAM` that no task runs is not built. The graphical languages and Instruction List are built when a task runs them.
- **A global is one variable.** It has one address, shared by every program and every task, and one initial value applied once, before the first scan of whichever task runs first. Two programs may declare variables of the same name: each keeps its own.
- **A declaration made twice is an error at both places**, and the message names both files and lines (`cmp-042-function-block-declared-in-two-files-is-rejected`).
- **One memory.** The globals, the functions, the function-block instances, the programs, the string literals and the work buffers of the string functions share the WORK memory of the target profile: 8192 bytes on the `posix` target. There is no limit per program or per task, and the last byte is the initialization flag.
- **Layout.** The compiler places, in this order: the globals, the variables of each function, the variables of the methods, the variables of each program in task order, the string literals and the work buffers. Each variable is aligned to its size up to 4 bytes, so the same project always gives the same addresses. The debug map lists each address (see [Memory model](../runtime/memory-model.md)).
- **An allocation failure names what it needs.** A project that does not fit is a build error at the declaration that crosses the end of the region. It states the bytes required, the bytes available and the three largest consumers: `WORK allocation exceeds the target memory profile: 9005 bytes required, 8192 bytes available (...). Largest consumers: Overflow.Table (9000 bytes), Overflow.Gain (4 bytes)`. A board with a smaller WORK memory has a smaller limit, because the project is built against the profile of the board it names.
- **Where a global is found.** The debug map lists a global once, in the unit of the file that declares it, marked `scope: "global"`. A scenario signal names it as `Program.Global` or by its name alone, and a watch takes the name of the global and shows that address.

## Known limits

This section lists what the compiler, the loader and the debug map do not do as IEC 61131-3 asks. The table is generated from the conformance cases that are expected to fail (`tools/ci/expected-failures.json`) and from the description of each requirement in `docs/known-limits.json`: a row exists while at least one case of its requirement fails, and it disappears when the last one passes. The standard blocks and functions have their own table in [section 11 of the Standard Library reference](../runtime/stdlib.md#11-known-differences-from-iec-61131-3).

{/* >>> GENERATED (tools/docs/generate_known_limits.py): known-limits-language. Do not edit. >>> */}
No conformance case of this area is on the expected-failures list: no limit is recorded.
{/* <<< END GENERATED: known-limits-language <<< */}

Not supported in this release and rejected with a message, by decision D-04: arrays of arrays, enumerations with a base type, subranges, `POINTER TO` and `ADR` (use `REF_TO` and `REF()`), `VAR_ACCESS`, a textual `CONFIGURATION`, `NAMESPACE`, `PROPERTY`, `ACTION` blocks in a program, positional function-block calls and the function forms of operators such as `ADD(a, b)`. The cases `cmp-006-*-is-rejected` pin the rejection, so a program that uses one fails to build.
