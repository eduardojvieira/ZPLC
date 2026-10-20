---
title: "Counters in Function Block Diagram: count parts to a batch"
sidebar_label: "counter-batch-fbd"
description: "The lesson counter-batch-fbd: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Counters in Function Block Diagram: count parts to a batch

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/counter-batch-fbd. Do not edit. >>> */}

Edit a Function Block Diagram so that a CTU counter counts three parts, lights BatchFull, and clears with Reset.

## Facts

- Module: [3](../modules/module-3.md)
- Level: Foundation
- Estimated time: 20 minutes
- Languages: FBD
- Tracks: Simulation, Hardware
- Plant: none
- Prerequisites: [edge-counter-pulses](./edge-counter-pulses.md)

## Objectives

- Read a Function Block Diagram as blocks whose output ports are wired to the input ports of other blocks.
- Wire a CTU counter: a rising edge on CU counts, R clears it, and Q is TRUE when the count reaches the preset PV.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish sensor wiring, debounce, counting accuracy at machine speed, HIL, or certification.

{/* <<< END GENERATED: learn/lessons/counter-batch-fbd <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
