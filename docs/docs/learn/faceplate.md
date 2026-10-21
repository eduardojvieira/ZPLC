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

While a program runs in the simulator, the **Watch** tab shows the **Live I/O**
faceplate: every input and output of the running program, with a control for each
input. It works for any project, not only for a lesson, and it needs no board. If
it says "Build the project and start the simulation to see its inputs and
outputs.", build the project, then choose **Connect** and **Run** on the toolbar.

## What it lists

- **Inputs**: every input the running program declares, read from its I/O map, by
  the name the program gives it. Each row shows the type, the address as the
  program writes it (for example `%IX0.1` or `%IW2`), the value, a control to set
  it, the state of the last change, and a box to force it.
- **Outputs**: every output the program maps to the output image, with its type,
  address and live value.
- A `BOOL` reads `TRUE` or `FALSE` and a number reads as the number; a dash means
  the value has not been read yet. A state is shown as a symbol and a word as well
  as a colour, and a forced value says that it is forced.

The faceplate does not depend on any name: a program whose inputs are called
`Gate` and `Dial` gets the same controls as one whose inputs are called `Start`
and `Speed`. A lesson plant drives the same inputs through the mapping of its
lesson; see [Lesson plants](./plants.md).

## How to operate an input

| Type of the input                                            | Control                                                                                                                                             | With the keyboard                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `BOOL`                                                       | A switch whose text says what pressing it does, **Set TRUE** or **Set FALSE**; a screen reader reads its name and value, for example `Gate: FALSE`. | Tab to it and press Space.                                                                                 |
| `BOOL`                                                       | A **Hold** button: `TRUE` while it is held, `FALSE` when it is released.                                                                            | Hold Space or Enter.                                                                                       |
| A number of 8 or 16 bits (`SINT`, `INT`, `BYTE`, `WORD` ...) | A slider over the range of the type, and a number box with **Set**.                                                                                 | Arrow keys step by one, Home and End go to the ends of the range; type a value in the box and press Enter. |
| A wider number (`DINT`, `REAL` ...)                          | A number box with **Set**. Its type gives no range to slide over.                                                                                   | Type a value and press Enter.                                                                              |

**Force** holds an input at its value until you release it. A force carries up
to 32 bits, so a wider input can be set but not forced.

## When a change reaches the program

A change is sent to the runtime at once, and the runtime applies it at a scan
boundary: the program reads it at the start of the next scan, never halfway
through one. Beside the input, the faceplate shows **Pending until next scan**
from the moment the change is sent until the runtime holds it, then **Applied**
for a moment. An output shows the value the program wrote in its last scan, so an
output that follows an input changes one scan after the input does.

## When the inputs cannot be operated

The controls are disabled, and the faceplate says why in words, when:

- the simulation is not connected or not running: start it;
- the simulation is paused: resume it, or change a value from the watch table;
- the simulation stopped with a fault: reset it;
- ZPLC is in hardware mode: the faceplate operates inputs in simulation only; on
  a board, force an input from the watch table;
- the simulator does not apply changes at a scan boundary: the inputs are then
  read-only.

## Evidence

Journey 50 of the development host operates a switch, a **Hold** button, a slider
and a number box, with the pointer and with the keyboard alone, and sees each
output follow. Journey 57 sees the output of the first lesson turn on and off.
Both run the native simulation on Linux; they are not evidence of a board.
