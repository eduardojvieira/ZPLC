---
slug: /runtime/connectivity
id: connectivity
title: Conectividad y Protocolos
sidebar_label: Conectividad
description: Resumen de los protocolos de red industrial soportados y capacidades de las placas en ZPLC.
---

# Conectividad y Protocolos

ZPLC provee soporte integrado para protocolos de automatización industrial estándar, permitiendo que tus controladores interactúen con dispositivos de campo, sistemas SCADA y plataformas en la nube.

## Capacidades de la Placa

El soporte de protocolos depende de las capacidades físicas de tu placa objetivo. ZPLC categoriza las placas en tres niveles de conectividad:

- **Solo Serial**: Soporta protocolos como Modbus RTU a través de UART/RS-485.
- **Con capacidad Wi-Fi**: Soporta protocolos TCP/UDP (Modbus TCP, MQTT) mediante redes inalámbricas (ej. ESP32-S3).
- **Con capacidad Ethernet**: Soporta protocolos TCP/UDP sobre conexiones cableadas (ej. STM32 Nucleo/Discovery).

El IDE filtra automáticamente los protocolos disponibles basándose en el perfil de placa seleccionado.

## Protocolos Soportados

ZPLC soporta de forma nativa:

- **Modbus**: Tanto Modbus RTU (Serial) como Modbus TCP (Red).
- **MQTT**: Mensajería estándar MQTT publicación/suscripción para integración IIoT, incluyendo perfiles para Sparkplug B, brokers estándar, AWS IoT Core y Azure IoT Hub.

## Configurando la Conectividad

La conectividad se define en el archivo `zplc.json` de tu proyecto. A través del IDE, puedes:
1. Configurar redes Modbus RTU/TCP (baud rates, direcciones IP, node IDs).
2. Configurar credenciales de brokers MQTT y certificados.
3. Mapear variables de PLC internas directamente hacia registros/bobinas Modbus o tópicos MQTT a través de **Bindings de Comunicación**.

El runtime maneja automáticamente la retransmisión del protocolo por debajo mientras tu lógica de PLC ejecuta.
