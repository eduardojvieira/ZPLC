---
title: "Pick from one belt, place on another in Ladder"
sidebar_label: "plant-belt-transfer-ladder"
description: "The lesson plant-belt-transfer-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Pick from one belt, place on another in Ladder

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-belt-transfer-ladder. Do not edit. >>> */}

Sequence a clamp carriage with limit sensors and a grip feedback to move four boxes from an infeed belt to an outfeed belt.

## Facts

- Module: [15](../modules/module-15.md)
- Level: Advanced
- Estimated time: 40 minutes
- Languages: LD
- Tracks: Simulation
- Reading page: yes
- Plant: [Transfer between belts](../../plant/scenes/belt-to-belt-transfer.md)
- Prerequisites: [plant-counted-queue](./plant-counted-queue.md)

## Objectives

- Sequence a pick and place so that each move starts only when the previous one is complete.
- Lift a box only when the clamp reports that it holds it, and put each box down without disturbing it.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Passing means your program behaved correctly in the simulator on this computer. It says nothing about a real machine, its timing or its safety.

## On a board

This ladder drives a two-axis carriage with a clamp, a stop blade and two belts that exist only in the scene; a learner board has none of that hardware, so the Ladder version runs in Simulation only. Complete it in Simulation, where the scene and its boxes are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-belt-transfer-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
