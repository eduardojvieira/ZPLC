---
id: structured-text
title: Structured Text (ST)
sidebar_label: Structured Text
description: Escribir lógica PLC con Structured Text en ZPLC.
tags: [languages, st, iec61131-3]
unlisted: true
---

# Structured Text (ST)

Structured Text (ST) es un lenguaje de alto nivel, estructurado en bloques, con una sintaxis parecida a Pascal. Es el lenguaje central de ZPLC Studio y del compilador.

## Sintaxis básica

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

## Tipos de datos

ZPLC soporta estos tipos elementales. [Structured Text (ST)](./st.md#tipos-numéricos) da el ancho, el rango y el comportamiento en los límites de cada uno.

*   `BOOL`
*   `SINT`, `INT`, `DINT`, `LINT` (enteros con signo de 8, 16, 32 y 64 bits)
*   `USINT`, `UINT`, `UDINT`, `ULINT` (enteros sin signo de 8, 16, 32 y 64 bits)
*   `BYTE`, `WORD`, `DWORD`, `LWORD` (cadenas de bits de 8, 16, 32 y 64 bits)
*   `REAL` (punto flotante de 32 bits). `LREAL` se puede declarar, pero hoy el cargador rechaza un programa que le asigne un valor o calcule con él (requisito CMP-015).
*   `TIME`, `DATE`, `TOD`, `DT`: ver [Tipos de tiempo y fecha](./st.md#tipos-de-tiempo-y-fecha).
*   `STRING`, `WSTRING`

`LTIME`, `LDATE`, `LTOD`, `LDT`, `CHAR` y `WCHAR` no están soportados: la declaración de uno de ellos es un error de compilación que nombra el tipo (requisito CMP-003).

## Estructuras de control

*   `IF ... THEN ... ELSIF ... ELSE ... END_IF`
*   `CASE ... OF ... ELSE ... END_CASE`
*   `FOR ... TO ... BY ... DO ... END_FOR`
*   `WHILE ... DO ... END_WHILE`
*   `REPEAT ... UNTIL ... END_REPEAT`
