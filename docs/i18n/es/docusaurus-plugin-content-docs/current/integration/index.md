---
slug: /integration
id: index
title: Despliegue y Montaje de Hardware
sidebar_label: Hardware e Integración
description: Adaptando, flasheando y engranando rutinas personalizadas de Zephyr Firmware con tu lógica ZPLC.
tags: [integration, runtime]
---

# Despliegue de Hardware Local o Personalizado

La instancia a detallar enmarca o traza el proceso intermedio e interactivo donde la abstracción general viaja desde simuladores hacia su fin e incrustación en Hardware Zephyr Operativo para fabricantes masivos u OEM integraciones dedicadas del sistema.

## Ciclos y Cargas

El objetivo se cumple y es emitido hacia tres opciones funcionales, todas gobernadas en última o única instancia vía interface nativa IDE ZPLC:

```mermaid
flowchart LR
  A[Bytecode validado y Compilado .zplc] --> B{Flujo Objetivo a desplegar}
  B --> D[Software Simulado POSIX SoftPLC base]
  B --> E[Descargas Vía Firmware e Imagen Original Base (Zephyr RTOS HW)]
  E --> F[Vistas OnLine Vía Sensores Replicados IDE]
```

## Embebiendo o Fusionando Custom Firmware en Fabricantes (OEM)

Si integras ZPLC a un modelo comercializado e innovado que precise directrices estrictas que ZPLC no trae en su base por su particularidad electrónica (ej; manejo y operación compleja de controladores para display CAN nativo, manejo SPI a ultra velocidades asíncronas para cámaras IoT etc):

1. **Ligando C Núcleos Oficiales**: Instanciar la base Core `libzplc_core` al subruteado o árbol Build del IDE con su configuración CMake en Zephyr de Custom.
2. **Re-Mapeo al Contracto HAL**: Rellenar implementaciones manualizadas hacia los punteros o abstracciones básicas (Ej `zplc_hal_tick` por temporización Zephyr Nativa o implementado lectura Custom de registros Aislados GPIO en `zplc_hal_io_read`).
3. **Inicio Cíclico Inyectable**: Arrastre el inicializado base con la instancia globalizada nativa `zplc_scheduler_init()` permitiendo así el multihilo cíclico principal C de Zephyr para encolamiento asíncrono sin pérdidas a sus periféricos o librerías del MCU elegida.

Sorteado favorablemente el listado inferior a librerías ZPLC se es portador pleno del entorno y motor determinístico a hardware no comerciales que cuenten con implementaciones Linux o baremetals nativos listados para RTOS POSIX/Zephyr globalmente conocidos.

## Dependientes Globales Modbus o Nube Sensórica

ZPLC acata operaciones en su runtime independientemente y con plena versatilidad, pero está sujeto férreamente bajo el limitante estructural si la conectividad no existe de su hardware original al tratar de operar:

- **Buses Criptográficos IoT / Nube (MQTT)**: Condicionado si posee Wifi Nativo su HW, transcodificadores serial a Wi-Fi implementados nativamente a LwIP local o stacks para Módems con sockets TCP por PPP, caso contrario estas rutinas IEC en ST compilan a `.zplc` pero caen a errores en llamadas HAL asertivas físicas por RTOS.
- **Red Fuerte Ethernet Local (Modbus TCP)**: Estricto control local enclavado Ethernet base (SPI Ethernet Módulos, PHY). Modbus actuará y abrirá el socket mediante ruteo.
- **Plataformas de Dispositivos Maestro Esclavo Analógico (Modbus RTU)**: Solicitudes que dependan de interconectores RS-485 requiriendo inyección hardware con MAX485 y tracción por Software e impliquen pines bidireccionales asignados por Serial/UART Zephyr nativo a rutear correctamente por la aplicación.

Dado el diseño de abstracción base ZPLC los errores de software jamás escalan a problemas o paralizaciones generalizadas. Las peticiones a interfaces irreales por el MCU, abortarán in-situ reportando loggings a registros visualizados de IDE salvaguardando o manteniendo control industrial activo del resto programático sin colisión del firmware.

## Actualizaciones Firmwares (Descargas y Quemadores)

Ajustando los procesos antes de desplegar `.zplc` y rutear en línea lógica con hardware, debe obligarse primero el cargado base C de imagen C/Zephyr ZPLC Boot mediante las matrices originales predispuestas u opcionales según manufacturado (Microchips o Target Selection):
- Cargas C genéricas orientadas por ARM pueden operar transitoriamente en su OS por `west flash --runner` acudiendo con STLinks/JLinks nativos por interfaces de la PC Host.
- Despliegue puro masificado o rápido (como líneas ESP32 Series o Teensys robustos) con herramientas integradas `python -esptool` inter USB sin requerimiento ST-Link hardware o puentes dedicados extra.
- Tarjetas embebidas y series tipo MicroPython/RP2040 Pico (Raspberry) asimilarán archivos auto extraíbles (Bootloader y Payload listos UF2 format) y asolazándose al conectarlos de inmediato y flasheando memorias.
