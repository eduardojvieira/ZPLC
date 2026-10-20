---
title: "Wiring: Interlocks in Ladder: a reversing motor on ESP32-S3-DevKitC-1 (N8R8)"
sidebar_label: "interlock-reversing-ladder"
description: "How to wire the lesson interlock-reversing-ladder on the ESP32-S3-DevKitC-1 (N8R8), generated from its wiring file."
tags: [learn, hardware, generated]
unlisted: true
---

# Wiring: Interlocks in Ladder: a reversing motor on ESP32-S3-DevKitC-1 (N8R8)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/esp32-s3-devkitc/interlock-reversing-ladder. Do not edit. >>> */}

The wiring of the lesson [Interlocks in Ladder: a reversing motor](../../../learn/lessons/interlock-reversing-ladder.md) on the [ESP32-S3-DevKitC-1 (N8R8)](../esp32-s3-devkitc.md). Wire it with the USB cable unplugged.

## Voltage limit

- The I/O pins of both learner boards work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything from mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin of the board, and join the grounds.
- Keep each output under 10 mA: one LED with a 330 Ω resistor draws about 4 mA. On the Pico, keep the total of all pins under 50 mA.
- Wire with the USB cable unplugged, and check the wiring twice before you plug it in.

## Diagram

![Wiring of Interlocks in Ladder: a reversing motor on ESP32-S3-DevKitC-1 (N8R8)](/img/wiring/esp32-s3-devkitc/interlock-reversing-ladder.en.svg)

## Wiring card

1. Forward button: push button between GPIO5 (header J1 pin 5, DI0) and GND (GND · J1-22); the internal pull-up of the board reads it.
2. Reverse button: push button between GPIO6 (header J1 pin 6, DI1) and GND (GND · J1-22); the internal pull-up of the board reads it.
3. Stop button: push button between GPIO7 (header J1 pin 7, DI2) and GND (GND · J1-22); the internal pull-up of the board reads it.
4. Lubrication OK (a held permissive: leave the jumper wire plugged in, and pull it out for a moment to simulate a lubrication fault): jumper wire from GPIO8 (header J1 pin 12, DI3) to GND (GND · J1-22); plugged in means on.
5. Forward: green LED with a 330 Ω resistor in series, from GPIO15 (header J1 pin 8, DO0) to GND (GND · J1-22).
6. Reverse: yellow LED with a 330 Ω resistor in series, from GPIO16 (header J1 pin 9, DO1) to GND (GND · J1-22).

{/* <<< END GENERATED: reference/learner-kits/esp32-s3-devkitc/interlock-reversing-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
