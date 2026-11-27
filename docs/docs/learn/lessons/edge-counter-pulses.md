---
title: "Edges and pulse counter"
sidebar_label: "edge-counter-pulses"
description: "The lesson edge-counter-pulses: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Edges and pulse counter

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/edge-counter-pulses. Do not edit. >>> */}

Use a CTU counter to count three discrete pulses and reset the count.

## Facts

- Module: [3](../modules/module-3.md)
- Level: Foundation
- Estimated time: 15 minutes
- Languages: ST
- Tracks: Simulation, Hardware
- Reading page: yes
- Plant: none
- Prerequisites: [timers-on-delay-off-delay](./timers-on-delay-off-delay.md)

## Objectives

- Count the rising edges of an input with a counter instance called on every scan, so that a long pulse counts once.
- Turn an output on when the count reaches its preset, and clear the count with a reset input.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Passing means your program behaved correctly in the simulator on this computer. It says nothing about a real machine, its timing or its safety, and it does not show how a real sensor bounces or what a real input does with a pulse shorter than a scan.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/edge-counter-pulses.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/edge-counter-pulses.md)

{/* <<< END GENERATED: learn/lessons/edge-counter-pulses <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
