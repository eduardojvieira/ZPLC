---
title: "Boolean logic: a two-hand control with a guard"
sidebar_label: "boolean-logic-two-hand-guard"
description: "The lesson boolean-logic-two-hand-guard: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Boolean logic: a two-hand control with a guard

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/boolean-logic-two-hand-guard. Do not edit. >>> */}

Combine AND, NOT and XOR so a press can only be enabled when both hands are on the buttons and the guard is closed.

## Facts

- Module: [2](../modules/module-2.md)
- Level: Foundation
- Estimated time: 15 minutes
- Languages: ST
- Tracks: Simulation
- Plant: none
- Prerequisites: [blinky-ladder-timer-feedback](./blinky-ladder-timer-feedback.md)

## Objectives

- Write a condition that is true only when several inputs are true together.
- Use NOT for a warning lamp and XOR for exactly one of two inputs.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish the response time, redundancy or fault behaviour a real two-hand safety device needs, and they are not safety, HIL, or certification evidence.

## On a board

The lesson presses two inputs at scripted times to test AND, NOT and XOR; a board would need two wired buttons and a recorded trace that do not exist yet. Complete it in Simulation, where the scenario presses both inputs for you.

{/* <<< END GENERATED: learn/lessons/boolean-logic-two-hand-guard <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
