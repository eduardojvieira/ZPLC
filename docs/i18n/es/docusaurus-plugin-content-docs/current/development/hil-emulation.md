---
slug: /development/hil-emulation
title: Banco HIL emulado
sidebar_label: Banco HIL emulado
description: Ejecute la cadena HIL de las placas de aprendizaje en emuladores en una máquina Linux; qué demuestra una ejecución emulada y qué no, y las licencias de los emuladores.
---

# Banco HIL emulado

La cadena de hardware en el lazo (`tools/hil/run_chain.py`) se ejecuta
normalmente con una persona frente a una placa real. El banco emulado ejecuta la
misma cadena, con las mismas imágenes de firmware, dentro de emuladores en una
máquina Linux, sin nadie en el banco y sin puerto serie. Es un ensayo: encuentra
defectos en el firmware, en el protocolo del dispositivo y en el arnés de pruebas
antes de tener una placa sobre la mesa.

:::warning Emulado no es hardware
Cada registro de una ejecución emulada indica `evidence_level: emulated` y nombra
el emulador, su versión y el hash de su parche. Un registro emulado nunca eleva el
nivel de compatibilidad de una placa, y ninguna cifra de tiempos puede citarlo (HIL-016).
Un emulador modela el chip, no la placa: no demuestra nada sobre pines, tensiones,
relojes reales, desgaste de la flash ni sobre los controladores frente al silicio.
:::

## Qué se emula

