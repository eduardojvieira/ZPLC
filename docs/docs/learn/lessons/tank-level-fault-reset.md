---
title: "Tank level, faults, and reset"
sidebar_label: "tank-level-fault-reset"
description: "The lesson tank-level-fault-reset: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Tank level, faults, and reset

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/tank-level-fault-reset. Do not edit. >>> */}

Walk through level control and the fault and reset latches in the Tank Level example.

## Facts

- Module: [6](../modules/module-6.md)
- Level: Intermediate
- Estimated time: 25 minutes
- Languages: ST
- Tracks: Simulation
- Plant: [`tank-v1`](../plants.md)
- Prerequisites: [motor-plant-feedback](./motor-plant-feedback.md)

## Objectives

- Keep the pump on from LevelLow until LevelHigh with a latch.
- Latch the alarm on PumpFault or EStop and release it only with a fresh Reset after the fault has cleared.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide deterministic native POSIX host evidence only; they are not physical-process, hardware, HIL, or certification evidence.

## On a board

The lesson fills and empties a simulated tank to provoke faults, which would be unsafe and slow to repeat on a board. Complete it in Simulation, where a fault costs nothing and can be repeated, and rehearse the reset steps there.

{/* <<< END GENERATED: learn/lessons/tank-level-fault-reset <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
