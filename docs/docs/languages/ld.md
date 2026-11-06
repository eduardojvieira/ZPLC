---
description: Build rungs in the ZPLC Ladder editor, use the function boxes with EN and ENO, and avoid the common mistakes.
tags: [languages, ladder, ld]
---

# Write a Ladder Diagram

This guide shows how to build a Ladder Diagram program in the ZPLC editor: how a rung is put together, which elements the palette offers, how the function boxes with EN and ENO behave, and which mistakes the build refuses. The full list of elements, with the proof behind each one, is the generated [Ladder Diagram reference](../reference/language-ld.md).

A Ladder file is a model of rungs, not text. The build checks it and translates it to Structured Text, which is read-only output; the compiler then handles it like any other program ([Compiler workflow](../ide/compiler.md)).

## Build a rung

1. Open a Ladder file of the project, or create one with **New file**. A new project can also start with a Ladder program.
2. Declare the variables the rung uses in the variable table of the file, with their type and, for a physical input or output, their address (`%IX0.0`, `%QX0.0`; see the [address table](../reference/language-ld.md#io-addressing)).
3. Choose **Add rung**. The cursor is a blue frame on a cell of the rung.
4. Put a contact on the left and a coil on the right. Press an item of the toolbox to insert it at the cursor, drag it onto the grid, or use the keys: `C` inserts a contact, `N` an inverted contact and `O` a coil; `Insert` or `I` opens the palette as a search list.
5. Press `F2` on an element to bind a variable from the declared symbols. A contact or coil dropped from the toolbox shows `???` until it is bound.
6. Use **Add parallel branch** to give the rung a second path, and **Move rung up**, **Move rung down** and **Delete rung** to arrange the rungs.
7. Build the project (`Ctrl+B`) and read the Problems tab. A problem names the rung and cell it is about, and activating it selects that element.

Every action also works from the keyboard; the [keyboard reference](../reference/visual-editor-keyboard.md) lists the keys.

## The elements of the palette

| Group | Elements |
| --- | --- |
| Contacts | normally open, normally closed, rising edge, falling edge |
| Coils | normal, negated, set, reset, rising edge, falling edge |
| Structure | the parallel branch |
| Function blocks | the timers, counters, triggers and bistables of the library, and the function blocks that the Structured Text files of the project declare |
| Functions | the fifteen IEC functions that run as boxes with EN and ENO, described below |

The communication blocks `COMM_CONNECT`, `COMM_PUBLISH`, `COMM_SUBSCRIBE` and `COMM_MODBUS` are not offered: a Ladder file cannot declare an instance of them. A function of the project is not placed in a rung; call it from a Function Block Diagram or from Structured Text. Jumps and labels are not supported, and the build refuses them with a message.

## How power flows

Read a rung from the left rail to the right. Contacts in series are an AND, contacts on parallel branches are an OR, and a coil takes the power that reaches its own position. Whatever you place after a function block follows that block's output.

The rung below has one contact, a comparison box, an addition box and a coil. The build translates it to the Structured Text under it, which this page completes with declarations so that CI can run it with `Start` on and `Level` at 110:

```st runnable expect="Lamp=TRUE Sum=113" scans=1 scan_ms=10
PROGRAM Rungs
VAR
    Start : BOOL := TRUE;
    Level : INT := 110;
    Lamp : BOOL;
    Sum : INT;
    _rung1_result : BOOL;
    _rung1_result_2 : BOOL;
END_VAR
_rung1_result := Level > 100;
_rung1_result_2 := Start AND _rung1_result;
IF _rung1_result_2 THEN Sum := Level + 3; END_IF;
Lamp := _rung1_result_2;
END_PROGRAM
```

## Function boxes with EN and ENO

A function box sits in the rung like a contact. Its left wire is EN, the power that reaches it, and its right wire is ENO, the power that leaves it. Pick the box from the **Functions** group of the palette; the number of operands follows the function you choose, and the Function field of the element changes it afterwards.

- **Comparison** (`GT`, `GE`, `EQ`, `NE`, `LE`, `LT`) is a condition in series. Power passes through it when the power that reaches it is on and the comparison holds. It has no output.
- **Math** (`ADD`, `SUB`, `MUL`, `DIV`, `MOD`), **move** (`MOVE`) and **select** (`LIMIT`, `MIN`, `MAX`) run while EN is on. They write the result to their output variable and pass the power on. While EN is off they do not run, their output keeps its value and ENO is off.
- Each operand is a declared variable or a literal you type. The output is a declared variable that is not an input.
- The box detects no error, so ENO never reports one. An integer result that does not fit its type wraps around.
- `DIV` and `MOD` by zero fault the VM: the scan ends in a fault, the output is not written and the `%Q` output image is cleared, so a mapped output reads 0. The same holds for `REAL` with `0.0` or `-0.0`. Guard the divisor with a comparison box in series.

The operand pins are `IN1` and `IN2` for the comparisons, math, `MIN` and `MAX`, `IN` for `MOVE`, and `MN`, `IN` and `MX` for `LIMIT`.

## Who may write a variable

| Writers of one variable | Result |
| --- | --- |
| Several function boxes | Allowed. Each writes while its EN is on, and the last in scan order wins. |
| One coil | Allowed. |
| A set coil in one rung and a reset coil in another | Allowed. |
| Two normal coils | Refused: `Multiple writers target ...`. |
| A coil and a function box | Refused, and the message names both positions. |

## Common mistakes

| Mistake | What happens | What to do |
| --- | --- | --- |
| Two coils drive the same output | The build refuses it with `Multiple writers target ...`. | Combine the conditions in one rung, or use a set coil and a reset coil in two rungs. |
| A box and a coil write one variable | The build refuses it and names both elements. | Give the box its own output variable and read it with a contact. |
| `DIV` or `MOD` with a divisor that can be zero | The VM faults and the outputs clear. | Put `NE` with the divisor and 0 in series before the box. |
| A box with an empty operand or output | The build reports the box by rung and cell. | Press `F2` on the box and bind every slot. |
| A contact or coil still shows `???` | It is not bound to a variable. | Press `F2` and choose a declared symbol. |
| A jump or a label | The build refuses it with a message. | Use a branch, or move the logic to a Structured Text program. |

## Watch it run

While a program runs in the simulation, an element is lit when power reaches it, and a box shows the value of each variable operand, of its output, and of EN and ENO. A value that was not read is shown as unavailable, never as FALSE. See [Text and visual editors](../ide/editors.md#online-values-from-the-debug-map) for what each editor shows, and [The ZPLC workbench](../ide/features.md#pause-resume-step-and-stop) for pausing and stepping.

Evidence level: host. `packages/zplc-ide/src/transpiler/ldFunctions.test.ts` checks the statements of every box, the writer rules and the refusals, and the conformance cases of the reference run the boxes on the native runtime. No board was used.
