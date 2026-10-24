---
title: "Kit del estudiante: Raspberry Pi Pico (RP2040)"
sidebar_label: "Raspberry Pi Pico (RP2040)"
description: "El mapa de pines, las piezas, el firmware y el límite de tensión de la Raspberry Pi Pico (RP2040) para el curso, generados a partir del manifiesto de E/S de la placa y del kit."
tags: [learn, hardware, generated]
---

# Kit del estudiante: Raspberry Pi Pico (RP2040)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/rpi-pico-rp2040. Do not edit. >>> */}

El kit del curso para la Raspberry Pi Pico (RP2040): su mapa de pines, las piezas, el firmware y el límite de tensión. Los pines provienen de `firmware/app/boards/boards.json` y las piezas de `packages/zplc-ide/lessons/kit.json`. La página [kits del estudiante](./index.md) explica cómo una lección declara su cableado.

## Límite de tensión

- Los pines de E/S de las dos placas del estudiante funcionan solo con lógica de 3.3 V.
- Nunca conecte 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más de 3.3 V ni nada que provenga de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 de la placa y una las tierras (GND).
- Mantenga cada salida por debajo de 10 mA: un LED con una resistencia de 330 Ω consume unos 4 mA. En la Pico, mantenga el total de todos los pines por debajo de 50 mA.
- Cablee con el cable USB desconectado y revise el cableado dos veces antes de conectarlo.

## Mapa de pines

| Canal | Dirección | Dirección IEC | Pin | Ubicación | Notas |
| --- | --- | --- | --- | --- | --- |
| `DO0` | salida, digital | `%QX0.0` | GP0 | pin 1 del conector | Lógica de 3.3 V. No tolera 5 V. El RP2040 entrega 4 mA por defecto (hasta 12 mA, valor no calificado aquí): mantenga cada salida por debajo de 10 mA, como lo hace un LED con 330 Ω en serie (unos 4 mA), y el total de todos los pines por debajo de 50 mA. |
| `DO1` | salida, digital | `%QX0.1` | GP1 | pin 2 del conector | Lógica de 3.3 V. No tolera 5 V. El RP2040 entrega 4 mA por defecto (hasta 12 mA, valor no calificado aquí): mantenga cada salida por debajo de 10 mA, como lo hace un LED con 330 Ω en serie (unos 4 mA), y el total de todos los pines por debajo de 50 mA. |
| `DO2` | salida, digital | `%QX0.2` | GP2 | pin 4 del conector | Lógica de 3.3 V. No tolera 5 V. El RP2040 entrega 4 mA por defecto (hasta 12 mA, valor no calificado aquí): mantenga cada salida por debajo de 10 mA, como lo hace un LED con 330 Ω en serie (unos 4 mA), y el total de todos los pines por debajo de 50 mA. |
| `DO3` | salida, digital | `%QX0.3` | GP3 | pin 5 del conector | Lógica de 3.3 V. No tolera 5 V. El RP2040 entrega 4 mA por defecto (hasta 12 mA, valor no calificado aquí): mantenga cada salida por debajo de 10 mA, como lo hace un LED con 330 Ω en serie (unos 4 mA), y el total de todos los pines por debajo de 50 mA. |
| `DO4` | salida, digital | `%QX0.4` | GP25 | LED integrado en la placa | LED verde integrado en la placa, con su resistencia en serie; no es una salida de campo. Esta imagen es para la Raspberry Pi Pico (RP2040): la Pico W tiene el LED en su chip inalámbrico, y la Pico 2 (RP2350) necesita otra imagen. |
| `DI0` | entrada, digital | `%IX0.0` | GP15 | pin 20 del conector | Entrada de lógica de 3.3 V con la resistencia de pull-up interna del RP2040 activada por el perfil; conecte un interruptor a GND. No tolera 5 V. |
| `DI1` | entrada, digital | `%IX0.1` | GP14 | pin 19 del conector | Entrada de lógica de 3.3 V con la resistencia de pull-up interna del RP2040 activada por el perfil; conecte un interruptor a GND. No tolera 5 V. |
| `DI2` | entrada, digital | `%IX0.2` | GP13 | pin 17 del conector | Entrada de lógica de 3.3 V con la resistencia de pull-up interna del RP2040 activada por el perfil; conecte un interruptor a GND. No tolera 5 V. |
| `DI3` | entrada, digital | `%IX0.3` | GP12 | pin 16 del conector | Entrada de lógica de 3.3 V con la resistencia de pull-up interna del RP2040 activada por el perfil; conecte un interruptor a GND. No tolera 5 V. |
| `AI0` | entrada, analógica | `%IW4` | GP26 (ADC0) | pin 31 del conector | De 0 V a 3.3 V en la entrada del ADC; no supere 3.3 V. Conecte un potenciómetro de 10 kΩ entre 3V3(OUT) (pin 36 del conector) y AGND (pin 33 del conector), con su cursor en este pin. |
| `AI1` | entrada, analógica | `%IW5` | GP27 (ADC1) | pin 32 del conector | De 0 V a 3.3 V en la entrada del ADC; no supere 3.3 V. |
| `AI2` | entrada, analógica | `%IW6` | GP28 (ADC2) | pin 34 del conector | De 0 V a 3.3 V en la entrada del ADC; no supere 3.3 V. |
| `AI3` | entrada, analógica | `%IW7` | VSYS/3 (ADC3) | interno | Interno: la tensión de alimentación dividida por 3, sin conexión externa. |
| `AI4` | entrada, analógica | `%IW8` | Sensor de temperatura (ADC4) | interno | Sensor de temperatura interno del chip, sin conexión externa. |

