---
title: "Instruction List: S and R, and the line that comes last"
sidebar_label: "set-reset-alarm-latch-il"
description: "The lesson set-reset-alarm-latch-il: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Instruction List: S and R, and the line that comes last

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/set-reset-alarm-latch-il. Do not edit. >>> */}

Keep a fault in memory with the S and R instructions and see that, when the fault and the acknowledge arrive together, the instruction written last decides which one wins.

## Facts

- Module: [2](../modules/module-2.md)
- Level: Foundation
- Estimated time: 15 minutes
- Languages: IL
- Tracks: Simulation, Hardware
- Plant: none
- Prerequisites: [set-reset-alarm-latch](./set-reset-alarm-latch.md), [boolean-logic-two-hand-guard-il](./boolean-logic-two-hand-guard-il.md)

## Objectives

- Hold an alarm after the fault has gone, until it is acknowledged, with the IL instructions S and R.
- Use the order of two lines to decide whether set or reset wins, and tell it from the SR and RS blocks.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish alarm handling requirements of a real machine, HIL, or certification.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/set-reset-alarm-latch-il.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/set-reset-alarm-latch-il.md)

{/* <<< END GENERATED: learn/lessons/set-reset-alarm-latch-il <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
