---
title: "Cableado: Bloques de función: un biestable, dos bombas en ESP32-S3-DevKitC-1 (N8R8)"
sidebar_label: "function-block-pump-pair"
description: "Cómo cablear la lección function-block-pump-pair en la ESP32-S3-DevKitC-1 (N8R8), generado de su archivo de cableado."
tags: [learn, hardware, generated]
unlisted: true
---

# Cableado: Bloques de función: un biestable, dos bombas en ESP32-S3-DevKitC-1 (N8R8)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/esp32-s3-devkitc/function-block-pump-pair. Do not edit. >>> */}

El cableado de la lección [Bloques de función: un biestable, dos bombas](../../../learn/lessons/function-block-pump-pair.md) en la [ESP32-S3-DevKitC-1 (N8R8)](../esp32-s3-devkitc.md). Cabléela con el cable USB desconectado.

## Límite de tensión

- Los pines de E/S de las dos placas del estudiante funcionan solo con lógica de 3.3 V.
- Nunca conecte 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más de 3.3 V ni nada que provenga de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 de la placa y una las tierras (GND).
- Mantenga cada salida por debajo de 10 mA: un LED con una resistencia de 330 Ω consume unos 4 mA. En la Pico, mantenga el total de todos los pines por debajo de 50 mA.
- Cablee con el cable USB desconectado y revise el cableado dos veces antes de conectarlo.

## Diagrama

![Cableado de Bloques de función: un biestable, dos bombas en ESP32-S3-DevKitC-1 (N8R8)](/img/wiring/esp32-s3-devkitc/function-block-pump-pair.es.svg)

## Tarjeta de cableado

1. Arranque de la bomba A: pulsador entre GPIO0 (BOOT) (header J3 and BOOT button, DI0) y GND (GND · J1-22); lo lee la resistencia de pull-up interna de la placa.
2. Parada de la bomba A: pulsador entre GPIO18 (header J1, DI1) y GND (GND · J1-22); lo lee la resistencia de pull-up interna de la placa.
3. Arranque de la bomba B: pulsador entre GPIO8 (header J1, DI2) y GND (GND · J1-22); lo lee la resistencia de pull-up interna de la placa.
4. Parada de la bomba B: cable puente desde GPIO9 (header J1, DI3) hasta GND (GND · J1-22); conectado significa activado.
5. Bomba A en marcha: LED verde con una resistencia de 330 Ω en serie, desde GPIO38 (header J3, DO0) hasta GND (GND · J1-22).
6. Bomba B en marcha: LED amarillo con una resistencia de 330 Ω en serie, desde GPIO15 (header J1, DO1) hasta GND (GND · J1-22).

{/* <<< END GENERATED: reference/learner-kits/esp32-s3-devkitc/function-block-pump-pair <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
