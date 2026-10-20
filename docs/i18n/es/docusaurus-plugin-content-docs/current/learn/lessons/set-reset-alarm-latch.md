---
title: "Retener una alarma: set y reset, y cuál tiene prioridad"
sidebar_label: "set-reset-alarm-latch"
description: "La lección set-reset-alarm-latch: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Retener una alarma: set y reset, y cuál tiene prioridad

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/set-reset-alarm-latch. Do not edit. >>> */}

Mantenga una falla en memoria con los bloques SR y RS y vea qué hace cada uno cuando la falla y el reconocimiento llegan juntos.

## Datos

- Módulo: [2](../modules/module-2.md)
- Nivel: Fundamentos
- Tiempo estimado: 15 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [seal-in-ladder](./seal-in-ladder.md)

## Objetivos

- Mantenga una alarma después de que la falla haya desaparecido, hasta que se reconozca.
- Distinga el bloque SR, dominante en set, del bloque RS, dominante en reset.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran los requisitos de gestión de alarmas de una máquina real, HIL ni certificación.

## En una placa

La lección compara biestables con prioridad al arranque y al reposo con entradas pulsadas en instantes exactos; una placa todavía no tiene traza registrada para ella. Complétela en Simulación, donde el escenario pulsa las entradas por usted.

{/* <<< END GENERATED: learn/lessons/set-reset-alarm-latch <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
