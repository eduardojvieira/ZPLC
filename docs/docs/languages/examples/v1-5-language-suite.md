---
title: Language Examples Suite
sidebar_label: Canonical Examples
description: Cross-language canonical examples showcasing ZPLC's IEC 61131-3 support.
---

# Language Examples Suite

This suite provides canonical logic examples demonstrating parity across the five supported IEC 61131-3 languages in ZPLC: `ST`, `IL`, `LD`, `FBD`, and `SFC`.

## Shared Logic Goal

Every sample listed below accomplishes the exact same logic control goal:
1. Initialize a start condition.
2. Trigger an On-Delay Timer (`TON`) for 250 milliseconds.
3. Bind the output of the timer to an external output tag (`Out1`).

No matter which language you author this logic in, the ZPLC compiler guarantees the same `.zplc` binary behavior, and full support for simulation and hardware debugging.

---

## 1. Structured Text (ST)

A clean, PASCAL-like procedural approach calling the timer intrinsically.

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

---

## 2. Instruction List (IL)

An assembly-like approach manually loading variables into the accumulator, calling the timer function block, and storing the result back out to the memory address `%Q0.0`.

```iecst
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

---

## 3. Ladder Diagram (LD)

If you author this visually in the IDE, you construct a single relay rung. 
The visual paradigm expresses the continuous flow: 
`Contact (Start)` -> `Block (TON 250ms)` -> `Coil (Out1)`.

The ZPLC transpiler reads this visual arrangement and enforces the identical semantic flow during bytecode compilation.

---

## 4. Function Block Diagram (FBD)

The FBD visual representation connects an input data source directly into a processing block, and out to a hardware pin.
You place a `TON` block in the workspace, map the `Start` boolean to its `IN` pin, map a constant `T#250ms` string to its `PT` pin, and wire the `Q` output pin straightforwardly into `Out1`.

---

## 5. Sequential Function Chart (SFC)

The SFC representation wraps the timer into a discrete machine state.
1. The machine launches to the `Initial Step`.
2. The initial step contains an `Action` body.
3. The Action executes the logic setting `Out1` high once the 250ms condition is fulfilled.
