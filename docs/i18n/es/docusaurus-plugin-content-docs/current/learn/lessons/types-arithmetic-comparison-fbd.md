---
title: "Tipos, aritmética y comparación en diagrama de bloques de función: un total y tres bandas"
sidebar_label: "types-arithmetic-comparison-fbd"
description: "La lección types-arithmetic-comparison-fbd: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Tipos, aritmética y comparación en diagrama de bloques de función: un total y tres bandas

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/types-arithmetic-comparison-fbd. Do not edit. >>> */}

Mantenga un total acumulado en una variable INT con bloques ADD, SEL y R_TRIG, y conviértalo en tres resultados BOOL con bloques de comparación.

## Datos

- Módulo: [4](../modules/module-4.md)
- Nivel: Intermedio
- Tiempo estimado: 25 minutos
- Lenguajes: FBD
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [types-arithmetic-comparison](./types-arithmetic-comparison.md), [boolean-logic-two-hand-guard-fbd](./boolean-logic-two-hand-guard-fbd.md)

## Objetivos

- Use una variable INT para un número: un bloque ADD calcula el valor siguiente, los bloques SEL eligen entre el total anterior, el nuevo y cero, y los bloques LT, EQ y GT convierten el número en resultados BOOL.
- Sume a un número solo en el flanco ascendente de una entrada, con un bloque R_TRIG, de modo que un botón mantenido durante varios ciclos cuente una sola vez.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran el rango de un sensor real ni el comportamiento ante desbordamiento de un controlador en particular, ni son evidencia de HIL ni de certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/types-arithmetic-comparison-fbd.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/types-arithmetic-comparison-fbd.md)

{/* <<< END GENERATED: learn/lessons/types-arithmetic-comparison-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
