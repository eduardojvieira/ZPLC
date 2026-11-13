---
title: "Load and unload three boxes in Ladder"
sidebar_label: "plant-counted-queue-ladder"
description: "The lesson plant-counted-queue-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Load and unload three boxes in Ladder

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-counted-queue-ladder. Do not edit. >>> */}

Count boxes with two CTU blocks to run a fixed batch: load three, unload three, then light Done.

## Facts

- Module: [12](../modules/module-12.md)
- Level: Advanced
- Estimated time: 30 minutes
- Languages: LD
- Tracks: Simulation
- Reading page: no
- Plant: [Counted queue](../../plant/scenes/counted-queue.md)
- Prerequisites: [plant-latch-two-sensors](./plant-latch-two-sensors.md), [edge-counter-pulses](./edge-counter-pulses.md)

## Objectives

- Count items with a counter that has a preset value.
- Use one counter to stop loading and another to know the batch is finished.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests give deterministic native POSIX host evidence on a simulated plant scene; they are not physical, hardware, HIL, or certification evidence.

## On a board

The two CTU blocks of this lesson count boxes that a simulated emitter and belt supply; a learner board has no boxes to pass the sensor contacts, so the counts could never reach their presets. Complete it in Simulation, where the scene and its boxes are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-counted-queue-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
