---
title: "Lista de instrucciones: llamar a un temporizador de retardo a la desconexión y a la conexión"
sidebar_label: "timers-on-delay-off-delay-il"
description: "La lección timers-on-delay-off-delay-il: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Lista de instrucciones: llamar a un temporizador de retardo a la desconexión y a la conexión

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/timers-on-delay-off-delay-il. Do not edit. >>> */}

Llame a un temporizador TOF con CAL para mantener una luz encendida después de soltar un botón, y a un temporizador TON para ignorar un pulso corto de un sensor, y lea cada salida del temporizador con LD.

## Datos

- Módulo: [3](../modules/module-3.md)
- Nivel: Fundamentos
- Tiempo estimado: 15 minutos
- Lenguajes: IL
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [timers-on-delay-off-delay](./timers-on-delay-off-delay.md), [boolean-logic-two-hand-guard-il](./boolean-logic-two-hand-guard-il.md)

## Objetivos

- Llame a una instancia de temporizador con CAL, pasándole su entrada y su valor preestablecido, y lea su salida con LD.
- Mantenga una salida encendida un tiempo fijo después de que su entrada baja, con TOF, e ignore una entrada que está en ON menos de un tiempo fijo, con TON.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran el antirrebote eléctrico, la respuesta de un sensor ni los tiempos en un dispositivo de destino, HIL ni certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/timers-on-delay-off-delay-il.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/timers-on-delay-off-delay-il.md)

{/* <<< END GENERATED: learn/lessons/timers-on-delay-off-delay-il <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
