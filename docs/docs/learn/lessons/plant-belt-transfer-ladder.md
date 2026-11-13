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
- Reading page: no
- Plant: none
- Prerequisites: [plant-counted-queue](./plant-counted-queue.md)

## Objectives

- Sequence a pick and place with one state per move, each move waiting for its limit sensor.
- Wait for the grip feedback before lifting, and keep the receiving belt still while a box is put down.

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

This ladder drives a two-axis carriage with a clamp, a stop blade and two belts that exist only in the scene; a learner board has none of that hardware, so the Ladder version runs in Simulation only. Complete it in Simulation, where the scene and its boxes are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-belt-transfer-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
