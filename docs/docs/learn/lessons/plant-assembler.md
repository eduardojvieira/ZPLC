---
title: "Assemble lids and bases"
sidebar_label: "plant-assembler"
description: "The lesson plant-assembler: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Assemble lids and bases

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-assembler. Do not edit. >>> */}

Model a two-axis assembler as a chart: take a lid from one belt, set it on a base on another belt, and repeat three times.

## Facts

- Module: [15](../modules/module-15.md)
- Level: Advanced
- Estimated time: 50 minutes
- Languages: SFC
- Tracks: Simulation
- Reading page: no
- Plant: none
- Prerequisites: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md), [plant-belt-transfer](./plant-belt-transfer.md)

## Objectives

- Coordinate two axes and a vacuum pad in one sequence, with one step for each move.
- Choose between two next steps with transition conditions that exclude each other.

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

The chart reads eight inputs and drives fourteen outputs, with a vacuum pad and three belts; the learner boards have four inputs, and the pad and the parts exist only in the simulated scene. Complete it in Simulation, where the scene and its boxes are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-assembler <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
