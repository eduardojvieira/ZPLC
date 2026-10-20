---
title: "Cableado: Oscilador TON y realimentación de salida en ESP32-S3-DevKitC-1 (N8R8)"
sidebar_label: "blinky-ladder-timer-feedback"
description: "Cómo cablear la lección blinky-ladder-timer-feedback en la ESP32-S3-DevKitC-1 (N8R8), generado a partir de su archivo de cableado."
tags: [learn, hardware, generated]
unlisted: true
---

# Cableado: Oscilador TON y realimentación de salida en ESP32-S3-DevKitC-1 (N8R8)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/esp32-s3-devkitc/blinky-ladder-timer-feedback. Do not edit. >>> */}

El cableado de la lección [Oscilador TON y realimentación de salida](../../../learn/lessons/blinky-ladder-timer-feedback.md) en la [ESP32-S3-DevKitC-1 (N8R8)](../esp32-s3-devkitc.md). Haga el cableado con el cable USB desconectado.

## Límite de tensión

- Los pines de E/S de las dos placas del estudiante funcionan solo con lógica de 3.3 V.
- Nunca conecte 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más de 3.3 V ni nada que provenga de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 de la placa y una las tierras (GND).
- Mantenga cada salida por debajo de 10 mA: un LED con una resistencia de 330 Ω consume unos 4 mA. En la Pico, mantenga el total de todos los pines por debajo de 50 mA.
- Cablee con el cable USB desconectado y revise el cableado dos veces antes de conectarlo.

## Diagrama

![Cableado de Oscilador TON y realimentación de salida en ESP32-S3-DevKitC-1 (N8R8)](/img/wiring/esp32-s3-devkitc/blinky-ladder-timer-feedback.es.svg)

## Tarjeta de cableado

1. Salida del LED: LED rojo con una resistencia de 330 Ω en serie, desde GPIO15 (pin 8 del conector J1, DO0) hasta GND (GND · J1-22).

{/* <<< END GENERATED: reference/learner-kits/esp32-s3-devkitc/blinky-ladder-timer-feedback <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
