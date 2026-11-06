---
sidebar_position: 2
---

# Instruction List (IL)

Instruction List is a low-level textual language: one operation per line, working on an implicit accumulator. Use it when you maintain existing IL logic or want to read a program as a flat sequence of operations. For new logic, Structured Text is the better starting point. What works, operator by operator, and the executed cases behind each one, is the generated [Instruction List reference](../reference/language-il.md).

## How IL reaches the compiler

ZPLC parses the IL source and translates it to Structured Text, then compiles that text to `.zplc` bytecode. The data types, functions and function blocks are therefore those of [Structured Text](./st.md).

```mermaid
flowchart LR
  IL[IL source] --> Parse[parseIL]
  Parse --> ToST[transpileILToST]
  ToST --> Compile[ZPLC compiler]
  Compile --> ZPLC[.zplc]
```

The translation goes one way. It does not give an IL and ST round trip or the same feature coverage as Structured Text, so check the diagnostics and the target capability profile for your own program.

## Write a program

A program declares its variables and then lists instructions. The accumulator, called the current result, is typed: a `REAL` stays a `REAL` and a `BOOL` stays a `BOOL`.

- **Load and store.** `LD` and `LDN` load a value, or its negation, into the accumulator. `ST` and `STN` store it, or its negation, in a variable. `S` and `R` set and reset a `BOOL` variable.
- **Operators.** Arithmetic, logic, comparison and shift operators work on the accumulator in place. `NOT` and `NEG` change it. A parenthesised operation such as `AND( ... )` evaluates its inner instructions first.
- **Jumps and labels.** `JMP`, `JMPC` and `JMPCN` jump to a label, always or when the accumulator is true or false.
- **Calls and returns.** `CAL`, `CALC` and `CALCN` call a function block with named parameters, always or on a condition. `RET`, `RETC` and `RETCN` return from the program.

This program evaluates `Start`, calls a `TON` timer and writes the output at `%Q0.0`:

```iecst runnable language=il expect="%QX0.0=TRUE" scans=30 scan_ms=10
PROGRAM WorkflowIL
VAR
    Start : BOOL := TRUE;
    Timer : TON;
END_VAR
VAR_OUTPUT
    Out1 AT %Q0.0 : BOOL;
END_VAR

    LD Start
    ST Timer.IN
    CAL Timer(
        PT := T#250ms
    )
    LD Timer.Q
    ST Out1
END_PROGRAM
```

After 250 ms of scans the output at `%Q0.0` is `TRUE`. CI runs the sample for 30 scans of 10 ms and checks `%QX0.0`.

## Diagnostics and breakpoints

A diagnostic of an IL file names the IL line it is about (`element: "line:12"`), also when the compiler finds the problem in the generated Structured Text, and each line that does not translate is its own diagnostic. An unknown mnemonic is refused with a message that names its line.

The debug map of an IL file states IL lines, so you set a breakpoint on the IL line in the gutter of the editor and the paused program is shown on that line. Lines of the generated code that no IL line stands behind are not places to stop.

## Limits

IL shares the compiler destination of every language, but the cost of execution, the availability of library blocks, and stepping, watches, breakpoints and behavior on a board depend on the runtime and its capability profile. The native simulation is host evidence only; a claim about a physical device needs a target or hardware-in-the-loop run.

## Related pages

- [Languages overview](./index.md)
- [Structured Text](./st.md)
- [Standard library](../runtime/stdlib.md)
