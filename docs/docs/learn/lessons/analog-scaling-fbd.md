---
title: "Analog scaling in Function Block Diagram: a high level alarm"
sidebar_label: "analog-scaling-fbd"
description: "The lesson analog-scaling-fbd: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Analog scaling in Function Block Diagram: a high level alarm

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/analog-scaling-fbd. Do not edit. >>> */}

Edit a Function Block Diagram that scales raw analog counts from 0 to 4095 into a level in percent with MUL, DIV and LIMIT blocks, and lights HighLevel at 75 percent.

## Facts

- Module: [4](../modules/module-4.md)
- Level: Intermediate
- Estimated time: 20 minutes
- Languages: FBD
- Tracks: Simulation, Hardware
- Plant: none
- Prerequisites: [analog-scaling-integer](./analog-scaling-integer.md), [counter-batch-fbd](./counter-batch-fbd.md)

## Objectives

- Scale raw analog counts to engineering units with arithmetic blocks: multiply by the span of the units, then divide by the span of the counts.
- Keep a scaled value inside its range with a LIMIT block, and compare the value in engineering units, not in raw counts, with a threshold.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task and a stand-in for the potentiometer; they do not establish the accuracy, noise or calibration of a real analog input, wiring, HIL, or certification.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/analog-scaling-fbd.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/analog-scaling-fbd.md)

{/* <<< END GENERATED: learn/lessons/analog-scaling-fbd <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
