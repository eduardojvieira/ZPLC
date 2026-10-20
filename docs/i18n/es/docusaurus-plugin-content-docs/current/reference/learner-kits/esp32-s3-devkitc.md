---
title: "Kit del estudiante: ESP32-S3-DevKitC-1 (N8R8)"
sidebar_label: "ESP32-S3-DevKitC-1 (N8R8)"
description: "El mapa de pines, las piezas, el firmware y el límite de tensión de la ESP32-S3-DevKitC-1 (N8R8) para el curso, generados a partir del manifiesto de E/S de la placa y del kit."
tags: [learn, hardware, generated]
---

# Kit del estudiante: ESP32-S3-DevKitC-1 (N8R8)

{/* >>> GENERATED (tools/docs/generate_hardware_pages.ts): reference/learner-kits/esp32-s3-devkitc. Do not edit. >>> */}

El kit del curso para la ESP32-S3-DevKitC-1 (N8R8): su mapa de pines, las piezas, el firmware y el límite de tensión. Los pines provienen de `firmware/app/boards/boards.json` y las piezas de `packages/zplc-ide/lessons/kit.json`. La página [kits del estudiante](./index.md) explica cómo una lección declara su cableado.

## Límite de tensión

- Los pines de E/S de las dos placas del estudiante funcionan solo con lógica de 3.3 V.
- Nunca conecte 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más de 3.3 V ni nada que provenga de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 de la placa y una las tierras (GND).
- Mantenga cada salida por debajo de 10 mA: un LED con una resistencia de 330 Ω consume unos 4 mA. En la Pico, mantenga el total de todos los pines por debajo de 50 mA.
- Cablee con el cable USB desconectado y revise el cableado dos veces antes de conectarlo.

## Mapa de pines

| Canal | Dirección | Dirección IEC | Pin | Ubicación | Notas |
| --- | --- | --- | --- | --- | --- |
| `DO0` | salida, digital | `%QX0.0` | GPIO15 | pin 8 del conector J1 | Lógica de 3.3 V. No tolera 5 V. Mantenga la carga por debajo de 10 mA: un LED con 330 Ω en serie consume unos 4 mA. |
| `DO1` | salida, digital | `%QX0.1` | GPIO16 | pin 9 del conector J1 | Lógica de 3.3 V. No tolera 5 V. Mantenga la carga por debajo de 10 mA: un LED con 330 Ω en serie consume unos 4 mA. |
| `DO2` | salida, digital | `%QX0.2` | GPIO17 | pin 10 del conector J1 | Lógica de 3.3 V. No tolera 5 V. Mantenga la carga por debajo de 10 mA: un LED con 330 Ω en serie consume unos 4 mA. |
| `DO3` | salida, digital | `%QX0.3` | GPIO18 | pin 11 del conector J1 | Lógica de 3.3 V. No tolera 5 V. Mantenga la carga por debajo de 10 mA: un LED con 330 Ω en serie consume unos 4 mA. |
| `DI0` | entrada, digital | `%IX0.0` | GPIO5 | pin 5 del conector J1 | Entrada de lógica de 3.3 V con la resistencia de pull-up interna activada por el perfil, activa en bajo: conecte un pulsador a GND. No tolera 5 V. |
| `DI1` | entrada, digital | `%IX0.1` | GPIO6 | pin 6 del conector J1 | Entrada de lógica de 3.3 V con la resistencia de pull-up interna activada por el perfil, activa en bajo: conecte un pulsador a GND. No tolera 5 V. |
| `DI2` | entrada, digital | `%IX0.2` | GPIO7 | pin 7 del conector J1 | Entrada de lógica de 3.3 V con la resistencia de pull-up interna activada por el perfil, activa en bajo: conecte un pulsador a GND. No tolera 5 V. |
| `DI3` | entrada, digital | `%IX0.3` | GPIO8 | pin 12 del conector J1 | Entrada de lógica de 3.3 V con la resistencia de pull-up interna activada por el perfil, activa en bajo: conecte un pulsador a GND. No tolera 5 V. |
| `DI4` | entrada, digital | `%IX0.4` | GPIO0 (botón BOOT) | botón BOOT de la placa | Botón BOOT de la placa, activo en bajo con la resistencia de pull-up interna: una entrada adicional que no necesita cableado y no es una de las cuatro entradas del estudiante. Es un pin de configuración de arranque (strapping): no lo mantenga presionado mientras la placa se reinicia, o la placa arranca en modo de descarga. |
| `AI0` | entrada, analógica | `%IW4` | GPIO4 (ADC1_CH3) | pin 4 del conector J1 | De 0 V a unos 3.1 V con atenuación de 12 dB (algunos chips llegan solo a unos 2.9 V); nunca aplique más de 3.3 V. Conecte un potenciómetro de 10 kΩ entre 3V3 (pin 1 del conector J1) y GND (pin 22 del conector J1), con su cursor en este pin. |

