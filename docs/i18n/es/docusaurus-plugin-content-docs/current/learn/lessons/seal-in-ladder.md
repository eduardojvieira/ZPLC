---
title: "Autorretención en Ladder: un motor que se mantiene encendido"
sidebar_label: "seal-in-ladder"
description: "La lección seal-in-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Autorretención en Ladder: un motor que se mantiene encendido

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/seal-in-ladder. Do not edit. >>> */}

Edite un peldaño de Ladder para que una pulsación de Start mantenga el motor encendido al soltar el botón, y una pulsación de Stop lo apague aunque Start siga pulsado.

## Datos

- Módulo: [2](../modules/module-2.md)
- Nivel: Fundamentos
- Tiempo estimado: 20 minutos
- Lenguajes: LD
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [boolean-logic-two-hand-guard](./boolean-logic-two-hand-guard.md)

## Objetivos

- Lea un peldaño de Ladder como un camino de contactos por el que debe pasar la energía hasta la bobina.
- Mantenga una bobina encendida con un contacto de su propia salida en paralelo con Start, y deje Stop en serie para que Stop gane.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

La evidencia de Tests es del runtime nativo POSIX con una tarea de 10 ms; no establece una función de parada segura, cableado, tiempos de hardware, HIL ni certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/seal-in-ladder.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/seal-in-ladder.md)

{/* <<< END GENERATED: learn/lessons/seal-in-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
