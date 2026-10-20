---
title: "Cableado: Escalado analógico en diagrama de bloques de función: una alarma de nivel alto en ESP32-S3-DevKitC-1 (N8R8)"
sidebar_label: "analog-scaling-fbd"
description: "Cómo cablear la lección analog-scaling-fbd en la ESP32-S3-DevKitC-1 (N8R8), generado a partir de su archivo de cableado."
tags: [learn, hardware, generated]
unlisted: true
---

# Cableado: Escalado analógico en diagrama de bloques de función: una alarma de nivel alto en ESP32-S3-DevKitC-1 (N8R8)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/esp32-s3-devkitc/analog-scaling-fbd. Do not edit. >>> */}

El cableado de la lección [Escalado analógico en diagrama de bloques de función: una alarma de nivel alto](../../../learn/lessons/analog-scaling-fbd.md) en la [ESP32-S3-DevKitC-1 (N8R8)](../esp32-s3-devkitc.md). Haga el cableado con el cable USB desconectado.

## Límite de tensión

- Los pines de E/S de las dos placas del estudiante funcionan solo con lógica de 3.3 V.
- Nunca conecte 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más de 3.3 V ni nada que provenga de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 de la placa y una las tierras (GND).
- Mantenga cada salida por debajo de 10 mA: un LED con una resistencia de 330 Ω consume unos 4 mA. En la Pico, mantenga el total de todos los pines por debajo de 50 mA.
- Cablee con el cable USB desconectado y revise el cableado dos veces antes de conectarlo.

## Diagrama

![Cableado de Escalado analógico en diagrama de bloques de función: una alarma de nivel alto en ESP32-S3-DevKitC-1 (N8R8)](/img/wiring/esp32-s3-devkitc/analog-scaling-fbd.es.svg)

## Tarjeta de cableado

1. Habilitación: pulsador entre GPIO5 (header J1 pin 5, DI0) y GND (GND · J1-22); la placa lo lee con su resistencia de pull-up interna.
2. Nivel alto: LED rojo con una resistencia de 330 Ω en serie, desde GPIO15 (header J1 pin 8, DO0) hasta GND (GND · J1-22).

{/* <<< END GENERATED: reference/learner-kits/esp32-s3-devkitc/analog-scaling-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
