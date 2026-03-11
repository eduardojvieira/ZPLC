---
id: structured-text
title: Structured Text (ST)
sidebar_label: Structured Text
description: Writing PLC logic using Structured Text in ZPLC.
tags: [languages, st, iec61131-3]
---

# Structured Text (ST)

Structured Text (ST) is a high-level, block-structured language with a syntax resembling Pascal or C. It is the primary language supported by the ZPLC Web IDE.

## Basic Syntax

```pascal
PROGRAM Main
    VAR
        Counter: INT := 0;
        Threshold: INT := 100;
        Output_LED: BOOL := FALSE;
    END_VAR

    Counter := Counter + 1;

    IF Counter >= Threshold THEN
        Output_LED := TRUE;
        Counter := 0;
    ELSE
        Output_LED := FALSE;
    END_IF;
END_PROGRAM
```

## Data Types

ZPLC supports standard IEC data types mapped to strict C types internally:
*   `BOOL` (Boolean)
*   `SINT`, `INT`, `DINT`, `LINT` (Signed integers)
*   `USINT`, `UINT`, `UDINT`, `ULINT` (Unsigned integers)
*   `REAL`, `LREAL` (Floating point)
*   `TIME`, `DATE`, `TOD`, `DT` (Time data types)

## Control Structures

*   `IF ... THEN ... ELSIF ... ELSE ... END_IF`
*   `CASE ... OF ... ELSE ... END_CASE`
*   `FOR ... TO ... BY ... DO ... END_FOR`
*   `WHILE ... DO ... END_WHILE`
*   `REPEAT ... UNTIL ... END_REPEAT`
