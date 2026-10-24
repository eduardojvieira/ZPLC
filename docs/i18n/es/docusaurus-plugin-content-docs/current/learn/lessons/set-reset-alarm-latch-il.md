---
title: "Lista de instrucciones: S y R, y la línea que va al final"
sidebar_label: "set-reset-alarm-latch-il"
description: "La lección set-reset-alarm-latch-il: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Lista de instrucciones: S y R, y la línea que va al final

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/set-reset-alarm-latch-il. Do not edit. >>> */}

Mantenga una falla en memoria con las instrucciones S y R y vea que, cuando la falla y el reconocimiento llegan juntos, la instrucción escrita al final decide cuál gana.

## Datos

- Módulo: [2](../modules/module-2.md)
- Nivel: Fundamentos
- Tiempo estimado: 15 minutos
- Lenguajes: IL
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [set-reset-alarm-latch](./set-reset-alarm-latch.md), [boolean-logic-two-hand-guard-il](./boolean-logic-two-hand-guard-il.md)

## Objetivos

- Retenga una alarma después de que la falla desaparece, hasta que se reconozca, con las instrucciones IL S y R.
- Use el orden de dos líneas para decidir si gana set o reset, y distíngalo de los bloques SR y RS.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran los requisitos de manejo de alarmas de una máquina real, HIL ni certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/set-reset-alarm-latch-il.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/set-reset-alarm-latch-il.md)

{/* <<< END GENERATED: learn/lessons/set-reset-alarm-latch-il <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
