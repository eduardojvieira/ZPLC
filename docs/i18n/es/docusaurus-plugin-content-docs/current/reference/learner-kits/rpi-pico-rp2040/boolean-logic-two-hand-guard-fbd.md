---
title: "Cableado: Diagrama de bloques de función: un mando a dos manos con protección en Raspberry Pi Pico (RP2040)"
sidebar_label: "boolean-logic-two-hand-guard-fbd"
description: "Cómo cablear la lección boolean-logic-two-hand-guard-fbd en la Raspberry Pi Pico (RP2040), generado a partir de su archivo de cableado."
tags: [learn, hardware, generated]
unlisted: true
---

# Cableado: Diagrama de bloques de función: un mando a dos manos con protección en Raspberry Pi Pico (RP2040)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/rpi-pico-rp2040/boolean-logic-two-hand-guard-fbd. Do not edit. >>> */}

El cableado de la lección [Diagrama de bloques de función: un mando a dos manos con protección](../../../learn/lessons/boolean-logic-two-hand-guard-fbd.md) en la [Raspberry Pi Pico (RP2040)](../rpi-pico-rp2040.md). Haga el cableado con el cable USB desconectado.

## Límite de tensión

- Los pines de E/S de las dos placas del estudiante funcionan solo con lógica de 3.3 V.
- Nunca conecte 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más de 3.3 V ni nada que provenga de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 de la placa y una las tierras (GND).
- Mantenga cada salida por debajo de 10 mA: un LED con una resistencia de 330 Ω consume unos 4 mA. En la Pico, mantenga el total de todos los pines por debajo de 50 mA.
- Cablee con el cable USB desconectado y revise el cableado dos veces antes de conectarlo.

## Diagrama

![Cableado de Diagrama de bloques de función: un mando a dos manos con protección en Raspberry Pi Pico (RP2040)](/img/wiring/rpi-pico-rp2040/boolean-logic-two-hand-guard-fbd.es.svg)

## Tarjeta de cableado

1. Mano izquierda: pulsador entre GP15 (pin 20 del conector, DI0) y GND (GND · pin 38); la placa lo lee con su resistencia de pull-up interna.
2. Mano derecha: pulsador entre GP14 (pin 19 del conector, DI1) y GND (GND · pin 38); la placa lo lee con su resistencia de pull-up interna.
3. Protección cerrada: cable puente desde GP13 (pin 17 del conector, DI2) hasta GND (GND · pin 38); conectado significa activado.
4. Habilitación de la prensa: LED verde con una resistencia de 330 Ω en serie, desde GP0 (pin 1 del conector, DO0) hasta GND (GND · pin 38).
5. Lámpara de la protección: LED amarillo con una resistencia de 330 Ω en serie, desde GP1 (pin 2 del conector, DO1) hasta GND (GND · pin 38).
6. Advertencia de una sola mano: LED rojo con una resistencia de 330 Ω en serie, desde GP2 (pin 4 del conector, DO2) hasta GND (GND · pin 38).

{/* <<< END GENERATED: reference/learner-kits/rpi-pico-rp2040/boolean-logic-two-hand-guard-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
