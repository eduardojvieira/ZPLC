---
title: "Enclavamientos en diagrama de escalera: un motor con inversión de giro"
sidebar_label: "interlock-reversing-ladder"
description: "La lección interlock-reversing-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Enclavamientos en diagrama de escalera: un motor con inversión de giro

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/interlock-reversing-ladder. Do not edit. >>> */}

Edite dos peldaños en diagrama de escalera para que un motor con inversión de giro nunca cierre a la vez sus contactores Forward y Reverse, y para que la pérdida del permisivo de lubricación apague cualquiera de los dos sentidos.

## Datos

- Módulo: [6](../modules/module-6.md)
- Nivel: Intermedio
- Tiempo estimado: 20 minutos
- Lenguajes: LD
- Rutas: Simulación, Hardware
- Página de lectura: sí
- Planta: ninguna
- Requisitos previos: [interlock-guard-permissive](./interlock-guard-permissive.md), [seal-in-ladder](./seal-in-ladder.md)

## Objetivos

- Distinga un enclavamiento, un contacto que mantiene una salida apagada mientras otra está encendida, de un permisivo, un contacto que debe estar cerrado para que una salida funcione.
- Haga que dos bobinas se excluyan mutuamente con un contacto normalmente cerrado de cada una en el peldaño de la otra, en serie con Stop y el permisivo.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Aprobar significa que su programa se comportó correctamente en el simulador de esta computadora. No dice nada sobre una máquina real, sus tiempos ni su seguridad, y no demuestra una función de seguridad, contactores con enclavamiento mecánico ni cableado.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/interlock-reversing-ladder.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/interlock-reversing-ladder.md)

{/* <<< END GENERATED: learn/lessons/interlock-reversing-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
