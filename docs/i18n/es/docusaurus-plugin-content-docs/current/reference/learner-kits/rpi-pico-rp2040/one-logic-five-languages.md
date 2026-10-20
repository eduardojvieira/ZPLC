---
title: "Cableado: Una lógica en cinco lenguajes: un portón que se mantiene abierto en Raspberry Pi Pico (RP2040)"
sidebar_label: "one-logic-five-languages"
description: "Cómo cablear la lección one-logic-five-languages en la Raspberry Pi Pico (RP2040), generado de su archivo de cableado."
tags: [learn, hardware, generated]
unlisted: true
---

# Cableado: Una lógica en cinco lenguajes: un portón que se mantiene abierto en Raspberry Pi Pico (RP2040)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/rpi-pico-rp2040/one-logic-five-languages. Do not edit. >>> */}

El cableado de la lección [Una lógica en cinco lenguajes: un portón que se mantiene abierto](../../../learn/lessons/one-logic-five-languages.md) en la [Raspberry Pi Pico (RP2040)](../rpi-pico-rp2040.md). Cabléela con el cable USB desconectado.

## Límite de tensión

- Los pines de E/S de las dos placas del estudiante funcionan solo con lógica de 3.3 V.
- Nunca conecte 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más de 3.3 V ni nada que provenga de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 de la placa y una las tierras (GND).
- Mantenga cada salida por debajo de 10 mA: un LED con una resistencia de 330 Ω consume unos 4 mA. En la Pico, mantenga el total de todos los pines por debajo de 50 mA.
- Cablee con el cable USB desconectado y revise el cableado dos veces antes de conectarlo.

## Diagrama

![Cableado de Una lógica en cinco lenguajes: un portón que se mantiene abierto en Raspberry Pi Pico (RP2040)](/img/wiring/rpi-pico-rp2040/one-logic-five-languages.es.svg)

## Tarjeta de cableado

1. Solicitud de apertura: pulsador entre GP15 (header pin 20, DI0) y GND (GND · pin 38); lo lee la resistencia de pull-up interna de la placa.
2. Cierre: pulsador entre GP14 (header pin 19, DI1) y GND (GND · pin 38); lo lee la resistencia de pull-up interna de la placa.
3. Portón abierto: LED verde con una resistencia de 330 Ω en serie, desde GP0 (header pin 1, DO0) hasta GND (GND · pin 38).

{/* <<< END GENERATED: reference/learner-kits/rpi-pico-rp2040/one-logic-five-languages <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
