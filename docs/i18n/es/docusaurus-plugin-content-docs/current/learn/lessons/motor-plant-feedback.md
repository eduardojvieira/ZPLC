---
title: "Comando, realimentación y velocidad"
sidebar_label: "motor-plant-feedback"
description: "La lección motor-plant-feedback: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Comando, realimentación y velocidad

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/motor-plant-feedback. Do not edit. >>> */}

Separe la orden del motor de la confirmación de marcha usando la planta Motor Plant.

## Datos

- Módulo: [6](../modules/module-6.md)
- Nivel: Intermedio
- Tiempo estimado: 20 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: [`motor-v1`](../plants.md)
- Requisitos previos: [pedestrian-crossing-states](./pedestrian-crossing-states.md)

## Objetivos

- Separe la orden al motor de la confirmación de que está en marcha.
- Retenga el pedido hasta Stop y deje que Running siga al pedido solo cuando llegue AtSpeed.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

La evidencia de Tests es determinística del host nativo POSIX y de la planta discreta; no es evidencia de motor físico, hardware, HIL ni certificación.

## En una placa

La realimentación de marcha proviene de la planta simulada del motor, que responde a sus salidas; una placa del estudiante no tiene un motor que la dé. Complétela en Simulación, que proporciona el motor y su realimentación de marcha.

{/* <<< END GENERATED: learn/lessons/motor-plant-feedback <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
