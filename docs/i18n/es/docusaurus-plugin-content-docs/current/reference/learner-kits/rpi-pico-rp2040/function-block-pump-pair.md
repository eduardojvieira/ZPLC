---
title: "Cableado: Bloques de función: un biestable, dos bombas en Raspberry Pi Pico (RP2040)"
sidebar_label: "function-block-pump-pair"
description: "Cómo cablear la lección function-block-pump-pair en la Raspberry Pi Pico (RP2040), generado a partir de su archivo de cableado."
tags: [learn, hardware, generated]
unlisted: true
---

# Cableado: Bloques de función: un biestable, dos bombas en Raspberry Pi Pico (RP2040)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/rpi-pico-rp2040/function-block-pump-pair. Do not edit. >>> */}

El cableado de la lección [Bloques de función: un biestable, dos bombas](../../../learn/lessons/function-block-pump-pair.md) en la [Raspberry Pi Pico (RP2040)](../rpi-pico-rp2040.md). Haga el cableado con el cable USB desconectado.

## Límite de tensión

- Los pines de E/S de las dos placas del estudiante funcionan solo con lógica de 3.3 V.
- Nunca conecte 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más de 3.3 V ni nada que provenga de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 de la placa y una las tierras (GND).
- Mantenga cada salida por debajo de 10 mA: un LED con una resistencia de 330 Ω consume unos 4 mA. En la Pico, mantenga el total de todos los pines por debajo de 50 mA.
- Cablee con el cable USB desconectado y revise el cableado dos veces antes de conectarlo.

## Diagrama

![Cableado de Bloques de función: un biestable, dos bombas en Raspberry Pi Pico (RP2040)](/img/wiring/rpi-pico-rp2040/function-block-pump-pair.es.svg)

## Tarjeta de cableado

1. Arranque de la bomba A: pulsador entre GP15 (header pin 20, DI0) y GND (GND · pin 38); la placa lo lee con su resistencia de pull-up interna.
2. Parada de la bomba A: pulsador entre GP14 (header pin 19, DI1) y GND (GND · pin 38); la placa lo lee con su resistencia de pull-up interna.
3. Arranque de la bomba B: pulsador entre GP13 (header pin 17, DI2) y GND (GND · pin 38); la placa lo lee con su resistencia de pull-up interna.
4. Parada de la bomba B: cable puente desde GP12 (header pin 16, DI3) hasta GND (GND · pin 38); conectado significa activado.
5. Bomba A en marcha: LED verde con una resistencia de 330 Ω en serie, desde GP0 (header pin 1, DO0) hasta GND (GND · pin 38).
6. Bomba B en marcha: LED amarillo con una resistencia de 330 Ω en serie, desde GP1 (header pin 2, DO1) hasta GND (GND · pin 38).

{/* <<< END GENERATED: reference/learner-kits/rpi-pico-rp2040/function-block-pump-pair <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
