---
title: "From sensor A to sensor B in Ladder"
sidebar_label: "plant-latch-two-sensors-ladder"
description: "The lesson plant-latch-two-sensors-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# From sensor A to sensor B in Ladder

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-latch-two-sensors-ladder. Do not edit. >>> */}

Sequence a move with a set coil and a reset coil: run the belt from sensor A until the box reaches sensor B.

## Facts

- Module: [12](../modules/module-12.md)
- Level: Advanced
- Estimated time: 20 minutes
- Languages: LD
- Tracks: Simulation
- Reading page: no
- Plant: [Latch between two sensors](../../plant/scenes/latch-two-sensors.md)
- Prerequisites: [plant-belt-to-sensor](./plant-belt-to-sensor.md)

## Objectives

- Use a set and a reset to hold an output between two events.
- Explain why a sensor that goes dark cannot hold the output by itself.

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

The set and reset coils of this lesson hold a belt between two sensors that exist only in the simulated scene; a learner board has no belt to carry a box from the first contact to the second. Complete it in Simulation, where the scene and its boxes are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-latch-two-sensors-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
