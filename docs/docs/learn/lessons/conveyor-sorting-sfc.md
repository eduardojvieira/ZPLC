---
title: "Conveyor sorting as a chart"
sidebar_label: "conveyor-sorting-sfc"
description: "The lesson conveyor-sorting-sfc: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Conveyor sorting as a chart

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/conveyor-sorting-sfc. Do not edit. >>> */}

Describe a sorting conveyor as a chart of stopped, running and fault steps: sort metal parts while running, and lock the belt out when the plant reports a jam.

## Facts

- Module: [5](../modules/module-5.md)
- Level: Intermediate
- Estimated time: 30 minutes
- Languages: SFC
- Tracks: Simulation
- Plant: [`conveyor-v1`](../plants.md)
- Prerequisites: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md)

## Objectives

- Describe a conveyor as three steps, with the sorting memory kept in a local variable that the running action updates.
- Move from RUNNING to FAULT on the jam sensor, and leave FAULT only when Reset is pressed and the jam is gone.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide deterministic native POSIX host evidence only; they are not physical conveyor, jam clearance, hardware, HIL, or certification evidence.

## On a board

The chart reads seven inputs where the learner boards have four, and its parts and its jam come from the simulated conveyor plant. Complete it in Simulation, where the conveyor and the jam are part of the scenario.

{/* <<< END GENERATED: learn/lessons/conveyor-sorting-sfc <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
