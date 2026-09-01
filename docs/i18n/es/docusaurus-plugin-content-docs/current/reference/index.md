---
slug: /reference
id: index
title: Referencias
sidebar_label: Referencias
description: APIs, profiles de placa, niveles de evidencia y setup Zephyr de ZPLC 2.0.
tags: [reference]
---

# Referencias

Usá esta sección para identificar el contrato actual y la evidencia detrás de un
claim. Que exista un profile no es calificación HIL ni de producción.

## Empezá acá

- [Capacidades y evidencia](./capabilities-evidence.md) — cómo leer resultados host, POSIX, paquete, Twister/QEMU, cross-build y HIL.
- [Profiles de placa](./boards.md) — datos generados desde el nombre histórico del manifest.
- [API del runtime](./runtime-api.md) — referencia C generada desde headers.
- [Preparar workspace Zephyr](./zephyr-workspace-setup.md) — inputs de build reproducible.

## Placas Soportadas

| Placa | IDE ID | Target Zephyr | Capacidad de red | Validación |
|-------|--------|---------------|------------------|------------|
| Raspberry Pi Pico (RP2040) | `rpi_pico` | `rpi_pico/rp2040` | Enfoque serial | cross-build |
| Arduino GIGA R1 (STM32H747 M7) | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | Enfoque serial | cross-build |
| ESP32-S3 DevKitC | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | Capacidad de red (Wi-Fi) | cross-build |
| STM32F746G Discovery | `stm32f746g_disco` | `stm32f746g_disco/stm32f746xx` | Capacidad de red (Ethernet) | cross-build |
| STM32 Nucleo-H743ZI | `nucleo_h743zi` | `nucleo_h743zi/stm32h743xx` | Capacidad de red (Ethernet) | cross-build |
| Arduino Opta WiFi (STM32H747 M7) | `arduino_opta_wifi` | `arduino_opta/stm32h747xx/m7` | Capacidad de red (Wi-Fi) | cross-build |

La tabla refleja `firmware/app/boards/supported-boards.v1.5.0.json`. Cada
fila actual tiene cero referencias de evidencia HIL.
