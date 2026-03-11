---
sidebar_position: 2
---

# Instruction List (IL)

Instruction List (IL) is a low-level, assembler-like language defined by IEC 61131-3. It is closer to the hardware execution model and is often used for small, optimized code segments.

ZPLC includes a fully-featured **IL Compiler** that translates IL source code directly into ZPLC bytecode.

## Basic Concept

IL is stack-based accumulator logic. Most instructions operate on a "Current Result" (CR) register (conceptually the top of the stack).

```il
LD  Var1    (* Load Var1 into Accumulator *)
ADD 10      (* Add 10 to Accumulator *)
ST  Result  (* Store Accumulator to Result *)
```

## Supported Instructions

### Load / Store

| Instruction | Operand | Description |
|---|---|---|
| `LD` | Var / Const | Load value to Accumulator (pushes to stack). |
| `LDN` | Var | Load negated value. |
| `ST` | Var | Store Accumulator to variable. |
| `STN` | Var | Store negated Accumulator. |

### Logic & Arithmetic

| Instruction | Operand | Description |
|---|---|---|
| `AND` | Var / Const | Bitwise AND with Accumulator. |
| `OR` | Var / Const | Bitwise OR with Accumulator. |
| `XOR` | Var / Const | Bitwise XOR with Accumulator. |
| `NOT` | - | Bitwise Invert Accumulator. |
| `ADD` | Var / Const | Add to Accumulator. |
| `SUB` | Var / Const | Subtract from Accumulator. |
| `MUL` | Var / Const | Multiply with Accumulator. |
| `DIV` | Var / Const | Divide Accumulator by operand. |
| `MOD` | Var / Const | Modulo operation. |
| `GT`, `LT`, `EQ` | Var | Comparison (Result is BOOL). |

### Modifiers

Most instructions support the `(` (deferred) modifier, which acts like opening a parenthesis.

```il
LD  A
AND ( B   (* Push A, start new evaluation for B OR C *)
OR  C
)         (* Pop A, AND with (B OR C) *)
ST  D
```

### Jumps and Calls

| Instruction | Operand | Description |
|---|---|---|
| `JMP` | Label | Unconditional Jump. |
| `JMPC` | Label | Jump if Accumulator is TRUE. |
| `JMPCN` | Label | Jump if Accumulator is FALSE. |
| `CAL` | FunctionBlock | Call a Function Block. |
| `RET` | - | Return from program/function. |

## Example Program

**Structured Text:**
```st
IF StartBtn AND NOT StopBtn THEN
    Motor := TRUE;
ELSE
    Motor := FALSE;
END_IF;
```

**Equivalent Instruction List:**
```il
    LD   StartBtn
    ANDN StopBtn
    ST   Motor
```

## Using IL in ZPLC IDE

1.  Create a new file with the `.il` extension.
2.  Write your program inside `PROGRAM ... END_PROGRAM`.
3.  The compiler will automatically detect the language and generate the corresponding bytecode.

```il
PROGRAM Main
    VAR
        Counter : INT := 0;
        Limit : INT := 100;
    END_VAR

    LD  Counter
    ADD 1
    ST  Counter

    LD  Counter
    GT  Limit
    JMPC Reset

    RET

Reset:
    LD  0
    ST  Counter
END_PROGRAM
```
