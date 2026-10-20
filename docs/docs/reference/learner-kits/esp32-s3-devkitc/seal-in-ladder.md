---
title: "Wiring: Seal-in in Ladder: a motor that holds itself on on ESP32-S3-DevKitC-1 (N8R8)"
sidebar_label: "seal-in-ladder"
description: "How to wire the lesson seal-in-ladder on the ESP32-S3-DevKitC-1 (N8R8), generated from its wiring file."
tags: [learn, hardware, generated]
unlisted: true
---

# Wiring: Seal-in in Ladder: a motor that holds itself on on ESP32-S3-DevKitC-1 (N8R8)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/esp32-s3-devkitc/seal-in-ladder. Do not edit. >>> */}

The wiring of the lesson [Seal-in in Ladder: a motor that holds itself on](../../../learn/lessons/seal-in-ladder.md) on the [ESP32-S3-DevKitC-1 (N8R8)](../esp32-s3-devkitc.md). Wire it with the USB cable unplugged.

## Voltage limit

- The I/O pins of both learner boards work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything from mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin of the board, and join the grounds.
- Keep each output under 10 mA: one LED with a 330 Ω resistor draws about 4 mA. On the Pico, keep the total of all pins under 50 mA.
- Wire with the USB cable unplugged, and check the wiring twice before you plug it in.

## Diagram

![Wiring of Seal-in in Ladder: a motor that holds itself on on ESP32-S3-DevKitC-1 (N8R8)](/img/wiring/esp32-s3-devkitc/seal-in-ladder.en.svg)

## Wiring card

1. Start: push button between GPIO0 (BOOT) (header J3 and BOOT button, DI0) and GND (GND · J1-22); the internal pull-up of the board reads it.
2. Stop: push button between GPIO18 (header J1, DI1) and GND (GND · J1-22); the internal pull-up of the board reads it.
3. Motor: green LED with a 330 Ω resistor in series, from GPIO38 (header J3, DO0) to GND (GND · J1-22).

{/* <<< END GENERATED: reference/learner-kits/esp32-s3-devkitc/seal-in-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
