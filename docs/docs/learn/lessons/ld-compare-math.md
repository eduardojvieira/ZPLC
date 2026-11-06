---
title: "Comparison and math boxes in Ladder: a tank alarm and a safe division"
sidebar_label: "ld-compare-math"
description: "The lesson ld-compare-math: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Comparison and math boxes in Ladder: a tank alarm and a safe division

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-compare-math. Do not edit. >>> */}

Use comparison boxes as conditions and math boxes as calculations in Ladder, and guard a division so that a zero divisor can never reach it.

## Facts

- Module: [4](../modules/module-4.md)
- Level: Intermediate
- Estimated time: 25 minutes
- Languages: LD
- Tracks: Simulation
- Plant: none
- Prerequisites: [ld-variables-and-types](./ld-variables-and-types.md)

## Objectives

- Use a comparison box as a condition in series, and choose between GT and GE for a limit.
- Calculate with math boxes that run only while their rung has power, and guard a division with an NE comparison so that the divisor is never zero.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish the behavior of a real level sensor, its wiring, the timing of a real tank, HIL, or certification.

## On a board

The inlet and outlet valves and the lamps are graded in the native simulator, and this lesson ships no wiring for the learner boards. Complete it in Simulation, which gives the same result each time and needs no board.

{/* <<< END GENERATED: learn/lessons/ld-compare-math <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
