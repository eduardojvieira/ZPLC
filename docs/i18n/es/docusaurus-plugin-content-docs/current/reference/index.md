---
slug: /reference
id: index
title: Referencia
sidebar_label: Referencia
description: Referencias de configuracion, listas de comandos y matrices de soporte.
tags: [reference]
---

# Referencia

Esta seccion contiene el material de referencia visible para la version v1.5 de ZPLC.

## Referencias de la version v1.5

- Manifiesto canonico de documentacion: `docs/docs/reference/v1-5-canonical-docs-manifest.md`
- Las placas soportadas se obtienen de `firmware/app/boards/supported-boards.v1.5.0.json`
- La validacion del release se registra en `specs/008-release-foundation/artifacts/release-evidence-matrix.md`

## Placas Soportadas

| Placa | IDE ID | Objetivo Zephyr | Red | Validacion |
|-------|--------|-----------------|-----|------------|
| Raspberry Pi Pico (RP2040) | `rpi_pico` | `rpi_pico/rp2040` | Enfoque serial | Cross-build |
| Arduino GIGA R1 (STM32H747 M7) | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | Wi-Fi | Cross-build |
| ESP32-S3 DevKitC | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | Wi-Fi | Cross-build |
| STM32F746G Discovery | `stm32f746g_disco` | `stm32f746g_disco` | Ethernet | Cross-build |

El subconjunto validado por humanos para v1.5.0 debe incluir al menos una placa enfocada
en serial y una placa con capacidad de red antes de la aprobacion final del release.
