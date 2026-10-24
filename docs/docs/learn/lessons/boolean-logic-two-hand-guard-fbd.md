---
title: "Function Block Diagram: a two-hand control with a guard"
sidebar_label: "boolean-logic-two-hand-guard-fbd"
description: "The lesson boolean-logic-two-hand-guard-fbd: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Function Block Diagram: a two-hand control with a guard

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/boolean-logic-two-hand-guard-fbd. Do not edit. >>> */}

Read a Function Block Diagram and wire AND, NOT and XOR blocks so a press can only be enabled when both hands are on the buttons and the guard is closed.

## Facts

- Module: [2](../modules/module-2.md)
- Level: Foundation
- Estimated time: 20 minutes
- Languages: FBD
- Tracks: Simulation, Hardware
- Plant: none
- Prerequisites: [boolean-logic-two-hand-guard](./boolean-logic-two-hand-guard.md)

## Objectives

- Read a Function Block Diagram: blocks are joined by wires from an output port to an input port, and each output shows the result of the blocks wired to it.
- Wire AND, NOT and XOR blocks so that an output is ON only when several inputs are ON together, when one input is OFF, or when exactly one of two inputs is ON.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish the response time, redundancy or fault behaviour a real two-hand safety device needs, and they are not safety, HIL, or certification evidence.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/boolean-logic-two-hand-guard-fbd.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/boolean-logic-two-hand-guard-fbd.md)

{/* <<< END GENERATED: learn/lessons/boolean-logic-two-hand-guard-fbd <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
