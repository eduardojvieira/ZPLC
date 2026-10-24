---
title: "Step times: a horn before the gate opens"
sidebar_label: "step-times-sfc"
description: "The lesson step-times-sfc: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Step times: a horn before the gate opens

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/step-times-sfc. Do not edit. >>> */}

Use the time a step has been active in a transition, so that a horn sounds for a fixed time before the gate motor runs for another.

## Facts

- Module: [5](../modules/module-5.md)
- Level: Intermediate
- Estimated time: 20 minutes
- Languages: SFC
- Tracks: Simulation
- Plant: none
- Prerequisites: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md)

## Objectives

- Use the elapsed time of a step, written step.T, as the condition of a transition.
- Check that the time of a step restarts at zero each time the step becomes active, so that two cycles take the same time.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish warning times required for a real gate, safety function behaviour, HIL, or certification.

## On a board

The gate warning sounds a horn and runs a gate motor from one button; its step times are graded in the native simulator, and this lesson ships no wiring for the learner boards. Complete it in Simulation, which gives the same result each time and needs no board.

{/* <<< END GENERATED: learn/lessons/step-times-sfc <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
