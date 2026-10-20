---
title: "Arranque y parada seguros"
sidebar_label: "motor-start-stop-safe"
description: "La lección motor-start-stop-safe: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Arranque y parada seguros

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/motor-start-stop-safe. Do not edit. >>> */}

Recorra un motor con autorretención, parada y protección por sobrecarga usando el ejemplo Motor Start Stop.

## Datos

- Módulo: [2](../modules/module-2.md)
- Nivel: Fundamentos
- Tiempo estimado: 20 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [set-reset-alarm-latch](./set-reset-alarm-latch.md)

## Objetivos

- Mantenga el motor encendido tras soltar Start mediante una autorretención.
- Detenga el motor con Stop, EStop y Overload, y evite que un Start mantenido lo vuelva a arrancar por sí solo.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan solo evidencia del host con el runtime nativo POSIX; no son evidencia de hardware ni de HIL.

## En una placa

La lección prueba una parada que debe imponerse a un arranque, con entradas que un guion pulsa en instantes exactos; una placa necesitaría pulsadores cableados y una traza registrada que todavía no existe. Complétela en Simulación, donde el escenario pulsa cada entrada por usted, y cablee el contacto de parada normalmente cerrado en un motor real.

{/* <<< END GENERATED: learn/lessons/motor-start-stop-safe <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
