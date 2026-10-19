---
title: "Reproducible diagnosis: two parts, one decision"
sidebar_label: "conveyor-two-parts-diagnosis"
description: "The lesson conveyor-two-parts-diagnosis: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Reproducible diagnosis: two parts, one decision

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/conveyor-two-parts-diagnosis. Do not edit. >>> */}

Use the versioned schedule to distinguish one metal part from one non-metal part without inventing observability.

## Facts

- Module: [8](../modules/module-8.md)
- Level: Advanced
- Estimated time: 20 minutes
- Languages: ST
- Tracks: Simulation
- Plant: none
- Prerequisites: [conveyor-classification-jam](./conveyor-classification-jam.md)

## Objectives

- Distinguish a metal part from a non-metal part with one memory that lives between two sensors.
- Read a scheduled input timeline and predict the outputs before running it.

## Stages

1. **Locate**
2. **Predict**
3. **Read the schedule**
4. **Edit**
5. **Run**
6. **Diagnose**
7. **Limits**

## What the evidence covers

Tests provide native POSIX host runtime evidence with scenario-scheduled inputs; they are not physical sensors or parts, target timing, hardware, HIL, or certification evidence.

## On a board

The lesson diagnoses a recorded two-part sequence by reading a trace, and no trace recorded from a board has been written for it. Complete it in Simulation, where the trace is the evidence you read.

{/* <<< END GENERATED: learn/lessons/conveyor-two-parts-diagnosis <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
