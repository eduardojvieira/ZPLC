---
title: "Wiring: Scan cycle and one-scan memory on Raspberry Pi Pico (RP2040)"
sidebar_label: "scan-cycle-one-scan-memory"
description: "How to wire the lesson scan-cycle-one-scan-memory on the Raspberry Pi Pico (RP2040), generated from its wiring file."
tags: [learn, hardware, generated]
unlisted: true
---

# Wiring: Scan cycle and one-scan memory on Raspberry Pi Pico (RP2040)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/rpi-pico-rp2040/scan-cycle-one-scan-memory. Do not edit. >>> */}

The wiring of the lesson [Scan cycle and one-scan memory](../../../learn/lessons/scan-cycle-one-scan-memory.md) on the [Raspberry Pi Pico (RP2040)](../rpi-pico-rp2040.md). Wire it with the USB cable unplugged.

## Voltage limit

- The I/O pins of both learner boards work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything from mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin of the board, and join the grounds.
- Keep each output under 10 mA: one LED with a 330 Ω resistor draws about 4 mA. On the Pico, keep the total of all pins under 50 mA.
- Wire with the USB cable unplugged, and check the wiring twice before you plug it in.

## Diagram

![Wiring of Scan cycle and one-scan memory on Raspberry Pi Pico (RP2040)](/img/wiring/rpi-pico-rp2040/scan-cycle-one-scan-memory.en.svg)

## Wiring card

1. Button: push button between GP15 (header pin 20, DI0) and GND (GND · pin 38); the internal pull-up of the board reads it.
2. Current: green LED with a 330 Ω resistor in series, from GP0 (header pin 1, DO0) to GND (GND · pin 38).
3. Delayed: yellow LED with a 330 Ω resistor in series, from GP1 (header pin 2, DO1) to GND (GND · pin 38).
4. Rising pulse: red LED with a 330 Ω resistor in series, from GP2 (header pin 4, DO2) to GND (GND · pin 38).

{/* <<< END GENERATED: reference/learner-kits/rpi-pico-rp2040/scan-cycle-one-scan-memory <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
