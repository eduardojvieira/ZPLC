---
title: "Instruction List: the current result and the order of instructions"
sidebar_label: "instruction-list-door-alarm"
description: "The lesson instruction-list-door-alarm: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Instruction List: the current result and the order of instructions

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/instruction-list-door-alarm. Do not edit. >>> */}

Complete an Instruction List program so that a door alarm holds itself on after the door closes and is silenced by a button, and see that the order of the instructions decides the result.

## Facts

- Module: [9](../modules/module-9.md)
- Level: Advanced
- Estimated time: 20 minutes
- Languages: IL
- Tracks: Simulation
- Plant: none
- Prerequisites: [function-block-pump-pair](./function-block-pump-pair.md)

## Objectives

- Read an Instruction List program as one current result that each instruction combines with an operand, from top to bottom.
- Use LD, AND, OR, ANDN and ST, and see that moving one instruction changes the logic.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish alarm requirements, siren timing or any real machine behaviour, HIL, or certification.

## On a board

The lesson is graded on a door and a silence button replayed at exact steps, and no board trace has been recorded for it. Complete it in Simulation: its grade is the same each time and needs no board.

{/* <<< END GENERATED: learn/lessons/instruction-list-door-alarm <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
