---
title: "Interlocks in Ladder: a reversing motor"
sidebar_label: "interlock-reversing-ladder"
description: "The lesson interlock-reversing-ladder: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Interlocks in Ladder: a reversing motor

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/interlock-reversing-ladder. Do not edit. >>> */}

Edit two Ladder rungs so that a reversing motor never closes its Forward and Reverse contactors together, and a lost lubrication permissive drops either direction.

## Facts

- Module: [6](../modules/module-6.md)
- Level: Intermediate
- Estimated time: 20 minutes
- Languages: LD
- Tracks: Simulation
- Plant: none
- Prerequisites: [interlock-guard-permissive](./interlock-guard-permissive.md), [seal-in-ladder](./seal-in-ladder.md)

## Objectives

- Tell an interlock, a contact that keeps one output off while another is on, from a permissive, a contact that must be closed for an output to run at all.
- Lock two coils out of each other with a normally closed contact of each one in the rung of the other, in series with Stop and the permissive.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

Tests provide native POSIX host evidence with one 10 ms task; they do not establish a safety function, mechanically interlocked contactors, wiring, hardware timing, HIL, or certification.

## On a board

The lesson is graded on pushbuttons pressed at exact 10 ms steps, and no check against a trace recorded from a board has been written for it yet. Complete it in Simulation: its grade is the same each time and needs no board.

{/* <<< END GENERATED: learn/lessons/interlock-reversing-ladder <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
