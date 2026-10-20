---
slug: /guides/build-firmware
id: build-firmware
title: Compilar el firmware desde el código fuente
sidebar_label: Compilar el firmware
description: "Cómo compilar la imagen del runtime de ZPLC para una placa desde el código fuente con el script que usa la integración continua, y qué demuestra una compilación terminada."
tags: [how-to, hardware, firmware]
---

# Compile el firmware desde el código fuente

La compilación produce una imagen del runtime para una placa. Es un paso aparte de
[grabar](./flash-firmware.md), cargar y ejecutar, y **usted inicia cada uno**: el asistente de
ZPLC y el servidor MCP nunca graban, despliegan, fuerzan, inician ni detienen un dispositivo.

:::caution Redactado, ejecutado en un anfitrión solo donde se indica
Los comandos son los de los scripts del repositorio. Las compilaciones de Zephyr no se ejecutaron
al escribir esta página (el espacio de trabajo de Zephyr no está instalado en la máquina que la escribió);
la integración continua compila cada placa del manifiesto y comprueba su presupuesto de flash y RAM.
:::

## 1. Prepare el espacio de trabajo una vez

Unos 15 GB libres y acceso a la red la primera vez. El script crea o verifica el espacio de
trabajo de Zephyr fuera del repositorio, en `~/zplc-zephyr-ws` (cámbielo con `ZPLC_FW_WS`):

```bash
tools/firmware-test/setup.sh
```

Los requisitos y lo que imprime el script están en
[Pruebas de firmware](../development/firmware-testing.md#preparación-única).

## 2. Compile una placa

```bash
tools/firmware-test/run.sh size rpi-pico-rp2040
tools/firmware-test/run.sh size esp32-s3-devkitc
```

El script ejecuta `west build` para la placa del manifiesto y comprueba el uso de flash y RAM
contra el presupuesto registrado. Las imágenes están en `$ZPLC_FW_WS/out/size/<placa>/zephyr/`:
`zephyr.elf` y, para la Pico, `zephyr.uf2`. El ESP32-S3 necesita una vez sus blobs de HAL:
`west blobs fetch hal_espressif`.

El canal de versiones compila con el mismo comando, limpio y sin superposiciones:

```bash
west build -p always -b rpi_pico/rp2040 firmware/app
```

## 3. Siguiente paso

[Grabe el firmware](./flash-firmware.md) y siga [Su primera placa](../tutorials/first-board.md).

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| El firmware de cada placa compila y cabe en su presupuesto | Integración continua, con los comandos de arriba | Compilación |
| Los pasos de esta página en una máquina limpia | No ejecutados aquí | Ninguno |
| Que la imagen corra en la placa | No probado | Ninguno |
