---
slug: /languages
id: index
title: Lenguajes y modelo de programación
sidebar_label: Generalidades
description: Panorama de los flujos de lenguajes IEC 61131-3 en ZPLC.
tags: [languages, iec61131-3]
---

# Lenguajes y modelo de programación

Structured Text (ST) es el frontend central de lenguaje de ZPLC. El repositorio también tiene flujos para LD, FBD, SFC e IL. Su edición, conversión, depuración y cobertura en target varían, por lo que conviene elegir el flujo según su evidencia actual y no suponer cobertura IEC completa ni paridad total.

## Flujos disponibles

| Lenguaje | Ruta actual |
|---|---|
| **Structured Text (ST)** | Frontend textual central del compilador. |
| **Instruction List (IL)** | Se parsea y transpila a ST antes de compilar. |
| **Ladder Diagram (LD)** | Flujo de editor/transpilador visual. |
| **Function Block Diagram (FBD)** | Flujo de editor/transpilador visual. |
| **Sequential Function Chart (SFC)** | Flujo de editor/transpilador visual. |

## Modelo de compilación

Los flujos de lenguaje soportados convergen en la ruta del compilador que produce bytecode `.zplc`. Ese destino común no promete round trips arbitrarios entre representaciones, funciones de editor idénticas, cobertura completa de la biblioteca estándar ni el mismo rendimiento en cada runtime.

Validá como un único flujo el lenguaje fuente, la representación generada, los diagnósticos y el perfil de destino elegido.

## Depuración y evidencia de runtime

El IDE expone inspección, simulación y depuración según el perfil de capacidades del runtime activo. POSIX nativo es un runtime lógico de host, no evidencia de timing de hardware ni de comportamiento en target. Breakpoints de hardware, forces, deploy y controles de ejecución son específicos de capacidades y requieren evidencia separada.

## Biblioteca estándar

La biblioteca estándar se implementa mediante rutas de compilador y runtime. Consultá [Biblioteca estándar](./stdlib.md) y compilá el flujo de lenguaje elegido para saber qué está disponible hoy.

## Continuá leyendo

- [Structured Text (ST)](./st.md)
- [Instruction List (IL)](./il.md)
- [Suite de ejemplos de lenguajes](./examples/v1-5-language-suite.md)
