---
title: "Selection branches: one path out of two"
sidebar_label: "selection-branches-sfc"
description: "The lesson selection-branches-sfc: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Selection branches: one path out of two

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/selection-branches-sfc. Do not edit. >>> */}

Send a part to the small or to the large bay with two transitions that leave the same step, and let their priority decide which one fires.

## Facts

- Module: [5](../modules/module-5.md)
- Level: Intermediate
- Estimated time: 25 minutes
- Languages: SFC
- Tracks: Simulation
- Plant: none
- Prerequisites: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md)

## Objectives

- Read a selection divergence as several transitions that leave one step, of which at most one fires.
- Use the priority of a transition to decide which branch wins when more than one condition holds.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish part sizing, gate timing on real equipment, HIL, or certification.

## On a board

The part router reads a part-ready button and a size signal and drives two gates; its sequence is graded in the native simulator, and this lesson ships no wiring for the learner boards. Complete it in Simulation, which gives the same result each time and needs no board.

{/* <<< END GENERATED: learn/lessons/selection-branches-sfc <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