| Placa | Emulador | Imagen | Qué hace el banco |
|---|---|---|---|
| Raspberry Pi Pico | [rp2040js](https://github.com/wokwi/rp2040js) 1.4.1 (commit `5fbd2050`) con cinco correcciones | la imagen `rpi_pico/rp2040` que se distribuye, sin cambios | grabación, ciclo de energía y corte de energía sobre un archivo de flash; consola USB CDC y UART1 (Modbus RTU) en pty del equipo; el lazo DO0→DI0 … DO3→DI3; inyección analógica en ADC0 a ADC4; tiempo simulado |
| ESP32-S3-DevKitC-1 | QEMU de Espressif `esp_develop_9.2.2_20260417`, máquina `esp32s3`, PSRAM octal | una compilación **solo para emulación**: consola en UART0, ADC apagado | grabación y ciclo de energía sobre un archivo de flash de 8 MB; consola de UART0 en una pty del equipo |
| `native_sim` con el mapa de canales de la Pico | Zephyr `native_sim/native/64` | `run.sh app-native` (solo emulación) | entradas, valores analógicos y salidas mediante su comando de consola `emu` |

## Qué no se emula

Los pasos que necesitan lo siguiente se registran como **no emulables**, nunca
como aprobados:

- **ESP32-S3:** QEMU no tiene modelo de entradas y salidas GPIO, ni ADC SAR, ni
  Wi-Fi, ni USB-Serial/JTAG. El lazo digital, la lectura analógica y el intercambio
  Modbus TCP y MQTT no se pueden ejecutar. La imagen de emulación compila AI0 como
  opcional con su convertidor apagado, por lo que el hash de su descripción de E/S
  difiere del perfil que se distribuye, y el paso de descripción de E/S de la
  cadena informa la diferencia.
- **Pico:** rp2040js no tiene red y no modela la multiplexación de pines ni los
  niveles eléctricos: una función de pin equivocada en una placa real no se detecta
  aquí (el banco informa la selección de función de cada pin para revisarla). Su
  flash se modela en la API de pico-sdk (`flash_range_erase`, `flash_range_program`,
  `flash_write_partial`), no como un chip NOR SPI, por lo que borrar y programar no
  toma tiempo.
- **Ambas:** el watchdog de hardware está apagado en los dos perfiles que se
  distribuyen hasta que exista un registro de hardware (RT-020), y la compilación se
  niega a encenderlo, así que el paso del watchdog tampoco se puede ejecutar en un
  emulador.

## Preparación

```bash
bash tools/hil/emulator/setup.sh
```

Instala en `$ZPLC_EMU_DIR` (por defecto `~/zplc-emu`), fuera del repositorio:

- rp2040js en su commit fijado, con `tools/hil/emulator/rp2040js-zplc-emu.patch`
  aplicado y sus dependencias instaladas con `npm ci --ignore-scripts` en esa
  carpeta;
- la versión de QEMU de Espressif, después de comprobar su SHA-256.

Una segunda ejecución no cambia nada. No se agrega nada al `package.json` ni al
archivo de bloqueo del repositorio. El arnés ejecuta rp2040js con Node.js desde esa
carpeta.

Compile las imágenes con el espacio de trabajo del firmware de
[Pruebas del firmware](./firmware-testing.md):

```bash
tools/hil/emulator/build.sh pico      # $ZPLC_FW_WS/out/emu-pico
tools/hil/emulator/build.sh esp32s3   # $ZPLC_FW_WS/out/emu-esp32s3 (solo emulación)
```

Nunca grabe en una placa la imagen de emulación de la ESP32-S3: su consola está en
UART0 y no tiene entrada analógica.

## Ejecutar la cadena

```bash
python3 tools/hil/run_chain.py rpi_pico --bench emulated
python3 tools/hil/run_chain.py esp32s3_devkitc --bench emulated
```

Ejecute esto con el Python del espacio de trabajo del firmware, `~/zplc-zephyr-ws/.venv/bin/python3` (incluye `pyserial`; el `python3` del sistema normalmente no, y la cadena se detiene entonces en el paso `open` con el nombre del intérprete que no lo tiene). El banco
emulado no necesita terminal y no le pregunta a nadie: los pasos en los que una
persona confirma la placa se registran como omitidos. Los registros se guardan en
`build/hil-records/`.

Para arrancar una placa y usar sus puertos a mano, por ejemplo desde la aplicación ZPLC:

```bash
python3 tools/hil/emulator/bench_emulated.py rpi_pico
```

Muestra la pty de la consola (`port`) y, para la Pico, la pty de UART1
(`rtu_port`), donde puede escuchar un extremo Modbus RTU del equipo.

## Cómo funciona el banco de la Pico

- **Flash:** el banco mantiene un archivo de flash por placa en `build/hil-emu/`.
  Una grabación escribe en él los bloques UF2, como lo hace el cargador de arranque
  UF2, y no toca la partición de almacenamiento. Cada borrado o programación llega
  al archivo de inmediato, así que detener el emulador es un corte de energía, y
  volver a iniciarlo sobre el mismo archivo es el siguiente encendido.
- **Puertos:** el banco es dueño de las pty del equipo, por lo que sus rutas no
  cambian tras una grabación ni tras un ciclo de energía. Entrega la placa cuando la
  consola mostró su indicador y luego estuvo en silencio 300 ms, como cuando una
  persona espera un reinicio.
- **Tiempo:** `now_ms()` es el tiempo simulado del emulador. El emulador nunca se
  adelanta al reloj de pared, así que los programas del equipo (el enlace del
  dispositivo, un extremo Modbus) ven los mismos tiempos de espera que con una
  placa; cuando el emulador es más lento que el chip, el tiempo simulado se atrasa.
  El banco de la ESP32-S3 usa el tiempo del equipo, pero QEMU no mantiene el reloj
  de la placa al paso del equipo: en las ejecuciones del 2026-10-20 la placa contó entre un sexto
  y un tercio del tiempo del equipo, según la carga de la máquina. Un paso de
  tiempo en QEMU (un TON de 3 s tardó 8 s) mide QEMU, no el firmware, y los pasos
  de falla esperan la falla, no un tiempo fijo.

## native_sim con el mapa de canales de la Pico

```bash
tools/firmware-test/run.sh app-native
```

compila `firmware/app` para `native_sim/native/64` con la descripción de E/S de la
Pico sobre `gpio_emul` y `adc_emul`, lo arranca y lo maneja con su comando de
consola `emu`:

| Comando | Efecto |
|---|---|
| `emu pin <gpio> <0\|1>` | fija el nivel de un pin de entrada (las entradas son activas en bajo: `0` es pulsado) |
| `emu adc <ch> <0..4095>` | fija una entrada del convertidor en esa fracción de 3,3 V |
| `emu out` | los niveles de los pines de salida, como máscara de bits por número de GPIO |

El comando está en `firmware/tests/app_native_emulation/module`, un módulo que solo
este modo agrega a la compilación. El modo también configura `rpi_pico/rp2040` con
el comando habilitado y espera que la compilación se detenga: el comando nunca se
puede compilar en una placa que se distribuye.

## Las correcciones de rp2040js

El parche corrige cinco lugares donde rp2040js no se comportaba como el RP2040;
cada uno detenía a Zephyr o daba lecturas erróneas. `tools/hil/emulator/README.md`
los enumera. Uno de ellos explica una lectura de "el canal 0 del ADC devuelve el
canal 4" observada al probar el emulador: rp2040js mantenía START_ONCE activo, así
que cada conversión leía la entrada seleccionada antes; la HAL de ZPLC era correcta.

## Lo que encontraron las ejecuciones emuladas

Las primeras ejecuciones emuladas de la cadena, el 2026-10-20, fallaron en cinco
pasos. Cada uno se rastreó hasta su causa, y el paso se volvió a ejecutar en el
emulador después de la corrección.

| Paso | Lo que dijo el registro | Causa | Corrección |
|---|---|---|---|
| Ciclo de energía y RETAIN (ambas placas) | RETAIN 102 antes del ciclo de energía, 0 después | Las imágenes no tenían persistencia de RETAIN: `CONFIG_ZPLC_RETAIN_PERSIST` estaba desactivada en cada perfil que se distribuye (ahora está activada en todos, RT-025), y en la Pico no cabe en la partición de almacenamiento de 64 KB (la compilación se detiene). Con la opción activada, la imagen de la ESP32-S3 conservó el valor (16 antes y después), y también una imagen de la Pico compilada para la prueba con una partición de almacenamiento de 128 KB (101 antes y después) | El paso comprueba la opción de la imagen y dice por qué no puede pasar. La imagen HIL activa la opción, y la Pico y la RP2040-Zero tienen una partición de almacenamiento de 128 KB: la imagen HIL de la Pico conservó el valor (102 antes y después) |
| Desborde (ambas placas) | `vm_fault` con error de VM 8, no `deadline_miss`; salidas apagadas | El bucle del paso ejecutaba 104.000 instrucciones de la VM en un ciclo, más que el presupuesto de 100.000 (`CONFIG_ZPLC_VM_CYCLE_INSTRUCTION_BUDGET`), así que el runtime enclavó su falla de watchdog de la VM, como está diseñado | El paso ajusta el bucle a la mitad del presupuesto que informa la imagen; entonces ambas placas enclavan `deadline_miss` tras tres ciclos tardíos, con las salidas apagadas |
| Intercambio de bus de campo (Pico) | Ninguna petición llegó al equipo, error 10 | El cliente Modbus RTU del dispositivo está desactivado por omisión y solo arranca al iniciar, así que el bloque fallaba de inmediato con `UNAVAILABLE`. Además, el lado del equipo de la línea se abría a 115200 baudios, mientras que el dispositivo usa 19200 | El paso activa el cliente a 19200 baudios, lo guarda y reinicia la placa; el intercambio emulado leyó 0x5A17 |
| Despliegue (ESP32-S3) | "Not in loading state" tras volver a enviar un bloque | El cargador rechazó el fixture con `ZPLC_LOADER_ERR_MEMORY` (-13): la cadena compila los fixtures para 8 KB de memoria de trabajo, y la ESP32-S3 tiene 2 KB. Luego el probador volvió a enviar el último bloque a una carga que ya había terminado. Una placa hace lo mismo | La cadena compila los fixtures para la placa, y el probador informa el rechazo del dispositivo en lugar de volver a enviar el bloque. El banco de la ESP32-S3 además da a los programas diez veces el tiempo del equipo, por el reloj lento de QEMU: entonces el despliegue y los seis fixtures de parpadeo pasan |
| Falla fatal (ESP32-S3) | Sigue en ejecución, sin falla, tras 1 s | La ruta de falla funciona en Xtensa (división por cero, error de VM 3, salidas apagadas), pero con el reloj lento de QEMU un segundo del equipo no alcanzaba para los 21 ciclos que el programa necesita | Los pasos de falla esperan la falla, hasta 10 s; QEMU la enclavó tras 1,4 s de tiempo del equipo y 21 ciclos |

Ejecutar el paso de RETAIN con la imagen HIL de la Pico encontró un defecto más: la imagen rechazaba cada START
(`Scheduler start failed (-3)`), porque el planificador solo armaba el `zephyr,watchdog` elegido en el árbol de
dispositivos, que ninguna placa de este repositorio define. Ahora arma el alias `watchdog0` de la placa cuando no hay
ninguno elegido, y una imagen con el watchdog de hardware y sin ninguno de los dos nodos no compila.

En rp2040js los fixtures de parpadeo cuentan los cambios de las salidas leyéndolas por la consola, y de una ejecución
a otra hay uno distinto que ve muy pocos cambios: en este emulador no sirven como evidencia ni a favor ni en contra.

## Licencias

| Software | Licencia | En este repositorio |
|---|---|---|
| rp2040js, Uri Shaked y Wokwi | MIT | solo `rp2040js-zplc-emu.patch`, una obra derivada bajo la misma licencia MIT; `setup.sh` descarga el emulador |
| QEMU de Espressif | GPL-2.0 | nada; `setup.sh` descarga la versión publicada, que se ejecuta como un programa aparte |

Ofrecer las correcciones de rp2040js al proyecto original es una decisión del
responsable del proyecto.
