---
title: "Instruction List: arithmetic, comparison and a jump on a rising edge"
sidebar_label: "types-arithmetic-comparison-il"
description: "The lesson types-arithmetic-comparison-il: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Instruction List: arithmetic, comparison and a jump on a rising edge

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/types-arithmetic-comparison-il. Do not edit. >>> */}

Keep a running total in an INT variable, add to it on each press with ADD and a conditional jump, and turn it into three BOOL results with LT, EQ and GT.

## Facts

- Module: [4](../modules/module-4.md)
- Level: Intermediate
- Estimated time: 20 minutes
- Languages: IL
- Tracks: Simulation, Hardware
- Plant: none
- Prerequisites: [types-arithmetic-comparison](./types-arithmetic-comparison.md), [edge-counter-pulses-il](./edge-counter-pulses-il.md)

## Objectives

- Use ADD on a number in the current result, and LT, EQ and GT to turn a number into a BOOL.
- Skip a group of lines with JMPCN so that a number changes only on the rising edge of an input.

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

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/types-arithmetic-comparison-il.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/types-arithmetic-comparison-il.md)

{/* <<< END GENERATED: learn/lessons/types-arithmetic-comparison-il <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
