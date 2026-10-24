---
title: "Diagrama de bloques de función: un mando a dos manos con protección"
sidebar_label: "boolean-logic-two-hand-guard-fbd"
description: "La lección boolean-logic-two-hand-guard-fbd: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Diagrama de bloques de función: un mando a dos manos con protección

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/boolean-logic-two-hand-guard-fbd. Do not edit. >>> */}

Lea un diagrama de bloques de función (FBD) y conecte bloques AND, NOT y XOR para que una prensa solo se habilite con las dos manos en los botones y la protección cerrada.

## Datos

- Módulo: [2](../modules/module-2.md)
- Nivel: Fundamentos
- Tiempo estimado: 20 minutos
- Lenguajes: FBD
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [boolean-logic-two-hand-guard](./boolean-logic-two-hand-guard.md)

## Objetivos

- Lea un diagrama de bloques de función (FBD): los bloques se unen con cables desde un puerto de salida hasta un puerto de entrada, y cada salida muestra el resultado de los bloques conectados a ella.
- Conecte bloques AND, NOT y XOR para que una salida esté en ON solo cuando varias entradas estén en ON a la vez, cuando una entrada esté en OFF o cuando exactamente una de dos entradas esté en ON.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran el tiempo de respuesta, la redundancia ni el comportamiento ante fallas que exige un dispositivo real de mando a dos manos, y no son evidencia de seguridad, de HIL ni de certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/boolean-logic-two-hand-guard-fbd.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/boolean-logic-two-hand-guard-fbd.md)

{/* <<< END GENERATED: learn/lessons/boolean-logic-two-hand-guard-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