Alimentación: 3V3 en 3V3 · J1-1, GND en GND · J1-22, la tierra de un potenciómetro en GND · J1-22.

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

Cada versión publicada tiene una imagen precompilada para esta placa, `zplc-runtime-<versión>-esp32-s3-devkitc.bin`. Su SHA-256 se publica en el archivo `SHA256SUMS` de la versión, y la tarjeta de firmware de Studio lo muestra junto al archivo. [Grabar el firmware](../../guides/flash-firmware.md) da los pasos. Usted realiza cada uno: Studio nunca graba una placa.

## Lecciones de la ruta de hardware

| Lección | Id |
| --- | --- |
| [Arranque y parada seguros](./esp32-s3-devkitc/motor-start-stop-safe.md) | `motor-start-stop-safe` |
| [Oscilador TON y realimentación de salida](./esp32-s3-devkitc/blinky-ladder-timer-feedback.md) | `blinky-ladder-timer-feedback` |
| [Flancos y contador de pulsos](./esp32-s3-devkitc/edge-counter-pulses.md) | `edge-counter-pulses` |
| [Ciclo de escaneo y memoria de un ciclo](./esp32-s3-devkitc/scan-cycle-one-scan-memory.md) | `scan-cycle-one-scan-memory` |
| [Lógica booleana: un mando a dos manos con protección](./esp32-s3-devkitc/boolean-logic-two-hand-guard.md) | `boolean-logic-two-hand-guard` |
| [Temporizadores: una luz con retardo a la desconexión y un filtro con retardo a la conexión](./esp32-s3-devkitc/timers-on-delay-off-delay.md) | `timers-on-delay-off-delay` |
| [Escriba un parpadeador en texto estructurado](./esp32-s3-devkitc/blink-structured-text.md) | `blink-structured-text` |
| [Retener una alarma: set y reset, y cuál tiene prioridad](./esp32-s3-devkitc/set-reset-alarm-latch.md) | `set-reset-alarm-latch` |
| [Autorretención en diagrama de escalera: un motor que se mantiene encendido](./esp32-s3-devkitc/seal-in-ladder.md) | `seal-in-ladder` |
| [Contadores en diagrama de bloques de función: contar piezas hasta completar un lote](./esp32-s3-devkitc/counter-batch-fbd.md) | `counter-batch-fbd` |
| [Tipos, aritmética y comparación: un total y tres bandas](./esp32-s3-devkitc/types-arithmetic-comparison.md) | `types-arithmetic-comparison` |
| [Escalado analógico: de cuentas en bruto a un porcentaje](./esp32-s3-devkitc/analog-scaling-integer.md) | `analog-scaling-integer` |
| [Bloques de función: un biestable, dos bombas](./esp32-s3-devkitc/function-block-pump-pair.md) | `function-block-pump-pair` |
| [Estructuras y arreglos: un panel de tres llamadas](./esp32-s3-devkitc/structures-arrays-call-panel.md) | `structures-arrays-call-panel` |
| [Una secuencia en diagrama funcional secuencial: llenar y luego mezclar](./esp32-s3-devkitc/sfc-fill-mix-sequence.md) | `sfc-fill-mix-sequence` |
| [Lista de instrucciones: el resultado actual y el orden de las instrucciones](./esp32-s3-devkitc/instruction-list-door-alarm.md) | `instruction-list-door-alarm` |
| [Una lógica en cinco lenguajes: un portón que se mantiene abierto](./esp32-s3-devkitc/one-logic-five-languages.md) | `one-logic-five-languages` |
| [Escalado analógico en diagrama de bloques de función: una alarma de nivel alto](./esp32-s3-devkitc/analog-scaling-fbd.md) | `analog-scaling-fbd` |
| [Verificar mi placa](./esp32-s3-devkitc/verify-my-board.md) | `verify-my-board` |

{/* <<< END GENERATED: reference/learner-kits/esp32-s3-devkitc <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
