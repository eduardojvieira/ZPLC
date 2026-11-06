---
slug: /learn/faceplate
id: faceplate
title: Live I/O faceplate
sidebar_label: Live I/O faceplate
description: 'The Live I/O faceplate of a simulation: what it lists, how to operate the inputs of the running program, and when a change reaches the program.'
tags: [learn, simulation, faceplate]
unlisted: true
---

# Live I/O faceplate

The faceplate is a panel in the **Watch** tab that lists every input and output of the program you are simulating and lets you operate the inputs with the pointer or the keyboard. It works with any project, not only with a lesson, and it needs no board. If the panel only says "Build the project and start the simulation to see its inputs and outputs.", build the project, then choose **Connect** and **Run** on the toolbar.

## What the panel shows

- **Inputs.** One row for every input the running program declares, read from the I/O map of the build and named as the program names it. A row gives the type, the address as the program writes it (`%IX0.1`, `%IW2`), the current value, a control to set it, the state of the last change and a box to force it.
- **Outputs.** One row for every output the program maps to the output image, with its type, address and live value.
- **Values.** A `BOOL` reads `TRUE` or `FALSE`, and a number reads as the number. A dash means the value has not been read yet. State is never colour alone: a symbol and a word go with it, and a forced value says that it is forced.

The panel does not depend on names. A program whose inputs are called `Gate` and `Dial` gets the same controls as one whose inputs are called `Start` and `Speed`. A lesson plant drives the same inputs through the mapping of its lesson; see [Lesson plants](./plants.md).

## Operate an input

The control depends on the type of the input.

| Type of the input                                            | Control                                                                                                                                             | With the keyboard                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `BOOL`                                                       | A switch whose text says what pressing it does, **Set TRUE** or **Set FALSE**; a screen reader reads its name and value, for example `Gate: FALSE`. | Tab to it and press Space.                                                                                 |
| `BOOL`                                                       | A **Hold** button: `TRUE` while it is held, `FALSE` when it is released.                                                                            | Hold Space or Enter.                                                                                       |
| A number of 8 or 16 bits (`SINT`, `INT`, `BYTE`, `WORD` ...) | A slider over the range of the type, and a number box with **Set**.                                                                                 | Arrow keys step by one, Home and End go to the ends of the range; type a value in the box and press Enter. |
| A wider number (`DINT`, `REAL` ...)                          | A number box with **Set**. Its type gives no range to slide over.                                                                                   | Type a value and press Enter.                                                                              |

The **Force** box holds an input at its value until you clear it. A force carries up to 32 bits, so an input wider than that can be set but not forced; the row says so.

## When a change reaches the program

The change goes to the runtime at once, and the runtime applies it between two cycles: the program reads the new value at the start of the next cycle, never halfway through one. Next to the input the panel shows **Pending until next scan** from the moment the change is sent until the runtime holds it, then **Applied** for a moment.

An output shows the value the program wrote in its last cycle. An output that follows an input therefore changes one cycle after the input does.

## When the inputs are disabled

The controls are disabled, and the panel says why in words, in these cases:

- The simulation is not connected or not running. Start it.
- The simulation is paused. Resume it, or change a value from the watch table.
- The simulation stopped with a fault. Reset it.
- ZPLC is in hardware mode. The panel operates inputs in simulation only; on a board, force an input from the watch table.
- The simulator cannot apply changes between cycles. The inputs are then read-only.

## Evidence

Evidence level: host. Two scripted runs of the ZPLC application, journeys 50 and 57 in `packages/zplc-ide/scripts/journeys.ts`, drive the panel on Linux against the native simulation. Journey 50 operates a switch, a **Hold** button, a slider and a number box with the pointer and with the keyboard alone, and sees each output follow. Journey 57 sees the output of the first lesson turn on and off. Neither is evidence of a board.
