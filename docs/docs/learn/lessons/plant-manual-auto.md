---
title: "Manual and automatic modes"
sidebar_label: "plant-manual-auto"
description: "The lesson plant-manual-auto: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Manual and automatic modes

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-manual-auto. Do not edit. >>> */}

Add a mode to the two-axis assembly: jog the pad by hand in manual, run the assembly cycle in automatic, and never let one leak into the other.

## Facts

- Module: [18](../modules/module-18.md)
- Level: Advanced
- Estimated time: 45 minutes
- Languages: ST
- Tracks: Simulation
- Reading page: no
- Plant: [Two-axis assembly](../../plant/scenes/two-axis-assembly.md)
- Prerequisites: [plant-assembler](./plant-assembler.md), [plant-estop-interlocks](./plant-estop-interlocks.md)

## Objectives

- Keep the mode in a memory that one press of ModeBtn switches, and let the machine power up in manual.
- Move the pad with the jog buttons only in manual, never past a limit switch, and start the cycle with Start only in automatic.

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

The lesson needs a two-axis pad with limit switches, a vacuum grip and five panel buttons; a learner board has four inputs, no pad and no panel, and the scene supplies all of them. Complete it in Simulation, where the scene and its boxes are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-manual-auto <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
