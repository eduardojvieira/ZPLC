---
title: "The same with numeric positions"
sidebar_label: "plant-assembler-numeric"
description: "The lesson plant-assembler-numeric: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# The same with numeric positions

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-assembler-numeric. Do not edit. >>> */}

Command a two-axis assembler with numeric setpoints in centimetres and a position tolerance instead of limit switches.

## Facts

- Module: [15](../modules/module-15.md)
- Level: Advanced
- Estimated time: 40 minutes
- Languages: ST
- Tracks: Simulation
- Reading page: no
- Plant: none
- Prerequisites: [plant-assembler](./plant-assembler.md)

## Objectives

- Send an axis to a named position with a setpoint and read its position back.
- Decide that a move is done when the position is within a tolerance of the setpoint, not when it is equal to it.

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

The program commands a carriage with real-valued positions in centimetres and reads them back; a learner board has no axis to command, and the scene supplies one. Complete it in Simulation, where the scene and its boxes are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-assembler-numeric <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
