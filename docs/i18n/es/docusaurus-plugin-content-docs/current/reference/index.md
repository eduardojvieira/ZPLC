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

## Empezá por acá para las superficies centrales reescritas

- [Primeros Pasos](/getting-started) — instalación, primer proyecto, caminos de simulación y handoff a hardware soportado
- [Arquitectura del Sistema](/architecture) — límites del sistema, relaciones IDE/compilador/runtime y principios de funcionamiento
- [Visión General del Runtime](/runtime) — responsabilidades del runtime, modelo de ejecución y mapa de subsistemas

## Referencias de la version v1.5

- [Manifiesto canónico de documentación](./v1-5-canonical-docs-manifest.md)
- [Fuentes de verdad](./source-of-truth.md)
- [API del Runtime](./runtime-api.md)
- [Placas soportadas](./boards.md)
- [Configuración del Workspace Zephyr](./zephyr-workspace-setup.md)
- Las placas soportadas se obtienen de `firmware/app/boards/supported-boards.v1.5.0.json`
- La validacion del release se registra en `specs/008-release-foundation/artifacts/release-evidence-matrix.md`

## Placas Soportadas

| Placa | IDE ID | Objetivo Zephyr | Red | Validacion |
|-------|--------|-----------------|-----|------------|
| Raspberry Pi Pico (RP2040) | `rpi_pico` | `rpi_pico/rp2040` | Enfoque serial | cross-build |
| Arduino GIGA R1 (STM32H747 M7) | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | Enfoque serial | cross-build |
| ESP32-S3 DevKitC | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | Capacidad de red (Wi-Fi) | cross-build |
| STM32F746G Discovery | `stm32f746g_disco` | `stm32f746g_disco` | Capacidad de red (Ethernet) | cross-build |
| STM32 Nucleo-H743ZI | `nucleo_h743zi` | `nucleo_h743zi` | Capacidad de red (Ethernet) | cross-build |

El subconjunto validado por humanos para v1.5.0 debe incluir al menos una placa enfocada
en serial y una placa con capacidad de red antes de la aprobacion final del release.
