---
slug: /integration
id: index
title: Integración y Despliegue
sidebar_label: Integración
description: Cómo integrar ZPLC en el hardware de destino y flujos de trabajo de despliegue.
tags: [integration, runtime]
---

# Integración y Despliegue

Esta sección cubre cómo integrar el runtime de ZPLC en sus objetivos de hardware y cómo gestionar el despliegue de aplicaciones PLC.

## Soporte de Plataforma

ZPLC está diseñado para ser altamente portable. Principalmente tiene como objetivo Zephyr RTOS, que proporciona un amplio soporte de hardware.

Los objetivos actualmente soportados y probados incluyen:

*   **STM32H7 / M7 Core** (`arduino_giga_r1/stm32h747xx/m7`, `nucleo_h743zi`)
*   **ESP32-S3** (`esp32s3_devkitc`)
*   **Raspberry Pi Pico** (`rpi_pico`)
*   **POSIX** (Linux/macOS para simulación y pruebas)
*   **WASM** (Simulación en navegador)

## Integración de ZPLC

La integración de ZPLC en una placa Zephyr personalizada implica:

1.  **Incluir la Biblioteca**: Añada `libzplc_core` a su compilación CMake.
2.  **Implementar la HAL**: Proporcione implementaciones específicas para las interfaces de hardware requeridas (`zplc_hal_*`) definidas en `docs/docs/runtime/hal-contract.md`.
3.  **Inicializar el Core**: Llame a las funciones de inicialización desde su aplicación `main()` de Zephyr.

## Flujos de Trabajo de Despliegue

Una vez que el runtime está integrado en un dispositivo, el despliegue de la lógica se gestiona a través del IDE:

1.  **Despliegue Serie**: Para el desarrollo local, el IDE puede transferir los archivos `.zplc` compilados directamente a través de una conexión serie.
2.  **Despliegue de Red**: Para dispositivos remotos (por ejemplo, a través de Wi-Fi en ESP32), el despliegue puede ocurrir sobre TCP/IP (MQTT o un protocolo personalizado, dependiendo de la implementación de su HAL).

*Nota: Para guías detalladas de implementación de HAL, consulte la [Documentación del Runtime](../runtime/index.md).*