---
title: "Nivel de tanque, fallas y reset"
sidebar_label: "tank-level-fault-reset"
description: "La lección tank-level-fault-reset: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Nivel de tanque, fallas y reset

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/tank-level-fault-reset. Do not edit. >>> */}

Recorra el control de nivel y las memorias de falla y de reset del ejemplo Tank Level.

## Datos

- Módulo: [6](../modules/module-6.md)
- Nivel: Intermedio
- Tiempo estimado: 25 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: [`tank-v1`](../plants.md)
- Requisitos previos: [motor-plant-feedback](./motor-plant-feedback.md)

## Objetivos

- Mantenga la bomba encendida desde LevelLow hasta LevelHigh con una retención.
- Retenga la alarma con PumpFault o EStop y libérela solo con un nuevo Reset, después de que la falla haya desaparecido.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan solo evidencia determinista del host con el runtime nativo POSIX, que no es evidencia de un proceso físico, hardware, HIL ni certificación.

## En una placa

La dinámica del nivel de la planta del tanque y sus fallas existen solo en simulación, y la lección lee seis entradas cuando las placas del estudiante tienen cuatro. Complétela en Simulación, donde una falla no cuesta nada y se puede repetir.

{/* <<< END GENERATED: learn/lessons/tank-level-fault-reset <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
