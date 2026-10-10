---
id: structured-text
title: Structured Text (ST)
sidebar_label: Structured Text
description: Writing PLC logic using Structured Text in ZPLC.
tags: [languages, st, iec61131-3]
unlisted: true
---

# Structured Text (ST)

Structured Text (ST) is a high-level, block-structured language with a syntax resembling Pascal. It is the central language of ZPLC Studio and of the compiler.

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

ZPLC supports these elementary types. [Structured Text (ST)](./st.md) gives the width, the range and the behaviour at the limits of each one.

*   `BOOL`
*   `SINT`, `INT`, `DINT`, `LINT` (signed integers of 8, 16, 32 and 64 bits)
*   `USINT`, `UINT`, `UDINT`, `ULINT` (unsigned integers of 8, 16, 32 and 64 bits)
*   `BYTE`, `WORD`, `DWORD`, `LWORD` (bit strings of 8, 16, 32 and 64 bits)
*   `REAL` (32-bit floating point). `LREAL` can be declared, but a program that assigns or computes with one is refused by the loader today (requirement CMP-015).
*   `TIME`, `DATE`, `TOD`, `DT`: see [Time and date types](./st.md#time-and-date-types).
*   `STRING`, `WSTRING`

`LTIME`, `LDATE`, `LTOD`, `LDT`, `CHAR` and `WCHAR` are not supported. The compiler does not reject them yet and gives the variable size 0 (requirement CMP-003).

## Control Structures

*   `IF ... THEN ... ELSIF ... ELSE ... END_IF`
*   `CASE ... OF ... ELSE ... END_CASE`
*   `FOR ... TO ... BY ... DO ... END_FOR`
*   `WHILE ... DO ... END_WHILE`
*   `REPEAT ... UNTIL ... END_REPEAT`
