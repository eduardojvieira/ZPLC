---
title: "Enclavar una alarma en escalera: bobinas SET y RESET, y el orden de los peldaños"
sidebar_label: "set-reset-alarm-latch-ladder"
description: "La lección set-reset-alarm-latch-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Enclavar una alarma en escalera: bobinas SET y RESET, y el orden de los peldaños

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/set-reset-alarm-latch-ladder. Do not edit. >>> */}

Mantenga una falla en memoria con bobinas SET y RESET, y compruebe que en escalera el peldaño que va al final decide cuál gana.

## Datos

- Módulo: [2](../modules/module-2.md)
- Nivel: Fundamentos
- Tiempo estimado: 20 minutos
- Lenguajes: LD
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [set-reset-alarm-latch](./set-reset-alarm-latch.md), [blinky-ladder-timer-feedback](./blinky-ladder-timer-feedback.md)

## Objetivos

- Mantenga una alarma después de que la falla desaparezca con una bobina SET y bórrela solo con una bobina RESET.
- Decida la prioridad entre set y reset por el orden de los peldaños: gana el último que se escanea.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran los requisitos de manejo de alarmas de una máquina real, el cableado, los tiempos del hardware, HIL ni certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/set-reset-alarm-latch-ladder.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/set-reset-alarm-latch-ladder.md)

{/* <<< END GENERATED: learn/lessons/set-reset-alarm-latch-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
