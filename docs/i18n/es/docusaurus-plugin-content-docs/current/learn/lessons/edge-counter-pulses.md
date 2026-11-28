---
title: "Flancos y contador de pulsos"
sidebar_label: "edge-counter-pulses"
description: "La lección edge-counter-pulses: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Flancos y contador de pulsos

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/edge-counter-pulses. Do not edit. >>> */}

Use un contador CTU para contar tres pulsos discretos y poner la cuenta a cero.

## Datos

- Módulo: [3](../modules/module-3.md)
- Nivel: Fundamentos
- Tiempo estimado: 15 minutos
- Lenguajes: ST
- Rutas: Simulación, Hardware
- Página de lectura: sí
- Planta: ninguna
- Requisitos previos: [timers-on-delay-off-delay](./timers-on-delay-off-delay.md)

## Objetivos

- Cuente los flancos ascendentes de una entrada con una instancia de contador llamada en cada ciclo, para que un pulso largo cuente una vez.
- Pase una salida a ON cuando la cuenta llega a su valor preestablecido, y ponga la cuenta a cero con una entrada de puesta a cero.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Aprobar significa que su programa se comportó correctamente en el simulador de esta computadora. No dice nada sobre una máquina real, sus tiempos ni su seguridad, y no muestra cómo rebota un sensor real ni qué hace una entrada real con un pulso más corto que un ciclo.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/edge-counter-pulses.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/edge-counter-pulses.md)

{/* <<< END GENERATED: learn/lessons/edge-counter-pulses <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
