---
slug: /development/hil-emulation
title: Banco HIL emulado
sidebar_label: Banco HIL emulado
description: Ejecute la cadena HIL de las placas de aprendizaje en emuladores en una máquina Linux; qué demuestra una ejecución emulada y qué no, y las licencias de los emuladores.
---

# Banco HIL emulado

Use el banco emulado para ensayar la cadena de hardware en el lazo (`tools/hil/run_chain.py`) antes de tener una placa en el escritorio. Ejecuta la misma cadena, con las mismas imágenes de firmware, dentro de emuladores en una máquina Linux, sin nadie en un banco y sin puerto serie. Encuentra defectos del firmware, del protocolo del dispositivo y del arnés de pruebas. No encuentra defectos de una placa.

:::warning Emulado no es hardware
Todo registro que escribe una ejecución emulada dice `evidence_level: emulated` y nombra el emulador, su versión y el hash de su parche. Un registro emulado nunca sube el nivel de soporte de una placa, y ninguna cifra de tiempos puede citarlo (HIL-016). Un emulador modela el chip, no la placa: no demuestra nada sobre pines, tensiones, relojes reales, desgaste de la flash ni sobre los controladores frente al silicio.
:::

## Qué se emula

| Placa                                  | Emulador                                                                                | Imagen                                                    | Lo que hace el banco                                                                                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Raspberry Pi Pico                      | [rp2040js](https://github.com/wokwi/rp2040js) 1.4.1 (commit `5fbd2050`) con cinco correcciones | La imagen distribuida `rpi_pico/rp2040`, sin cambios      | Grabación, ciclo de energía y corte de energía sobre un archivo de flash; el shell USB CDC y UART1 (Modbus RTU) en ptys del host; el lazo DO0→DI0 … DO3→DI3; inyección analógica en ADC0 a ADC4; tiempo simulado |
| ESP32-S3-DevKitC-1                     | QEMU de Espressif `esp_develop_9.2.2_20260417`, máquina `esp32s3`, PSRAM octal          | Una compilación **solo para emulación**: consola en UART0, ADC apagado | Grabación y ciclo de energía sobre un archivo de flash de 8 MB; el shell de UART0 en un pty del host                                                                                       |
| `native_sim` con el mapa de canales de la Pico | Zephyr `native_sim/native/64`                                                   | `run.sh app-native` (solo emulación)                      | Entradas, valores analógicos y salidas mediante su comando de shell `emu`                                                                                                                  |

## Qué no se emula

Un paso que necesita alguna de estas cosas se registra como **no emulable**, nunca como aprobado.

- **ESP32-S3.** QEMU no tiene modelo de entrada ni de salida GPIO, ni ADC SAR, ni Wi-Fi, ni USB-Serial/JTAG. Por eso no pueden ejecutarse el lazo digital, la lectura analógica ni el intercambio Modbus TCP y MQTT. La imagen de emulación compila AI0 como opcional y con su conversor apagado, de modo que el hash de su descripción de E/S difiere del del perfil distribuido, y el paso de descripción de E/S de la cadena informa la diferencia.
- **Pico.** rp2040js no tiene red, y no modela la multiplexión de pines ni los niveles eléctricos, así que una función de pin equivocada en una placa real no se detecta aquí (el banco informa la selección de función de cada pin para que usted la inspeccione). Su flash se modela en la API del pico-sdk (`flash_range_erase`, `flash_range_program`, `flash_write_partial`), no como un chip NOR SPI, así que borrar y programar no tardan nada.
- **Ambas.** El perro guardián por hardware está apagado en los dos perfiles distribuidos hasta que exista un registro de hardware (RT-020), y la compilación se niega a encenderlo, así que el paso del perro guardián tampoco puede ejecutarse en un emulador.

## Preparación

```bash
bash tools/hil/emulator/setup.sh
```

El script instala, en `$ZPLC_EMU_DIR` (por omisión `~/zplc-emu`), fuera del repositorio:

- rp2040js en su commit fijado, con `tools/hil/emulator/rp2040js-zplc-emu.patch` aplicado y sus dependencias instaladas con `npm ci --ignore-scripts` en esa carpeta;
- la versión de QEMU de Espressif, tras comprobar su SHA-256.

Una segunda ejecución no cambia nada. No se agrega nada al `package.json` ni al archivo de bloqueo del repositorio. El arnés ejecuta rp2040js con el Node.js de esa carpeta.

Compile las imágenes con el espacio de trabajo de firmware de [Pruebas del firmware](./firmware-testing.md):

```bash
tools/hil/emulator/build.sh pico      # $ZPLC_FW_WS/out/emu-pico
tools/hil/emulator/build.sh esp32s3   # $ZPLC_FW_WS/out/emu-esp32s3 (solo emulación)
```

No grabe nunca la imagen de emulación del ESP32-S3 en una placa: su consola está en UART0 y no tiene entrada analógica.

## Ejecutar la cadena

```bash
python3 tools/hil/run_chain.py rpi_pico --bench emulated
python3 tools/hil/run_chain.py esp32s3_devkitc --bench emulated
```

Ejecute estos comandos con el Python del espacio de trabajo de firmware, `~/zplc-zephyr-ws/.venv/bin/python3`. Ese tiene `pyserial`; el `python3` del sistema normalmente no, y entonces la cadena se detiene en el paso `open` y nombra el intérprete al que le falta.

El banco emulado no necesita terminal y no le pregunta nada a nadie: los pasos que piden a una persona confirmar la placa se registran como omitidos. Los registros van a `build/hil-records/`.

Para arrancar una placa y usar sus puertos a mano, por ejemplo desde la aplicación ZPLC:

```bash
python3 tools/hil/emulator/bench_emulated.py rpi_pico
```

Imprime el pty del shell (`port`) y, para la Pico, el pty de UART1 (`rtu_port`), donde puede escuchar un extremo Modbus RTU del host.

## Cómo funciona el banco de la Pico

- **Flash.** El banco mantiene un archivo de flash por placa en `build/hil-emu/`. Una grabación escribe en él los bloques UF2, como hace el cargador UF2, y deja intacta la partición de almacenamiento. Cada borrado o programación llega al archivo de inmediato, de modo que matar el emulador es un corte de energía, y volver a iniciarlo sobre el mismo archivo es el siguiente encendido.
- **Puertos.** El banco es dueño de los ptys del host, así que sus rutas se mantienen a través de una grabación y de un ciclo de energía. Entrega la placa cuando el shell imprimió su indicador y luego estuvo en silencio 300 ms, como espera una persona tras un reinicio.
- **Tiempo.** `now_ms()` es el tiempo simulado del emulador. El emulador nunca se adelanta al reloj de pared, de modo que los programas del host (el enlace con el dispositivo, un extremo Modbus) ven los mismos tiempos de espera que en una placa; cuando el emulador es más lento que el chip, es el tiempo simulado el que se atrasa.

El banco del ESP32-S3 usa el tiempo del host, pero QEMU no mantiene el reloj de la placa sincronizado con él. En las ejecuciones del 2026-10-20 la placa contó entre un sexto y un tercio del tiempo del host, según la carga de la máquina. Un paso de tiempo en QEMU (un TON de 3 s tardó 8 s) mide a QEMU, no al firmware, y los pasos de falla esperan la falla, no un tiempo fijo.

## Manejar native_sim con el mapa de canales de la Pico

```bash
tools/firmware-test/run.sh app-native
```

Esto compila `firmware/app` para `native_sim/native/64` con la descripción de E/S de la Pico sobre `gpio_emul` y `adc_emul`, lo arranca y lo maneja mediante su comando de shell `emu`:

| Comando                  | Efecto                                                           |
| ------------------------ | ---------------------------------------------------------------- |
| `emu pin <gpio> <0\|1>`  | Maneja un pin de entrada (las entradas son activas en bajo: `0` es pulsado) |
| `emu adc <ch> <0..4095>` | Fija una entrada del conversor a esa fracción de 3,3 V           |
| `emu out`                | Los niveles de los pines de salida, como máscara de bits de números GPIO |

El comando vive en `firmware/tests/app_native_emulation/module`, un módulo que solo este modo agrega a la compilación. El modo también configura `rpi_pico/rp2040` con el comando habilitado y espera que la compilación se detenga, de modo que el comando nunca puede compilarse en una placa distribuida.

## Las correcciones de rp2040js

El parche corrige cinco lugares donde rp2040js no se comportaba como el RP2040. Cada uno detenía a Zephyr o daba lecturas erróneas, y `tools/hil/emulator/README.md` los enumera. Uno de ellos explica una lectura de "el canal 0 del ADC devuelve el canal 4" vista al probar el emulador: rp2040js mantenía START_ONCE activado, así que cada conversión leía la entrada seleccionada antes. El HAL de ZPLC era correcto.

## Lo que encontraron las ejecuciones emuladas

Las primeras ejecuciones emuladas de la cadena, el 2026-10-20, fallaron cinco pasos. Cada falla se rastreó hasta su causa, y el paso se volvió a ejecutar en el emulador tras la corrección.

1. **Ciclo de energía y RETAIN, ambas placas.**
   - *Registro:* RETAIN 102 antes del ciclo de energía, 0 después.
   - *Causa:* las imágenes no tenían persistencia de RETAIN. `CONFIG_ZPLC_RETAIN_PERSIST` estaba apagada en todos los perfiles distribuidos (ahora está activa en todos, RT-025), y en la Pico no cabe en la partición de almacenamiento de 64 KB, así que la compilación se detiene. Con la opción activa, la imagen del ESP32-S3 conservó el valor (16 antes y después), y también lo hizo una imagen de la Pico compilada para la prueba con una partición de almacenamiento de 128 KB (101 antes y después).
   - *Corrección:* el paso comprueba la opción de la imagen y dice por qué no puede aprobar. La imagen HIL activa la opción, y la Pico y la RP2040-Zero mantienen una partición de almacenamiento de 128 KB. La imagen HIL de la Pico conservó el valor (102 antes y después).
2. **Sobrecarga, ambas placas.**
   - *Registro:* `vm_fault` con error de VM 8, no `deadline_miss`; salidas apagadas.
   - *Causa:* el bucle del paso ejecutó 104.000 instrucciones de VM en un ciclo, por encima del presupuesto de 100.000 (`CONFIG_ZPLC_VM_CYCLE_INSTRUCTION_BUDGET`), así que el runtime retuvo su falla de perro guardián de la VM, como está diseñado.
   - *Corrección:* el paso dimensiona el bucle a la mitad del presupuesto que informa la imagen. Ambas placas retienen entonces `deadline_miss` tras tres ciclos tardíos, con las salidas apagadas.
3. **Intercambio de bus de campo, Pico.**
   - *Registro:* ninguna solicitud llegó al host, error 10.
   - *Causa:* el cliente Modbus RTU del dispositivo está apagado por omisión y arranca solo al iniciar, de modo que el bloque falló de inmediato con `UNAVAILABLE`. El lado del host de la línea también se abrió a 115200 baudios, mientras el dispositivo funciona a 19200.
   - *Corrección:* el paso enciende el cliente a 19200 baudios, lo guarda y reinicia la placa. El intercambio emulado leyó 0x5A17.
4. **Despliegue, ESP32-S3.**
   - *Registro:* "Not in loading state" después de que se envió un fragmento otra vez.
   - *Causa:* el cargador rechazó el fixture con `ZPLC_LOADER_ERR_MEMORY` (-13), porque la cadena compilaba los fixtures para 8 KB de memoria de trabajo y el ESP32-S3 tiene 2 KB. El probador volvió entonces a enviar el último fragmento, a una carga que había terminado. Una placa hace lo mismo.
   - *Corrección:* la cadena compila los fixtures para la placa, y el probador eleva el rechazo del dispositivo en lugar de reenviar el fragmento. El banco del ESP32-S3 también da a los programas diez veces el tiempo del host, por el reloj lento de QEMU. El despliegue y los seis fixtures de parpadeo pasan entonces.
5. **Falla fatal, ESP32-S3.**
   - *Registro:* sigue en ejecución, sin falla, después de 1 s.
   - *Causa:* la ruta de falla funciona en Xtensa (división por cero, error de VM 3, salidas apagadas), pero con el reloj lento de QEMU un segundo de tiempo del host no alcanzó para los 21 ciclos que necesita el programa.
   - *Corrección:* los pasos de falla esperan la falla, hasta 10 s. QEMU la retuvo tras 1,4 s de tiempo del host y 21 ciclos.

Al ejecutar el paso de RETAIN en la imagen HIL de la Pico se encontró un defecto más: la imagen rechazaba todo START con el error -3. El planificador armaba solo el `zephyr,watchdog` elegido en el árbol de dispositivos, que ninguna placa de este repositorio define. Ahora arma el alias `watchdog0` de la placa cuando no hay ninguno elegido, y una imagen con perro guardián por hardware y ninguno de los dos nodos no compila.

En rp2040js, los fixtures de parpadeo cuentan los cambios de salida leyendo las salidas por el shell, y de una ejecución a la siguiente un fixture distinto ve muy pocos cambios. No son evidencia en este emulador en ningún sentido.

## Licencias

| Software                       | Licencia | En este repositorio                                                                                                  |
| ------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------- |
| rp2040js, Uri Shaked y Wokwi   | MIT      | Solo `rp2040js-zplc-emu.patch`, una obra derivada bajo la misma licencia MIT. `setup.sh` descarga el emulador.        |
| QEMU de Espressif              | GPL-2.0  | Nada. `setup.sh` descarga la versión, que se ejecuta como un programa aparte.                                         |

Ofrecer las correcciones de rp2040js a su proyecto de origen es una decisión del dueño del proyecto.
