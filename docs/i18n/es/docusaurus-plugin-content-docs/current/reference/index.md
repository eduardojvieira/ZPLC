---
slug: /reference
id: index
title: Referencias
sidebar_label: Referencias
description: APIs, placas catalogadas y documentación técnica de ZPLC.
tags: [reference]
---

# Referencias técnicas

Esta sección reúne la referencia técnica de ZPLC. Las placas de la tabla
reproducen el manifest versionado: no son una calificación HIL ni de producción.

## Empezar por la arquitectura

- [Primeros pasos](../getting-started/index.md) — instalación, primer proyecto, simulación y paso a hardware compatible.
- [Arquitectura del sistema](../architecture/index.md) — límites entre IDE, compilador, runtime y Zephyr.
- [Runtime](../runtime/index.md) — responsabilidades, modelo de ejecución y subsistemas.

## Referencia de ZPLC v1.5

- [API del runtime](./runtime-api.md)
- [Placas catalogadas](./boards.md)
- [Preparar el workspace de Zephyr](./zephyr-workspace-setup.md)


## Placas Soportadas

| Placa | IDE ID | Zephyr Target | Capacidad de red | Validación |
|-------|--------|---------------|------------------|------------|
| Raspberry Pi Pico (RP2040) | `rpi_pico` | `rpi_pico/rp2040` | Enfoque serial | cross-build |
| Arduino GIGA R1 (STM32H747 M7) | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | Enfoque serial | cross-build |
| ESP32-S3 DevKitC | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | Capacidad de red (Wi-Fi) | cross-build |
| STM32F746G Discovery | `stm32f746g_disco` | `stm32f746g_disco/stm32f746xx` | Capacidad de red (Ethernet) | cross-build |
| STM32 Nucleo-H743ZI | `nucleo_h743zi` | `nucleo_h743zi/stm32h743xx` | Capacidad de red (Ethernet) | cross-build |
| Arduino Opta WiFi (STM32H747 M7) | `arduino_opta_wifi` | `arduino_opta/stm32h747xx/m7` | Capacidad de red (Wi-Fi) | cross-build |

La tabla refleja `firmware/app/boards/supported-boards.v1.5.0.json`. El nivel
`cross-build` sólo registra la validación del manifest; no afirma HIL ni
calificación de producción.
