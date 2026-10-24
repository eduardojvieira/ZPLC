---
title: "Types, arithmetic and comparison in Function Block Diagram: a total and three bands"
sidebar_label: "types-arithmetic-comparison-fbd"
description: "The lesson types-arithmetic-comparison-fbd: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Types, arithmetic and comparison in Function Block Diagram: a total and three bands

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/types-arithmetic-comparison-fbd. Do not edit. >>> */}

Keep a running total in an INT variable with ADD, SEL and R_TRIG blocks, and turn it into three BOOL results with comparison blocks.

## Facts

- Module: [4](../modules/module-4.md)
- Level: Intermediate
- Estimated time: 25 minutes
- Languages: FBD
- Tracks: Simulation, Hardware
- Plant: none
- Prerequisites: [types-arithmetic-comparison](./types-arithmetic-comparison.md), [boolean-logic-two-hand-guard-fbd](./boolean-logic-two-hand-guard-fbd.md)

## Objectives

- Use an INT variable for a number: an ADD block builds the next value, SEL blocks choose between the old total, the new one and zero, and LT, EQ and GT blocks turn the number into BOOL results.
- Add to a number only on the rising edge of an input, with an R_TRIG block, so that a button held for several scans counts once.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish the range of a real sensor or the overflow behaviour of a particular controller, HIL, or certification.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/types-arithmetic-comparison-fbd.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/types-arithmetic-comparison-fbd.md)

{/* <<< END GENERATED: learn/lessons/types-arithmetic-comparison-fbd <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
