---
description: Build a Function Block Diagram in the ZPLC editor, wire typed pins, and avoid the common mistakes.
tags: [languages, fbd]
---

# Write a Function Block Diagram

This guide shows how to build a Function Block Diagram (FBD) in the ZPLC editor: which blocks the palette offers, how to wire them, how the types of the pins are checked, and which diagrams the build refuses. The full list of elements, with the proof behind each one, is the generated [Function Block Diagram reference](../reference/language-fbd.md).

An FBD file is a model of blocks and wires, not text. The build checks it and translates it to Structured Text, which is read-only output; the compiler then handles it like any other program ([Compiler workflow](../ide/compiler.md)).

## Build a diagram

1. Open an FBD file of the project, or create one with **New File**. A new project can also start with a Function Block Diagram program.
2. Press a block in the palette to insert it beside the selected block, or drag it onto the canvas. Search the palette by typing in its search box.
3. Add a **variable** block for each input and output the diagram reads or writes, and bind it to a declared variable. Add a **constant** block for a fixed value (`T#2s` is a `TIME`, `0.5` a `REAL`).
4. Connect an output pin to an input pin. Drag from either end, or press `C` on a block, choose the wire from the list and press Enter. `Shift+C` lists the wires of the block and removes the one you choose.
5. Name the instance of every function block you place. The editor proposes a name that nothing else has and declares the instance as a local variable of its type; `F2` or a double click on a block asks what it holds.
6. Build the project (`Ctrl+B`) and read the Problems tab. A problem names the block or the wire it is about, and activating it selects that element.

Every action also works from the keyboard; the [keyboard reference](../reference/visual-editor-keyboard.md) lists the keys.

## The blocks of the palette

| Group                                                                                                           | Blocks                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library groups such as Logic Gates, Comparison, Math, Selection, Timers, Counters, Edge Detection and Bistables | The gates, the comparisons, `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `ABS`, `MAX`, `MIN`, `LIMIT`, `SEL`, and the function blocks of the library. A group appears only when it holds a block that a diagram can place. |
| Project                                                                                                         | The function blocks and the functions that the Structured Text files of the project declare, with the ports of their declaration.                                                                                |
| I/O                                                                                                             | The blocks that carry a value: `constant`, `variable`, `input`, `output`.                                                                                                                                        |

The functions of the library such as `SQRT`, `SIN`, `LEN`, `CONCAT` and the conversions are not offered, and the build refuses them by name; call them from Structured Text. A function of the project is offered, and it is called even when nothing uses its result. A declaration in the project wins over a standard block of the same name.

## How the diagram runs

The build orders the blocks by their data dependencies, so a block runs after the blocks that feed it, whatever its position on the canvas. Every output that another block consumes gets a temporary of the type the block computes. The blocks `ADD`, `SUB`, `MUL` and the other numeric blocks keep the type of their inputs, and an integer constant adapts to it.

A block of the project is called with named arguments, so the order in which you wire its inputs does not matter. For a function block the `VAR_INPUT` and `VAR_IN_OUT` variables are the inputs and the `VAR_OUTPUT` variables are the outputs; for a function the inputs are its parameters and its result is the output `OUT`.

## Pin types

The canvas refuses a wire between pins whose types do not match, and says why in a message over the canvas.

| Types                                        | Rule                                                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integers, bit strings, `REAL`, `LREAL`       | One family of numbers. An integer goes into a `REAL` or an `LREAL`, and a `REAL` and an `LREAL` go into each other (the build warns when an `LREAL` is narrowed). A `REAL` never goes into an integer. |
| `BOOL`, `TIME`, `DATE`, `TOD`, `DT`, strings | Each takes only its own type.                                                                                                                                                                          |
| A pin declared `ANY`                         | Not judged.                                                                                                                                                                                            |

To feed a `REAL` to an integer input, convert it first with a conversion function such as `REAL_TO_INT` in a Structured Text program. An input has one source: a second wire into the same input is refused.

## Common mistakes

| Mistake                                                   | What happens                                              | What to do                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| An input pin with no wire                                 | The build refuses it with a message that names the block. | Wire it, or add a constant or variable block.                                               |
| A feedback loop, an output wired back to an earlier block | The build refuses it and names a block of the loop.       | Restructure the logic so that data flows one way, or write the feedback in Structured Text. |
| A `BOOL` output into a numeric input                      | The wire is refused.                                      | Convert it, or compare the value instead.                                                   |
| Two wires into one input                                  | The second is refused.                                    | Combine the sources with a block such as `OR` or `SEL`.                                     |
| EN and ENO on a block                                     | Not supported. The build refuses it with a message.       | Use a Ladder function box when you need EN and ENO ([Write a Ladder Diagram](./ld.md)).     |
| A block that no file declares                             | The build refuses it by name.                             | Declare it in a Structured Text file of `src` or of a library folder.                       |

## Arrange and read the diagram

Fit the diagram to the window with `Ctrl+Alt+0`. The canvas zooms from 10% to 400%. Align the selected blocks with `Alt+Shift` and an arrow key, and spread three or more evenly with `Ctrl+Alt+Shift+H` or `Ctrl+Alt+Shift+V`; each command is one undo step. While a program runs in the simulation the editor shows the value on every wire and the outputs of every block, and a value that was not read is shown as unavailable, never as FALSE. See [Text and visual editors](../ide/editors.md) for the details.

Evidence level: host. `packages/zplc-ide/src/transpiler/transpiler.test.ts` and `packages/zplc-ide/src/models/pinTypes.test.ts` cover the translation, the ordering and the pin rules, and the conformance cases of the reference run the diagrams on the native runtime. No board was used.
