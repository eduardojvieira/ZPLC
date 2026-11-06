---
slug: /guides/flash-firmware
id: flash-firmware
title: Grabar el firmware
sidebar_label: Grabar el firmware
description: 'Escriba la imagen del entorno de ejecución de ZPLC en una placa: los pasos del modo de arranque de la Raspberry Pi Pico y del ESP32-S3, y la línea de comandos para cada placa.'
tags: [how-to, hardware, firmware]
---

# Grabar el firmware

Grabar escribe el entorno de ejecución de ZPLC en una placa. **Usted lo inicia.** El asistente de ZPLC y el servidor MCP nunca graban, despliegan, fuerzan, arrancan ni detienen un dispositivo, y nada de esta página lo hace por usted. Compilar la imagen, grabarla, desplegar un programa y ejecutarlo son cuatro operaciones separadas ([Despliegue](../ide/deployment.md)).

:::caution No hay una grabación registrada en una placa
El firmware de cada placa compila en integración continua y cabe en su presupuesto. Nadie ha registrado una grabación en una placa, así que los pasos de abajo se leyeron de las herramientas de cada placa y no son un resultado. Todas las placas están en el nivel `cross-build` ([Compatibilidad de hardware](../reference/capabilities-evidence.md)). Si los sigue, informe lo que vio con el formulario de informe de placa de las incidencias del repositorio.
:::

## 1. Obtenga la imagen y compruébela

