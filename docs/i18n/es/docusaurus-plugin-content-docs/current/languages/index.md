---
slug: /languages
id: index
title: Lenguajes y Modelo de Programación
sidebar_label: Visión General de Lenguajes
description: Visión general de los lenguajes IEC 61131-3 soportados por ZPLC.
tags: [languages, iec61131-3]
---

# Lenguajes y Modelo de Programación

ZPLC v1.5 reclama cobertura completa de autor, compilar, simular, desplegar y depurar para
cinco rutas de lenguaje IEC 61131-3: `ST`, `IL`, `LD`, `FBD` y `SFC`.

## Alineación con IEC 61131-3

El estándar define cinco lenguajes:
1. Texto Estructurado (ST)
2. Lista de Instrucciones (IL)
3. Diagrama de Contactos (LD)
4. Diagrama de Bloques de Función (FBD)
5. Diagrama de Funciones Secuenciales (SFC)

ZPLC usa una ruta canónica de compilación. `ST` es la base semántica. `IL`, `LD`, `FBD`
y `SFC` se normalizan hacia el mismo contrato antes de producir bytecode `.zplc`.

## Contrato de Workflow para los Lenguajes Reclamados

Cada lenguaje reclamado en v1.5 debe cubrir:

- autoría en el IDE
- compilación exitosa a `.zplc`
- soporte de simulación
- soporte de despliegue
- soporte de depuración

## Modelo de Bytecode

El formato `.zplc` es un bytecode basado en pila (stack). Está diseñado para ser compacto y rápido de ejecutar en un microcontrolador sin sistema operativo, o dentro de una tarea de un RTOS.

## Biblioteca Estándar

ZPLC proporciona implementaciones integradas de funciones y bloques de función comunes de IEC 61131-3, tales como:
*   Temporizadores (`TON`, `TOF`, `TP`)
*   Contadores (`CTU`, `CTD`, `CTUD`)
*   Funciones matemáticas (`ADD`, `SUB`, `MUL`, `DIV`)
*   Operadores lógicos (`AND`, `OR`, `NOT`)
*   Disparadores (Triggers) (`R_TRIG`, `F_TRIG`)
