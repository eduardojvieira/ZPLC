---
title: "Timers: an off-delay light and an on-delay filter"
sidebar_label: "timers-on-delay-off-delay"
description: "The lesson timers-on-delay-off-delay: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Timers: an off-delay light and an on-delay filter

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/timers-on-delay-off-delay. Do not edit. >>> */}

Use a TOF timer to keep a light on after a button is released, and a TON timer to ignore a sensor blip that is too short.

## Facts

- Module: [3](../modules/module-3.md)
- Level: Foundation
- Estimated time: 15 minutes
- Languages: ST
- Tracks: Simulation, Hardware
- Reading page: yes
- Plant: none
- Prerequisites: [motor-start-stop-safe](./motor-start-stop-safe.md)

## Objectives

- Keep an output on for a fixed time after its input drops, with a TOF instance called on every scan.
- Ignore an input that is on for less than a fixed time, with a TON instance.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Passing means your program behaved correctly in the simulator on this computer. It says nothing about a real machine, its timing or its safety, and it does not show how a real button bounces or how fast a real sensor answers.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/timers-on-delay-off-delay.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/timers-on-delay-off-delay.md)

{/* <<< END GENERATED: learn/lessons/timers-on-delay-off-delay <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
