---
slug: /integration
id: index
title: Integration & Deployment
sidebar_label: Integration
description: How to embed ZPLC into target hardware and deployment workflows.
tags: [integration, runtime]
---

# Integration & Deployment

This section covers how to embed the ZPLC runtime into your hardware targets and how to manage the deployment of PLC applications.

## Platform Support

ZPLC is designed to be highly portable. It primarily targets Zephyr RTOS, which provides broad hardware support.

Currently supported and tested targets include:

*   **STM32H7 / M7 Core** (`arduino_giga_r1/stm32h747xx/m7`, `nucleo_h743zi`)
*   **ESP32-S3** (`esp32s3_devkitc`)
*   **Raspberry Pi Pico** (`rpi_pico`)
*   **POSIX** (Linux/macOS for simulation and testing)
*   **WASM** (Browser simulation)

## Embedding ZPLC

Integrating ZPLC into a custom Zephyr board involves:

1.  **Including the Library**: Add `libzplc_core` to your CMake build.
2.  **Implementing the HAL**: Provide specific implementations for the required hardware interfaces (`zplc_hal_*`) defined in `docs/docs/runtime/hal-contract.md`.
3.  **Initializing the Core**: Call the initialization functions from your Zephyr `main()` application.

## Deployment Workflows

Once the runtime is embedded on a device, deploying logic is managed via the IDE:

1.  **Serial Deployment**: For local development, the IDE can transfer compiled `.zplc` files directly over a serial connection.
2.  **Network Deployment**: For remote devices (e.g., via ESP32 Wi-Fi), deployment can occur over TCP/IP (MQTT or a custom protocol, depending on your HAL implementation).

*Note: For detailed HAL implementation guides, refer to the [Runtime Documentation](../runtime/index.md).*