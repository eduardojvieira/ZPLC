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
- Página de lectura: sí
- Planta: ninguna
- Requisitos previos: [edge-counter-pulses](./edge-counter-pulses.md)

## Objetivos

- Lea un contador en un diagrama de bloques de función como un bloque con memoria: una instancia cuyos puertos de entrada reciben conexiones y cuyas salidas Q y CV se pueden conectar a otros bloques.
- Haga que un CTU cuente flancos ascendentes hasta su valor preestablecido, y póngalo a cero con una entrada de puesta a cero.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Aprobar significa que su programa se comportó correctamente en el simulador de esta computadora. No dice nada sobre una máquina real, sus tiempos ni su seguridad, y no muestra cómo rebota una fotocélula real ni a qué velocidad se puede contar una línea real.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/counter-batch-fbd.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/counter-batch-fbd.md)

{/* <<< END GENERATED: learn/lessons/counter-batch-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
