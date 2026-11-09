---
slug: /guides/map-io
id: map-io
title: Map variables to pins
sidebar_label: Map I/O to pins
description: 'Connect the variables of a program to the inputs and outputs of a board, with the I/O description of the board and the I/O mapping editor of ZPLC.'
tags: [how-to, io, boards, mapping]
---

# Map variables to pins

A program reads inputs and writes outputs through addresses of the process image, such as `%IX0.0` and `%QX0.0`. The board decides which pin each address reaches. This page shows how to place a variable at an address, how to see which pin it is, and what the build and the deploy do when the address is wrong.

:::note Where the truth is
Every board has an I/O description in `firmware/app/boards/boards.json`: its channels, the IEC address and pin of each, its electrical notes and the safe value of every output. ZPLC, the build, the firmware and the documentation read that one file, so the pin table of [Supported boards](../reference/boards.md) is the same data the build checks. No pin has been measured on a bench: see [Hardware support](../reference/capabilities-evidence.md).
:::

## 1. Find the channels of your board

Open [Supported boards](../reference/boards.md) and go to your board. Each row is a channel:

- its address (`%QX0.0` for a digital output, `%IW4` for an analog input);
- the pin or terminal printed on the board;
- whether the devicetree of the board proves the pin (`devicetree`) or the profile chooses it (`profile`);
- the safe value of an output.

## 2. Place the variables

In Structured Text, give a variable its address after the name with `AT`:

```st runnable expect="LED_Output=TRUE" scans=1 scan_ms=10
PROGRAM Light
VAR_INPUT
    Start AT %IX0.0 : BOOL;
END_VAR
VAR_OUTPUT
    LED_Output AT %QX0.0 : BOOL;
END_VAR

LED_Output := NOT Start;
END_PROGRAM
```

Nothing sets the input, so it is `FALSE` and the output is `TRUE`. On a board whose input has a pull-up, as the Raspberry Pi Pico's profile enables, a switch to ground reads `FALSE` while pressed. The electrical notes of the channel say how the pin is wired.

## 3. Read an address

An address is an area, a size and a position: `%` + `I` (input), `Q` (output) or `M` (memory) + `X` (bit), `B` (byte), `W` (word, 16 bits) or `D` (double word, 32 bits) + the index.

| Address  | Covers                                          |
| -------- | ----------------------------------------------- |
| `%IX0.0` | Bit 0 of byte 0 of the input image              |
| `%IB1`   | Byte 1                                          |
| `%IW1`   | Word 1: bytes 2 and 3                           |
| `%QD1`   | Double word 1: bytes 4 to 7 of the output image |

The index of a word or a double word counts words, but the index of a bit and a byte counts bytes. So `%IX0.0` to `%IX1.7` lie inside the bytes of `%IW0`, and `%IW1` starts at byte 2.

:::warning Bit and word addresses overlap
The compiler does not warn when a bit address and a word address cover the same byte. Both variables read and write the same memory, and the later write wins. Here `Flag` is set and the word write clears it again:
:::

```st runnable expect="Flag=FALSE Word=4" scans=1 scan_ms=10
PROGRAM Overlap
VAR_OUTPUT
    Flag AT %QX0.0 : BOOL;
    Word AT %QW0 : WORD;
END_VAR

Flag := TRUE;
Word := 16#0004;
END_PROGRAM
```

Keep the bit addresses and the word addresses of one area in different bytes. The `%M` area behaves the same way: `%MX0.0` and `%MW0` share a byte.

## 4. Map them in the project

The same placement is recorded in `zplc.json` under `io`. In ZPLC, open **Project Settings**. The **I/O Mapping** section lists the channels of the selected board with the pin names printed on it, and each row offers only the channels of that board, so a row cannot land where the board has nothing.

![The I/O Mapping section of Project Settings](/img/screens/guide-io-mapping.png)

```json zplc-fragment board=rpi_pico
{
  "io": {
    "inputs": [{ "name": "Start", "address": "%IX0.0", "type": "BOOL", "pin": 15, "description": "Push button between GP15 and ground" }],
    "outputs": [
      { "name": "LED_Output", "address": "%QX0.0", "type": "BOOL", "pin": 0, "description": "LED with a series resistor on GP0" }
    ],
    "virtual": [{ "name": "SpareFlag", "address": "%QX0.6", "type": "BOOL", "description": "A bit of the output image that no pin drives" }]
  }
}
```

The documentation check holds every address under `inputs` and `outputs` of a fragment to the channels of its board, merges the fragment into a project and builds it.

An address that no pin drives is not a channel. List it under `io.virtual` (in ZPLC: **Keep as virtual (no pin)**) when you want a bit or a word of the process image that only a test or the debugger reads.

## 5. What happens when an address is wrong

- **In ZPLC**, a row on an address the board does not have is flagged. The message names the board, the address and the channels the board has.
- **In the build**, a variable located where the board has no channel is an error that names the board and the variable, unless the address is listed under `io.virtual`.
- **On deploy**, a program that touches an address without a channel is refused with a message that names the board. A deploy to firmware that reports another description than the project was built for is refused too.

## 6. Add a channel to a board

Add the alias to the board's devicetree overlay and an entry to its I/O description in `firmware/app/boards/boards.json`. The firmware I/O table is generated from the description at build time, so no C source changes, and the build fails when the description and the devicetree disagree.

## What is verified, and what is not

| Part                                                                          | Verified                                                                          | Level           |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------- |
| The descriptions are consistent with the devicetree of each board             | The firmware build fails otherwise                                                | Build           |
| An unmapped address is an error in the editor, the build and the deploy       | Unit tests, and journey 40 in the real application                                | Host            |
| A bit and a word on one byte share it, and the compiler does not refuse it    | The sample above runs on the native runtime; `zplc-cli check` accepts the program | Host            |
| The analog scaling of a channel, and the I/O table of the firmware            | Tests on `native_sim`                                                             | Emulated target |
| That a pin drives the signal the description says, and the level of an output | Not tested                                                                        | None            |

## See also

- [Supported boards](../reference/boards.md): the channels, pins, safe values and footprint of every board.
- [Force a value](./force-values.md) and [Write and run scenario tests](./scenario-tests.md).
- [Project file](../reference/project-file.md): every field of `io`.