Una versión lleva una imagen por placa del manifiesto, con el nombre `zplc-runtime-<versión>-<placa>.<ext>`. `SHA256SUMS` guarda las sumas de verificación. El manifiesto `zplc-runtime-<versión>.manifest.json` indica, para cada imagen, el runner de flash, la dirección donde se escribe y el nivel de evidencia de la placa. Los instaladores de ZPLC incluyen las imágenes de las dos placas del curso: **Configuración del proyecto**, **Destino** muestra el archivo, su SHA-256 y estos pasos. Hasta la primera versión que las incluya, compile la imagen con [Su primera placa](../tutorials/first-board.md#1-obtenga-el-firmware).

Compruebe el archivo antes de escribirlo:

```bash
sha256sum --check --ignore-missing SHA256SUMS
```

| Placa                  | Id del manifiesto       | Imagen de la versión                               | La escribe                           |
| ---------------------- | ----------------------- | -------------------------------------------------- | ------------------------------------ |
| Raspberry Pi Pico      | `rpi-pico-rp2040`       | `zplc-runtime-<versión>-rpi-pico-rp2040.uf2`       | la ROM de arranque: usted copia el archivo |
| Waveshare RP2040-Zero  | `waveshare-rp2040-zero` | `zplc-runtime-<versión>-waveshare-rp2040-zero.uf2` | la ROM de arranque: usted copia el archivo |
| ESP32-S3-DevKitC-1     | `esp32-s3-devkitc`      | `zplc-runtime-<versión>-esp32-s3-devkitc.bin`      | `esptool` o `west flash`             |
| Arduino GIGA R1 (M7)   | `arduino-giga-r1-m7`    | `zplc-runtime-<versión>-arduino-giga-r1-m7.bin`    | `dfu-util` o `west flash`            |
| Arduino Opta WiFi (M7) | `arduino-opta-wifi-m7`  | `zplc-runtime-<versión>-arduino-opta-wifi-m7.bin`  | `dfu-util` o `west flash`            |
| STM32 Nucleo-H743ZI    | `nucleo-h743zi`         | `zplc-runtime-<versión>-nucleo-h743zi.bin`         | `west flash`                         |
| STM32F746G Discovery   | `stm32f746g-disco`      | `zplc-runtime-<versión>-stm32f746g-disco.bin`      | `west flash`                         |

## 2. Raspberry Pi Pico y Waveshare RP2040-Zero: modo de arranque

En modo de arranque, la ROM del RP2040 presenta la placa como una unidad USB y acepta un archivo UF2 copiado en ella.

1. Desconecte la placa. Mantenga pulsado su botón BOOT (BOOTSEL en la Pico), conecte el cable USB con el botón pulsado y luego suéltelo.
2. Aparece una unidad llamada `RPI-RP2`. Si no aparece, desconecte la placa y empiece de nuevo. Una placa que no arrancó en modo de arranque no muestra unidad, y tampoco un cable que solo carga.
3. Copie el `.uf2` de su placa a la unidad: la imagen de la versión (`zplc-runtime-<versión>-rpi-pico-rp2040.uf2` para la Pico) o `build/zephyr/zephyr.uf2` para una imagen compilada por usted. La placa la escribe y se reinicia sola, y la unidad desaparece.

La imagen de la Pico es para la Raspberry Pi Pico (RP2040). En una Pico W el LED integrado no está en GP25, y una Pico 2 (RP2350) no acepta esta imagen.

## 3. ESP32-S3-DevKitC-1: modo de descarga y esptool

La ROM de arranque del ESP32-S3 acepta una imagen por USB cuando la placa arranca en modo de descarga. La imagen es para la placa N8R8 (8 MB de flash, 8 MB de PSRAM octal). No arranca en la N8 ni en la N8R2 ([Placas](../reference/boards.md)).

1. Conecte el cable al puerto marcado **USB**, el USB propio del chip, no al marcado UART. La consola de ZPLC y la conexión de la aplicación de ZPLC usan el puerto **USB**. Es `/dev/ttyACM<n>` en Linux, `/dev/cu.usbmodem<n>` en macOS y un puerto `COM<n>` en Windows.
2. Mantenga pulsado BOOT, pulse y suelte RST, y suelte BOOT. La placa queda en modo de descarga.
3. Escriba la imagen en la dirección `0x0`, la que el manifiesto indica para ella (`images[].flash.address` de `zplc-runtime-<versión>.manifest.json`). Con esptool v5:

```bash
esptool --chip esp32s3 --port <serial port> write-flash 0x0 zplc-runtime-<version>-esp32-s3-devkitc.bin
```

Para una imagen compilada por usted, el archivo es `build/zephyr/zephyr.bin`. La versión 4 de esptool escribe el comando como `esptool.py ... write_flash`.

4. Pulse RST para salir del modo de descarga e iniciar el firmware que grabó. Si la consola sigue en silencio, la placa aún está en modo de descarga: pulse RST otra vez.

### El grabador en el navegador

En Chrome o Edge en un computador, el grabador de abajo escribe la imagen del ESP32-S3 por Web Serial con [ESP Web Tools](https://esphome.github.io/esp-web-tools/). Firefox y Safari no tienen Web Serial, y entonces la página muestra la línea de comandos de arriba. Usted hace cada paso:

1. Descargue `zplc-runtime-<versión>-esp32-s3-devkitc.bin` y `SHA256SUMS` de la versión. El sitio no puede descargarlos por usted, porque los archivos de las versiones de GitHub no llevan encabezados de origen cruzado.
2. Ponga la placa en modo de descarga y elija el archivo.
3. Compare el SHA-256 que muestra la página con `SHA256SUMS` y pulse **Install**.
4. Elija el puerto serie en el diálogo del navegador. El grabador escribe la imagen en la dirección `0x0` y no borra el flash salvo que marque la casilla del diálogo.

import FirmwareFlasher from '@site/src/components/FirmwareFlasher';

<FirmwareFlasher lang="es" />

:::caution El grabador no ha escrito una placa
Nadie ha registrado una grabación del ESP32-S3 con este grabador en una placa. La página y su manifiesto se prueban en el repositorio (host). La escritura por Web Serial no se prueba.
:::

## 4. La línea de comandos para cada placa

`west flash` escribe la imagen con el runner de la placa, desde el directorio de compilación o desde la raíz del espacio de trabajo con `--build-dir`. La tabla lista los runners que cada placa nombra en su definición de Zephyr. Elija uno con `--runner <nombre>`.

| Placa                  | Runners                                               | Un comando                                                            |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| Raspberry Pi Pico      | `uf2`, `openocd`, `jlink`, `pyocd`, `blackmagicprobe` | `west flash --runner uf2` con la placa en modo de arranque            |
| Waveshare RP2040-Zero  | `uf2`                                                 | `west flash --runner uf2` con la placa en modo de arranque            |
| ESP32-S3-DevKitC-1     | `esp32`, `openocd`                                    | `west flash --runner esp32` con la placa en modo de descarga          |
| Arduino GIGA R1 (M7)   | `dfu-util`, `openocd`, `jlink`, `blackmagicprobe`     | `west flash --runner dfu-util` con la placa en su modo de arranque DFU |
| Arduino Opta WiFi (M7) | `dfu-util`, `stm32cubeprogrammer`, `openocd`          | `west flash --runner dfu-util` con la placa en su modo de arranque DFU |
| STM32 Nucleo-H743ZI    | `stm32cubeprogrammer`, `openocd`, `jlink`, `pyocd`    | `west flash --runner stm32cubeprogrammer` por el ST-LINK integrado    |
| STM32F746G Discovery   | `stm32cubeprogrammer`, `openocd`, `jlink`             | `west flash --runner stm32cubeprogrammer` por el ST-LINK integrado    |

Un runner necesita su propia herramienta en el computador: `esptool`, `dfu-util`, OpenOCD o el programador de STM32. Si no se encuentra la herramienta o la placa, el mensaje de `west flash` dice cuál. Si una placa no responde tras grabarla, siga su procedimiento de recuperación: [Límites de recuperación](../operations/recovery.md).

## Después de grabar

Abra la consola serie de la placa y ejecute `zplc version`. Imprime la versión, el commit, la placa y las opciones de compilación de la imagen, que deben coincidir con el archivo que escribió. Después [conecte ZPLC](../tutorials/first-board.md#3-conecte-zplc).

## Qué está verificado y qué no

| Parte                                                         | Verificado                                           | Nivel                       |
| ------------------------------------------------------------- | ---------------------------------------------------- | --------------------------- |
| El firmware de cada placa compila y cabe en su presupuesto    | Compilación en integración continua                  | Compilación para el destino |
| Los nombres, direcciones y sumas de las imágenes de la versión | La canalización de versiones los comprueba          | Host                   |
| Los pasos del modo de arranque y los comandos de los runners | Leídos de las herramientas de cada placa, no ejecutados | Ninguno                 |
| Una grabación en una placa real                               | Nadie la ha registrado                               | Ninguno                     |
