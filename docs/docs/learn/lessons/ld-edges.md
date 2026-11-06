---
title: "Edges in Ladder: P and N contacts and one-scan pulses"
sidebar_label: "ld-edges"
description: "The lesson ld-edges: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Edges in Ladder: P and N contacts and one-scan pulses

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-edges. Do not edit. >>> */}

Use a positive transition contact and a negative transition contact so that a box on a conveyor gives one pulse when it arrives and one when it leaves, however long the sensor stays on.

## Facts

- Module: [3](../modules/module-3.md)
- Level: Foundation
- Estimated time: 15 minutes
- Languages: LD
- Tracks: Simulation
- Plant: none
- Prerequisites: [set-reset-alarm-latch-ladder](./set-reset-alarm-latch-ladder.md)

## Objectives

- Use a positive transition contact (P) and a negative transition contact (N) to turn a level into a pulse of one scan.
- Explain why a held input must be counted once, and which scan sees the pulse.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish the debounce, the response time or the wiring of a real sensor, HIL, or certification.

## On a board

The box sensor and its pulses are graded in the native simulator, and this lesson ships no wiring for the learner boards. Complete it in Simulation, which gives the same result each time and needs no board.

{/* <<< END GENERATED: learn/lessons/ld-edges <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
