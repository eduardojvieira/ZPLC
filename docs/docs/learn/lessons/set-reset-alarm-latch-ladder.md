---
title: "Latching an alarm in Ladder: SET and RESET coils, and the order of the rungs"
sidebar_label: "set-reset-alarm-latch-ladder"
description: "The lesson set-reset-alarm-latch-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Latching an alarm in Ladder: SET and RESET coils, and the order of the rungs

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/set-reset-alarm-latch-ladder. Do not edit. >>> */}

Hold a fault in memory with SET and RESET coils, and see that in Ladder the rung that comes last decides which one wins.

## Facts

- Module: [2](../modules/module-2.md)
- Level: Foundation
- Estimated time: 20 minutes
- Languages: LD
- Tracks: Simulation, Hardware
- Reading page: yes
- Plant: none
- Prerequisites: [set-reset-alarm-latch](./set-reset-alarm-latch.md), [blinky-ladder-timer-feedback](./blinky-ladder-timer-feedback.md)

## Objectives

- Hold an alarm after the fault has gone with a SET coil, and clear it only with a RESET coil.
- Give two outputs opposite priorities between set and reset, and check the scan in which both arrive together.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Passing means your program behaved correctly in the simulator on this computer. It says nothing about a real machine, its timing or its safety, and it does not show how a real plant must handle and acknowledge its alarms.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/set-reset-alarm-latch-ladder.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/set-reset-alarm-latch-ladder.md)

{/* <<< END GENERATED: learn/lessons/set-reset-alarm-latch-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
