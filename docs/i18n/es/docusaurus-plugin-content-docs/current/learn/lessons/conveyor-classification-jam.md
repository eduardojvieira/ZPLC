---
title: "Cinta de clasificación y atasco seguro"
sidebar_label: "conveyor-classification-jam"
description: "La lección conveyor-classification-jam: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Cinta de clasificación y atasco seguro

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/conveyor-classification-jam. Do not edit. >>> */}

Recorra la clasificación de piezas y el bloqueo seguro por atasco del ejemplo Conveyor 01.

## Datos

- Módulo: [8](../modules/module-8.md)
- Nivel: Avanzado
- Tiempo estimado: 25 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: [`conveyor-v1`](../plants.md)
- Requisitos previos: [motor-plant-feedback](./motor-plant-feedback.md), [tank-level-fault-reset](./tank-level-fault-reset.md)

## Objetivos

- Detenga la cinta y encienda FaultLamp mientras la planta informa JamDetected.
- Evite que Reset libere la falla mientras el atasco siga presente.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

La evidencia de Tests es determinística del host nativo POSIX; no es evidencia de cinta física, despeje de atasco, hardware, HIL ni certificación.

## En una placa

La lección necesita la planta de la cinta con sus sensores y un atasco forzado, que una placa no puede reproducir sin la máquina. Complétela en Simulación, donde la cinta y el atasco forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/conveyor-classification-jam <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
