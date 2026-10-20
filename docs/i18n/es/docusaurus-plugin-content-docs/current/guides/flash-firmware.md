---
slug: /guides/flash-firmware
id: flash-firmware
title: Grabar el firmware
sidebar_label: Grabar el firmware
description: "Cómo escribir la imagen del runtime ZPLC en una placa: los pasos del modo de arranque de la Raspberry Pi Pico y del ESP32-S3, y la línea de comandos para cada placa."
tags: [how-to, hardware, firmware]
---

# Grabar el firmware

Grabar escribe el runtime de ZPLC en una placa. **Usted lo inicia.** El asistente de
Studio y el servidor MCP nunca graban, despliegan, fuerzan, arrancan ni detienen un
dispositivo, y nada de esta página lo hace por usted. Compilar la imagen, grabarla,
cargar un programa y ejecutarlo son cuatro operaciones separadas
([Despliegue](../ide/deployment.md)).

:::caution No ejecutado en una placa
El firmware de cada placa compila en integración continua y cabe en su presupuesto.
Nadie ha registrado una grabación en una placa, así que los pasos de abajo están
escritos a partir de las herramientas de cada placa y no son un resultado: el nivel de
todas las placas es `cross-build`
([Soporte de hardware](../reference/capabilities-evidence.md)). Si los sigue, informe
lo que vio con el formulario de reporte de placa de los issues del repositorio.
:::

## 1. Obtener la imagen y comprobarla

