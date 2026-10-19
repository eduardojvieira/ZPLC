---
title: "Function blocks: one latch, two pumps"
sidebar_label: "function-block-pump-pair"
description: "The lesson function-block-pump-pair: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Function blocks: one latch, two pumps

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/function-block-pump-pair. Do not edit. >>> */}

Write the body of a function block that holds a start and stop latch, then use it twice, once for each pump.

## Facts

- Module: [7](../modules/module-7.md)
- Level: Intermediate
- Estimated time: 25 minutes
- Languages: ST
- Tracks: Simulation
- Plant: none
- Prerequisites: [types-arithmetic-comparison](./types-arithmetic-comparison.md)

## Objectives

- Write a function block with inputs, an output and a memory that lives between calls.
- See that two instances of the same function block keep separate memories.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish pump behaviour, start-up current or any real machine requirement, HIL, or certification.

## On a board

The lesson starts and stops two pumps at exact steps to compare two instances of one block, and no board trace has been recorded for it. Complete it in Simulation: its grade is the same each time and needs no board.

{/* <<< END GENERATED: learn/lessons/function-block-pump-pair <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
