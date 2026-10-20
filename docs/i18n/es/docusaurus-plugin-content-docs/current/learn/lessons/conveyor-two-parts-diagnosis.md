---
title: "Diagnóstico reproducible: dos piezas, una decisión"
sidebar_label: "conveyor-two-parts-diagnosis"
description: "La lección conveyor-two-parts-diagnosis: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Diagnóstico reproducible: dos piezas, una decisión

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/conveyor-two-parts-diagnosis. Do not edit. >>> */}

Use el calendario versionado para distinguir una pieza metálica de una no metálica sin inventar observabilidad.

## Datos

- Módulo: [8](../modules/module-8.md)
- Nivel: Avanzado
- Tiempo estimado: 20 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [conveyor-classification-jam](./conveyor-classification-jam.md)

## Objetivos

- Distinga una pieza metálica de una no metálica con una memoria que se conserva entre dos sensores.
- Lea una línea de tiempo de entradas programadas y prediga las salidas antes de ejecutarla.

## Etapas

1. **Ubique**
2. **Prediga**
3. **Lea el calendario**
4. **Edite**
5. **Ejecute**
6. **Diagnostique**
7. **Límites**

## Qué cubre la evidencia

La evidencia de Tests es del runtime nativo POSIX host con inputs programados por escenario; no es evidencia de sensores ni piezas físicas, timing de target, hardware, HIL ni certificación.

## En una placa

La lección diagnostica una secuencia registrada de dos piezas leyendo una traza, y no se ha escrito para ella una traza registrada desde una placa. Complétela en Simulación, donde la traza es la evidencia que usted lee.

{/* <<< END GENERATED: learn/lessons/conveyor-two-parts-diagnosis <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
