---
title: "Kit del estudiante: Raspberry Pi Pico (RP2040)"
sidebar_label: "Raspberry Pi Pico (RP2040)"
description: "El mapa de pines, las piezas, el firmware y el límite de tensión de la Raspberry Pi Pico (RP2040) para el curso, generados del manifiesto de E/S de la placa y del kit."
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
| `DO0` | salida, digital | `%QX0.0` | GP0 | header pin 1 | 3.3 V logic. Not 5 V tolerant. RP2040 drive strength is configurable up to 12 mA per pin (datasheet, not qualified here). |
| `DO1` | salida, digital | `%QX0.1` | GP1 | header pin 2 | 3.3 V logic. Not 5 V tolerant. RP2040 drive strength is configurable up to 12 mA per pin (datasheet, not qualified here). |
| `DO2` | salida, digital | `%QX0.2` | GP2 | header pin 4 | 3.3 V logic. Not 5 V tolerant. RP2040 drive strength is configurable up to 12 mA per pin (datasheet, not qualified here). |
| `DO3` | salida, digital | `%QX0.3` | GP3 | header pin 5 | 3.3 V logic. Not 5 V tolerant. RP2040 drive strength is configurable up to 12 mA per pin (datasheet, not qualified here). |
| `DO4` | salida, digital | `%QX0.4` | GP25 | on-board LED | On-board green LED through its series resistor; not a field output. |
| `DI0` | entrada, digital | `%IX0.0` | GP15 | header pin 20 | 3.3 V logic input with the RP2040 internal pull-up enabled by the profile; connect a switch to GND. Not 5 V tolerant. |
| `DI1` | entrada, digital | `%IX0.1` | GP14 | header pin 19 | 3.3 V logic input with the RP2040 internal pull-up enabled by the profile; connect a switch to GND. Not 5 V tolerant. |
| `DI2` | entrada, digital | `%IX0.2` | GP13 | header pin 17 | 3.3 V logic input with the RP2040 internal pull-up enabled by the profile; connect a switch to GND. Not 5 V tolerant. |
| `DI3` | entrada, digital | `%IX0.3` | GP12 | header pin 16 | 3.3 V logic input with the RP2040 internal pull-up enabled by the profile; connect a switch to GND. Not 5 V tolerant. |
| `AI0` | entrada, analógica | `%IW4` | GP26 (ADC0) | header pin 31 | 0 V to 3.3 V on the ADC input; do not exceed 3.3 V. |
| `AI1` | entrada, analógica | `%IW5` | GP27 (ADC1) | header pin 32 | 0 V to 3.3 V on the ADC input; do not exceed 3.3 V. |
| `AI2` | entrada, analógica | `%IW6` | GP28 (ADC2) | header pin 34 | 0 V to 3.3 V on the ADC input; do not exceed 3.3 V. |
| `AI3` | entrada, analógica | `%IW7` | VSYS/3 (ADC3) | internal | Internal: the supply voltage divided by 3, no external connection. |
| `AI4` | entrada, analógica | `%IW8` | Temperature sensor (ADC4) | internal | Internal die temperature sensor, no external connection. |

Alimentación: 3V3 en 3V3(OUT) · pin 36, GND en GND · pin 38, la tierra de un potenciómetro en AGND · pin 33.

## Lista de materiales

| Pieza | Cantidad | Notas |
| --- | --- | --- |
| Una placa del estudiante: una Raspberry Pi Pico o Pico H, o una ESP32-S3-DevKitC-1 N8R8 | 1 | La Pico W y la Pico 2 W no son compatibles: su LED integrado está en el chip inalámbrico. |
| Cable USB de datos que encaje en el conector de la placa | 1 | Un cable solo de carga no transmite datos, y Studio no puede comunicarse con la placa a través de él. |
| Protoboard de 830 puntos | 1 | La DevKitC-1 es ancha: dos medias protoboards una junto a otra dejan una fila libre a cada lado. |
| LED de 5 mm: rojos, verdes y amarillos | 6 | No azules ni blancos: necesitan unos 3 V y encienden poco con 3.3 V. |
| Resistencias de 330 Ω, una en serie con cada LED | 6 |   |
| Pulsadores táctiles de 6×6 mm | 3 |   |
| Resistencias de 10 kΩ | 2 | Piezas de repuesto para experimentar; ninguna lección las necesita. |
| Potenciómetro lineal de 10 kΩ | 1 |   |
| Capacitor de 100 nF | 1 | Opcional: del cursor del potenciómetro a GND, estabiliza la lectura analógica. |
| Cables puente macho-macho | 20 |   |

