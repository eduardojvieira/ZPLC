---
title: "Flancos y contador de pulsos"
sidebar_label: "edge-counter-pulses"
description: "La lección edge-counter-pulses: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Flancos y contador de pulsos

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/edge-counter-pulses. Do not edit. >>> */}

Use un contador CTU para contar tres pulsos discretos y resetear la cuenta.

## Datos

- Módulo: [3](../modules/module-3.md)
- Nivel: Fundamentos
- Tiempo estimado: 15 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [motor-start-stop-safe](./motor-start-stop-safe.md)

## Objetivos

- Cuente tres flancos ascendentes de PulseInput con un contador CTU.
- Resetee la cuenta y CountReached con Reset.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

La evidencia de Tests es del host nativo POSIX; no es evidencia de sensor físico, rebote, hardware, HIL ni certificación.

## En una placa

La lección cuenta pulsos que el escenario envía en instantes exactos; una placa necesitaría una fuente de pulsos y una traza registrada que todavía no se ha escrito. Complétela en Simulación y luego pruebe el ejemplo Contador de flancos en su placa con un pulsador.

{/* <<< END GENERATED: learn/lessons/edge-counter-pulses <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
