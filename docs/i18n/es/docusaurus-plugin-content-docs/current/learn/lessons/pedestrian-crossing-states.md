---
title: "Cruce peatonal y estados seguros"
sidebar_label: "pedestrian-crossing-states"
description: "La lección pedestrian-crossing-states: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Cruce peatonal y estados seguros

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/pedestrian-crossing-states. Do not edit. >>> */}

Recorra estados de cruce peatonal con salidas de vehículo y peatón mutuamente consistentes.

## Datos

- Módulo: [5](../modules/module-5.md)
- Nivel: Intermedio
- Tiempo estimado: 25 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: [`pedestrian-v1`](../plants.md)
- Requisitos previos: [edge-counter-pulses](./edge-counter-pulses.md)

## Objetivos

- Modele el cruce como estados numerados, cada uno con una combinación de salidas explícita.
- Muestre WALK solo mientras los vehículos están en rojo.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

La evidencia de Tests es determinística del host nativo POSIX; no es evidencia de cruce físico, hardware, HIL ni certificación.

## En una placa

El cruce maneja cinco lámparas y las placas del estudiante tienen cuatro salidas para LED; sus solicitudes de peatones provienen de la planta simulada del cruce. Complétela en Simulación, que modela el cruce y da el mismo resultado cada vez.

{/* <<< END GENERATED: learn/lessons/pedestrian-crossing-states <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
