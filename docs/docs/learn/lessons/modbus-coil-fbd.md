---
title: "Modbus in Function Block Diagram: write a coil and read it back"
sidebar_label: "modbus-coil-fbd"
description: "The lesson modbus-coil-fbd: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Modbus in Function Block Diagram: write a coil and read it back

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/modbus-coil-fbd. Do not edit. >>> */}

Edit a Function Block Diagram so that MB_READ_COIL reads coil 4 back once MB_WRITE_COIL has written it, and Echo reports the coil read.

## Facts

- Module: [10](../modules/module-10.md)
- Level: Advanced
- Estimated time: 25 minutes
- Languages: FBD
- Tracks: Simulation
- Plant: none
- Prerequisites: [modbus-register-round-trip](./modbus-register-round-trip.md), [counter-batch-fbd](./counter-batch-fbd.md)

## Objectives

- Call a Modbus client block in a Function Block Diagram, with its inputs fed from constants that both blocks share, so that the write and the read name the same server and coil.
- Chain two requests with a wire from the DONE output of the first block to the EN input of the second.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

The Modbus server of this lesson is a loopback double that Studio starts inside the simulation session, on this computer. The scenario shows how the blocks and their handshake behave against that double; it does not show that a real controller, drive or gateway accepts the same request, and it says nothing about wiring, network timing, a real device, HIL or certification.

## On a board

The lesson writes and reads a coil of the Modbus server that Studio starts inside the simulation session, and no trace of a real device or gateway answering the same requests has been recorded. Complete it in Simulation: its grade is the same each time and needs no device or network.

{/* <<< END GENERATED: learn/lessons/modbus-coil-fbd <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