Alimentación: 3V3 en 3V3(OUT) · pin 36, GND en GND · pin 38, la tierra de un potenciómetro en AGND · pin 33.

## Lista de materiales

| Pieza | Cantidad | Notas |
| --- | --- | --- |
| Una placa del estudiante: una Raspberry Pi Pico o Pico H, o una ESP32-S3-DevKitC-1 N8R8 | 1 | La Pico W y la Pico 2 W no son compatibles: su LED integrado está en el chip inalámbrico. |
| Cable USB de datos que encaje en el conector de la placa | 1 | Un cable solo de carga no transmite datos, y ZPLC no puede comunicarse con la placa a través de él. |
| Protoboard de 830 puntos | 1 | La DevKitC-1 es ancha: dos medias protoboards una junto a otra dejan una fila libre a cada lado. |
| LED de 5 mm: rojos, verdes y amarillos | 6 | No azules ni blancos: necesitan unos 3 V y encienden poco con 3.3 V. |
| Resistencias de 330 Ω, una en serie con cada LED | 6 |   |
| Pulsadores táctiles de 6×6 mm | 4 |   |
| Resistencias de 10 kΩ | 2 | Piezas de repuesto para experimentar; ninguna lección las necesita. |
| Potenciómetro lineal de 10 kΩ | 1 |   |
| Capacitor de 100 nF | 1 | Opcional: del cursor del potenciómetro a GND, estabiliza la lectura analógica. |
| Cables puente macho-macho | 20 |   |

## Firmware

Cada versión publicada tiene una imagen precompilada para esta placa, `zplc-runtime-<versión>-rpi-pico-rp2040.uf2`. Su SHA-256 se publica en el archivo `SHA256SUMS` de la versión, y la tarjeta de firmware de la aplicación ZPLC lo muestra junto al archivo. [Grabar el firmware](../../guides/flash-firmware.md) da los pasos. Usted realiza cada uno: ZPLC nunca graba una placa.

## Lecciones de la ruta de hardware

