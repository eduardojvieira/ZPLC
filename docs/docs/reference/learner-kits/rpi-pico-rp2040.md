---
title: "Learner kit: Raspberry Pi Pico (RP2040)"
sidebar_label: "Raspberry Pi Pico (RP2040)"
description: "The pin map, parts, firmware and voltage limit of the Raspberry Pi Pico (RP2040) for the course, generated from the board I/O manifest and the kit."
tags: [learn, hardware, generated]
---

# Learner kit: Raspberry Pi Pico (RP2040)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/rpi-pico-rp2040. Do not edit. >>> */}

The kit of the course for the Raspberry Pi Pico (RP2040): its pin map, the parts, the firmware and the voltage limit. The pins come from `firmware/app/boards/boards.json` and the parts from `packages/zplc-ide/lessons/kit.json`. The [learner kits](./index.md) page explains how a lesson declares its wiring.

## Voltage limit

- The I/O pins of both learner boards work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything from mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin of the board, and join the grounds.
- Keep each output under 10 mA: one LED with a 330 Ω resistor draws about 4 mA. On the Pico, keep the total of all pins under 50 mA.
- Wire with the USB cable unplugged, and check the wiring twice before you plug it in.

## Pin map

| Channel | Direction | Address | Pin | Location | Notes |
| --- | --- | --- | --- | --- | --- |
| `DO0` | output, digital | `%QX0.0` | GP0 | header pin 1 | 3.3 V logic. Not 5 V tolerant. RP2040 drive strength is configurable up to 12 mA per pin (datasheet, not qualified here). |
| `DO1` | output, digital | `%QX0.1` | GP1 | header pin 2 | 3.3 V logic. Not 5 V tolerant. RP2040 drive strength is configurable up to 12 mA per pin (datasheet, not qualified here). |
| `DO2` | output, digital | `%QX0.2` | GP2 | header pin 4 | 3.3 V logic. Not 5 V tolerant. RP2040 drive strength is configurable up to 12 mA per pin (datasheet, not qualified here). |
| `DO3` | output, digital | `%QX0.3` | GP3 | header pin 5 | 3.3 V logic. Not 5 V tolerant. RP2040 drive strength is configurable up to 12 mA per pin (datasheet, not qualified here). |
| `DO4` | output, digital | `%QX0.4` | GP25 | on-board LED | On-board green LED through its series resistor; not a field output. |
| `DI0` | input, digital | `%IX0.0` | GP15 | header pin 20 | 3.3 V logic input with the RP2040 internal pull-up enabled by the profile; connect a switch to GND. Not 5 V tolerant. |
| `DI1` | input, digital | `%IX0.1` | GP14 | header pin 19 | 3.3 V logic input with the RP2040 internal pull-up enabled by the profile; connect a switch to GND. Not 5 V tolerant. |
| `DI2` | input, digital | `%IX0.2` | GP13 | header pin 17 | 3.3 V logic input with the RP2040 internal pull-up enabled by the profile; connect a switch to GND. Not 5 V tolerant. |
| `DI3` | input, digital | `%IX0.3` | GP12 | header pin 16 | 3.3 V logic input with the RP2040 internal pull-up enabled by the profile; connect a switch to GND. Not 5 V tolerant. |
| `AI0` | input, analog | `%IW4` | GP26 (ADC0) | header pin 31 | 0 V to 3.3 V on the ADC input; do not exceed 3.3 V. |
| `AI1` | input, analog | `%IW5` | GP27 (ADC1) | header pin 32 | 0 V to 3.3 V on the ADC input; do not exceed 3.3 V. |
| `AI2` | input, analog | `%IW6` | GP28 (ADC2) | header pin 34 | 0 V to 3.3 V on the ADC input; do not exceed 3.3 V. |
| `AI3` | input, analog | `%IW7` | VSYS/3 (ADC3) | internal | Internal: the supply voltage divided by 3, no external connection. |
| `AI4` | input, analog | `%IW8` | Temperature sensor (ADC4) | internal | Internal die temperature sensor, no external connection. |

Power: 3V3 on 3V3(OUT) · pin 36, GND on GND · pin 38, the ground of a potentiometer on AGND · pin 33.

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

Each release has a prebuilt image for this board, `zplc-runtime-<version>-rpi-pico-rp2040.uf2`. Its SHA-256 is published in the `SHA256SUMS` file of the release, and the firmware card of Studio shows it next to the file. [Flash the firmware](../../guides/flash-firmware.md) gives the steps. You perform each of them: Studio never flashes a board.

## Lessons on the hardware track

| Lesson | Id |
| --- | --- |
| [Safe motor start-stop](./rpi-pico-rp2040/motor-start-stop-safe.md) | `motor-start-stop-safe` |
| [TON oscillator and output feedback](./rpi-pico-rp2040/blinky-ladder-timer-feedback.md) | `blinky-ladder-timer-feedback` |
| [Edges and pulse counter](./rpi-pico-rp2040/edge-counter-pulses.md) | `edge-counter-pulses` |
| [Scan cycle and one-scan memory](./rpi-pico-rp2040/scan-cycle-one-scan-memory.md) | `scan-cycle-one-scan-memory` |
| [Boolean logic: a two-hand control with a guard](./rpi-pico-rp2040/boolean-logic-two-hand-guard.md) | `boolean-logic-two-hand-guard` |
| [Timers: an off-delay light and an on-delay filter](./rpi-pico-rp2040/timers-on-delay-off-delay.md) | `timers-on-delay-off-delay` |
| [Write a blinker in Structured Text](./rpi-pico-rp2040/blink-structured-text.md) | `blink-structured-text` |
| [Latching an alarm: set and reset, and which one wins](./rpi-pico-rp2040/set-reset-alarm-latch.md) | `set-reset-alarm-latch` |
| [Seal-in in Ladder: a motor that holds itself on](./rpi-pico-rp2040/seal-in-ladder.md) | `seal-in-ladder` |
| [Counters in Function Block Diagram: count parts to a batch](./rpi-pico-rp2040/counter-batch-fbd.md) | `counter-batch-fbd` |
| [Types, arithmetic and comparison: a total and three bands](./rpi-pico-rp2040/types-arithmetic-comparison.md) | `types-arithmetic-comparison` |
| [Analog scaling: from raw counts to a percentage](./rpi-pico-rp2040/analog-scaling-integer.md) | `analog-scaling-integer` |
| [Function blocks: one latch, two pumps](./rpi-pico-rp2040/function-block-pump-pair.md) | `function-block-pump-pair` |
| [Structures and arrays: a panel of three calls](./rpi-pico-rp2040/structures-arrays-call-panel.md) | `structures-arrays-call-panel` |
| [A sequence in Sequential Function Chart: fill, then mix](./rpi-pico-rp2040/sfc-fill-mix-sequence.md) | `sfc-fill-mix-sequence` |
| [Instruction List: the current result and the order of instructions](./rpi-pico-rp2040/instruction-list-door-alarm.md) | `instruction-list-door-alarm` |
| [One logic in five languages: a gate that holds itself open](./rpi-pico-rp2040/one-logic-five-languages.md) | `one-logic-five-languages` |
| [Analog scaling in Function Block Diagram: a high level alarm](./rpi-pico-rp2040/analog-scaling-fbd.md) | `analog-scaling-fbd` |
| [Verify my board](./rpi-pico-rp2040/verify-my-board.md) | `verify-my-board` |

{/* <<< END GENERATED: reference/learner-kits/rpi-pico-rp2040 <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
