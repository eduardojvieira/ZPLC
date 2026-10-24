---
title: "Instruction List: calling a function block and reading its outputs"
sidebar_label: "function-block-call-il"
description: "The lesson function-block-call-il: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Instruction List: calling a function block and reading its outputs

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/function-block-call-il. Do not edit. >>> */}

Call two instances of the same function block with CAL, pass their inputs by name, and read each output with LD Instance.Output.

## Facts

- Module: [7](../modules/module-7.md)
- Level: Intermediate
- Estimated time: 25 minutes
- Languages: IL
- Tracks: Simulation, Hardware
- Plant: none
- Prerequisites: [function-block-pump-pair](./function-block-pump-pair.md), [boolean-logic-two-hand-guard-il](./boolean-logic-two-hand-guard-il.md)

## Objectives

- Call a function block instance with CAL, passing its inputs by name, and read its output with LD Instance.Output.
- See that two instances of the same function block keep separate memories.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish pump behaviour, start-up current or any real machine requirement, HIL, or certification.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/function-block-call-il.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/function-block-call-il.md)

{/* <<< END GENERATED: learn/lessons/function-block-call-il <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
