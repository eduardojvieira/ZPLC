---
slug: /guides/build-firmware
id: build-firmware
title: Compilar el firmware desde el código fuente
sidebar_label: Compilar el firmware
description: 'Compile la imagen del runtime de ZPLC para una placa con el script del repositorio, compruebe su presupuesto de tamaño y sepa qué demuestra una compilación terminada.'
tags: [how-to, hardware, firmware]
---

# Compilar el firmware desde el código fuente

Siga esta página para producir la imagen del runtime de una placa. Compilar es un paso aparte de [grabar](./flash-firmware.md), cargar y ejecutar. Usted inicia cada uno: el asistente de ZPLC y el servidor MCP nunca graban, cargan, fuerzan, arrancan ni detienen un dispositivo.

:::note Nivel de evidencia: compilación para el destino
La integración continua compila cada placa del manifiesto con `west build -p always` y comprueba su presupuesto de flash y RAM con `fwtest.py size`, el verificador que llama `run.sh size`. Esta página se escribió sin ejecutar una compilación de Zephyr en la máquina de quien la redactó, así que los pasos se leyeron de los scripts y no de una ejecución en una máquina limpia.
:::

## 1. Cree el espacio de trabajo una vez

Cuente con unos 15 GB libres y acceso a la red la primera vez: el espacio de trabajo ocupa unos 6,6 GB, el SDK de Zephyr unos 7 GB instalado completo y las salidas de compilación el resto. El script crea o verifica el espacio de trabajo de Zephyr fuera del repositorio, en `~/zplc-zephyr-ws`. Defina `ZPLC_FW_WS` para usar otra carpeta.

```bash
tools/firmware-test/setup.sh
```

Los requisitos y la salida del script están en [Pruebas de firmware](../development/firmware-testing.md#preparación-única).

## 2. Compile una placa

Indique el `board_id` del manifiesto ([Placas](../reference/boards.md)):

```bash
tools/firmware-test/run.sh size rpi-pico-rp2040
tools/firmware-test/run.sh size esp32-s3-devkitc
```

El script ejecuta `west build` para esa placa y compara el uso de flash y RAM con el presupuesto registrado. Las imágenes quedan en `$ZPLC_FW_WS/out/size/<placa>/zephyr/`: `zephyr.elf` para cada placa y `zephyr.uf2` para la Pico. El ESP32-S3 necesita una vez sus blobs de HAL: `west blobs fetch hal_espressif`.

Los trabajos de integración continua y la canalización de publicación no llaman al script. Ejecutan `west build` directamente, desde cero y sin superposición:

```bash
west build -p always -b rpi_pico/rp2040 firmware/app
```

## 3. Siguiente paso

[Grabe el firmware](./flash-firmware.md) y siga [Su primera placa](../tutorials/first-board.md).

## Qué está verificado y qué no

| Parte                                             | Verificado                                        | Nivel                  |
| ------------------------------------------------- | ------------------------------------------------- | ---------------------- |
| El firmware de cada placa compila y cabe en su presupuesto | Integración continua, con los comandos de arriba | Compilación para el destino |
| Los pasos de esta página en una máquina limpia    | No ejecutados                                     | Ninguno                |
| Que la imagen se ejecute en la placa              | No probado                                        | Ninguno                |
