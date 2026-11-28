---
title: "TON oscillator and output feedback"
sidebar_label: "blinky-ladder-timer-feedback"
description: "The lesson blinky-ladder-timer-feedback: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# TON oscillator and output feedback

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/blinky-ladder-timer-feedback. Do not edit. >>> */}

Complete a 500 ms Ladder blinker made of two TON timers and SET and RESET coils, and check its on and off times with FOR and AT assertions.

## Facts

- Module: [1](../modules/module-1.md)
- Level: Foundation
- Estimated time: 20 minutes
- Languages: LD
- Tracks: Simulation, Hardware
- Reading page: yes
- Plant: none
- Prerequisites: [scan-cycle-one-scan-memory](./scan-cycle-one-scan-memory.md)

## Objectives

- Read a two-timer Ladder oscillator: each timer runs in one half period and starts the next.
- Make the output change state by itself, from the time that each timer measures.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Passing means your program behaved correctly in the simulator on this computer. It says nothing about a real machine, its timing or its safety, and it does not show how bright a real lamp is or how exactly a real controller keeps the period.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/blinky-ladder-timer-feedback.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/blinky-ladder-timer-feedback.md)

{/* <<< END GENERATED: learn/lessons/blinky-ladder-timer-feedback <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
