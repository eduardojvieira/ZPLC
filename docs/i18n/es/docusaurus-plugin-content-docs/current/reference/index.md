---
slug: /reference
id: index
title: Index de Referencias
sidebar_label: Referencias
description: APIS, Comandos, Compatibilidad y Documentos técnicos.
tags: [reference]
---

# Referencias Técnicas

Esta sección aloja y vincula referencias técnicas en bruto para ZPLC.

## Puntos de Partida de Arquitectura Estructural

- [Puesta y Primeros Pasos](../getting-started/index.md) — instalación, proyecto uno, simulación nativa y compatibilidad de base.
- [Arquitectura Topológica](../architecture/index.md) — delimitaciones e implementaciones entre el engine ide, compilación, librerías stdlib y Zephyr.
- [Visual General del Motor (Runtime)](../runtime/index.md) — desmenuzado responsivo e internos del microkernel multi-threading y su modelo iterativo nativo en Host/HW Zephyr.

## Documentos Técnicos para ZPLC V1.5 

- [Funciones del Runtime C Base](./runtime-api.md)
- [Hardwares Testeados y Compatibilizados](./boards.md)
- [Instanciando el Motor Interno Zephyr](./zephyr-workspace-setup.md)


## Placas Soportadas

| Placa | IDE ID | Zephyr Target | Capacidad de red | Validación |
|-------|--------|---------------|------------------|------------|
| Raspberry Pi Pico (RP2040) | `rpi_pico` | `rpi_pico/rp2040` | Enfoque serial | cross-build |
| Arduino GIGA R1 (STM32H747 M7) | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | Enfoque serial | cross-build |
| ESP32-S3 DevKitC | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | Capacidad de red (Wi-Fi) | cross-build |
| STM32F746G Discovery | `stm32f746g_disco` | `stm32f746g_disco` | Capacidad de red (Ethernet) | cross-build |
| STM32 Nucleo-H743ZI | `nucleo_h743zi` | `nucleo_h743zi` | Capacidad de red (Ethernet) | cross-build |

*Para informarse más sobre listados exhaustivos y perfiles dinámicos asimilados consulte las hojas detalladas de Hardwares Listados.*
