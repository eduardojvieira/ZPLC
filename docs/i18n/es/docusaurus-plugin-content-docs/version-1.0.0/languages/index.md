---
slug: /languages
id: index
title: Lenguajes y Modelo de Programación
sidebar_label: Visión General de Lenguajes
description: Visión general de los lenguajes IEC 61131-3 soportados por ZPLC.
tags: [languages, iec61131-3]
---

# Lenguajes y Modelo de Programación

ZPLC tiene como objetivo una fuerte alineación con el estándar IEC 61131-3 para controladores lógicos programables. El enfoque principal del IDE web moderno es el **Texto Estructurado (ST)**.

## Alineación con IEC 61131-3

El estándar define cinco lenguajes:
1.  Texto Estructurado (ST) - *Actualmente el enfoque principal de ZPLC*
2.  Lista de Instrucciones (IL)
3.  Diagrama de Contactos (LD)
4.  Diagrama de Bloques de Función (FBD)
5.  Diagrama de Funciones Secuenciales (SFC)

Independientemente del lenguaje de entrada utilizado en el IDE, el compilador traduce la lógica a una Representación Intermedia (IR) común antes de emitir el bytecode `.zplc`.

## Modelo de Bytecode

El formato `.zplc` es un bytecode basado en pila (stack). Está diseñado para ser compacto y rápido de ejecutar en un microcontrolador sin sistema operativo, o dentro de una tarea de un RTOS.

## Biblioteca Estándar

ZPLC proporciona implementaciones integradas de funciones y bloques de función comunes de IEC 61131-3, tales como:
*   Temporizadores (`TON`, `TOF`, `TP`)
*   Contadores (`CTU`, `CTD`, `CTUD`)
*   Funciones matemáticas (`ADD`, `SUB`, `MUL`, `DIV`)
*   Operadores lógicos (`AND`, `OR`, `NOT`)
*   Disparadores (Triggers) (`R_TRIG`, `F_TRIG`)