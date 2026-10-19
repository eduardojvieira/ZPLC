---
title: "Interlocks and permissives: a guard that stops the motor"
sidebar_label: "interlock-guard-permissive"
description: "The lesson interlock-guard-permissive: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Interlocks and permissives: a guard that stops the motor

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/interlock-guard-permissive. Do not edit. >>> */}

Add a permissive to a motor start and stop so that the motor runs only while a guard is closed, and check it against the motor plant and its speed feedback.

## Facts

- Module: [6](../modules/module-6.md)
- Level: Intermediate
- Estimated time: 20 minutes
- Languages: ST
- Tracks: Simulation
- Plant: [`motor-v1`](../plants.md)
- Prerequisites: [pedestrian-crossing-states](./pedestrian-crossing-states.md)

## Objectives

- Tell a permissive, a condition that must be true for the output to be on, from a command.
- Put a permissive in the same condition that holds the motor, so that it drops the motor and also stops Start from restarting it.

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

The lesson drops a guard input at an exact step and needs the motor plant model for its speed feedback, which a board without a motor cannot give. Complete it in Simulation, which provides the motor and its run feedback.

{/* <<< END GENERATED: learn/lessons/interlock-guard-permissive <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
