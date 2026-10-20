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
- Plant: none
- Prerequisites: [scan-cycle-one-scan-memory](./scan-cycle-one-scan-memory.md)

## Objectives

- Read a two-timer Ladder oscillator: each timer runs in one half period and starts the next.
- Complete it with a SET coil and a RESET coil driven by the timers' Q outputs.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence only; they are not physical LED, hardware timing, HIL, or certification evidence.

{/* <<< END GENERATED: learn/lessons/blinky-ladder-timer-feedback <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
