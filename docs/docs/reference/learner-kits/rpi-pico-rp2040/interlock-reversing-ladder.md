---
title: "Wiring: Interlocks in Ladder: a reversing motor on Raspberry Pi Pico (RP2040)"
sidebar_label: "interlock-reversing-ladder"
description: "How to wire the lesson interlock-reversing-ladder on the Raspberry Pi Pico (RP2040), generated from its wiring file."
tags: [learn, hardware, generated]
unlisted: true
---

# Wiring: Interlocks in Ladder: a reversing motor on Raspberry Pi Pico (RP2040)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/rpi-pico-rp2040/interlock-reversing-ladder. Do not edit. >>> */}

The wiring of the lesson [Interlocks in Ladder: a reversing motor](../../../learn/lessons/interlock-reversing-ladder.md) on the [Raspberry Pi Pico (RP2040)](../rpi-pico-rp2040.md). Wire it with the USB cable unplugged.

## Voltage limit

- The I/O pins of both learner boards work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything from mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin of the board, and join the grounds.
- Keep each output under 10 mA: one LED with a 330 Ω resistor draws about 4 mA. On the Pico, keep the total of all pins under 50 mA.
- Wire with the USB cable unplugged, and check the wiring twice before you plug it in.

## Diagram

![Wiring of Interlocks in Ladder: a reversing motor on Raspberry Pi Pico (RP2040)](/img/wiring/rpi-pico-rp2040/interlock-reversing-ladder.en.svg)

## Wiring card

1. Forward button: push button between GP15 (header pin 20, DI0) and GND (GND · pin 38); the internal pull-up of the board reads it.
2. Reverse button: push button between GP14 (header pin 19, DI1) and GND (GND · pin 38); the internal pull-up of the board reads it.
3. Stop button: push button between GP13 (header pin 17, DI2) and GND (GND · pin 38); the internal pull-up of the board reads it.
4. Lubrication OK (a held permissive: leave the jumper wire plugged in, and pull it out for a moment to simulate a lubrication fault): jumper wire from GP12 (header pin 16, DI3) to GND (GND · pin 38); plugged in means on.
5. Forward: green LED with a 330 Ω resistor in series, from GP0 (header pin 1, DO0) to GND (GND · pin 38).
6. Reverse: yellow LED with a 330 Ω resistor in series, from GP1 (header pin 2, DO1) to GND (GND · pin 38).

{/* <<< END GENERATED: reference/learner-kits/rpi-pico-rp2040/interlock-reversing-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
