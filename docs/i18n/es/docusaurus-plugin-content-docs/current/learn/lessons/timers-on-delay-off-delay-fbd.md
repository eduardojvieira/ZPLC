---
title: "Temporizadores en diagrama de bloques de función: una luz con retardo a la desconexión y un filtro con retardo a la conexión"
sidebar_label: "timers-on-delay-off-delay-fbd"
description: "La lección timers-on-delay-off-delay-fbd: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Temporizadores en diagrama de bloques de función: una luz con retardo a la desconexión y un filtro con retardo a la conexión

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/timers-on-delay-off-delay-fbd. Do not edit. >>> */}

Conecte un bloque TOF para mantener una luz encendida después de soltar un botón, y un bloque TON para ignorar un pulso de sensor demasiado corto.

## Datos

- Módulo: [3](../modules/module-3.md)
- Nivel: Fundamentos
- Tiempo estimado: 20 minutos
- Lenguajes: FBD
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [timers-on-delay-off-delay](./timers-on-delay-off-delay.md), [boolean-logic-two-hand-guard-fbd](./boolean-logic-two-hand-guard-fbd.md)

## Objetivos

- Mantenga una salida en ON durante un tiempo fijo después de que su entrada cae, con un bloque TOF cuya entrada PT está conectada a una constante TIME.
- Ignore una entrada que está en ON menos de un tiempo fijo, con un bloque TON, y diga qué temporizador retrasa el inicio y cuál retrasa el final.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran el antirrebote eléctrico, la respuesta del sensor, el tiempo en el destino, ni son evidencia de HIL ni de certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/timers-on-delay-off-delay-fbd.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/timers-on-delay-off-delay-fbd.md)

{/* <<< END GENERATED: learn/lessons/timers-on-delay-off-delay-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
