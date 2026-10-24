---
title: "On-delay and off-delay in Ladder: timers as blocks in a rung"
sidebar_label: "timers-on-delay-off-delay-ladder"
description: "The lesson timers-on-delay-off-delay-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# On-delay and off-delay in Ladder: timers as blocks in a rung

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/timers-on-delay-off-delay-ladder. Do not edit. >>> */}

Place a TOF and a TON between a contact and a coil, and see that an off-delay keeps a light on after the button and an on-delay ignores a sensor that does not stay on.

## Facts

- Module: [3](../modules/module-3.md)
- Level: Foundation
- Estimated time: 20 minutes
- Languages: LD
- Tracks: Simulation, Hardware
- Plant: none
- Prerequisites: [timers-on-delay-off-delay](./timers-on-delay-off-delay.md), [blinky-ladder-timer-feedback](./blinky-ladder-timer-feedback.md)

## Objectives

- Place a timer function block in a rung, with the contact feeding its IN and its output feeding the coil.
- Tell an off-delay (TOF) from an on-delay (TON) by what each does when the input rises and falls.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish real sensor filtering requirements, wiring, hardware timing, HIL, or certification.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/timers-on-delay-off-delay-ladder.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/timers-on-delay-off-delay-ladder.md)

{/* <<< END GENERATED: learn/lessons/timers-on-delay-off-delay-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
