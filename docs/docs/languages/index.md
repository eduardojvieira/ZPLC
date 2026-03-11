---
slug: /languages
id: index
title: Languages & Programming Model
sidebar_label: Languages Overview
description: Overview of the IEC 61131-3 languages supported by ZPLC.
tags: [languages, iec61131-3]
---

# Languages & Programming Model

ZPLC aims for strong alignment with the IEC 61131-3 standard for programmable logic controllers. The primary focus of the modern web IDE is **Structured Text (ST)**.

## IEC 61131-3 Alignment

The standard defines five languages:
1.  Structured Text (ST) - *Currently the primary focus of ZPLC*
2.  Instruction List (IL)
3.  Ladder Diagram (LD)
4.  Function Block Diagram (FBD)
5.  Sequential Function Chart (SFC)

Regardless of the input language used in the IDE, the compiler translates the logic into a common Intermediate Representation (IR) before emitting the `.zplc` bytecode.

## Bytecode Model

The `.zplc` format is a stack-based bytecode. It is designed to be compact and fast to execute on a microcontroller without an operating system, or within an RTOS task.

## Standard Library

ZPLC provides built-in implementations of common IEC 61131-3 functions and function blocks, such as:
*   Timers (`TON`, `TOF`, `TP`)
*   Counters (`CTU`, `CTD`, `CTUD`)
*   Math functions (`ADD`, `SUB`, `MUL`, `DIV`)
*   Logical operators (`AND`, `OR`, `NOT`)
*   Triggers (`R_TRIG`, `F_TRIG`)