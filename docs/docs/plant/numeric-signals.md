---
title: 'Numeric signals'
sidebar_label: 'Numeric signals'
description: 'How an INT or REAL value travels between a plant part and the program: raw and engineering values, scaling, saturation and the exchange limits.'
tags: [plant, reference]
---

# Numeric signals

A plant part can have numeric signals: the level of a tank, the position of a potentiometer, the opening of a valve. A numeric signal is an `INT` or a `REAL`. It travels between the part and a variable of the program on every cycle, in the live session and in the graded run, with the same scaling in both.

## Raw and engineering values

A numeric signal has two values.

- The **engineering value** is what the part uses, in the unit of the signal: metres, litres per second, per cent. The [parts reference](./parts.md) lists the unit and the range of each signal.
- The **raw value** is what the program variable holds: a whole number for an `INT`, a decimal number for a `REAL`.

The plant map ties the two together with a `range` on each numeric signal: `raw_min`, `raw_max`, `eng_min`, `eng_max` and `unit`. `eng_min`, `eng_max` and `unit` must equal the range and the unit that the part declares for that signal; ZPLC reports a located message when they differ. The raw range is free: it is the choice of the author of the map.

## The two rules

Raw to engineering, for a signal the program reads from the plant or sends to it as a command:

1. Limit the raw value to `raw_min` to `raw_max`.
2. `eng = eng_min + (raw - raw_min) / (raw_max - raw_min) * (eng_max - eng_min)`.

Engineering to raw, for a signal the plant writes to the program:

1. Limit the engineering value to `eng_min` to `eng_max`.
2. `raw = raw_min + (eng - eng_min) / (eng_max - eng_min) * (raw_max - raw_min)`.
3. For an `INT`, round to the nearest whole number (a half rounds up) and limit it again to `raw_min` to `raw_max`. For a `REAL`, round to the nearest 32-bit float.

### Worked example

The tank of scene 12 has a level sensor, `Tank1.level`, of 0 to 1 m. Its map entry is an `INT` with a raw range of 0 to 27648 over 0 to 1 m.

| Raw value the program reads | Engineering value (m) |
| --------------------------- | --------------------- |
| 0                           | 0                     |
| 13824                       | 0.5                   |
| 27648                       | 1                     |

The tank holds 0.5 m. The plant writes `raw = 0 + 0.5 / 1 * 27648 = 13824` into the `INT` variable of the program. In the other direction, a program that sends 13824 to a signal with this range commands 0.5.

## Saturation

A value outside its range **saturates**: it stops at the nearest end of the range and never wraps around. A level of 1.2 m on a signal of 0 to 1 m reads as 27648. A raw value of 30000 on that range commands 1 m.

## REAL and INT

A `REAL` is a 32-bit float stored little-endian in 4 bytes. An `INT` is a 16-bit whole number stored little-endian in 2 bytes, from -32768 to 32767.

The type of a part signal and the type of the program variable are two choices. A part signal that is a `REAL` in the parts reference may be bound to an `INT` variable of the program, and the other way round: the scaling converts. That is the usual case of an analog channel, where a physical value in a unit reaches the program as a whole number. The variable the map names must have the same type as the `type` that the map gives to the signal.

A `REAL` that the program sends and that is not a finite number (not a number, or infinite) is ignored: the plant keeps the previous value of that command.

## The exchange span

On each cycle the live session reads once the part of the output image that holds the commands of the program, and writes once the part of the input image that holds the sensors. Each of the two spans runs from the lowest mapped address to the end of the highest mapped slot, so the span counts the address and the width of the slot: an `INT` at address 10 ends at 12 and a `REAL` at address 10 ends at 14. A span carries at most 64 bytes. A longer span is reported with a message that asks you to map the points closer together.

A numeric signal needs its own bytes. It cannot share a byte with another numeric signal, and it cannot share a byte with a `BOOL` bit that another signal owns. ZPLC reports both cases when the map is checked.

## Force

A forced `BOOL` input keeps its forced value: the plant's write does not change it. A forced numeric input keeps its whole forced value too: an `INT` of 2 bytes and a `REAL` of 4 bytes stay as forced while the plant writes the input image every scan. This is checked by a test on the native runtime on Linux; macOS and Windows are not yet checked.

## Sorting sensors

Three sensors of the sorting scenes publish a number, with the ranges below. They follow the same scaling and the same 64-byte exchange span as every other numeric signal. The [sorting page](./sorting.md) gives the rule of each reading.

| Signal   | Part          | Type   | Unit | Range                       | Reads                                                   |
| -------- | ------------- | ------ | ---- | --------------------------- | ------------------------------------------------------- |
| `height` | light array   | `REAL` | m    | 0 to `beams` times `pitchM` | The top edge of the highest item, in steps of the pitch |
| `weight` | scale         | `REAL` | kg   | 0 to `rangeKg`              | The mass at rest, 0 while the load moves                |
| `code`   | vision sensor | `INT`  | code | 0 to 9                      | The code of the item nearest the field centre           |

An empty scale that is not stable and has the `readingOffset` fault reads 2 kg, not 0.

## Stacker crane

The `stacker-crane` has two `INT` command signals. They are setpoints, so the crane keeps the last value; a value outside the range saturates, as in the [Saturation](#saturation) section. The [stations page](./stations.md) explains how the crane uses them.

| Signal  | Part          | Type  | Unit  | Range          | Commands                                         |
| ------- | ------------- | ----- | ----- | -------------- | ------------------------------------------------ |
| `bay`   | stacker crane | `INT` | bay   | 0 to `columns` | The column the crane goes to (0 is the dock end) |
| `level` | stacker crane | `INT` | level | 0 to `levels`  | The level the mast goes to (0 is the dock)       |

The same 64-byte exchange span applies. The crane has two `INT` commands (2 bytes each) and eleven `BOOL` signals.

## Not yet measured

Nothing on this page states a time, a rate or a hardware result. The cost of numeric exchange per cycle is not yet measured on the reference machines.
