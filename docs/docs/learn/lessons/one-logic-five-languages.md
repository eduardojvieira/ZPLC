---
title: "One logic in five languages: a gate that holds itself open"
sidebar_label: "one-logic-five-languages"
description: "The lesson one-logic-five-languages: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# One logic in five languages: a gate that holds itself open

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/one-logic-five-languages. Do not edit. >>> */}

Fix a Structured Text program so that a gate holds itself open and closes on command, then read the same logic in Instruction List, Ladder, Function Block Diagram and Sequential Function Chart, and see that one scenario grades all five.

## Facts

- Module: [9](../modules/module-9.md)
- Level: Advanced
- Estimated time: 30 minutes
- Languages: ST, LD, FBD, SFC, IL
- Tracks: Simulation
- Plant: none
- Prerequisites: [instruction-list-door-alarm](./instruction-list-door-alarm.md)

## Objectives

- Hold an output on after its request is released, and let a close command win, in Structured Text.
- Recognise the same condition, (Request OR Open) AND NOT Close, in Instruction List, Ladder, Function Block Diagram and Sequential Function Chart.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish gate requirements, actuator timing or any real machine behaviour, HIL, or certification.

## On a board

The lesson is graded on a request and a close command replayed at exact steps, and no board trace has been recorded for it. Complete it in Simulation: its grade is the same each time and needs no board.

{/* <<< END GENERATED: learn/lessons/one-logic-five-languages <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
