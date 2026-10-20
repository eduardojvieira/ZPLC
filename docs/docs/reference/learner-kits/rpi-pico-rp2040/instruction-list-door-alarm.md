---
title: "Wiring: Instruction List: the current result and the order of instructions on Raspberry Pi Pico (RP2040)"
sidebar_label: "instruction-list-door-alarm"
description: "How to wire the lesson instruction-list-door-alarm on the Raspberry Pi Pico (RP2040), generated from its wiring file."
tags: [learn, hardware, generated]
unlisted: true
---

# Wiring: Instruction List: the current result and the order of instructions on Raspberry Pi Pico (RP2040)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/rpi-pico-rp2040/instruction-list-door-alarm. Do not edit. >>> */}

The wiring of the lesson [Instruction List: the current result and the order of instructions](../../../learn/lessons/instruction-list-door-alarm.md) on the [Raspberry Pi Pico (RP2040)](../rpi-pico-rp2040.md). Wire it with the USB cable unplugged.

## Voltage limit

- The I/O pins of both learner boards work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything from mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin of the board, and join the grounds.
- Keep each output under 10 mA: one LED with a 330 Ω resistor draws about 4 mA. On the Pico, keep the total of all pins under 50 mA.
- Wire with the USB cable unplugged, and check the wiring twice before you plug it in.

## Diagram

![Wiring of Instruction List: the current result and the order of instructions on Raspberry Pi Pico (RP2040)](/img/wiring/rpi-pico-rp2040/instruction-list-door-alarm.en.svg)

## Wiring card

1. Armed: jumper wire from GP15 (header pin 20, DI0) to GND (GND · pin 38); plugged in means on.
2. Door open: push button between GP14 (header pin 19, DI1) and GND (GND · pin 38); the internal pull-up of the board reads it.
3. Silence: push button between GP13 (header pin 17, DI2) and GND (GND · pin 38); the internal pull-up of the board reads it.
4. Siren: red LED with a 330 Ω resistor in series, from GP0 (header pin 1, DO0) to GND (GND · pin 38).

{/* <<< END GENERATED: reference/learner-kits/rpi-pico-rp2040/instruction-list-door-alarm <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
