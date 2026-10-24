---
title: "Pedestrian crossing as a chart"
sidebar_label: "pedestrian-crossing-sfc"
description: "The lesson pedestrian-crossing-sfc: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Pedestrian crossing as a chart

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/pedestrian-crossing-sfc. Do not edit. >>> */}

Draw the pedestrian crossing as a Sequential Function Chart with one step per light combination, and check that WALK shows only while the vehicles are red.

## Facts

- Module: [5](../modules/module-5.md)
- Level: Intermediate
- Estimated time: 25 minutes
- Languages: SFC
- Tracks: Simulation
- Plant: [`pedestrian-v1`](../plants.md)
- Prerequisites: [pedestrian-crossing-states](./pedestrian-crossing-states.md), [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md)

## Objectives

- Turn the phases of a pedestrian crossing into the steps of a chart, each with an action that sets every light.
- Leave the green step with a transition on the plant's request and move through the other phases with timed transitions.

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

The chart drives five lamps and the learner boards have four LED outputs; its pedestrian requests come from the simulated crossing plant. Complete it in Simulation, which models the crossing and gives the same result each time.

{/* <<< END GENERATED: learn/lessons/pedestrian-crossing-sfc <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
