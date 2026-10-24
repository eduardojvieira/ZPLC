---
title: "Contar pulsos en escalera: un CTU cuenta los flancos por sí mismo"
sidebar_label: "edge-counter-pulses-ladder"
description: "La lección edge-counter-pulses-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Contar pulsos en escalera: un CTU cuenta los flancos por sí mismo

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/edge-counter-pulses-ladder. Do not edit. >>> */}

Coloque un CTU en un peldaño para que CountReached se active en el tercer flanco ascendente de una entrada de pulsos y Reset borre la cuenta.

## Datos

- Módulo: [3](../modules/module-3.md)
- Nivel: Fundamentos
- Tiempo estimado: 20 minutos
- Lenguajes: LD
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [edge-counter-pulses](./edge-counter-pulses.md), [blinky-ladder-timer-feedback](./blinky-ladder-timer-feedback.md)

## Objetivos

- Coloque un bloque contador en un peldaño y fije su preset y su reset.
- Explique que un contador suma uno en el flanco ascendente de su entrada, no en cada escaneo en que la entrada está en alto.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran la exactitud de conteo de una entrada real, el cableado, los tiempos del hardware, HIL ni certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/edge-counter-pulses-ladder.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/edge-counter-pulses-ladder.md)

{/* <<< END GENERATED: learn/lessons/edge-counter-pulses-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