Una versión del canal lleva una imagen del runtime para cada placa del manifiesto,
con el nombre `zplc-runtime-<versión>-<placa>.<ext>`, con las sumas de verificación en
`SHA256SUMS` y un manifiesto, `zplc-runtime-<versión>.manifest.json`, que nombra para
cada imagen el runner de grabación, la dirección en la que se escribe y el nivel de
evidencia de la placa. Los instaladores de Studio llevan las imágenes de las dos placas
de aprendizaje: **Configuración del proyecto**, **Destino** muestra el archivo, su SHA-256 y estos
pasos. Hasta la primera versión que las tenga, compile usted la imagen con los pasos de
[Su primera placa](../tutorials/first-board.md#1-obtenga-el-firmware).

Compruebe el archivo antes de escribirlo:

```bash
sha256sum --check --ignore-missing SHA256SUMS
```

| Placa | Id del manifiesto | Imagen de la versión | La escribe |
| --- | --- | --- | --- |
| Raspberry Pi Pico | `rpi-pico-rp2040` | `zplc-runtime-<versión>-rpi-pico-rp2040.uf2` | la ROM de arranque: usted copia el archivo |
| Waveshare RP2040-Zero | `waveshare-rp2040-zero` | `zplc-runtime-<versión>-waveshare-rp2040-zero.uf2` | la ROM de arranque: usted copia el archivo |
| ESP32-S3-DevKitC-1 | `esp32-s3-devkitc` | `zplc-runtime-<versión>-esp32-s3-devkitc.bin` | `esptool` o `west flash` |
| Arduino GIGA R1 (M7) | `arduino-giga-r1-m7` | `zplc-runtime-<versión>-arduino-giga-r1-m7.bin` | `dfu-util` o `west flash` |
| Arduino Opta WiFi (M7) | `arduino-opta-wifi-m7` | `zplc-runtime-<versión>-arduino-opta-wifi-m7.bin` | `dfu-util` o `west flash` |
| STM32 Nucleo-H743ZI | `nucleo-h743zi` | `zplc-runtime-<versión>-nucleo-h743zi.bin` | `west flash` |
| STM32F746G Discovery | `stm32f746g-disco` | `zplc-runtime-<versión>-stm32f746g-disco.bin` | `west flash` |

## 2. Raspberry Pi Pico y Waveshare RP2040-Zero: descarga y modo de arranque

La ROM de arranque del RP2040 muestra la placa como una unidad USB cuando arranca en
modo de arranque, y acepta un archivo UF2 copiado en ella. Usted realiza cada paso:
Studio nunca escribe en una placa.

1. Desconecte la placa. Mantenga pulsado su botón BOOT (BOOTSEL en la Pico) y, con el
   botón pulsado, conecte el cable USB. Suelte el botón.
2. Aparece una unidad llamada `RPI-RP2`. Si no aparece, desconecte la placa y empiece
   de nuevo; una placa que no arrancó en modo de arranque no muestra ninguna unidad, y
   tampoco la muestra un cable que solo carga.
3. Copie a la unidad el archivo `.uf2` de su placa: la imagen de la versión
   (`zplc-runtime-<versión>-rpi-pico-rp2040.uf2` para la Pico), o `build/zephyr/zephyr.uf2`
   cuando compiló la imagen usted mismo. La placa lo escribe y se reinicia sola, y la
   unidad desaparece.

La imagen de la Pico es para la Raspberry Pi Pico (RP2040). En una Pico W el LED de la
placa no está en GP25, y una Pico 2 (RP2350) no ejecuta esta imagen.

## 3. ESP32-S3-DevKitC-1: modo de descarga y esptool

El cargador de arranque en ROM del ESP32-S3 acepta una imagen por USB cuando la placa
arranca en modo de descarga. La imagen es para la placa N8R8 (8 MB de flash, 8 MB de PSRAM
octal): no arranca en la N8 ni en la N8R2 ([Referencia de placas](../reference/boards.md)).

1. Conecte el cable al puerto marcado **USB**, el puerto USB propio del ESP32-S3, no al
   marcado UART: la consola de ZPLC y la conexión de Studio usan el puerto **USB**. En
   Linux es `/dev/ttyACM<n>`, en macOS `/dev/cu.usbmodem<n>` y en Windows un puerto
   `COM<n>`.
2. Mantenga pulsado BOOT, pulse y suelte RST, y suelte BOOT. La placa está en modo de
   descarga.
3. Escriba la imagen en la dirección `0x0`, la que el manifiesto nombra para ella
   (`images[].flash.address` de `zplc-runtime-<versión>.manifest.json`). Con esptool v5:

```bash
esptool --chip esp32s3 --port <puerto serie> write-flash 0x0 zplc-runtime-<versión>-esp32-s3-devkitc.bin
```

   Para una imagen que compiló usted mismo, el archivo es `build/zephyr/zephyr.bin`. La
   versión 4 de esptool escribe el mismo comando como `esptool.py ... write_flash`.

4. Pulse RST para salir del modo de descarga y arrancar el programa que escribió. Si la
   consola sigue en silencio, la placa sigue en modo de descarga: pulse RST otra vez.

### El grabador en el navegador

Todavía no se ofrece un grabador que corra en el navegador sobre Web Serial: el ESP32-S3
necesita una biblioteca que el sitio no incluye. Hasta entonces la línea de comandos de
arriba es el camino, y la página de la placa no cambia cuando el grabador llegue.

## 4. La línea de comandos para cada placa

Desde el directorio de compilación de la imagen, o desde la raíz del espacio de trabajo
de Zephyr con `--build-dir`, `west flash` escribe la imagen con el runner de la placa.
Los runners que cada placa nombra en su definición de Zephyr son los de esta tabla; elija
uno con `--runner <nombre>`.

| Placa | Runners | Un comando |
| --- | --- | --- |
| Raspberry Pi Pico | `uf2`, `openocd`, `jlink`, `pyocd`, `blackmagicprobe` | `west flash --runner uf2` con la placa en modo de arranque |
| Waveshare RP2040-Zero | `uf2` | `west flash --runner uf2` con la placa en modo de arranque |
| ESP32-S3-DevKitC-1 | `esp32`, `openocd` | `west flash --runner esp32` con la placa en modo de descarga |
| Arduino GIGA R1 (M7) | `dfu-util`, `openocd`, `jlink`, `blackmagicprobe` | `west flash --runner dfu-util` con la placa en su modo de arranque DFU |
| Arduino Opta WiFi (M7) | `dfu-util`, `stm32cubeprogrammer`, `openocd` | `west flash --runner dfu-util` con la placa en su modo de arranque DFU |
| STM32 Nucleo-H743ZI | `stm32cubeprogrammer`, `openocd`, `jlink`, `pyocd` | `west flash --runner stm32cubeprogrammer` por el ST-LINK de la placa |
| STM32F746G Discovery | `stm32cubeprogrammer`, `openocd`, `jlink` | `west flash --runner stm32cubeprogrammer` por el ST-LINK de la placa |

Un runner necesita su propia herramienta en su computadora (`esptool`, `dfu-util`,
OpenOCD, el programador de STM32). Si no se encuentra la herramienta o la placa, el
mensaje de `west flash` lo dice. Si una placa no vuelve después de grabarla, use el
procedimiento de recuperación de su perfil: [Límites de recuperación](../operations/recovery.md).

## Después de grabar

Abra la consola serie de la placa y ejecute `zplc version`: imprime la versión, el
commit, la placa y las opciones de compilación de la imagen. Deben ser las del archivo
que escribió. Luego [conecte Studio](../tutorials/first-board.md#3-conecte-studio).

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| El firmware de cada placa compila y cabe en su presupuesto | Compilación en integración continua | Compilación |
| Los nombres, direcciones y sumas de comprobación de las imágenes de la versión | Los comprueba el canal de versiones | Anfitrión |
| Los pasos del modo de arranque y los comandos del programador | Escritos a partir de las herramientas de cada placa, no ejecutados | Ninguno |
| Una grabación en una placa real | Nadie la ha registrado | Ninguno |
