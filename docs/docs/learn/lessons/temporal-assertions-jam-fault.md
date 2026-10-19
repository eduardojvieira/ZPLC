---
title: "Temporal assertions and jam fault"
sidebar_label: "temporal-assertions-jam-fault"
description: "The lesson temporal-assertions-jam-fault: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Temporal assertions and jam fault

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/temporal-assertions-jam-fault. Do not edit. >>> */}

Latch the jam fault and prove its timing with AT, WITHIN, FOR, UNTIL, RISING, and FALLING assertions.

## Facts

- Module: [8](../modules/module-8.md)
- Level: Advanced
- Estimated time: 25 minutes
- Languages: ST
- Tracks: Simulation
- Plant: none
- Prerequisites: [conveyor-classification-jam](./conveyor-classification-jam.md)

## Objectives

- Latch the jam fault and prove its timing with temporal assertions.
- Require a new Start before the belt moves again after the fault is released.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Compare**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host runtime and discrete-input evidence only; the scheduled jam is not a physical fault, physical clearance, target timing, HIL, or certification evidence.

## On a board

The lesson checks timed assertions to the millisecond, and a board adds timing jitter that would make those checks unreliable. Complete it in Simulation, where time is exact, then apply the same assertions to a board with the test tools.

{/* <<< END GENERATED: learn/lessons/temporal-assertions-jam-fault <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
