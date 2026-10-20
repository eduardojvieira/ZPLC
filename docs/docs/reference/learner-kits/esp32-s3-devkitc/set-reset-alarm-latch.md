---
title: "Wiring: Latching an alarm: set and reset, and which one wins on ESP32-S3-DevKitC-1 (N8R8)"
sidebar_label: "set-reset-alarm-latch"
description: "How to wire the lesson set-reset-alarm-latch on the ESP32-S3-DevKitC-1 (N8R8), generated from its wiring file."
tags: [learn, hardware, generated]
unlisted: true
---

# Wiring: Latching an alarm: set and reset, and which one wins on ESP32-S3-DevKitC-1 (N8R8)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/esp32-s3-devkitc/set-reset-alarm-latch. Do not edit. >>> */}

The wiring of the lesson [Latching an alarm: set and reset, and which one wins](../../../learn/lessons/set-reset-alarm-latch.md) on the [ESP32-S3-DevKitC-1 (N8R8)](../esp32-s3-devkitc.md). Wire it with the USB cable unplugged.

## Voltage limit

- The I/O pins of both learner boards work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything from mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin of the board, and join the grounds.
- Keep each output under 10 mA: one LED with a 330 Ω resistor draws about 4 mA. On the Pico, keep the total of all pins under 50 mA.
- Wire with the USB cable unplugged, and check the wiring twice before you plug it in.

## Diagram

![Wiring of Latching an alarm: set and reset, and which one wins on ESP32-S3-DevKitC-1 (N8R8)](/img/wiring/esp32-s3-devkitc/set-reset-alarm-latch.en.svg)

## Wiring card

1. Fault: push button between GPIO0 (BOOT) (header J3 and BOOT button, DI0) and GND (GND · J1-22); the internal pull-up of the board reads it.
2. Acknowledge: push button between GPIO18 (header J1, DI1) and GND (GND · J1-22); the internal pull-up of the board reads it.
3. Set-dominant alarm: red LED with a 330 Ω resistor in series, from GPIO38 (header J3, DO0) to GND (GND · J1-22).
4. Reset-dominant alarm: yellow LED with a 330 Ω resistor in series, from GPIO15 (header J1, DO1) to GND (GND · J1-22).

{/* <<< END GENERATED: reference/learner-kits/esp32-s3-devkitc/set-reset-alarm-latch <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
