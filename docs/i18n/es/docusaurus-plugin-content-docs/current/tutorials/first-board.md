---
slug: /tutorials/first-board
id: first-board
title: Su primera placa
sidebar_label: Su primera placa
description: 'Los pasos para compilar el firmware, grabarlo, conectar ZPLC, cargar un programa y observar una salida en una Raspberry Pi Pico o un ESP32-S3, todavía no ejecutados en una placa.'
tags: [tutorial, hardware, raspberry-pi-pico, esp32-s3]
---

# Su primera placa

Esta página enumera los pasos desde el firmware hasta un LED que parpadea en una
Raspberry Pi Pico o en un ESP32-S3. Está escrita a partir del manifiesto de placas
y del flujo de despliegue de ZPLC, y **nadie la ha ejecutado en una placa**.

:::danger No ejecutado en una placa
El firmware de ambas placas compila en integración continua y cabe en su
presupuesto de flash y RAM. Nadie lo ha grabado, arrancado, cargado un programa
en él ni visto cambiar una salida: el nivel de ambas placas es `cross-build`
([Compatibilidad de hardware](../reference/capabilities-evidence.md)). Nada de lo que sigue
dice que un paso funcione. Si lo sigue, usted es el primero, y su resultado es una
pista hasta que se registre con la versión del firmware, el commit y el hash de la
imagen: use la plantilla de informe de placa de las incidencias del repositorio y no
incluya credenciales ni identificadores de dispositivo.
:::

Termine primero [Blink sin hardware](./blink-without-hardware.md): todos los pasos
siguientes suponen que usted puede compilar y ejecutar un programa en el simulador,
lo cual está verificado.

## Qué necesita

|                        | Raspberry Pi Pico                                                    | ESP32-S3-DevKitC-1 (N8R8)                                                |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Destino de compilación | `rpi_pico/rp2040`                                                    | `esp32s3_devkitc/esp32s3/procpu`                                         |
| Placa en ZPLC          | `rpi_pico`                                                           | `esp32s3_devkitc`                                                        |
| Proyecto de ejemplo    | `pico_blinky`                                                        | `esp32s3_blinky`                                                         |
| Primera salida digital | `DO0`, `%QX0.0`, pin GP0 (pin 1 del conector)                        | `DO0`, `%QX0.0`, pin GPIO15 (pin 8 del conector J1)                      |
| Qué cablear            | Un LED y una resistencia de 330 Ω del pin a GND (pin 3 del conector) | Un LED y una resistencia de 330 Ω del pin a GND (pin 22 del conector J1) |
| Interfaz con ZPLC      | El cable USB de la placa                                             | El cable USB, en el puerto marcado USB (no UART)                         |

Los canales y el valor seguro de cada salida, las notas eléctricas y qué pines
demuestra el devicetree de la placa están en [Placas](../reference/boards.md).
Lea las notas de su placa antes de cablear nada: los pines son de lógica de 3,3 V y
no toleran 5 V. Allí están también las entradas y la entrada analógica: en la Pico,
`DI0` a `DI3` son GP15 a GP12 y `AI0` es GP26; en la DevKitC-1, `DI0` a `DI3` son
GPIO5 a GPIO8 (pines 5 a 7 y 12 del conector J1) y `AI0` es GPIO4 (pin 4 del
conector J1). El botón BOOT de la DevKitC-1 es la entrada adicional `DI4`: no lo
mantenga pulsado mientras la placa se reinicia, o la placa arranca en modo de
descarga.

## 1. Obtenga el firmware

