---
title: "Pedestrian crossing and safe states"
sidebar_label: "pedestrian-crossing-states"
description: "The lesson pedestrian-crossing-states: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Pedestrian crossing and safe states

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/pedestrian-crossing-states. Do not edit. >>> */}

Walk through pedestrian-crossing states with mutually consistent vehicle and pedestrian outputs.

## Facts

- Module: [5](../modules/module-5.md)
- Level: Intermediate
- Estimated time: 25 minutes
- Languages: ST
- Tracks: Simulation
- Plant: [`pedestrian-v1`](../plants.md)
- Prerequisites: [edge-counter-pulses](./edge-counter-pulses.md)

## Objectives

- Model the crossing as numbered states, each with an explicit output combination.
- Show WALK only while the vehicles are red.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide deterministic native POSIX host evidence only; they are not physical crossing, hardware, HIL, or certification evidence.

## On a board

The crossing drives five lamps, and the learner boards have four LED outputs; its pedestrian requests come from the simulated crossing plant. Complete it in Simulation, which models the crossing and gives the same result each time.

{/* <<< END GENERATED: learn/lessons/pedestrian-crossing-states <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
