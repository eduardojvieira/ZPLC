---
title: "Latching an alarm: set and reset, and which one wins"
sidebar_label: "set-reset-alarm-latch"
description: "The lesson set-reset-alarm-latch: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Latching an alarm: set and reset, and which one wins

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/set-reset-alarm-latch. Do not edit. >>> */}

Keep a fault in memory with the SR and RS blocks and see what each one does when the fault and the acknowledge arrive together.

## Facts

- Module: [2](../modules/module-2.md)
- Level: Foundation
- Estimated time: 15 minutes
- Languages: ST
- Tracks: Simulation
- Plant: none
- Prerequisites: [boolean-logic-two-hand-guard](./boolean-logic-two-hand-guard.md)

## Objectives

- Hold an alarm after the fault has gone, until it is acknowledged.
- Tell the set-dominant block SR from the reset-dominant block RS.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish alarm handling requirements of a real machine, HIL, or certification.

## On a board

The lesson compares set-dominant and reset-dominant latches with inputs pressed at exact times; a board has no recorded trace for it yet. Complete it in Simulation, where the scenario presses the inputs for you.

{/* <<< END GENERATED: learn/lessons/set-reset-alarm-latch <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
