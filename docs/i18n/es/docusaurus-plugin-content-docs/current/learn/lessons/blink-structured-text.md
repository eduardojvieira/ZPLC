---
title: "Escriba un parpadeador en Structured Text"
sidebar_label: "blink-structured-text"
description: "La lección blink-structured-text: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Escriba un parpadeador en Structured Text

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/blink-structured-text. Do not edit. >>> */}

Construya un parpadeador con un temporizador TON y una variable de memoria, y haga que funcione solo mientras una entrada de habilitación está en ON.

## Datos

- Módulo: [1](../modules/module-1.md)
- Nivel: Fundamentos
- Tiempo estimado: 15 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [scan-cycle-one-scan-memory](./scan-cycle-one-scan-memory.md)

## Objetivos

- Escriba el patrón de temporizador y memoria que hace cambiar una salida a intervalos fijos.
- Condicione una salida a una entrada para que se detenga de inmediato cuando la entrada baja.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

La evidencia de Tests es del runtime nativo POSIX con una tarea de 10 ms; no es evidencia de una lámpara física, de tiempos de hardware, de HIL ni de certificación.

## En una placa

El escenario comprueba la lámpara en instantes de ciclo exactos con un guion que habilita el parpadeo; una placa todavía no tiene traza registrada para esta lección. Complétela en Simulación y pruebe después el ejemplo de parpadeo de la Raspberry Pi Pico con el mismo temporizador sobre un LED real.

{/* <<< END GENERATED: learn/lessons/blink-structured-text <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
