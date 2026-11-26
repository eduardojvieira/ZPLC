---
title: "Latching an alarm: set and reset, and which one wins"
sidebar_label: "set-reset-alarm-latch"
description: "The lesson set-reset-alarm-latch: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Latching an alarm: set and reset, and which one wins

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/set-reset-alarm-latch. Do not edit. >>> */}

Keep a fault in memory with the SR and RS blocks and see what each one does when the fault and the acknowledge arrive together.

## Facts

- Module: [2](../modules/module-2.md)
- Level: Foundation
- Estimated time: 15 minutes
- Languages: ST
- Tracks: Simulation, Hardware
- Reading page: yes
- Plant: none
- Prerequisites: [seal-in-ladder](./seal-in-ladder.md)

## Objectives

- Hold an alarm after the fault has gone, until it is acknowledged.
- Tell the set-dominant block SR from the reset-dominant block RS.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Passing means your program behaved correctly in the simulator on this computer. It says nothing about a real machine, its timing or its safety, and it does not show alarm handling requirements of a real machine.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/set-reset-alarm-latch.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/set-reset-alarm-latch.md)

{/* <<< END GENERATED: learn/lessons/set-reset-alarm-latch <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
