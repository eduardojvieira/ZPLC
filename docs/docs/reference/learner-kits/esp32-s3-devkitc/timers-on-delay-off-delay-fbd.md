---
title: "Wiring: Timers in Function Block Diagram: an off-delay light and an on-delay filter on ESP32-S3-DevKitC-1 (N8R8)"
sidebar_label: "timers-on-delay-off-delay-fbd"
description: "How to wire the lesson timers-on-delay-off-delay-fbd on the ESP32-S3-DevKitC-1 (N8R8), generated from its wiring file."
tags: [learn, hardware, generated]
unlisted: true
---

# Wiring: Timers in Function Block Diagram: an off-delay light and an on-delay filter on ESP32-S3-DevKitC-1 (N8R8)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/esp32-s3-devkitc/timers-on-delay-off-delay-fbd. Do not edit. >>> */}

The wiring of the lesson [Timers in Function Block Diagram: an off-delay light and an on-delay filter](../../../learn/lessons/timers-on-delay-off-delay-fbd.md) on the [ESP32-S3-DevKitC-1 (N8R8)](../esp32-s3-devkitc.md). Wire it with the USB cable unplugged.

## Voltage limit

- The I/O pins of both learner boards work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything from mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin of the board, and join the grounds.
- Keep each output under 10 mA: one LED with a 330 Ω resistor draws about 4 mA. On the Pico, keep the total of all pins under 50 mA.
- Wire with the USB cable unplugged, and check the wiring twice before you plug it in.

## Diagram

![Wiring of Timers in Function Block Diagram: an off-delay light and an on-delay filter on ESP32-S3-DevKitC-1 (N8R8)](/img/wiring/esp32-s3-devkitc/timers-on-delay-off-delay-fbd.en.svg)

## Wiring card

1. Button: push button between GPIO5 (header J1 pin 5, DI0) and GND (GND · J1-22); the internal pull-up of the board reads it.
2. Sensor: push button between GPIO6 (header J1 pin 6, DI1) and GND (GND · J1-22); the internal pull-up of the board reads it.
3. Light: yellow LED with a 330 Ω resistor in series, from GPIO15 (header J1 pin 8, DO0) to GND (GND · J1-22).
4. Confirmed: green LED with a 330 Ω resistor in series, from GPIO16 (header J1 pin 9, DO1) to GND (GND · J1-22).

{/* <<< END GENERATED: reference/learner-kits/esp32-s3-devkitc/timers-on-delay-off-delay-fbd <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
