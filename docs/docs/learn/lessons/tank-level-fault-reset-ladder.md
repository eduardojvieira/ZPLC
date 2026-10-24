---
title: "Tank level, faults and reset in Ladder: latches and the order of the rungs"
sidebar_label: "tank-level-fault-reset-ladder"
description: "The lesson tank-level-fault-reset-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Tank level, faults and reset in Ladder: latches and the order of the rungs

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/tank-level-fault-reset-ladder. Do not edit. >>> */}

Control a tank pump with a seal-in, latch a fault with SET and RESET coils, and clear it only with a fresh Reset, in a program that follows the plant level.

## Facts

- Module: [6](../modules/module-6.md)
- Level: Intermediate
- Estimated time: 30 minutes
- Languages: LD
- Tracks: Simulation
- Plant: [`tank-v1`](../plants.md)
- Prerequisites: [tank-level-fault-reset](./tank-level-fault-reset.md), [blinky-ladder-timer-feedback](./blinky-ladder-timer-feedback.md)

## Objectives

- Keep the pump on from LevelLow until LevelHigh with a seal-in, with every stop condition in series.
- Latch the alarm on PumpFault or EStop with a SET coil, and release it with a RESET coil that only a fresh Reset press can reach.

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

The level sensors and the pump fault of this Ladder program come from the tank plant, which exists only in simulation, and the program reads six inputs where the learner boards have four. Complete it in Simulation, where a fault costs nothing and can be repeated.

{/* <<< END GENERATED: learn/lessons/tank-level-fault-reset-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
