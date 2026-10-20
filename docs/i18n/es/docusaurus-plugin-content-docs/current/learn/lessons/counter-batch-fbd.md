---
title: "Contadores en diagrama de bloques de función: contar piezas hasta completar un lote"
sidebar_label: "counter-batch-fbd"
description: "La lección counter-batch-fbd: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Contadores en diagrama de bloques de función: contar piezas hasta completar un lote

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/counter-batch-fbd. Do not edit. >>> */}

Edite un diagrama de bloques de función para que un contador CTU cuente tres piezas, encienda BatchFull y se borre con Reset.

## Datos

- Módulo: [3](../modules/module-3.md)
- Nivel: Fundamentos
- Tiempo estimado: 20 minutos
- Lenguajes: FBD
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [edge-counter-pulses](./edge-counter-pulses.md)

## Objetivos

- Lea un diagrama de bloques de función como bloques cuyos puertos de salida se conectan a los puertos de entrada de otros bloques.
- Conecte un contador CTU: un flanco ascendente en CU cuenta, R lo borra y Q es TRUE cuando la cuenta llega al valor preestablecido PV.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran el cableado del sensor, el antirrebote, la exactitud del conteo a la velocidad de la máquina, HIL ni certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/counter-batch-fbd.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/counter-batch-fbd.md)

{/* <<< END GENERATED: learn/lessons/counter-batch-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