## Firmware

Cada versión publicada tiene una imagen precompilada para esta placa, `zplc-runtime-<versión>-rpi-pico-rp2040.uf2`. Su SHA-256 se publica en el archivo `SHA256SUMS` de la versión, y la tarjeta de firmware de Studio lo muestra junto al archivo. [Grabar el firmware](../../guides/flash-firmware.md) da los pasos. Usted realiza cada uno: Studio nunca graba una placa.

## Lecciones de la ruta de hardware

| Lección | Id |
| --- | --- |
| [Arranque y parada seguros](./rpi-pico-rp2040/motor-start-stop-safe.md) | `motor-start-stop-safe` |
| [Oscilador TON y realimentación de salida](./rpi-pico-rp2040/blinky-ladder-timer-feedback.md) | `blinky-ladder-timer-feedback` |
| [Flancos y contador de pulsos](./rpi-pico-rp2040/edge-counter-pulses.md) | `edge-counter-pulses` |
| [Ciclo de scan y memoria de un ciclo](./rpi-pico-rp2040/scan-cycle-one-scan-memory.md) | `scan-cycle-one-scan-memory` |
| [Lógica booleana: un mando a dos manos con protección](./rpi-pico-rp2040/boolean-logic-two-hand-guard.md) | `boolean-logic-two-hand-guard` |
| [Temporizadores: una luz con retardo a la desconexión y un filtro con retardo a la conexión](./rpi-pico-rp2040/timers-on-delay-off-delay.md) | `timers-on-delay-off-delay` |
| [Escriba un parpadeador en Structured Text](./rpi-pico-rp2040/blink-structured-text.md) | `blink-structured-text` |
| [Enclavar una alarma: set y reset, y cuál gana](./rpi-pico-rp2040/set-reset-alarm-latch.md) | `set-reset-alarm-latch` |
| [Autorretención en Ladder: un motor que se mantiene encendido](./rpi-pico-rp2040/seal-in-ladder.md) | `seal-in-ladder` |
| [Contadores en diagrama de bloques de función: contar piezas hasta un lote](./rpi-pico-rp2040/counter-batch-fbd.md) | `counter-batch-fbd` |
| [Tipos, aritmética y comparación: un total y tres bandas](./rpi-pico-rp2040/types-arithmetic-comparison.md) | `types-arithmetic-comparison` |
| [Escalado analógico: de cuentas crudas a un porcentaje](./rpi-pico-rp2040/analog-scaling-integer.md) | `analog-scaling-integer` |
| [Bloques de función: un enclavamiento, dos bombas](./rpi-pico-rp2040/function-block-pump-pair.md) | `function-block-pump-pair` |
| [Estructuras y arreglos: un panel de tres llamadas](./rpi-pico-rp2040/structures-arrays-call-panel.md) | `structures-arrays-call-panel` |
| [Una secuencia en diagrama funcional de secuencias: llenar y luego mezclar](./rpi-pico-rp2040/sfc-fill-mix-sequence.md) | `sfc-fill-mix-sequence` |
| [Lista de instrucciones: el resultado actual y el orden de las instrucciones](./rpi-pico-rp2040/instruction-list-door-alarm.md) | `instruction-list-door-alarm` |
| [Una lógica en cinco lenguajes: un portón que se mantiene abierto](./rpi-pico-rp2040/one-logic-five-languages.md) | `one-logic-five-languages` |
| [Verificar mi placa](./rpi-pico-rp2040/verify-my-board.md) | `verify-my-board` |

{/* <<< END GENERATED: reference/learner-kits/rpi-pico-rp2040 <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
