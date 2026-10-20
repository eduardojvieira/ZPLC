---
title: "Cableado: Su propio bloque de función en diagrama de bloques de función: dos válvulas, un bloque en Raspberry Pi Pico (RP2040)"
sidebar_label: "function-block-valves-fbd"
description: "Cómo cablear la lección function-block-valves-fbd en la Raspberry Pi Pico (RP2040), generado a partir de su archivo de cableado."
tags: [learn, hardware, generated]
unlisted: true
---

# Cableado: Su propio bloque de función en diagrama de bloques de función: dos válvulas, un bloque en Raspberry Pi Pico (RP2040)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/rpi-pico-rp2040/function-block-valves-fbd. Do not edit. >>> */}

El cableado de la lección [Su propio bloque de función en diagrama de bloques de función: dos válvulas, un bloque](../../../learn/lessons/function-block-valves-fbd.md) en la [Raspberry Pi Pico (RP2040)](../rpi-pico-rp2040.md). Haga el cableado con el cable USB desconectado.

## Límite de tensión

- Los pines de E/S de las dos placas del estudiante funcionan solo con lógica de 3.3 V.
- Nunca conecte 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más de 3.3 V ni nada que provenga de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 de la placa y una las tierras (GND).
- Mantenga cada salida por debajo de 10 mA: un LED con una resistencia de 330 Ω consume unos 4 mA. En la Pico, mantenga el total de todos los pines por debajo de 50 mA.
- Cablee con el cable USB desconectado y revise el cableado dos veces antes de conectarlo.

## Diagrama

![Cableado de Su propio bloque de función en diagrama de bloques de función: dos válvulas, un bloque en Raspberry Pi Pico (RP2040)](/img/wiring/rpi-pico-rp2040/function-block-valves-fbd.es.svg)

## Tarjeta de cableado

1. Botón de llenado: pulsador entre GP15 (pin 20 del conector, DI0) y GND (GND · pin 38); la placa lo lee con su resistencia de pull-up interna.
2. Botón de vaciado: pulsador entre GP14 (pin 19 del conector, DI1) y GND (GND · pin 38); la placa lo lee con su resistencia de pull-up interna.
3. Botón de parada: pulsador entre GP13 (pin 17 del conector, DI2) y GND (GND · pin 38); la placa lo lee con su resistencia de pull-up interna.
4. Suministro de aire correcto (permisivo sostenido: deje el cable puente conectado y retírelo un momento para simular una falla del suministro de aire): cable puente desde GP12 (pin 16 del conector, DI3) hasta GND (GND · pin 38); conectado significa activado.
5. Válvula de llenado: LED verde con una resistencia de 330 Ω en serie, desde GP0 (pin 1 del conector, DO0) hasta GND (GND · pin 38).
6. Válvula de vaciado: LED amarillo con una resistencia de 330 Ω en serie, desde GP1 (pin 2 del conector, DO1) hasta GND (GND · pin 38).

{/* <<< END GENERATED: reference/learner-kits/rpi-pico-rp2040/function-block-valves-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
