---
title: "Wiring: Structures and arrays: a panel of three calls on ESP32-S3-DevKitC-1 (N8R8)"
sidebar_label: "structures-arrays-call-panel"
description: "How to wire the lesson structures-arrays-call-panel on the ESP32-S3-DevKitC-1 (N8R8), generated from its wiring file."
tags: [learn, hardware, generated]
unlisted: true
---

# Wiring: Structures and arrays: a panel of three calls on ESP32-S3-DevKitC-1 (N8R8)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/esp32-s3-devkitc/structures-arrays-call-panel. Do not edit. >>> */}

The wiring of the lesson [Structures and arrays: a panel of three calls](../../../learn/lessons/structures-arrays-call-panel.md) on the [ESP32-S3-DevKitC-1 (N8R8)](../esp32-s3-devkitc.md). Wire it with the USB cable unplugged.

## Voltage limit

- The I/O pins of both learner boards work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything from mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin of the board, and join the grounds.
- Keep each output under 10 mA: one LED with a 330 Ω resistor draws about 4 mA. On the Pico, keep the total of all pins under 50 mA.
- Wire with the USB cable unplugged, and check the wiring twice before you plug it in.

## Diagram

![Wiring of Structures and arrays: a panel of three calls on ESP32-S3-DevKitC-1 (N8R8)](/img/wiring/esp32-s3-devkitc/structures-arrays-call-panel.en.svg)

## Wiring card

1. Call 1: push button between GPIO0 (BOOT) (header J3 and BOOT button, DI0) and GND (GND · J1-22); the internal pull-up of the board reads it.
2. Call 2: push button between GPIO18 (header J1, DI1) and GND (GND · J1-22); the internal pull-up of the board reads it.
3. Call 3: push button between GPIO8 (header J1, DI2) and GND (GND · J1-22); the internal pull-up of the board reads it.
4. Acknowledge: jumper wire from GPIO9 (header J1, DI3) to GND (GND · J1-22); plugged in means on.
5. Call pending: yellow LED with a 330 Ω resistor in series, from GPIO38 (header J3, DO0) to GND (GND · J1-22).
6. All calling: red LED with a 330 Ω resistor in series, from GPIO15 (header J1, DO1) to GND (GND · J1-22).

{/* <<< END GENERATED: reference/learner-kits/esp32-s3-devkitc/structures-arrays-call-panel <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
