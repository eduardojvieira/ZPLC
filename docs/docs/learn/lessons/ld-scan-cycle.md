---
title: "The scan cycle: why the order of the rungs matters"
sidebar_label: "ld-scan-cycle"
description: "The lesson ld-scan-cycle: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# The scan cycle: why the order of the rungs matters

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-scan-cycle. Do not edit. >>> */}

Learn that a PLC reads its inputs, solves the rungs from top to bottom and then writes its outputs, and fix a program whose lamp follows the button one scan too late.

## Facts

- Module: [1](../modules/module-1.md)
- Level: Foundation
- Estimated time: 15 minutes
- Languages: LD
- Tracks: Simulation
- Reading page: yes
- Plant: none
- Prerequisites: [ld-what-is-a-plc](./ld-what-is-a-plc.md)

## Objectives

- Describe the scan cycle: read the inputs, solve the rungs from top to bottom, write the outputs, and repeat.
- Reorder two rungs so that a value is calculated before the rung that uses it, and see the difference of one scan in the recorded trace.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide deterministic native POSIX host evidence with a 10 ms task on your computer only; they are not hardware, timing-on-a-board, HIL, or safety evidence.

## On a board

The order of the rungs is graded scan by scan, and a board cannot show a one-scan difference without instruments; the simulation records every scan. Complete it in Simulation, where every scan is recorded and the result is the same each time.

{/* <<< END GENERATED: learn/lessons/ld-scan-cycle <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