| Lección | Id |
| --- | --- |
| [Arranque y parada seguros](./rpi-pico-rp2040/motor-start-stop-safe.md) | `motor-start-stop-safe` |
| [Oscilador TON y realimentación de salida](./rpi-pico-rp2040/blinky-ladder-timer-feedback.md) | `blinky-ladder-timer-feedback` |
| [Flancos y contador de pulsos](./rpi-pico-rp2040/edge-counter-pulses.md) | `edge-counter-pulses` |
| [Ciclo de escaneo y memoria de un ciclo](./rpi-pico-rp2040/scan-cycle-one-scan-memory.md) | `scan-cycle-one-scan-memory` |
| [Lógica booleana: un mando a dos manos con protección](./rpi-pico-rp2040/boolean-logic-two-hand-guard.md) | `boolean-logic-two-hand-guard` |
| [Temporizadores: una luz con retardo a la desconexión y un filtro con retardo a la conexión](./rpi-pico-rp2040/timers-on-delay-off-delay.md) | `timers-on-delay-off-delay` |
| [Escriba un parpadeador en texto estructurado](./rpi-pico-rp2040/blink-structured-text.md) | `blink-structured-text` |
| [Retener una alarma: set y reset, y cuál tiene prioridad](./rpi-pico-rp2040/set-reset-alarm-latch.md) | `set-reset-alarm-latch` |
| [Autorretención en diagrama de escalera: un motor que se mantiene encendido](./rpi-pico-rp2040/seal-in-ladder.md) | `seal-in-ladder` |
| [Contadores en diagrama de bloques de función: contar piezas hasta completar un lote](./rpi-pico-rp2040/counter-batch-fbd.md) | `counter-batch-fbd` |
| [Tipos, aritmética y comparación: un total y tres bandas](./rpi-pico-rp2040/types-arithmetic-comparison.md) | `types-arithmetic-comparison` |
| [Escalado analógico: de cuentas en bruto a un porcentaje](./rpi-pico-rp2040/analog-scaling-integer.md) | `analog-scaling-integer` |
| [Bloques de función: un biestable, dos bombas](./rpi-pico-rp2040/function-block-pump-pair.md) | `function-block-pump-pair` |
| [Estructuras y arreglos: un panel de tres llamadas](./rpi-pico-rp2040/structures-arrays-call-panel.md) | `structures-arrays-call-panel` |
| [Una secuencia en diagrama funcional secuencial: llenar y luego mezclar](./rpi-pico-rp2040/sfc-fill-mix-sequence.md) | `sfc-fill-mix-sequence` |
| [Lista de instrucciones: el resultado actual y el orden de las instrucciones](./rpi-pico-rp2040/instruction-list-door-alarm.md) | `instruction-list-door-alarm` |
| [Una lógica en cinco lenguajes: un portón que se mantiene abierto](./rpi-pico-rp2040/one-logic-five-languages.md) | `one-logic-five-languages` |
| [Escalado analógico en diagrama de bloques de función: una alarma de nivel alto](./rpi-pico-rp2040/analog-scaling-fbd.md) | `analog-scaling-fbd` |
| [Enclavamientos en diagrama de escalera: un motor con inversión de giro](./rpi-pico-rp2040/interlock-reversing-ladder.md) | `interlock-reversing-ladder` |
| [Su propio bloque de función en diagrama de bloques de función: dos válvulas, un bloque](./rpi-pico-rp2040/function-block-valves-fbd.md) | `function-block-valves-fbd` |
| [Verificar mi placa](./rpi-pico-rp2040/verify-my-board.md) | `verify-my-board` |
| [Lógica booleana en escalera: un mando a dos manos](./rpi-pico-rp2040/boolean-logic-two-hand-guard-ladder.md) | `boolean-logic-two-hand-guard-ladder` |
| [Enclavar una alarma en escalera: bobinas SET y RESET, y el orden de los peldaños](./rpi-pico-rp2040/set-reset-alarm-latch-ladder.md) | `set-reset-alarm-latch-ladder` |
| [Retardo a la conexión y a la desconexión en escalera: temporizadores como bloques en un peldaño](./rpi-pico-rp2040/timers-on-delay-off-delay-ladder.md) | `timers-on-delay-off-delay-ladder` |
| [Contar pulsos en escalera: un CTU cuenta los flancos por sí mismo](./rpi-pico-rp2040/edge-counter-pulses-ladder.md) | `edge-counter-pulses-ladder` |
| [Diagrama de bloques de función: un mando a dos manos con protección](./rpi-pico-rp2040/boolean-logic-two-hand-guard-fbd.md) | `boolean-logic-two-hand-guard-fbd` |
| [Temporizadores en diagrama de bloques de función: una luz con retardo a la desconexión y un filtro con retardo a la conexión](./rpi-pico-rp2040/timers-on-delay-off-delay-fbd.md) | `timers-on-delay-off-delay-fbd` |
| [Tipos, aritmética y comparación en diagrama de bloques de función: un total y tres bandas](./rpi-pico-rp2040/types-arithmetic-comparison-fbd.md) | `types-arithmetic-comparison-fbd` |
| [Lista de instrucciones: el resultado actual en un mando a dos manos](./rpi-pico-rp2040/boolean-logic-two-hand-guard-il.md) | `boolean-logic-two-hand-guard-il` |
| [Lista de instrucciones: S y R, y la línea que va al final](./rpi-pico-rp2040/set-reset-alarm-latch-il.md) | `set-reset-alarm-latch-il` |
| [Lista de instrucciones: llamar a un temporizador de retardo a la desconexión y a la conexión](./rpi-pico-rp2040/timers-on-delay-off-delay-il.md) | `timers-on-delay-off-delay-il` |
| [Lista de instrucciones: contar pulsos con un CTU](./rpi-pico-rp2040/edge-counter-pulses-il.md) | `edge-counter-pulses-il` |
| [Lista de instrucciones: aritmética, comparación y un salto en un flanco ascendente](./rpi-pico-rp2040/types-arithmetic-comparison-il.md) | `types-arithmetic-comparison-il` |
| [Lista de instrucciones: llamar a un bloque de función y leer sus salidas](./rpi-pico-rp2040/function-block-call-il.md) | `function-block-call-il` |

{/* <<< END GENERATED: reference/learner-kits/rpi-pico-rp2040 <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