La versión rc.3 no incluye firmware precompilado: se subió a mano. El canal de
versiones compila una imagen del runtime para cada placa del manifiesto en cada
versión que hace, con el nombre `zplc-runtime-<versión>-<placa>.<extensión>`, con su
suma de verificación en `SHA256SUMS` y el nivel de evidencia de la placa en las
notas de la versión. Sus instaladores llevan las imágenes de la Raspberry Pi Pico y
de la ESP32-S3: en ZPLC, abra **Configuración del proyecto**, **Destino**, elija la placa, y
ZPLC muestra el archivo, su SHA-256, dónde está y los pasos para grabarlo. ZPLC
solo las muestra: usted graba (paso 2). El canal todavía no ha hecho una versión,
así que hoy usted compila el firmware desde el código fuente, con el script del repositorio, que envuelve el mismo `west build` y la misma
comprobación de tamaño que el trabajo de integración continua. Prepare el espacio
de trabajo de Zephyr una vez (unos 6,6 GB, o unos 15 GB con el SDK de Zephyr y las salidas de compilación; vea
[Pruebas de firmware](../development/firmware-testing.md#preparación-única)), y
luego compile la placa:

```bash
tools/firmware-test/setup.sh
tools/firmware-test/run.sh size rpi-pico-rp2040
```

El script ejecuta `west build` para la placa del manifiesto y comprueba su flash y
su RAM contra el presupuesto registrado. La imagen está en
`$ZPLC_FW_WS/out/size/rpi-pico-rp2040/zephyr/` (`zephyr.elf` y, para la Pico,
`zephyr.uf2`; para el ESP32-S3, `zephyr.bin`). Para el ESP32-S3 el identificador de placa es `esp32-s3-devkitc`.
Para compilar una placa sin el script, ejecute el comando de su perfil desde la raíz
del espacio de trabajo de Zephyr:

```bash
west build -b rpi_pico/rp2040 firmware/app --pristine
```

Una compilación que termina demuestra solo que el firmware compila para la placa.

## 2. Grábelo (lo hace una persona)

Grabar escribe el firmware en el dispositivo y **nunca lo hacen las funciones de IA
ni de MCP de ZPLC**. [Grabar el firmware](../guides/flash-firmware.md) tiene los pasos
de cada placa y la línea de comandos; en resumen, use el procedimiento Zephyr propio de
la placa:

- **Raspberry Pi Pico:** el cargador de arranque del RP2040 acepta un archivo UF2.
  Mantenga pulsado el botón BOOTSEL mientras conecta el cable USB, y copie
  `zephyr.uf2` en la unidad que aparece.
- **ESP32-S3:** mantenga pulsado BOOT, pulse y suelte RST, y suelte BOOT para entrar
  en modo de descarga; luego ejecute `west flash` desde el directorio de compilación,
  o escriba `zephyr.bin` en `0x0` con `esptool`, y pulse RST.

Si una placa no vuelve, use el procedimiento de recuperación de su perfil:
[Límites de la recuperación](../operations/recovery.md).

## 3. Conecte ZPLC

1. Abra el proyecto del ejemplo, compílelo (**Compilación**, **Compilar**) y elija
   **Hardware** en la barra de herramientas en lugar de **Simular**.
2. Pulse **Conectar**. Un diálogo de ZPLC lista cada puerto serie con su nombre
   y sus identificadores USB, y marca las placas que conoce. Si la placa no aparece,
   conéctela y pulse **Actualizar**. Elija su puerto y pulse **Usar este puerto**:
   ZPLC usa solo ese puerto, y elegirlo no envía nada a la placa. En Linux su usuario
   necesita el grupo del puerto serie: [Instalar ZPLC](../getting-started/install.md#linux-acceso-al-puerto-serie).
3. La aplicación ZPLC lee la identidad del runtime: placa, perfil y ABI. Un proyecto compilado
   para otra placa se rechaza.

## 4. Despliegue y ejecute (lo hace una persona)

1. Pulse **Cargar**. ZPLC muestra el SHA-256 del programa, su tamaño, la
   cantidad de tareas y la placa del dispositivo, y le pide confirmar. Un despliegue
   detiene el programa actual y deja el runtime **detenido**: no lo ejecuta.
2. Compruebe que la máquina está en un estado en el que una salida puede cambiar.
3. Pulse **Ejecutar** (F5) usted mismo. El LED debería conmutar cada medio segundo si
   el programa es el del ejemplo.

## 5. Observe

Abra la pestaña **Observación** y agregue `LED_Output`: su valor sigue al LED. Pulse
**Detener** (Shift+F5): en una placa una detención también lleva las salidas físicas a
su estado seguro, apagado
([Planificador](../runtime/scheduler.md#pausa-reanudación-paso-y-parada)).

## Qué está verificado

| Paso                    | Evidencia hoy                                                                                                                    | Estado                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1. Obtenga el firmware  | La integración continua ejecuta `west build` y la misma comprobación del presupuesto de flash y RAM que el script de compilación | Compila en integración continua: `cross-build` |
| 2. Grábelo              | Ninguna                                                                                                                          | Aún no verificado en hardware                  |
| 3. Conecte ZPLC         | El tutorial Blink ejercita la conexión en el simulador; ninguna placa se ha conectado                                            | Aún no verificado en hardware                  |
| 4. Despliegue y ejecute | El tutorial Blink ejercita la ejecución en el simulador; ninguna placa ha recibido un programa                                   | Aún no verificado en hardware                  |
| 5. Observe              | La tabla de observación se ejercita en el simulador; nadie ha visto cambiar una salida física                                    | Aún no verificado en hardware                  |

## Qué puede informar

Suceda lo que suceda, el resultado es útil: informe qué paso alcanzó, la placa y la
versión del firmware (`zplc version` en la consola imprime el commit, la placa y las
opciones de compilación) y qué vio. Un registro que nombra el commit y el hash de la
imagen es lo que lleva a una placa de `cross-build` a `human-hil`.

## Vea también

- [Compatibilidad de hardware](../reference/capabilities-evidence.md): los niveles y el nivel de cada placa hoy.
- [Placas](../reference/boards.md): los canales, pines y valores seguros.
- [Despliegue y sesiones de runtime](../ide/deployment.md): las cuatro operaciones separadas.
- [Seguridad y limitaciones](../safety-and-limitations.md).
