---
title: "Lista de instrucciones: aritmética, comparación y un salto en un flanco ascendente"
sidebar_label: "types-arithmetic-comparison-il"
description: "La lección types-arithmetic-comparison-il: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Lista de instrucciones: aritmética, comparación y un salto en un flanco ascendente

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/types-arithmetic-comparison-il. Do not edit. >>> */}

Mantenga un total en una variable INT, súmele en cada pulsación con ADD y un salto condicional, y conviértalo en tres resultados BOOL con LT, EQ y GT.

## Datos

- Módulo: [4](../modules/module-4.md)
- Nivel: Intermedio
- Tiempo estimado: 20 minutos
- Lenguajes: IL
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [types-arithmetic-comparison](./types-arithmetic-comparison.md), [edge-counter-pulses-il](./edge-counter-pulses-il.md)

## Objetivos

- Use ADD sobre un número en el resultado actual, y LT, EQ y GT para convertir un número en un BOOL.
- Salte un grupo de líneas con JMPCN para que un número cambie solo en el flanco ascendente de una entrada.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran el rango de un sensor real ni el comportamiento de desbordamiento de un controlador concreto, HIL ni certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/types-arithmetic-comparison-il.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/types-arithmetic-comparison-il.md)

{/* <<< END GENERATED: learn/lessons/types-arithmetic-comparison-il <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
