---
title: "Modbus TCP: write a register and read it back"
sidebar_label: "modbus-register-round-trip"
description: "The lesson modbus-register-round-trip: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# Modbus TCP: write a register and read it back

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/modbus-register-round-trip. Do not edit. >>> */}

Write one holding register through a Modbus TCP block, read it back once the write is done, and report whether the value that came back is the one you sent.

## Facts

- Module: [10](../modules/module-10.md)
- Level: Advanced
- Estimated time: 25 minutes
- Languages: ST
- Tracks: Simulation
- Plant: none
- Prerequisites: [structures-arrays-call-panel](./structures-arrays-call-panel.md)

## Objectives

- Write a holding register with MB_WRITE_HREG and read it back with MB_READ_HREG, in that order, using the DONE output of the first block as the trigger of the second.
- Compare the value read with the value written, and report an ERROR from either block.
- Say what a loopback double shows and what it does not show.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

The Modbus server in this lesson is a loopback double that ZPLC starts inside the simulation session, on this computer. The scenario shows how the blocks and their handshake behave against that double; it does not show that a real controller, drive or gateway accepts the same request, and it says nothing about wiring, network timing or a real device, HIL, or certification.

## On a board

The lesson talks to the Modbus TCP server that ZPLC starts on this computer. The Raspberry Pi Pico has no network interface, and the ESP32-S3 would need Wi-Fi credentials and the address of a server in its firmware, which the course firmware does not set. Complete it in Simulation: its grade is the same each time and needs no device or network.

{/* <<< END GENERATED: learn/lessons/modbus-register-round-trip <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
