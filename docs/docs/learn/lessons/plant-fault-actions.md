---
title: "Find the fault"
sidebar_label: "plant-fault-actions"
description: "The lesson plant-fault-actions: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Find the fault

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-fault-actions. Do not edit. >>> */}

Diagnose a beam that sticks on while the line is sorting: compare its signal with how long a box can really break it, and stop the line before it misroutes a box.

## Facts

- Module: [18](../modules/module-18.md)
- Level: Advanced
- Estimated time: 45 minutes
- Languages: ST
- Tracks: Simulation
- Reading page: no
- Plant: [Height sorting with a chain transfer](../../plant/scenes/height-sorting-chain.md)
- Prerequisites: [plant-height-chain](./plant-height-chain.md)

## Objectives

- Diagnose a stuck sensor from a fact the program can read, not from the sensor itself.
- Choose a safe reaction: stop what brings new boxes and let the boxes already moving arrive.

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

The lesson triggers a stuck sensor on a simulated plant with a chain transfer and three bins; a learner board has no such plant, and the scene supplies it together with the fault action. Complete it in Simulation, where the scene and its items are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-fault-actions <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
