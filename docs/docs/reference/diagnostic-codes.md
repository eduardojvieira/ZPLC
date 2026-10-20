---
title: "Diagnostic codes"
sidebar_label: "Diagnostic codes"
description: "The stable code of every error of a build, what it means and a program that provokes it, generated from the compiler registry."
tags: [reference, generated]
---

# Diagnostic codes

{/* >>> GENERATED (tools/docs/generate_diagnostic_codes.ts): reference/diagnostic-codes. Do not edit. >>> */}

Every error of a build carries a **code**: a name for the kind of problem, such as `UNKNOWN_IDENTIFIER`. The sentence of the message names the identifier, the types and the numbers of this one and may be reworded; the code does not change, so a script, a test or a person who searches this page can rely on it. A code is never reused for another meaning and never removed.

The code is reported wherever the error is: the `code` field of every diagnostic of the command line (`--json`), of the Tool API and of the MCP tools; the end of the line that `zplc-cli` prints, in brackets; the label of the problem in the Problems tab of ZPLC; and the marker of the editor. Each diagnostic also has the position where it starts (`line` and `column`, from 1), the position just after where it ends (`endLine` and `endColumn`), the project file (`path`) and the phase that found it (`phase`).

The warnings of a build that succeeds have codes of their own: see [Compiler workflow](../ide/compiler.md#warnings).

## When the program does not fit

The memory a program can use is limited by the target profile only: the board that the project names, or the host. A program that does not fit is a build error that says how much it needs, how much the profile has and what takes the most, and that is reported at the declaration of the variable that crosses the end, or at the program or function that is the largest:

- `WORK_MEMORY_EXCEEDED`: the variables of every program of the project, with the literals of the strings, in the work memory of the profile (one byte of it is the initialization flag).
- `RETAIN_MEMORY_EXCEEDED`: the `RETAIN` variables, in the retentive memory of the profile.
- `CODE_MEMORY_EXCEEDED`: the generated program, in the code memory of the profile. The consumers are the programs and functions that were written, and the library routines the code calls.

## The codes

### Reading the characters (lexer)

| Code | What it means |
| --- | --- |
| `UNEXPECTED_CHARACTER` | A character that is not part of the language appears outside a comment or a string. |
| `UNTERMINATED_COMMENT` | A comment is opened and never closed. |
| `UNTERMINATED_STRING_LITERAL` | A STRING or WSTRING literal is not closed before the end of the line. |
| `INVALID_NUMBER_LITERAL` | A number is written in a form the language does not define: a digit separator in the wrong place, a base that is not 2, 8 or 16, a digit that is not valid in its base, or a base prefix without digits. |
| `INVALID_TYPED_LITERAL` | A typed literal such as `INT#5` names an unknown type, has no value, has a value that does not belong to the type (a fraction in an integer, `BOOL#2`) or a value outside the range of the type. |

### Reading the structure (parser)

| Code | What it means |
| --- | --- |
| `UNEXPECTED_TOKEN` | The grammar does not allow the word or symbol that is written here; the message says what was expected. |
| `UNSUPPORTED_CONSTRUCT` | A construct of IEC 61131-3 that this release does not implement (a namespace, a pointer, a property, a textual configuration, a call form) is rejected by name instead of being compiled wrongly. |
| `INVALID_ARRAY_DECLARATION` | An array declaration is not valid: more than three dimensions, a bound that is not an integer constant, or an upper bound below the lower bound. |
| `CIRCULAR_TYPE_ALIAS` | A type alias refers to itself, directly or through other aliases. |
| `INVALID_STRING_CAPACITY` | The capacity of a STRING or WSTRING is not an integer constant of 1 or more. |
| `INVALID_TIME_LITERAL` | A TIME, DATE, TIME_OF_DAY or DATE_AND_TIME literal is malformed, is finer than TIME can hold (1 ms), or is outside the range of its type. |
| `INVALID_DIRECT_ADDRESS` | A located variable (`AT %IX0.0`) has an address that does not follow the form `%` area, size, byte and bit. |
| `INVALID_BIT_ACCESS` | A bit access such as `w.3` names a bit that the type does not have, or is not written as a decimal number. |
| `INVALID_ENUMERATION` | The value of an enumeration member is not an integer literal. |
| `INVALID_FUNCTION_RETURN_TYPE` | A function returns a type that a function cannot return: an array, a structure or a function block. |
| `INVALID_OUTPUT_BINDING` | The output binding `=>` is not used the way the language defines: it must name the variable that receives the output, and only a function block call has output bindings. |
| `NO_PROGRAM` | A source file of a program has no `PROGRAM`. |

### Names, types and memory (code generation and project)

| Code | What it means |
| --- | --- |
| `UNKNOWN_IDENTIFIER` | A name is used that no declaration in scope introduces. |
| `UNKNOWN_MEMBER` | A member is read or written that the structure or function block does not have. |
| `UNKNOWN_TYPE` | A data type, enumeration, function block type or interface is named that is not declared. |
| `UNKNOWN_FUNCTION` | A call names a function or function block instance that is not declared. |
| `UNKNOWN_METHOD` | A method is called that the function block, or the interface of the variable, does not have. |
| `UNKNOWN_PARAMETER` | A call names an argument that the function, function block or method does not have. |
| `MISSING_ARGUMENT` | A call of a function leaves out a parameter that has no default. |
| `INVALID_ARGUMENTS` | The arguments of a call do not fit its declaration: a parameter given twice, a positional argument after a named one, or the wrong number of arguments. |
| `RECURSIVE_CALL` | A function or function block calls itself, directly or through other calls; the language has no recursion. |
| `DUPLICATE_DECLARATION` | A name is declared twice in the same scope, or a function, function block, type or global is declared in two files of the project. |
| `TYPE_MISMATCH` | A value of one type is used where another is required: an assignment, an operand, a condition, an argument or an initial value. |
| `NARROWING_NOT_ALLOWED` | A value is stored in a narrower type and the project turns implicit narrowing into an error (`compiler.strictTypes`). |
| `CONSTANT_OUT_OF_RANGE` | A constant does not fit the type it is stored in or compared with, or an integer literal does not fit 32 bits. |
| `STRING_TOO_LONG` | A string literal has more characters than the capacity of the variable it initialises or is assigned to. |
| `ASSIGNMENT_TO_CONSTANT` | A constant is assigned to, bound to an output, passed as an in-out parameter or referenced for writing. |
| `INVALID_INITIALISER` | An initial value does not fit the declaration: the wrong form for the type, too many values, or an unknown member in a structure initialiser. |
| `INVALID_ARRAY_ACCESS` | An index is applied to something that is not an array, with the wrong number of indices (more than three is never accepted), or with an index that is not a 32-bit integer. |
| `INDEX_OUT_OF_BOUNDS` | A constant index lies outside the bounds of the array. |
| `INVALID_MEMBER_ACCESS` | A member is accessed on something that has no members, or a whole structure or function block is used where a value is required. |
| `INVALID_REFERENCE` | A reference is created or followed in a way that is not allowed: dereferencing something that is not a `REF_TO` variable, assigning to one a value that is not a reference, or referencing a constant. |
| `INVALID_CASE_LABEL` | A `CASE` label is not an integer constant, a range is empty, the label does not fit the selector, or the selector is not an integer or an enumeration. |
| `OVERLAPPING_CASE_LABELS` | Two labels of the same `CASE` select the same value. |
| `INVALID_FOR_COUNTER` | The counter of a `FOR` loop is not a declared integer variable. |
| `JUMP_OUTSIDE_LOOP` | `EXIT` or `CONTINUE` is written outside a `FOR`, `WHILE` or `REPEAT` loop. |
| `UNSUPPORTED_ARGUMENT_TYPE` | A standard function is given a type it does not accept in this release (a 64-bit or LREAL argument where only 32 bits are defined, or a WSTRING). |
| `INVALID_INHERITANCE` | A function block extends a block that is not declared, that is `FINAL`, or that extends it back. |
| `ABSTRACT_INSTANTIATION` | An instance of an `ABSTRACT` function block is declared. |
| `INVALID_OVERRIDE` | A method is declared `OVERRIDE` with no base method, overrides a `FINAL` method, changes the return type, or hides an inherited method without `OVERRIDE`. |
| `INTERFACE_NOT_IMPLEMENTED` | A function block names an interface it does not fully implement, or a value is assigned to an interface variable that does not implement it. |
| `ACCESS_VIOLATION` | A method that is `PRIVATE` or `PROTECTED` is called from where its access specifier does not allow. |
| `INVALID_THIS_OR_SUPER` | `THIS` or `SUPER^` is used outside a function block or method, or `SUPER^` is used in a block that extends none. |
| `INVALID_EXTERNAL_DECLARATION` | A `VAR_EXTERNAL` has no `VAR_GLOBAL` of the same name, or declares another type than the global. |
| `WORK_MEMORY_EXCEEDED` | The variables of the project need more WORK memory than the target profile has. The message states the bytes required, the bytes available and the largest consumers. |
| `RETAIN_MEMORY_EXCEEDED` | The `RETAIN` variables of the project need more retentive memory than the target profile has. The message states the bytes required, the bytes available and the largest consumers. |
| `CODE_MEMORY_EXCEEDED` | The generated program is larger than the code memory of the target profile. The message states the bytes required, the bytes available and the largest consumers. |
| `INVALID_MEMORY_PROFILE` | The target memory profile given to the compiler is not valid: a capacity that is not a positive integer or that exceeds what the virtual machine addresses. |
| `ADDRESS_OUT_OF_REGION` | A located variable lies outside the input, output or memory area it names. |
| `ADDRESS_OVERLAP` | A located `%M` variable overlaps the storage of another variable, the initialization flag or the string pool. |
| `INVALID_LOCATED_VARIABLE` | A located variable has a size or a type that its address does not allow, such as a bit address on a variable that is not BOOL. |
| `INVALID_TAG` | A communication tag on a variable names a type or a region the tag cannot use, or a Modbus address outside 0 to 65535. |
| `STACK_DEPTH_EXCEEDED` | A task needs an evaluation stack or a call nesting deeper than the target holds, or its depth cannot be determined. |
| `MULTIPLE_PROGRAMS_IN_SOURCE` | A source file declares more than one `PROGRAM`; each program has its own file. |
| `INVALID_TASK_CONFIGURATION` | The tasks of `zplc.json` are not valid: none, too many, a trigger that is not supported, an interval or a priority out of range, or a task that does not reference exactly one program. |
| `UNKNOWN_TASK_PROGRAM` | A task names a program that is not among the sources of the project. |
| `OUTPUT_OWNERSHIP_CONFLICT` | Two programs write the same physical output. |
| `INVALID_SAFE_VALUE` | The safe values that the project declares for its outputs cannot be loaded: more of them than the loader takes, an offset outside the output image, a bit past 7, a value that is not 0 or 1, or the same output twice. |
| `INTERNAL_COMPILER_ERROR` | The compiler stopped on a condition it did not expect; the message names it. It is never a mistake of the program: report it with the source. |
| `NO_BOARD_CHANNEL` | A located variable sits at an address where the board of the project has no channel; the message names the variable, the address and the board. |
| `TRANSLATION_FAILED` | A ladder, function block diagram, sequential function chart or instruction list source cannot be translated to Structured Text; the message names the element. |

### Assembling the code

| Code | What it means |
| --- | --- |
| `ASSEMBLER_ERROR` | The assembler refused the generated code, for example an operand or a relocated address that does not fit its field. It is a defect of the compiler when the source is valid. |

## Examples

Each example is a program that the compiler refuses with that code; the position and the message are the ones its build reports, and a test of the compiler builds each of them.

### UNEXPECTED_CHARACTER

A character that is not part of the language appears outside a comment or a string.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := 1 @ 2;
END_PROGRAM
```

Reported at: `src/Main.st` `6:10`. Message: `Compilation of 'Main' failed: Unexpected character: '@'`

### UNTERMINATED_COMMENT

A comment is opened and never closed.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  (* never closed
  X := 1;
END_PROGRAM
```

Reported at: `src/Main.st` `6:3`. Message: `Compilation of 'Main' failed: Unterminated comment: the comment opened by (* is never closed with *)`

### UNTERMINATED_STRING_LITERAL

A STRING or WSTRING literal is not closed before the end of the line.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  S : STRING;
END_VAR
  S := 'open;
END_PROGRAM
```

Reported at: `src/Main.st` `7:8`. Message: `Compilation of 'Main' failed: Unterminated string literal (newline in string)`

### INVALID_NUMBER_LITERAL

A number is written in a form the language does not define: a digit separator in the wrong place, a base that is not 2, 8 or 16, a digit that is not valid in its base, or a base prefix without digits.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := 3#12;
END_PROGRAM
```

Reported at: `src/Main.st` `6:8`. Message: `Compilation of 'Main' failed: The number base 3# is not supported: use 2#, 8# or 16#`

### INVALID_TYPED_LITERAL

A typed literal such as `INT#5` names an unknown type, has no value, has a value that does not belong to the type (a fraction in an integer, `BOOL#2`) or a value outside the range of the type.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := INT#1.5;
END_PROGRAM
```

Reported at: `src/Main.st` `6:8`. Message: `Compilation of 'Main' failed: INT#1.5: an integer literal has no fraction or exponent`

### UNEXPECTED_TOKEN

The grammar does not allow the word or symbol that is written here; the message says what was expected.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := ;
END_PROGRAM
```

Reported at: `src/Main.st` `6:8`. Message: `Compilation of 'Main' failed: Expected expression, got SEMICOLON`

### UNSUPPORTED_CONSTRUCT

A construct of IEC 61131-3 that this release does not implement (a namespace, a pointer, a property, a textual configuration, a call form) is rejected by name instead of being compiled wrongly.

```text
NAMESPACE Plant
END_NAMESPACE
PROGRAM Main
END_PROGRAM
```

Reported at: `src/Main.st` `1:1`. Message: `Compilation of 'Main' failed: NAMESPACE ... END_NAMESPACE is not supported`

### INVALID_ARRAY_DECLARATION

An array declaration is not valid: more than three dimensions, a bound that is not an integer constant, or an upper bound below the lower bound.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  A : ARRAY[5..1] OF INT;
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `src/Main.st` `5:17`. Message: `Compilation of 'Main' failed: Invalid array bounds: 5..1 (upper must be >= lower)`

### CIRCULAR_TYPE_ALIAS

A type alias refers to itself, directly or through other aliases.

```text
TYPE A : B; B : A; END_TYPE
PROGRAM Main
END_PROGRAM
```

Reported at: `src/Main.st` `1:1`. Message: `Compilation of 'Main' failed: The type alias 'A' refers to itself`

### INVALID_STRING_CAPACITY

The capacity of a STRING or WSTRING is not an integer constant of 1 or more.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  S : STRING[0];
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `src/Main.st` `5:14`. Message: `Compilation of 'Main' failed: The capacity of STRING must be an integer constant of 1 or more`

### INVALID_TIME_LITERAL

A TIME, DATE, TIME_OF_DAY or DATE_AND_TIME literal is malformed, is finer than TIME can hold (1 ms), or is outside the range of its type.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  T : TIME;
END_VAR
  T := T#5x;
END_PROGRAM
```

Reported at: `src/Main.st` `7:8`. Message: `Compilation of 'Main' failed: Invalid time literal: 5x`

### INVALID_DIRECT_ADDRESS

A located variable (`AT %IX0.0`) has an address that does not follow the form `%` area, size, byte and bit.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Q AT %IW : INT;
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `src/Main.st` `5:8`. Message: `Compilation of 'Main' failed: Invalid I/O address: %IW`

### INVALID_BIT_ACCESS

A bit access such as `w.3` names a bit that the type does not have, or is not written as a decimal number.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  B := X.20;
END_PROGRAM
```

Reported at: `src/Main.st` `6:8`. Message: `Bit 20 is out of range for INT: it has bits 0 to 15`

### INVALID_ENUMERATION

The value of an enumeration member is not an integer literal.

```text
TYPE Color : (Red := X, Green); END_TYPE
PROGRAM Main
END_PROGRAM
```

Reported at: `src/Main.st` `1:23`. Message: `Compilation of 'Main' failed: Enum value must be an integer literal`

### INVALID_FUNCTION_RETURN_TYPE

A function returns a type that a function cannot return: an array, a structure or a function block.

```text
FUNCTION F : ARRAY[0..3] OF INT
END_FUNCTION
PROGRAM Main
END_PROGRAM
```

Reported at: `src/Main.st` `2:1`. Message: `Compilation of 'Main' failed: Function return type must be an elementary type, not ARRAY`

### INVALID_OUTPUT_BINDING

The output binding `=>` is not used the way the language defines: it must name the variable that receives the output, and only a function block call has output bindings.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Tmr : TON;
END_VAR
  X := 1;
  Tmr(IN := B, PT := T#1s, Q => 5);
END_PROGRAM
```

Reported at: `src/Main.st` `8:33`. Message: `Compilation of 'Main' failed: An output binding names the variable that receives 'Q'`

### UNKNOWN_IDENTIFIER

A name is used that no declaration in scope introduces.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := Missing;
END_PROGRAM
```

Reported at: `src/Main.st` `6:8`. Message: `Unknown identifier 'Missing'`

### UNKNOWN_MEMBER

A member is read or written that the structure or function block does not have.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Tmr : TON;
END_VAR
  Tmr(IN := B, PT := T#1s);
  B := Tmr.Nope;
END_PROGRAM
```

Reported at: `src/Main.st` `8:8`. Message: `Unknown member 'Nope' on FB 'TON'`

### UNKNOWN_TYPE

A data type, enumeration, function block type or interface is named that is not declared.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Y : Widget;
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `src/Main.st` `5:7`. Message: `Unknown type 'Widget' in the declaration of 'Y'`

### UNKNOWN_FUNCTION

A call names a function or function block instance that is not declared.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := NoSuchFunction(1);
END_PROGRAM
```

Reported at: `src/Main.st` `6:8`. Message: `Unknown function 'NoSuchFunction'`

### UNKNOWN_METHOD

A method is called that the function block, or the interface of the variable, does not have.

```text
FUNCTION_BLOCK Fb
END_FUNCTION_BLOCK
PROGRAM Main
VAR
  I : Fb;
END_VAR
  I.Missing();
END_PROGRAM
```

Reported at: `src/Main.st` `7:3`. Message: `Unknown method 'Missing' on FB 'Fb'`

### UNKNOWN_PARAMETER

A call names an argument that the function, function block or method does not have.

```text
FUNCTION Twice : INT
VAR_INPUT
  V : INT;
END_VAR
  Twice := V * 2;
END_FUNCTION
PROGRAM Main
VAR
  X : INT;
END_VAR
  X := Twice(W := 1);
END_PROGRAM
```

Reported at: `src/Main.st` `11:14`. Message: `Function 'Twice' has no input parameter 'W'`

### MISSING_ARGUMENT

A call of a function leaves out a parameter that has no default.

```text
FUNCTION Twice : INT
VAR_INPUT
  V : INT;
END_VAR
  Twice := V * 2;
END_FUNCTION
PROGRAM Main
VAR
  X : INT;
END_VAR
  X := Twice();
END_PROGRAM
```

Reported at: `src/Main.st` `11:8`. Message: `Function 'Twice' is called without its parameter 'V'`

### INVALID_ARGUMENTS

The arguments of a call do not fit its declaration: a parameter given twice, a positional argument after a named one, or the wrong number of arguments.

```text
FUNCTION Twice : INT
VAR_INPUT
  V : INT;
END_VAR
  Twice := V * 2;
END_FUNCTION
PROGRAM Main
VAR
  X : INT;
END_VAR
  X := Twice(V := 1, V := 2);
END_PROGRAM
```

Reported at: `src/Main.st` `11:22`. Message: `Parameter 'V' of function 'Twice' is given twice`

### RECURSIVE_CALL

A function or function block calls itself, directly or through other calls; the language has no recursion.

```text
FUNCTION F : INT
VAR_INPUT
  V : INT;
END_VAR
  F := F(V := V);
END_FUNCTION
PROGRAM Main
VAR
  X : INT;
END_VAR
  X := F(V := 1);
END_PROGRAM
```

Reported at: `src/Main.st` `5:8`. Message: `Function 'F' calls itself: a function cannot be recursive`

### DUPLICATE_DECLARATION

A name is declared twice in the same scope, or a function, function block, type or global is declared in two files of the project.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  X : INT;
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `src/Main.st` `5:3`. Message: `Symbol 'X' already defined`

### TYPE_MISMATCH

A value of one type is used where another is required: an assignment, an operand, a condition, an argument or an initial value.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  B := X;
END_PROGRAM
```

Reported at: `src/Main.st` `6:8`. Message: `Type mismatch: a value of type INT cannot be used where BOOL is expected. IEC 61131-3 converts implicitly only to a wider type of the same kind; convert it explicitly, for example with INT_TO_BOOL`

### NARROWING_NOT_ALLOWED

A value is stored in a narrower type and the project turns implicit narrowing into an error (`compiler.strictTypes`).

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Y : SINT;
END_VAR
  Y := X;
END_PROGRAM
```

Reported at: `src/Main.st` `7:8`. Message: `Implicit narrowing from INT to SINT: a value that does not fit keeps only its low 8 bits; use an explicit conversion if that is intended. This is an error because compiler.strictTypes is on`

### CONSTANT_OUT_OF_RANGE

A constant does not fit the type it is stored in or compared with, or an integer literal does not fit 32 bits.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Y : SINT;
END_VAR
  Y := 300;
END_PROGRAM
```

Reported at: `src/Main.st` `7:8`. Message: `The constant 300 does not fit SINT (-128 to 127)`

### STRING_TOO_LONG

A string literal has more characters than the capacity of the variable it initialises or is assigned to.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  S : STRING[4];
END_VAR
  S := 'much too long';
END_PROGRAM
```

Reported at: `src/Main.st` `7:8`. Message: `String literal of 13 characters does not fit 'S' (STRING[4] holds 4)`

### ASSIGNMENT_TO_CONSTANT

A constant is assigned to, bound to an output, passed as an in-out parameter or referenced for writing.

```text
PROGRAM Main
VAR CONSTANT
  K : INT := 1;
END_VAR
  K := 2;
END_PROGRAM
```

Reported at: `src/Main.st` `5:3`. Message: `Cannot assign to constant 'K'`

### INVALID_INITIALISER

An initial value does not fit the declaration: the wrong form for the type, too many values, or an unknown member in a structure initialiser.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  A : ARRAY[0..1] OF INT := [1, 2, 3];
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `src/Main.st` `5:29`. Message: `Too many initial values for 'A': 3 given, it has 2 elements`

### INVALID_ARRAY_ACCESS

An index is applied to something that is not an array, with the wrong number of indices (more than three is never accepted), or with an index that is not a 32-bit integer.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := X[1];
END_PROGRAM
```

Reported at: `src/Main.st` `6:8`. Message: `'X' is not an array`

### INDEX_OUT_OF_BOUNDS

A constant index lies outside the bounds of the array.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  A : ARRAY[0..3] OF INT;
END_VAR
  X := A[9];
END_PROGRAM
```

Reported at: `src/Main.st` `7:10`. Message: `Array index 9 is outside the bounds 0..3 of 'A'`

### INVALID_MEMBER_ACCESS

A member is accessed on something that has no members, or a whole structure or function block is used where a value is required.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := X.field;
END_PROGRAM
```

Reported at: `src/Main.st` `6:8`. Message: `Cannot access member 'field' of 'X': type 'INT' has no members`

### INVALID_REFERENCE

A reference is created or followed in a way that is not allowed: dereferencing something that is not a `REF_TO` variable, assigning to one a value that is not a reference, or referencing a constant.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  P : INT;
END_VAR
  X := P^;
END_PROGRAM
```

Reported at: `src/Main.st` `7:8`. Message: `'P' is not a reference: only a REF_TO variable can be dereferenced`

### INVALID_CASE_LABEL

A `CASE` label is not an integer constant, a range is empty, the label does not fit the selector, or the selector is not an integer or an enumeration.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  CASE X OF
    X: B := TRUE;
  END_CASE;
END_PROGRAM
```

Reported at: `src/Main.st` `7:5`. Message: `'X' is not an integer constant`

### OVERLAPPING_CASE_LABELS

Two labels of the same `CASE` select the same value.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  CASE X OF
    1..5: B := TRUE;
    3: B := FALSE;
  END_CASE;
END_PROGRAM
```

Reported at: `src/Main.st` `8:5`. Message: `CASE label 3 overlaps an earlier label`

### INVALID_FOR_COUNTER

The counter of a `FOR` loop is not a declared integer variable.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  R : LREAL;
END_VAR
  FOR R := 1 TO 3 DO
    X := X + 1;
  END_FOR;
END_PROGRAM
```

Reported at: `src/Main.st` `7:3`. Message: `A FOR counter must be an integer variable, not LREAL`

### JUMP_OUTSIDE_LOOP

`EXIT` or `CONTINUE` is written outside a `FOR`, `WHILE` or `REPEAT` loop.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  EXIT;
END_PROGRAM
```

Reported at: `src/Main.st` `6:3`. Message: `EXIT outside of loop`

### UNSUPPORTED_ARGUMENT_TYPE

A standard function is given a type it does not accept in this release (a 64-bit or LREAL argument where only 32 bits are defined, or a WSTRING).

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  WS : WSTRING;
  S : STRING;
END_VAR
  S := LEFT(WS, 2);
END_PROGRAM
```

Reported at: `src/Main.st` `8:13`. Message: `LEFT does not take a WSTRING yet: only LEN, assignment and initial values do`

### INVALID_INHERITANCE

A function block extends a block that is not declared, that is `FINAL`, or that extends it back.

```text
FUNCTION_BLOCK Child EXTENDS Missing
END_FUNCTION_BLOCK
PROGRAM Main
END_PROGRAM
```

Reported at: `src/Main.st` `1:1`. Message: `Circular inheritance or missing base FB in definitions: Child (extends Missing)`

### ABSTRACT_INSTANTIATION

An instance of an `ABSTRACT` function block is declared.

```text
FUNCTION_BLOCK ABSTRACT Base
END_FUNCTION_BLOCK
PROGRAM Main
VAR
  B : Base;
END_VAR
END_PROGRAM
```

Reported at: `src/Main.st` `5:3`. Message: `'B' is an instance of the ABSTRACT function block 'Base'`

### INVALID_OVERRIDE

A method is declared `OVERRIDE` with no base method, overrides a `FINAL` method, changes the return type, or hides an inherited method without `OVERRIDE`.

```text
FUNCTION_BLOCK Base
END_FUNCTION_BLOCK
FUNCTION_BLOCK Child EXTENDS Base
  METHOD OVERRIDE Run : BOOL
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM Main
END_PROGRAM
```

Reported at: `src/Main.st` `4:3`. Message: `Method 'Run' marked as OVERRIDE but no base method found in 'Child'`

### INTERFACE_NOT_IMPLEMENTED

A function block names an interface it does not fully implement, or a value is assigned to an interface variable that does not implement it.

```text
INTERFACE IRun
  METHOD Run : BOOL
  END_METHOD
END_INTERFACE
FUNCTION_BLOCK Fb IMPLEMENTS IRun
END_FUNCTION_BLOCK
PROGRAM Main
END_PROGRAM
```

Reported at: `src/Main.st` `5:1`. Message: `Function Block 'Fb' implements interface 'IRun' but is missing required method 'Run'`

### ACCESS_VIOLATION

A method that is `PRIVATE` or `PROTECTED` is called from where its access specifier does not allow.

```text
FUNCTION_BLOCK Fb
  METHOD PRIVATE Hidden : BOOL
    Hidden := TRUE;
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM Main
VAR
  I : Fb;
  B : BOOL;
END_VAR
  B := I.Hidden();
END_PROGRAM
```

Reported at: `src/Main.st` `11:8`. Message: `The method 'Hidden' of 'Fb' is PRIVATE: it can be called only inside 'Fb'`

### INVALID_THIS_OR_SUPER

`THIS` or `SUPER^` is used outside a function block or method, or `SUPER^` is used in a block that extends none.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  SUPER^();
END_PROGRAM
```

Reported at: `src/Main.st` `6:3`. Message: `SUPER^ is used outside of a function block`

### INVALID_EXTERNAL_DECLARATION

A `VAR_EXTERNAL` has no `VAR_GLOBAL` of the same name, or declares another type than the global.

```text
PROGRAM Main
VAR_EXTERNAL
  Nowhere : INT;
END_VAR
END_PROGRAM
```

Reported at: `src/Main.st` `3:3`. Message: `VAR_EXTERNAL 'Nowhere' has no VAR_GLOBAL declaration`

### WORK_MEMORY_EXCEEDED

The variables of the project need more WORK memory than the target profile has. The message states the bytes required, the bytes available and the largest consumers.

```text
PROGRAM Main
VAR
  Table : ARRAY[0..8999] OF BYTE;
  Gain : REAL;
END_VAR
  Gain := 1.5;
END_PROGRAM
```

Reported at: `src/Main.st` `3:1`. Message: `WORK allocation exceeds the target memory profile: 9005 bytes required, 8192 bytes available (the WORK memory of the target profile, one byte of it the initialization flag). Largest consumers: Main.Table (9000 bytes), Main.Gain (4 bytes)`

### RETAIN_MEMORY_EXCEEDED

The `RETAIN` variables of the project need more retentive memory than the target profile has. The message states the bytes required, the bytes available and the largest consumers.

```text
PROGRAM Main
VAR RETAIN
  Log : ARRAY[0..5000] OF BYTE;
  Count : DINT;
END_VAR
  Count := Count + 1;
END_PROGRAM
```

Reported at: `src/Main.st` `3:1`. Message: `RETAIN allocation exceeds the target memory profile: 5012 bytes required, 4096 bytes available (the retentive memory of the target profile). Largest consumers: Main.Log (5001 bytes), Main.Count (4 bytes)`

### CODE_MEMORY_EXCEEDED

The generated program is larger than the code memory of the target profile. The message states the bytes required, the bytes available and the largest consumers.

```text
FUNCTION Twice : INT
VAR_INPUT
  V : INT;
END_VAR
  Twice := V * 2;
END_FUNCTION
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := Twice(V := X);
  X := X + 1;
  X := X * 2;
  X := X - 3;
END_PROGRAM
```

Reported at: `src/Main.st` `7:1`. Message: `CODE exceeds the target memory profile: 81 bytes required, 40 bytes available (the code memory of the target profile). Largest consumers: Program Main (53 bytes), Function Twice (25 bytes)`

### INVALID_MEMORY_PROFILE

The target memory profile given to the compiler is not valid: a capacity that is not a positive integer or that exceeds what the virtual machine addresses.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `zplc.json` `1:1`. Message: `Invalid target memory profile`

### ADDRESS_OUT_OF_REGION

A located variable lies outside the input, output or memory area it names.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Big AT %MB9000000 : BYTE;
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `src/Main.st` `5:1`. Message: `WORK allocation exceeds its memory region`

### ADDRESS_OVERLAP

A located `%M` variable overlaps the storage of another variable, the initialization flag or the string pool.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  A AT %MW0 : INT;
  B2 AT %MB1 : BYTE;
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `src/Main.st` `5:1`. Message: `automatic WORK symbol collides with located %M symbol`

### INVALID_LOCATED_VARIABLE

A located variable has a size or a type that its address does not allow, such as a bit address on a variable that is not BOOL.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Q AT %QX0.1 : INT;
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `src/Main.st` `5:1`. Message: `Bit-addressed locations require BOOL values`

### INVALID_TAG

A communication tag on a variable names a type or a region the tag cannot use, or a Modbus address outside 0 to 65535.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  T : DINT {publish};
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `src/Main.st` `5:1`. Message: `PUBLISH tag on 'T' does not support DINT`

### STACK_DEPTH_EXCEEDED

A task needs an evaluation stack or a call nesting deeper than the target holds, or its depth cannot be determined.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := 13 + (12 + (11 + (10 + (9 + (8 + (7 + (6 + (5 + (4 + (3 + (2 + (1))))))))))));
END_PROGRAM
```

Reported at: `src/Main.st` `1:1`. Message: `Task 'Main' needs an evaluation stack of 13 values and the target holds 8: split the largest expression, or move part of the program into a function`

### NO_PROGRAM

A source file of a program has no `PROGRAM`.

```text
FUNCTION F : INT
END_FUNCTION
```

Reported at: `src/Main.st` `1:1`. Message: `No program found in source`

### MULTIPLE_PROGRAMS_IN_SOURCE

A source file declares more than one `PROGRAM`; each program has its own file.

```text
PROGRAM A
END_PROGRAM
PROGRAM Main
END_PROGRAM
```

Reported at: `src/Main.st` `3:1`. Message: `Exactly one PROGRAM is required per source unit`

### INVALID_TASK_CONFIGURATION

The tasks of `zplc.json` are not valid: none, too many, a trigger that is not supported, an interval or a priority out of range, or a task that does not reference exactly one program.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `zplc.json` `1:1`. Message: `Task 'Main' has invalid interval`

### UNKNOWN_TASK_PROGRAM

A task names a program that is not among the sources of the project.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `zplc.json` `1:1`. Message: `Program 'Nope' referenced by task but not found in sources`

### OUTPUT_OWNERSHIP_CONFLICT

Two programs write the same physical output.

```text
(* src/Main.st *)
PROGRAM Main
VAR
  Out AT %QX0.0 : BOOL;
END_VAR
  Out := TRUE;
END_PROGRAM
```

```text
(* src/Other.st *)
PROGRAM Other
VAR
  Out AT %QX0.0 : BOOL;
END_VAR
  Out := FALSE;
END_PROGRAM
```

Reported at: `src/Other.st` `3:1`. Message: `Physical output 'Other.Out' (src/Other.st) overlaps 'Main.Out' (src/Main.st)`

### INVALID_SAFE_VALUE

The safe values that the project declares for its outputs cannot be loaded: more of them than the loader takes, an offset outside the output image, a bit past 7, a value that is not 0 or 1, or the same output twice.

```text
PROGRAM Main
VAR
  X : INT;
END_VAR
  X := 1;
END_PROGRAM
```

Reported at: `zplc.json` `1:1`. Message: `Safe value 1 declares output byte 0 bit 3 twice`

### ASSEMBLER_ERROR

The assembler refused the generated code, for example an operand or a relocated address that does not fit its field. It is a defect of the compiler when the source is valid.

No program provokes this code: it is for a defect of the compiler, or for an error of a part that is not the compiler (the translators of the visual languages, the admission of the located variables against a board).

### INTERNAL_COMPILER_ERROR

The compiler stopped on a condition it did not expect; the message names it. It is never a mistake of the program: report it with the source.

No program provokes this code: it is for a defect of the compiler, or for an error of a part that is not the compiler (the translators of the visual languages, the admission of the located variables against a board).

### NO_BOARD_CHANNEL

A located variable sits at an address where the board of the project has no channel; the message names the variable, the address and the board.

No program provokes this code: it is for a defect of the compiler, or for an error of a part that is not the compiler (the translators of the visual languages, the admission of the located variables against a board).

### TRANSLATION_FAILED

A ladder, function block diagram, sequential function chart or instruction list source cannot be translated to Structured Text; the message names the element.

No program provokes this code: it is for a defect of the compiler, or for an error of a part that is not the compiler (the translators of the visual languages, the admission of the located variables against a board).

{/* <<< END GENERATED: reference/diagnostic-codes <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
