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

## Standard library entry point

See [Standard Library](./stdlib.md) for the built-in functions and function blocks grounded in
`packages/zplc-compiler/src/compiler/stdlib/index.ts`.
