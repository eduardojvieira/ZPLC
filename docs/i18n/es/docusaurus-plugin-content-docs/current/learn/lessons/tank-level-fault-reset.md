---
title: "Nivel de tanque, fallas y reset"
sidebar_label: "tank-level-fault-reset"
description: "La lección tank-level-fault-reset: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Nivel de tanque, fallas y reset

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/tank-level-fault-reset. Do not edit. >>> */}

Recorra el control de nivel y los enclavamientos de falla y reset del ejemplo Tank Level.

## Datos

- Módulo: [6](../modules/module-6.md)
- Nivel: Intermedio
- Tiempo estimado: 25 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: [`tank-v1`](../plants.md)
- Requisitos previos: [motor-plant-feedback](./motor-plant-feedback.md)

## Objetivos

- Mantenga la bomba encendida desde LevelLow hasta LevelHigh con un enclavamiento.
- Enclave la alarma con PumpFault o EStop y libérela solo con un Reset nuevo tras despejarse la falla.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

La evidencia de Tests es determinística del host nativo POSIX; no es evidencia de proceso físico, hardware, HIL ni certificación.

## En una placa

La lección llena y vacía un tanque simulado para provocar fallos, algo inseguro y lento de repetir en una placa. Complétela en Simulación, donde un fallo no cuesta nada y se puede repetir, y ensaye allí los pasos de rearme.

{/* <<< END GENERATED: learn/lessons/tank-level-fault-reset <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
