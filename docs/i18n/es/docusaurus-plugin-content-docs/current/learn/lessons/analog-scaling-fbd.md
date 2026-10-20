---
title: "Escalado analógico en diagrama de bloques de función: una alarma de nivel alto"
sidebar_label: "analog-scaling-fbd"
description: "La lección analog-scaling-fbd: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Escalado analógico en diagrama de bloques de función: una alarma de nivel alto

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/analog-scaling-fbd. Do not edit. >>> */}

Edite un diagrama de bloques de función que escala cuentas analógicas en bruto de 0 a 4095 a un nivel en porcentaje con los bloques MUL, DIV y LIMIT, y enciende HighLevel al 75 por ciento.

## Datos

- Módulo: [4](../modules/module-4.md)
- Nivel: Intermedio
- Tiempo estimado: 20 minutos
- Lenguajes: FBD
- Rutas: Simulación, Hardware
- Planta: ninguna
- Requisitos previos: [analog-scaling-integer](./analog-scaling-integer.md), [counter-batch-fbd](./counter-batch-fbd.md)

## Objetivos

- Escale cuentas analógicas en bruto a unidades de ingeniería con bloques aritméticos: multiplique por el rango de las unidades y luego divida por el rango de las cuentas.
- Mantenga un valor escalado dentro de su rango con un bloque LIMIT, y compare con un umbral el valor en unidades de ingeniería, no en cuentas en bruto.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX, una tarea de 10 ms y un sustituto del potenciómetro; no demuestran la exactitud, el ruido ni la calibración de una entrada analógica real, el cableado, HIL ni certificación.

## Cableado

- [Raspberry Pi Pico (RP2040)](../../reference/learner-kits/rpi-pico-rp2040/analog-scaling-fbd.md)
- [ESP32-S3-DevKitC-1 (N8R8)](../../reference/learner-kits/esp32-s3-devkitc/analog-scaling-fbd.md)

{/* <<< END GENERATED: learn/lessons/analog-scaling-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
