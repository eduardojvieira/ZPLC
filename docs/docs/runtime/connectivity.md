---
slug: /runtime/connectivity
id: connectivity
title: Connectivity & Protocols
sidebar_label: Connectivity
description: Overview of supported industrial network protocols and board capabilities in ZPLC.
---

# Connectivity & Protocols

ZPLC provides built-in support for standard industrial automation protocols, allowing your controllers to interact with field devices, SCADA systems, and cloud platforms.

## Board Capabilities

Protocol support depends on the physical capabilities of your target board. ZPLC categorizes boards into three levels of connectivity:

- **Serial-only**: Supports protocols like Modbus RTU via UART/RS-485.
- **Wi-Fi capable**: Supports TCP/UDP protocols (Modbus TCP, MQTT) over wireless networks (e.g., ESP32-S3).
- **Ethernet capable**: Supports TCP/UDP protocols over wired connections (e.g., STM32 Nucleo/Discovery).

The IDE automatically filters available protocols based on your selected board profile.

## Supported Protocols

ZPLC natively supports:

- **Modbus**: Both Modbus RTU (Serial) and Modbus TCP (Network).
- **MQTT**: Standard MQTT publish/subscribe messaging for IIoT integration, including profiles for Sparkplug B, standard brokers, AWS IoT Core, and Azure IoT Hub.

## Configuring Connectivity

Connectivity is defined in your project's `zplc.json` file. Through the IDE, you can:
1. Configure Modbus RTU/TCP networks (baud rates, IP addresses, node IDs).
2. Set up MQTT broker credentials and certificates.
3. Map internal PLC variables directly to Modbus registers/coils or MQTT topics via **Communication Bindings**.

The runtime handles the underlying protocol dispatch automatically while your PLC logic is executing.
