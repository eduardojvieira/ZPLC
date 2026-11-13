---
title: "Accumulate and release"
sidebar_label: "plant-buffer-release"
description: "The lesson plant-buffer-release: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Accumulate and release

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-buffer-release. Do not edit. >>> */}

Model a buffer station as a state machine: load five boxes, hold them at a blade, and release one per button press.

## Facts

- Module: [14](../modules/module-14.md)
- Level: Advanced
- Estimated time: 45 minutes
- Languages: SFC
- Tracks: Simulation
- Reading page: no
- Plant: none
- Prerequisites: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md), [plant-counted-queue](./plant-counted-queue.md)

## Objectives

- Model a station as steps and transitions, one step for each thing the station does.
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

The chart reads five inputs where the learner boards have four, and the queue and its blade exist only in the simulated scene. Complete it in Simulation, where the scene and its boxes are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-buffer-release <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
