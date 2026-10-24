---
title: "Nivel de tanque, fallas y reset en escalera: enclavamientos y orden de los peldaños"
sidebar_label: "tank-level-fault-reset-ladder"
description: "La lección tank-level-fault-reset-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Nivel de tanque, fallas y reset en escalera: enclavamientos y orden de los peldaños

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/tank-level-fault-reset-ladder. Do not edit. >>> */}

Controle la bomba de un tanque con una autorretención, enclave una falla con bobinas SET y RESET y bórrela solo con un Reset nuevo, en un programa que sigue el nivel de la planta.

## Datos

- Módulo: [6](../modules/module-6.md)
- Nivel: Intermedio
- Tiempo estimado: 30 minutos
- Lenguajes: LD
- Rutas: Simulación
- Planta: [`tank-v1`](../plants.md)
- Requisitos previos: [tank-level-fault-reset](./tank-level-fault-reset.md), [blinky-ladder-timer-feedback](./blinky-ladder-timer-feedback.md)

## Objetivos

- Mantenga la bomba encendida desde LevelLow hasta LevelHigh con una autorretención, con todas las condiciones de parada en serie.
- Enclave la alarma con PumpFault o EStop mediante una bobina SET y libérela con una bobina RESET a la que solo llegue una nueva pulsación de Reset.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan solo evidencia determinista del host con el runtime nativo POSIX; no son evidencia de proceso físico, hardware, HIL ni certificación.

## En una placa

Los sensores de nivel y la falla de la bomba de este programa en escalera provienen de la planta del tanque, que existe solo en simulación, y el programa lee seis entradas cuando las placas del estudiante tienen cuatro. Complétela en Simulación, donde una falla no cuesta nada y se puede repetir.

{/* <<< END GENERATED: learn/lessons/tank-level-fault-reset-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
