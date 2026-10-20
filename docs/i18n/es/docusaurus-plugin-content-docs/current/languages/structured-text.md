---
id: structured-text
title: Structured Text (ST)
sidebar_label: Sintaxis de Structured Text
description: Escribir lógica PLC con Structured Text en ZPLC.
tags: [languages, st, iec61131-3]
---

# Structured Text (ST)

Structured Text (ST) es un lenguaje de alto nivel, estructurado en bloques, con una sintaxis parecida a Pascal. Es el lenguaje central de la aplicación ZPLC y del compilador.

## Sintaxis básica

```pascal runnable expect="Counter=3 Output_LED=FALSE" scans=3 scan_ms=10
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

Cada ciclo suma 1 a `Counter`, y `Output_LED` sigue en `FALSE` hasta que `Counter` llega a `Threshold`.
Después de tres ciclos `Counter` vale 3 y `Output_LED` es `FALSE`; CI ejecuta el ejemplo durante tres
ciclos y comprueba ambos valores.

## Tipos de datos

ZPLC soporta estos tipos elementales. [Structured Text (ST)](./st.md#tipos-numéricos) da el ancho, el rango y el comportamiento en los límites de cada uno.

*   `BOOL`
*   `SINT`, `INT`, `DINT`, `LINT` (enteros con signo de 8, 16, 32 y 64 bits)
*   `USINT`, `UINT`, `UDINT`, `ULINT` (enteros sin signo de 8, 16, 32 y 64 bits)
*   `BYTE`, `WORD`, `DWORD`, `LWORD` (cadenas de bits de 8, 16, 32 y 64 bits)
*   `REAL` (punto flotante de 32 bits) y `LREAL` (punto flotante de 64 bits, doble precisión IEEE 754; requisito CMP-015)
*   `TIME`, `DATE`, `TOD`, `DT`: ver [Tipos de tiempo y fecha](./st.md#tipos-de-tiempo-y-fecha).
*   `STRING`, `WSTRING`

`LTIME`, `LDATE`, `LTOD`, `LDT`, `CHAR` y `WCHAR` no están soportados: la declaración de uno de ellos es un error de compilación que nombra el tipo (requisito CMP-003).

## Estructuras de control

*   `IF ... THEN ... ELSIF ... ELSE ... END_IF`
*   `CASE ... OF ... ELSE ... END_CASE`
*   `FOR ... TO ... BY ... DO ... END_FOR`
*   `WHILE ... DO ... END_WHILE`
*   `REPEAT ... UNTIL ... END_REPEAT`
