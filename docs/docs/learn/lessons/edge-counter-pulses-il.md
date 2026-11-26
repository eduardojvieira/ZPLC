---
title: "Instruction List: counting pulses with a CTU"
sidebar_label: "edge-counter-pulses-il"
description: "The lesson edge-counter-pulses-il: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Instruction List: counting pulses with a CTU

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/edge-counter-pulses-il. Do not edit. >>> */}

Call a CTU counter from Instruction List to count three discrete pulses, read its output with LD and reset the count.

## Facts

- Module: [3](../modules/module-3.md)
- Level: Foundation
- Estimated time: 15 minutes
- Languages: IL
- Tracks: Simulation, Hardware
- Reading page: yes
- Plant: none
- Prerequisites: [edge-counter-pulses](./edge-counter-pulses.md), [boolean-logic-two-hand-guard-il](./boolean-logic-two-hand-guard-il.md)

## Objectives

- Call a CTU instance with CAL on every scan, passing its inputs, and read its output after the call.
- Count the rising edges of PulseInput up to a preset of 3, and clear the count with Reset.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Passing means your program behaved correctly in the simulator on this computer. It says nothing about a real machine, its timing or its safety, and it does not show how a real sensor bounces or what a real input does with a pulse shorter than a scan.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/edge-counter-pulses-il.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/edge-counter-pulses-il.md)

{/* <<< END GENERATED: learn/lessons/edge-counter-pulses-il <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
