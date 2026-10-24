---
title: "Lista de instrucciones: contar pulsos con un CTU"
sidebar_label: "edge-counter-pulses-il"
description: "La lección edge-counter-pulses-il: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Lista de instrucciones: contar pulsos con un CTU

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/edge-counter-pulses-il. Do not edit. >>> */}

Llame a un contador CTU desde lista de instrucciones para contar tres pulsos discretos, lea su salida con LD y reinicie la cuenta.

## Datos

- Módulo: [3](../modules/module-3.md)
- Nivel: Fundamentos
- Tiempo estimado: 15 minutos
- Lenguajes: IL
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [edge-counter-pulses](./edge-counter-pulses.md), [boolean-logic-two-hand-guard-il](./boolean-logic-two-hand-guard-il.md)

## Objetivos

- Llame a un contador CTU con CAL y lea su salida con LD Count.Q.
- Cuente los flancos ascendentes de PulseInput hasta un valor preestablecido de 3, y borre la cuenta con Reset.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran sensores físicos, rebote de contactos ni tiempos de hardware, HIL ni certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/edge-counter-pulses-il.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/edge-counter-pulses-il.md)

{/* <<< END GENERATED: learn/lessons/edge-counter-pulses-il <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
