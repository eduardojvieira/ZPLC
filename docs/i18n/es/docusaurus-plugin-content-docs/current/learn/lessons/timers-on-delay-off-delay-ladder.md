---
title: "Retardo a la conexión y a la desconexión en escalera: temporizadores como bloques en un peldaño"
sidebar_label: "timers-on-delay-off-delay-ladder"
description: "La lección timers-on-delay-off-delay-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Retardo a la conexión y a la desconexión en escalera: temporizadores como bloques en un peldaño

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/timers-on-delay-off-delay-ladder. Do not edit. >>> */}

Coloque un TOF y un TON entre un contacto y una bobina, y compruebe que un retardo a la desconexión mantiene una luz tras soltar el botón y que un retardo a la conexión ignora un sensor que no se mantiene.

## Datos

- Módulo: [3](../modules/module-3.md)
- Nivel: Fundamentos
- Tiempo estimado: 20 minutos
- Lenguajes: LD
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [timers-on-delay-off-delay](./timers-on-delay-off-delay.md), [blinky-ladder-timer-feedback](./blinky-ladder-timer-feedback.md)

## Objetivos

- Coloque un bloque temporizador en un peldaño, con el contacto en su entrada IN y su salida en la bobina.
- Distinga un retardo a la desconexión (TOF) de uno a la conexión (TON) por lo que hace cada uno cuando la entrada sube y baja.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran los requisitos de filtrado de un sensor real, el cableado, los tiempos del hardware, HIL ni certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/timers-on-delay-off-delay-ladder.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/timers-on-delay-off-delay-ladder.md)

{/* <<< END GENERATED: learn/lessons/timers-on-delay-off-delay-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
