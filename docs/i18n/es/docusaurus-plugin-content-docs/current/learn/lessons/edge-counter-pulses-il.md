---
title: "Lista de instrucciones: contar pulsos con un CTU"
sidebar_label: "edge-counter-pulses-il"
description: "La lección edge-counter-pulses-il: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Lista de instrucciones: contar pulsos con un CTU

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/edge-counter-pulses-il. Do not edit. >>> */}

Llame a un contador CTU desde lista de instrucciones para contar tres pulsos discretos, lea su salida con LD y reinicie la cuenta.

## Datos

- Módulo: [3](../modules/module-3.md)
- Nivel: Fundamentos
- Tiempo estimado: 15 minutos
- Lenguajes: IL
- Rutas: Simulación, Hardware
- Página de lectura: sí
- Planta: ninguna
- Requisitos previos: [edge-counter-pulses](./edge-counter-pulses.md), [boolean-logic-two-hand-guard-il](./boolean-logic-two-hand-guard-il.md)

## Objetivos

- Llame a una instancia de CTU con CAL en cada ciclo, pasándole sus entradas, y lea su salida después de la llamada.
- Cuente los flancos ascendentes de PulseInput hasta un valor preestablecido de 3, y ponga la cuenta a cero con Reset.

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

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/edge-counter-pulses-il.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/edge-counter-pulses-il.md)

{/* <<< END GENERATED: learn/lessons/edge-counter-pulses-il <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
