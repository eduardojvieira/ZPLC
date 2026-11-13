---
title: "Merge two lines in Ladder"
sidebar_label: "plant-merge-lines-ladder"
description: "The lesson plant-merge-lines-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Merge two lines in Ladder

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-merge-lines-ladder. Do not edit. >>> */}

Arbitrate two feeders that share one outfeed with latch rungs: give line A priority, let one box through at a time and interlock the two blades.

## Facts

- Module: [14](../modules/module-14.md)
- Level: Advanced
- Estimated time: 45 minutes
- Languages: LD
- Tracks: Simulation
- Reading page: no
- Plant: [Merge two lines](../../plant/scenes/merge-lines.md)
- Prerequisites: [plant-counted-queue](./plant-counted-queue.md), [interlock-guard-permissive](./interlock-guard-permissive.md)

## Objectives

- Arbitrate two requests with a priority: line A wins when both lines wait.
- Interlock two outputs so they are never active together, and release the grant only when the box has cleared the merge.

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

The grant latches and interlocked coils of this lesson arbitrate boxes that two simulated feeders deliver to one merge zone; a learner board has no feeders, blades or boxes for the contacts to arbitrate. Complete it in Simulation, where the scene and its boxes are part of the scenario.

{/* <<< END GENERATED: learn/lessons/plant-merge-lines-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
