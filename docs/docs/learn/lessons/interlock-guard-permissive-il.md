---
title: "Instruction List: a guard as a permissive on the whole condition"
sidebar_label: "interlock-guard-permissive-il"
description: "The lesson interlock-guard-permissive-il: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Instruction List: a guard as a permissive on the whole condition

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/interlock-guard-permissive-il. Do not edit. >>> */}

Add a permissive to a motor start and stop in Instruction List so that the motor runs only while a guard is closed, and check it against the motor plant and its speed feedback.

## Facts

- Module: [6](../modules/module-6.md)
- Level: Intermediate
- Estimated time: 20 minutes
- Languages: IL
- Tracks: Simulation
- Plant: [`motor-v1`](../plants.md)
- Prerequisites: [interlock-guard-permissive](./interlock-guard-permissive.md), [boolean-logic-two-hand-guard-il](./boolean-logic-two-hand-guard-il.md)

## Objectives

- Tell a permissive, a condition that must be true for the output to be on, from a command, and write it as one more AND line.
- Place the permissive after the lines that hold the motor, so that it drops the motor and also stops Start from restarting it.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish a safety function, guard wiring or stopping time, HIL, or certification.

## On a board

The Instruction List motor interlock reads run feedback from the simulated motor plant; a learner board has no motor to give it. Complete it in Simulation, which provides the motor and its run feedback.

{/* <<< END GENERATED: learn/lessons/interlock-guard-permissive-il <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
