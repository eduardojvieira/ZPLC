---
title: "Timers in Function Block Diagram: an off-delay light and an on-delay filter"
sidebar_label: "timers-on-delay-off-delay-fbd"
description: "The lesson timers-on-delay-off-delay-fbd: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Timers in Function Block Diagram: an off-delay light and an on-delay filter

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/timers-on-delay-off-delay-fbd. Do not edit. >>> */}

Wire a TOF block to keep a light on after a button is released, and a TON block to ignore a sensor blip that is too short.

## Facts

- Module: [3](../modules/module-3.md)
- Level: Foundation
- Estimated time: 20 minutes
- Languages: FBD
- Tracks: Simulation, Hardware
- Plant: none
- Prerequisites: [timers-on-delay-off-delay](./timers-on-delay-off-delay.md), [boolean-logic-two-hand-guard-fbd](./boolean-logic-two-hand-guard-fbd.md)

## Objectives

- Keep an output ON for a fixed time after its input drops, with a TOF block whose PT input is wired to a TIME constant.
- Ignore an input that is ON for less than a fixed time, with a TON block, and say which timer delays the start and which one delays the end.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish electrical debounce, sensor response, target timing, HIL, or certification.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/timers-on-delay-off-delay-fbd.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/timers-on-delay-off-delay-fbd.md)

{/* <<< END GENERATED: learn/lessons/timers-on-delay-off-delay-fbd <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
