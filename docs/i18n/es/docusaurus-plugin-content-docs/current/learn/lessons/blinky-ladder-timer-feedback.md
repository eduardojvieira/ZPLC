---
title: "Oscilador TON y realimentación de salida"
sidebar_label: "blinky-ladder-timer-feedback"
description: "La lección blinky-ladder-timer-feedback: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Oscilador TON y realimentación de salida

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/blinky-ladder-timer-feedback. Do not edit. >>> */}

Complete un parpadeador de 500 ms en diagrama de escalera, hecho con dos temporizadores TON y bobinas SET y RESET, y verifique sus tiempos de encendido y apagado con aserciones FOR y AT.

## Datos

- Módulo: [1](../modules/module-1.md)
- Nivel: Fundamentos
- Tiempo estimado: 20 minutos
- Lenguajes: LD
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [scan-cycle-one-scan-memory](./scan-cycle-one-scan-memory.md)

## Objetivos

- Lea un oscilador de dos temporizadores en diagrama de escalera: cada temporizador cuenta durante un semiperíodo y pone en marcha al siguiente.
- Complételo con una bobina SET y una bobina RESET accionadas por las salidas Q de los temporizadores.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

La evidencia de Tests es del host nativo POSIX; no es evidencia de LED físico, timing de hardware, HIL ni certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/blinky-ladder-timer-feedback.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/blinky-ladder-timer-feedback.md)

{/* <<< END GENERATED: learn/lessons/blinky-ladder-timer-feedback <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
