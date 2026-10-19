---
title: "Write a blinker in Structured Text"
sidebar_label: "blink-structured-text"
description: "The lesson blink-structured-text: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Write a blinker in Structured Text

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/blink-structured-text. Do not edit. >>> */}

Build a blinker from a TON timer and a memory variable, and make it run only while an enable input is on.

## Facts

- Module: [1](../modules/module-1.md)
- Level: Foundation
- Estimated time: 15 minutes
- Languages: ST
- Tracks: Simulation
- Plant: none
- Prerequisites: [scan-cycle-one-scan-memory](./scan-cycle-one-scan-memory.md)

## Objectives

- Write the timer-and-memory pattern that makes an output change state at a fixed interval.
- Gate an output with an input so that it stops at once when the input drops.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they are not evidence of a physical lamp, hardware timing, HIL, or certification.

## On a board

The scenario checks the lamp at exact scan times with a script that gates the blinker; a board has no recorded trace for this lesson yet. Complete it in Simulation, then try the Raspberry Pi Pico blinky example for the same timer on a real LED.

{/* <<< END GENERATED: learn/lessons/blink-structured-text <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
