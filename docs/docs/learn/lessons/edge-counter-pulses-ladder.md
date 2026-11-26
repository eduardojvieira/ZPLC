---
title: "Counting pulses in Ladder: a CTU counts the edges itself"
sidebar_label: "edge-counter-pulses-ladder"
description: "The lesson edge-counter-pulses-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Counting pulses in Ladder: a CTU counts the edges itself

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/edge-counter-pulses-ladder. Do not edit. >>> */}

Place a CTU in a rung so that CountReached turns on at the third rising edge of a pulse input and Reset clears the count.

## Facts

- Module: [3](../modules/module-3.md)
- Level: Foundation
- Estimated time: 20 minutes
- Languages: LD
- Tracks: Simulation, Hardware
- Reading page: yes
- Plant: none
- Prerequisites: [edge-counter-pulses](./edge-counter-pulses.md), [blinky-ladder-timer-feedback](./blinky-ladder-timer-feedback.md)

## Objectives

- Place a counter block in a rung and set its preset and its reset.
- Explain that a counter adds one on the rising edge of its input, not on every scan in which the input is high.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Passing means your program behaved correctly in the simulator on this computer. It says nothing about a real machine, its timing or its safety, and it does not show how a real sensor bounces, how many pulses a real input misses or how it is wired.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/edge-counter-pulses-ladder.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/edge-counter-pulses-ladder.md)

{/* <<< END GENERATED: learn/lessons/edge-counter-pulses-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
