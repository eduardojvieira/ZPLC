---
title: "Interlocks and permissives in Function Block Diagram: a guard that stops the motor"
sidebar_label: "interlock-guard-permissive-fbd"
description: "The lesson interlock-guard-permissive-fbd: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Interlocks and permissives in Function Block Diagram: a guard that stops the motor

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/interlock-guard-permissive-fbd. Do not edit. >>> */}

Wire a permissive into the reset of an RS bistable so that the motor runs only while a guard is closed, and check it against the motor plant and its speed feedback.

## Facts

- Module: [6](../modules/module-6.md)
- Level: Intermediate
- Estimated time: 25 minutes
- Languages: FBD
- Tracks: Simulation
- Plant: [`motor-v1`](../plants.md)
- Prerequisites: [interlock-guard-permissive](./interlock-guard-permissive.md), [boolean-logic-two-hand-guard-fbd](./boolean-logic-two-hand-guard-fbd.md)

## Objectives

- Tell a permissive, a condition that must be TRUE for the output to be ON, from a command.
- Wire the permissive into the reset of an RS bistable, which is reset dominant, so that an open guard drops the motor and also stops Start from restarting it.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence for a built-in motor plant model with one 10 ms task; they do not establish a safety function, guard wiring, stopping time, HIL, or certification.

## On a board

The run feedback of this Function Block Diagram comes from the simulated motor plant; a learner board has no motor to give it. Complete it in Simulation, which provides the motor and its run feedback to the Function Block Diagram.

{/* <<< END GENERATED: learn/lessons/interlock-guard-permissive-fbd <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
