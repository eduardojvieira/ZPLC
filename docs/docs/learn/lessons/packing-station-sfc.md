---
title: "Capstone: a packing station as a chart"
sidebar_label: "packing-station-sfc"
description: "The lesson packing-station-sfc: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Capstone: a packing station as a chart

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/packing-station-sfc. Do not edit. >>> */}

Build a packing station as a Sequential Function Chart from a written description, with a seal-in belt, a count of three parts, an emergency stop and a latched fault, and prove it with a scenario that also checks what must not happen.

## Facts

- Module: [11](../modules/module-11.md)
- Level: Advanced
- Estimated time: 60 minutes
- Languages: SFC
- Tracks: Simulation
- Plant: none
- Prerequisites: [capstone-packing-station](./capstone-packing-station.md), [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md)

## Objectives

- Turn five written requirements into a chart of steps, transitions and actions, and decide which behaviour is a step and which is a transition.
- Read a scenario that checks both what must happen and what must not happen, and use its failed assertions to find the requirement you missed.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish packing-line requirements, safety function behaviour, sensor timing or any real machine behaviour, HIL, or certification.

## On a board

The chart reads five digital inputs (Start, Stop, EStop, Part and Reset) where the learner boards have four. Complete it in Simulation: its grade is the same each time and needs no board.

{/* <<< END GENERATED: learn/lessons/packing-station-sfc <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
