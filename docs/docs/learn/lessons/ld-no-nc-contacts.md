---
title: "NO and NC contacts: a stop button that fails safe"
sidebar_label: "ld-no-nc-contacts"
description: "The lesson ld-no-nc-contacts: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# NO and NC contacts: a stop button that fails safe

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-no-nc-contacts. Do not edit. >>> */}

Learn the normally open and normally closed contacts, why a stop button is wired normally closed, and read a field stop signal correctly in a program that also lights a lamp when the stop circuit is open.

## Facts

- Module: [2](../modules/module-2.md)
- Level: Foundation
- Estimated time: 20 minutes
- Languages: LD
- Tracks: Simulation
- Plant: none
- Prerequisites: [blinky-ladder-timer-feedback](./blinky-ladder-timer-feedback.md)

## Objectives

- Explain why a stop button is wired normally closed, and what a field NC button looks like to the program: TRUE at rest, FALSE when pressed or when the wire breaks.
- Choose the right kind of contact in a rung: a normally open contact passes power when its variable is TRUE, a normally closed contact when it is FALSE.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide deterministic native POSIX host evidence on your computer only. The stop signal is set by the scenario; they do not prove a safe stop function, wiring, hardware timing, HIL, or certification.

## On a board

The lesson needs a stop button wired normally closed and a broken wire, which the simulation applies as a signal and the learner boards do not provide. Complete it in Simulation, where a broken wire costs nothing and can be repeated.

{/* <<< END GENERATED: learn/lessons/ld-no-nc-contacts <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
