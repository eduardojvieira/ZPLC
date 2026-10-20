---
title: "Wiring: Write a blinker in Structured Text on Raspberry Pi Pico (RP2040)"
sidebar_label: "blink-structured-text"
description: "How to wire the lesson blink-structured-text on the Raspberry Pi Pico (RP2040), generated from its wiring file."
tags: [learn, hardware, generated]
unlisted: true
---

# Wiring: Write a blinker in Structured Text on Raspberry Pi Pico (RP2040)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/rpi-pico-rp2040/blink-structured-text. Do not edit. >>> */}

The wiring of the lesson [Write a blinker in Structured Text](../../../learn/lessons/blink-structured-text.md) on the [Raspberry Pi Pico (RP2040)](../rpi-pico-rp2040.md). Wire it with the USB cable unplugged.

## Voltage limit

- The I/O pins of both learner boards work at 3.3 V logic only.
- Never connect 5 V (including the 5V, VBUS and VSYS pins), a battery above 3.3 V or anything from mains to a GPIO, ADC or 3V3 pin.
- Power the parts only from the 3V3 pin of the board, and join the grounds.
- Keep each output under 10 mA: one LED with a 330 Ω resistor draws about 4 mA. On the Pico, keep the total of all pins under 50 mA.
- Wire with the USB cable unplugged, and check the wiring twice before you plug it in.

## Diagram

![Wiring of Write a blinker in Structured Text on Raspberry Pi Pico (RP2040)](/img/wiring/rpi-pico-rp2040/blink-structured-text.en.svg)

## Wiring card

1. Enable: jumper wire from GP15 (header pin 20, DI0) to GND (GND · pin 38); plugged in means on.
2. Lamp: red LED with a 330 Ω resistor in series, from GP0 (header pin 1, DO0) to GND (GND · pin 38).

{/* <<< END GENERATED: reference/learner-kits/rpi-pico-rp2040/blink-structured-text <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
