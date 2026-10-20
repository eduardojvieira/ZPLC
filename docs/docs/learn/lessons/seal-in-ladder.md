---
title: "Seal-in in Ladder: a motor that holds itself on"
sidebar_label: "seal-in-ladder"
description: "The lesson seal-in-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Seal-in in Ladder: a motor that holds itself on

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/seal-in-ladder. Do not edit. >>> */}

Edit a Ladder rung so that a Start press keeps the motor on after the button is released, and a Stop press drops it even while Start is still pressed.

## Facts

- Module: [2](../modules/module-2.md)
- Level: Foundation
- Estimated time: 20 minutes
- Languages: LD
- Tracks: Simulation, Hardware
- Plant: none
- Prerequisites: [boolean-logic-two-hand-guard](./boolean-logic-two-hand-guard.md)

## Objectives

- Read a Ladder rung as a path of contacts that must all pass power to reach a coil.
- Hold a coil on with a contact of its own output in parallel with Start, and keep Stop in series so that Stop wins.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish a safe stop function, wiring, hardware timing, HIL, or certification.

## Wiring

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/seal-in-ladder.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/seal-in-ladder.md)

{/* <<< END GENERATED: learn/lessons/seal-in-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
