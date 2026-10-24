---
title: "Instruction List: calling an off-delay and an on-delay timer"
sidebar_label: "timers-on-delay-off-delay-il"
description: "The lesson timers-on-delay-off-delay-il: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Instruction List: calling an off-delay and an on-delay timer

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/timers-on-delay-off-delay-il. Do not edit. >>> */}

Call a TOF timer with CAL to keep a light on after a button is released, and a TON timer to ignore a sensor blip that is too short, then read each timer output with LD.

## Facts

- Module: [3](../modules/module-3.md)
- Level: Foundation
- Estimated time: 15 minutes
- Languages: IL
- Tracks: Simulation, Hardware
- Plant: none
- Prerequisites: [timers-on-delay-off-delay](./timers-on-delay-off-delay.md), [boolean-logic-two-hand-guard-il](./boolean-logic-two-hand-guard-il.md)

## Objectives

- Call a timer instance with CAL, passing its input and its preset, and read its output with LD.
- Keep an output on for a fixed time after its input drops, using TOF, and ignore an input that is on for less than a fixed time, using TON.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish electrical debounce, sensor response or target timing, HIL, or certification.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/timers-on-delay-off-delay-il.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/timers-on-delay-off-delay-il.md)

{/* <<< END GENERATED: learn/lessons/timers-on-delay-off-delay-il <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
