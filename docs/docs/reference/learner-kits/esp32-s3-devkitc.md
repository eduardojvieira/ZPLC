---
title: "Learner kit: ESP32-S3-DevKitC-1 (N8R8)"
sidebar_label: "ESP32-S3-DevKitC-1 (N8R8)"
description: "The pin map, parts, firmware and voltage limit of the ESP32-S3-DevKitC-1 (N8R8) for the course, generated from the board I/O manifest and the kit."
tags: [learn, hardware, generated]
---

# Learner kit: ESP32-S3-DevKitC-1 (N8R8)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/esp32-s3-devkitc. Do not edit. >>> */}

The kit of the course for the ESP32-S3-DevKitC-1 (N8R8): its pin map, the parts, the firmware and the voltage limit. The pins come from `firmware/app/boards/boards.json` and the parts from `packages/zplc-ide/lessons/kit.json`. The [learner kits](./index.md) page explains how a lesson declares its wiring.

## Voltage limit

- The I/O pins of both learner boards work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything from mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin of the board, and join the grounds.
- Keep each output under 10 mA: one LED with a 330 Ω resistor draws about 4 mA. On the Pico, keep the total of all pins under 50 mA.
- Wire with the USB cable unplugged, and check the wiring twice before you plug it in.

## Pin map

| Channel | Direction | Address | Pin | Location | Notes |
| --- | --- | --- | --- | --- | --- |
| `DO0` | output, digital | `%QX0.0` | GPIO38 | header J3 | 3.3 V logic. Not 5 V tolerant. External LED with a series resistor. |
| `DO1` | output, digital | `%QX0.1` | GPIO15 | header J1 | 3.3 V logic. Not 5 V tolerant. |
| `DO2` | output, digital | `%QX0.2` | GPIO16 | header J1 | 3.3 V logic. Not 5 V tolerant. |
| `DO3` | output, digital | `%QX0.3` | GPIO17 | header J1 | 3.3 V logic. Not 5 V tolerant. |
| `DI0` | input, digital | `%IX0.0` | GPIO0 (BOOT) | header J3 and BOOT button | BOOT button, active low with an internal pull-up. A strapping pin: keep it high at reset. |
| `DI1` | input, digital | `%IX0.1` | GPIO18 | header J1 | 3.3 V logic. Not 5 V tolerant. Internal pull-up; connect a switch to GND. |
| `DI2` | input, digital | `%IX0.2` | GPIO8 | header J1 | 3.3 V logic. Not 5 V tolerant. Internal pull-up; connect a switch to GND. |
| `DI3` | input, digital | `%IX0.3` | GPIO9 | header J1 | 3.3 V logic. Not 5 V tolerant. Internal pull-up; connect a switch to GND. |
| `AI0` | input, analog | `%IW4` | GPIO4 (ADC1 channel 3) | header J1 | 0 V to about 3.1 V at 11 dB attenuation; do not exceed 3.3 V. |

Power: 3V3 on 3V3 · J1-1, GND on GND · J1-22, the ground of a potentiometer on GND · J1-22.

## Bill of materials

| Part | Quantity | Notes |
| --- | --- | --- |
| One learner board: a Raspberry Pi Pico or Pico H, or an ESP32-S3-DevKitC-1 N8R8 | 1 | The Pico W and Pico 2 W are not supported: their on-board LED sits on the wireless chip. |
| USB data cable that fits the connector of the board | 1 | A charge-only cable does not carry data, and Studio cannot reach the board through it. |
| Breadboard of 830 points | 1 | The DevKitC-1 is wide: two half breadboards side by side leave a free row on each side of it. |
| 5 mm LEDs: red, green and yellow | 6 | Not blue or white: they need about 3 V and stay dim at 3.3 V. |
| 330 Ω resistors, one in series with each LED | 6 |   |
| 6×6 mm tactile push buttons | 3 |   |
| 10 kΩ resistors | 2 | Spare parts for experiments; no lesson needs them. |
| 10 kΩ linear potentiometer | 1 |   |
| 100 nF capacitor | 1 | Optional: from the wiper of the potentiometer to GND, it steadies the analog reading. |
| Male-to-male jumper wires | 20 |   |

## Firmware

Each release has a prebuilt image for this board, `zplc-runtime-<version>-esp32-s3-devkitc.bin`. Its SHA-256 is published in the `SHA256SUMS` file of the release, and the firmware card of Studio shows it next to the file. [Flash the firmware](../../guides/flash-firmware.md) gives the steps. You perform each of them: Studio never flashes a board.

## Lessons on the hardware track

| Lesson | Id |
| --- | --- |
| [Safe motor start-stop](./esp32-s3-devkitc/motor-start-stop-safe.md) | `motor-start-stop-safe` |
| [TON oscillator and output feedback](./esp32-s3-devkitc/blinky-ladder-timer-feedback.md) | `blinky-ladder-timer-feedback` |
| [Edges and pulse counter](./esp32-s3-devkitc/edge-counter-pulses.md) | `edge-counter-pulses` |
| [Scan cycle and one-scan memory](./esp32-s3-devkitc/scan-cycle-one-scan-memory.md) | `scan-cycle-one-scan-memory` |
| [Boolean logic: a two-hand control with a guard](./esp32-s3-devkitc/boolean-logic-two-hand-guard.md) | `boolean-logic-two-hand-guard` |
| [Timers: an off-delay light and an on-delay filter](./esp32-s3-devkitc/timers-on-delay-off-delay.md) | `timers-on-delay-off-delay` |
| [Write a blinker in Structured Text](./esp32-s3-devkitc/blink-structured-text.md) | `blink-structured-text` |
| [Latching an alarm: set and reset, and which one wins](./esp32-s3-devkitc/set-reset-alarm-latch.md) | `set-reset-alarm-latch` |
| [Seal-in in Ladder: a motor that holds itself on](./esp32-s3-devkitc/seal-in-ladder.md) | `seal-in-ladder` |
| [Counters in Function Block Diagram: count parts to a batch](./esp32-s3-devkitc/counter-batch-fbd.md) | `counter-batch-fbd` |
| [Types, arithmetic and comparison: a total and three bands](./esp32-s3-devkitc/types-arithmetic-comparison.md) | `types-arithmetic-comparison` |
| [Analog scaling: from raw counts to a percentage](./esp32-s3-devkitc/analog-scaling-integer.md) | `analog-scaling-integer` |
| [Function blocks: one latch, two pumps](./esp32-s3-devkitc/function-block-pump-pair.md) | `function-block-pump-pair` |
| [Structures and arrays: a panel of three calls](./esp32-s3-devkitc/structures-arrays-call-panel.md) | `structures-arrays-call-panel` |
| [A sequence in Sequential Function Chart: fill, then mix](./esp32-s3-devkitc/sfc-fill-mix-sequence.md) | `sfc-fill-mix-sequence` |
| [Instruction List: the current result and the order of instructions](./esp32-s3-devkitc/instruction-list-door-alarm.md) | `instruction-list-door-alarm` |
| [One logic in five languages: a gate that holds itself open](./esp32-s3-devkitc/one-logic-five-languages.md) | `one-logic-five-languages` |
| [Analog scaling in Function Block Diagram: a high level alarm](./esp32-s3-devkitc/analog-scaling-fbd.md) | `analog-scaling-fbd` |
| [Verify my board](./esp32-s3-devkitc/verify-my-board.md) | `verify-my-board` |

{/* <<< END GENERATED: reference/learner-kits/esp32-s3-devkitc <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
