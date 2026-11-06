---
slug: /development/hardware-in-the-loop
title: Hardware en el lazo
sidebar_label: Hardware en el lazo
description: Cómo una persona ejecuta en el banco las pruebas de hardware de ZPLC, qué comprueba y qué escribe cada herramienta, qué pruebas corren también en el host sin placa y qué falta para que una placa tenga evidencia de hardware.
---

# Hardware en el lazo

Use esta página cuando trabaje en un banco con una placa ZPLC. Dice qué comando ejecutar, qué le pide hacer la herramienta, qué registra y qué demuestra o no demuestra un registro.

:::warning Una persona inicia cada acción sobre una placa
Las herramientas de IA y MCP no graban, despliegan, fuerzan, inician ni detienen una placa, ni abren su shell serie, y ninguna opción permite que un script lo haga por ellas. Cada comando de esta página que toca una placa lo inicia usted.
:::

Nada de lo que sigue es evidencia de hardware hasta que existe un registro para una placa y una imagen de firmware (vea [Registros de ejecución](#registros-de-ejecución)). Todo lo que ejecuta la integración continua es evidencia de host: demuestra las herramientas, no una placa.

## Qué corre dónde

| Nivel | Qué demuestra                                                                                                                                                                                                                                                  | Dónde                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Host  | Cada fixture de lenguaje compila con el compilador del repositorio y mantiene sus valores esperados en el runtime nativo; los scripts de dispositivo terminan con código distinto de cero cuando una comprobación falla; el motor de escenarios corre en el puerto de hardware contra el runtime nativo. | CI, y cualquier máquina con el repositorio  |
| Placa | Los mismos fixtures y escenarios en una placa grabada, y los pasos físicos.                                                                                                                                                                                    | Una persona, en el banco                    |

El nivel de host no demuestra que un pin maneje una carga, que un temporizador mantenga su período en silicio real ni que un perro guardián reinicie a tiempo. Eso requiere el nivel de placa. Para un banco sin placa, vea el [banco emulado](./hil-emulation.md); es un ensayo y nunca sube un nivel de soporte.

## Las herramientas

| Herramienta                                                                             | Uso                                                                                                                  |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `python3 tools/hil/run_chain.py <placa> [--bench human\|emulated]`                      | Un comando por placa. Pide cada paso físico, mide los pasos de HIL-010 y escribe un registro de ejecución.           |
| `python3 tools/hil/compare_sim.py <placa> [--bench human\|emulated]`                    | Ejecuta los proyectos de referencia en simulación nativa y en el banco, y registra cada diferencia (HIL-015).        |
| `bun packages/zplc-hil/src/cli.ts run --board <id> --workspace <dir> --scenario <archivo>` | Ejecuta en una placa el archivo de escenario de un proyecto. Es el archivo que la aplicación ZPLC ejecuta en el host. |
| `python3 tools/hil/run_all_languages.py`                                                | Los fixtures IL, LD, FBD, SFC y ST y los proyectos de referencia, en el dispositivo.                                 |
| `python3 tools/hil/run_all_hil_tests.py`                                                | Los scripts de nivel de opcode. Necesitan una imagen de firmware que imprima la traza HIL.                           |
| `python3 tools/hil/verify_compilation.py`                                               | Compila cada fixture y cada proyecto de referencia. Sin dispositivo.                                                 |

`<placa>` es el `ide_id` de la placa en `firmware/app/boards/boards.json`, por ejemplo `rpi_pico`.

### Encontrar el puerto serie

Las herramientas eligen el puerto en este orden: `--port`, luego la variable de entorno `ZPLC_SERIAL_PORT`, luego una búsqueda por los identificadores USB de la placa en `tools/hil/usb-ids.json`. Cuando coinciden varios dispositivos, o ninguno, la herramienta se detiene y enumera lo que vio; nunca adivina. Ningún script escribe la ruta de un puerto, y las herramientas funcionan en Linux, macOS y Windows. CI ejecuta sus pruebas solo en Linux; todavía no hay registrada ninguna ejecución en macOS ni en Windows.

### Ejecutar sin placa

`ZPLC_HIL_DEVICE=host` (con `ZPLC_NATIVE_SIM_BIN` indicando el binario `zplc_runtime`) y `ZPLC_HIL_DEVICE=null` sustituyen a una placa. Un registro hecho con un sustituto dice `host-runtime` o `fake` como evidencia, nunca `hardware`.

Cada registro declara además su nivel de evidencia:

| Nivel                | Lo produce                                                                           | Sube un nivel de soporte |
| -------------------- | ------------------------------------------------------------------------------------ | ------------------------ |
| `hardware`           | El banco de una persona                                                              | Sí                       |
| `emulated`           | El banco emulado, con el emulador, su versión y el hash de su parche                 | Nunca                    |
| `community-reported` | El informe de un usuario                                                             | Nunca                    |
| ninguno              | Un sustituto                                                                         | Nunca                    |

### Estado de salida

| Estado | Significado                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| 0      | Todas las comprobaciones se cumplieron.                                                                                  |
| 1      | Una comprobación falló, o el script no hizo ninguna comprobación.                                                        |
| 2      | No se pudo usar ningún dispositivo: no se eligió puerto, el puerto no abrió o un programa no compiló.                    |
| 77     | Omitido: la imagen de firmware no tiene traza HIL. No es un resultado correcto.                                          |

Una herramienta iniciada sin terminal interactiva termina con estado 2 y dice por qué, antes de abrir un puerto. Los scripts que solo observan una placa y no juzgan nada (`check_alive.py`, `check_hw.py`, `debug_peek.py`, `inspect_zplc.py`, `rescue.py`, `rescue_device.py`, `sniff.py`) figuran con su motivo en `tools/hil/non-gating.json`.

## La cadena

`run_chain.py` ejecuta estos pasos en orden y se detiene en el primero que falla.

1. **Verificación previa.** La placa está en el manifiesto, y los fixtures de la ejecución compilan con el compilador del repositorio, para la placa.
2. **Grabar.** Usted graba la imagen; la herramienta no. Abre el enlace con el dispositivo solo después de este paso, porque una placa en blanco no tiene puerto serie y una placa grabada reaparece con otro nombre. Cuando pulsa Enter, vuelve a buscar el puerto durante hasta 30 segundos.
3. **Handshake de identidad.** La herramienta pregunta al dispositivo quién es (`zplc sys info --json`) y qué imagen es (`zplc sys build --json`: versión, commit, si el árbol estaba modificado, placa, ABI, borrador y las opciones de compilación con su hash). Ambas respuestas van al registro, junto con el comando de compilación que la herramienta le indicó ejecutar.
4. **Descripción de E/S.** El dispositivo dice de qué descripción de E/S de la placa se compiló su imagen (`zplc sys io --json`: id de la placa, hash, cantidad de canales y bytes de imagen). La herramienta la compara con `boards.json` y hace fallar la ejecución cuando difieren. Una imagen que no informa ninguna se registra como omitida, no como aprobada.
5. **Opción de traza.** Las opciones de la imagen dicen si la traza HIL está activa. La ejecución falla cuando no es lo que pidió: el firmware de versión no lleva traza, y `--hil-trace` pide la imagen que la lleva.
6. **Confirmar la placa.** Usted escribe la identidad que informó el dispositivo. Pulsar Enter solo no confirma.
7. **Las salidas son seguras de manejar.** Usted escribe la identidad otra vez, para decir que nada conectado a las salidas puede dañar a nadie.
8. **Desplegar y ejecutar.** Se carga un programa y el contador de ciclos debe avanzar.
9. **Fixtures.** Se ejecuta el parpadeo de cada uno de los cinco lenguajes (cada fixture marcado para hardware con `--all-fixtures`), con las entradas forzadas y liberadas.
10. **Forzar y liberar.** Se fija un forzado, se lista y se borra, y no queda ninguno.
11. **Detener.** El dispositivo no está en ejecución y la imagen de salida es cero.
12. **Los pasos de medición de HIL-010.** Lazo digital, lectura analógica, exactitud de temporizador, diez minutos de fluctuación de ciclo, salidas apagadas tras una sobrecarga y tras una falla fatal, salidas seguras tras STOP y tras la pérdida del enlace con forzados activos, tiempo de reinicio del perro guardián, un ciclo de energía con RETAIN, veinte cortes de energía durante despliegues, una escritura atómica y un intercambio de bus de campo. Cada uno escribe sus mediciones y su veredicto en el registro; la [guía de banco](#guía-de-banco) los enumera con su cableado y sus reglas de aprobación.

La cadena escribe un registro tanto si aprueba como si falla, y antes de empezar dice cuánto tarda (unos 31 minutos en el banco de una persona). Un paso que el banco no puede hacer se registra como `skipped` (o `not-emulable` en un emulador), nunca como aprobado. Una ejecución en seco o con un sustituto ejecuta los pasos de medición solo cuando `--steps` los nombra.

### Opciones de `run_chain.py`

| Opción                          | Efecto                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port`                        | El puerto serie; vea [Encontrar el puerto serie](#encontrar-el-puerto-serie).                                                                       |
| `--out`                         | El directorio del registro de ejecución. El valor predeterminado es `build/hil-records`.                                                            |
| `--operator`                    | Quién está en el banco. Se pregunta cuando no se indica.                                                                                            |
| `--firmware-image`              | La imagen que se grabó; su SHA-256 va al registro.                                                                                                  |
| `--only`                        | Ids de fixtures separados por comas que se ejecutan en lugar de los parpadeos de los cinco lenguajes.                                               |
| `--all-fixtures`                | Ejecuta cada fixture marcado para hardware (HIL-005), unos siete minutos más.                                                                       |
| `--hil-trace`                   | La imagen bajo prueba lleva la superposición de traza HIL. Vea [Fixtures](#fixtures).                                                               |
| `--steps`                       | Pasos de medición de HIL-010, separados por comas, que se ejecutan en lugar de todos.                                                               |
| `--no-watchdog-build`           | Imprime el comando de compilación simple del manifiesto; el paso del perro guardián falla entonces y dice que la imagen no lo tiene.                |
| `--rtu-port`                    | El lado del host de la línea Modbus RTU de la Pico: el adaptador USB-serie conectado a UART1.                                                       |
| `--host-ip`                     | La dirección de este equipo que alcanza el ESP32-S3 por Wi-Fi. Por omisión se obtiene de la ruta predeterminada.                                    |
| `--loopback-bin`                | El binario `zplc_loopback` de este árbol. Por omisión es el que está junto a `ZPLC_NATIVE_SIM_BIN`.                                                 |
| `--bench`                       | `human` (predeterminado) o `emulated`.                                                                                                              |
| `--dry-run`, `--device`         | Ejecuta en un dispositivo falso (`host` o `null`). Con `--dry-run` no se pregunta a nadie; sin él se pregunta a una persona, como ensayo. El registro dice que no es hardware. |
| `--keep-going`                  | Solo para el banco emulado: informa cada paso tras una falla. Una ejecución de hardware siempre se detiene en la primera falla.                     |

### El registro de evidencia

Una ejecución en hardware real que termina en aprobada o fallida escribe además `<ejecución>.evidence.json` junto al registro de ejecución, cuando se cumplen dos condiciones: la imagen se indicó con `--firmware-image`, y el dispositivo informa un commit de 40 dígitos de un árbol sin cambios sin confirmar. El archivo es el registro plano del que `firmware/zephyr/scripts/zplc_boards.py` deriva el nivel de soporte de una placa. Tiene el esquema `zplc.hil-record/1`, el `board_id`, la versión y el commit del firmware, el SHA-256 de la imagen, y el resultado con la lista de lo que la ejecución no cubrió.

Cuando falta alguno de esos datos, el registro de ejecución dice por qué no se escribió el registro de evidencia (registro `evidence-record`). Una ejecución con un sustituto nunca lo escribe. Agregar el archivo a `evidence_refs` de la placa en `boards.json` es una edición suya, después de leer el registro de ejecución.

### Un informe de un usuario

El resultado de otra persona en su placa entra en la misma lista con un nivel menor. El formulario "Board report" pide la placa, la versión del firmware, el commit, el SHA-256 de la imagen y el resultado. Quien mantiene el proyecto, tras leer la incidencia, ejecuta `python3 tools/hil/community_report.py` con esos valores y la dirección de la incidencia. Escribe un registro `zplc.community-report/1`, y se agrega el archivo a `evidence_refs` de la placa. La tabla de placas generada lo lista como `community-reported`. Es una pista: nunca sube el nivel de soporte ni activa el perro guardián por hardware del perfil.

## Fixtures

`tools/hil/il_tests`, `ld_tests`, `fbd_tests`, `sfc_tests`, `st_tests` y `blinky_ld_gen.st` contienen los fixtures de lenguaje, y `tools/hil/fixtures.json` contiene el valor esperado de cada fase de cada uno. Una fase fija entradas, deja que el programa corra un número de ciclos y comprueba salidas. Los archivos compilados se crean cuando una ejecución los necesita, en un directorio temporal que se elimina, y no se conservan en el repositorio.

Los valores se leen mientras el programa corre. STOP lleva las salidas a su estado seguro, de modo que una salida lee cero después, sea lo que sea que calculó el programa.

Los scripts de nivel de opcode leen tramas de traza HIL, que solo imprime una imagen de firmware compilada con `CONFIG_ZPLC_HIL_DEBUG=y`. El firmware de versión no lleva la traza en su bucle de VM y ningún perfil de placa la activa, así que con una imagen de versión esos scripts terminan con 77. Una imagen con traza HIL es el perfil más `tools/hil/hil_debug.conf`:

```bash
west build -b rpi_pico/rp2040 firmware/app --pristine -- -DEXTRA_CONF_FILE=$PWD/tools/hil/hil_debug.conf
```

`run_chain.py <placa> --hil-trace` imprime el comando para la placa y lo registra. No publique una imagen compilada con la superposición: el hash de sus opciones difiere del de la versión, y el registro dice que la traza está activa.

## Escenarios en una placa

Un archivo de escenario que corre en el host con `zplc-cli scenario-run` corre también en una placa, mediante el puerto de runtime de hardware del motor de escenarios:

- El tiempo es el reloj del dispositivo. Una marca se muestrea cuando el dispositivo la alcanzó y completó un ciclo desde que se forzaron las entradas.
- Las entradas se fuerzan, no se escriben, porque la placa reescribe su imagen de entrada en cada ciclo. El byte forzado reemplaza sus ocho bits durante la ejecución.
- La tolerancia, `--tolerance-ms` (50 ms por omisión), es un límite de retraso, no una ventana alrededor de la marca. Nunca se toma una muestra antes de su marca, las ventanas de aserción del escenario no se ensanchan con ella, y una muestra tomada después de la tolerancia anula la ejecución.
- Una ejecución anulada por la tolerancia, o detenida por un error, escribe igualmente su registro: el resultado anulado, la tolerancia, el retraso de cada marca muestreada (`measurements.ticks`) y la liberación de los forzados.
- Todo forzado que fijó la herramienta se borra al final y al abortar, y la placa queda detenida. Si se pierde el enlace, el propio dispositivo libera los forzados.

## Registros de ejecución

Cada ejecución en hardware escribe un registro JSON, descrito por `tools/hil/run-record.schema.json`, en `build/hil-records/` o en el directorio de `--out`. Contiene:

- la placa y lo que informó el dispositivo;
- el commit, la versión y la ABI del firmware según los informa la imagen;
- el hash de cada programa y de la imagen (la que usted indica con `--firmware-image`, o si no la que informa el dispositivo);
- cada paso con su resultado y la hora en que usted lo confirmó;
- las pruebas, las versiones de las herramientas, el operador y el registro bruto del shell.

Los campos que la imagen de firmware aún no puede informar son `null`: el registro dice que no lo sabe, y no adivina. Un registro queda ligado a la imagen que probó. Confirme el registro después, nunca en el commit desde el que se compiló la imagen: las pruebas HIL en Python que ejecuta CI comprueban que el commit de la imagen de cada registro que referencia el manifiesto sea un ancestro estricto del commit que agregó el registro.

## Guía de banco

Este es el banco que `run_chain.py` pide, paso a paso, en las dos placas de aprendizaje. El banco emulado (`--bench emulated`) aplica el mismo cableado de forma virtual, y sus registros dicen `emulated`.

:::note Ningún paso se ha ejecutado todavía en una placa física
La columna "Hardware" de abajo lo dice para cada paso. Cambia solo cuando una persona ejecuta la cadena y confirma su registro.
:::

### Piezas

El kit del curso (`packages/zplc-ide/lessons/kit.json`: la placa, un cable USB de datos, una protoboard, LED con resistencias de 330 Ω, pulsadores, un potenciómetro lineal de 10 kΩ, un condensador de 100 nF y cables de conexión), y para el banco:

- cuatro resistencias de 1 kΩ, una en serie en cada cable del lazo;
- solo Raspberry Pi Pico: un adaptador USB-serie con lógica de 3,3 V (por ejemplo CP2102, CH340 o FT232 configurado a 3,3 V) para el intercambio Modbus RTU;
- solo ESP32-S3: una red Wi-Fi a la que este equipo también esté conectado;
- un multímetro, útil para el punto de 50 % del paso analógico pero no obligatorio.

### Límites de tensión

- Los pines de E/S de ambas placas de aprendizaje funcionan solo con lógica de 3,3 V.
- No conecte nunca 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más de 3,3 V ni nada de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 de la placa y una las tierras.
- Mantenga cada salida por debajo de 10 mA: un LED con una resistencia de 330 Ω consume cerca de 4 mA. En la Pico, mantenga el total de todos los pines por debajo de 50 mA.
- Cablee con el cable USB desconectado y revise el cableado dos veces antes de conectarlo.

### Cableado

Cada salida se conecta a la entrada del mismo número mediante una resistencia de 1 kΩ. Nada más se conecta a esos pines durante la ejecución. Cuando el mapa de pines de la placa en la aplicación ZPLC (`firmware/app/boards/boards.json`) difiere de esta tabla, el mapa de pines es la referencia.

| Cable | Raspberry Pi Pico | ESP32-S3-DevKitC-1 |
| --- | --- | --- |
| DO0 → 1 kΩ → DI0 | GP0 (pin 1) → GP15 (pin 20) | GPIO15 (J1-8) → GPIO5 (J1-5) |
| DO1 → 1 kΩ → DI1 | GP1 (pin 2) → GP14 (pin 19) | GPIO16 (J1-9) → GPIO6 (J1-6) |
| DO2 → 1 kΩ → DI2 | GP2 (pin 4) → GP13 (pin 17) | GPIO17 (J1-10) → GPIO7 (J1-7) |
| DO3 → 1 kΩ → DI3 | GP3 (pin 5) → GP12 (pin 16) | GPIO18 (J1-11) → GPIO8 (J1-12) |
| Extremos del potenciómetro | 3V3(OUT) (pin 36) y AGND (pin 33) | 3V3 (J1-1) y GND (J1-22) |
| Cursor del potenciómetro → AI0 | GP26/ADC0 (pin 31) | GPIO4/ADC1_CH3 (J1-4) |
| Modbus RTU | GP4 (pin 6, TX) → RX del adaptador, GP5 (pin 7, RX) ← TX del adaptador, GND (pin 8) → GND del adaptador | (ninguno) |
| Red | (ninguna) | Wi-Fi: las credenciales se guardan con `zplc config set wifi_ssid` y `wifi_pass` (y luego `zplc config save`); `wifi connect` solo las usa |

Las entradas usan su resistencia de pull-up interna y son activas en bajo en el firmware, así que a través del lazo una entrada lee lo inverso de su salida. La cadena acepta cualquiera de las dos polaridades, siempre que cada entrada siga a su propia salida y ninguna otra entrada se mueva.

### Procedimiento

El procedimiento es la cadena, un comando por placa:

```bash
python3 tools/hil/run_chain.py rpi_pico --firmware-image <zephyr.uf2> --rtu-port <adaptador USB-serie>
python3 tools/hil/run_chain.py esp32s3_devkitc --firmware-image <zephyr.bin> [--host-ip <este equipo en la red Wi-Fi>]
```

Antes de empezar, la cadena dice cuánto tarda en este banco: unos 31 minutos, de los cuales diez corresponden al paso de fluctuación de ciclo y unos ocho a los veinte cortes de energía. El paso de fluctuación corre solo, porque todos los demás pasos detienen, despliegan o cortan la energía. Por omisión la cadena ejecuta el parpadeo de los cinco lenguajes; `--all-fixtures` agrega cada fixture marcado para hardware (HIL-005), unos siete minutos más.

**La imagen bajo prueba es la imagen HIL**: el comando de compilación de la placa con `-DCONFIG_ZPLC_HIL_IMAGE=y`, que la cadena imprime, porque RT-020 pide que el registro se haga con el perro guardián activo.

- La imagen HIL activa el perro guardián por hardware con los tiempos límite y las políticas de la entrada de la placa en `boards.json`, y dice lo que es: `zplc version` imprime una línea para ella, y sus opciones de compilación listan `HIL_IMAGE=y`, que el handshake registra.
- Una compilación que active el perro guardián por sí sola sigue siendo rechazada por `firmware/app/CMakeLists.txt`.
- La imagen HIL nunca es una imagen de versión: la recolección de versiones (`scripts/release/firmware-images.ts`) rechaza una compilación cuya configuración u opciones la nombren.
- `--no-watchdog-build` imprime el comando simple, y el paso del perro guardián falla entonces y dice por qué.

La imagen HIL también activa la persistencia de RETAIN (`CONFIG_ZPLC_RETAIN_PERSIST`, que los perfiles distribuidos también activan), para que el paso de RETAIN pueda medirla. En una imagen sin ella, el paso falla y dice que la imagen no puede conservar RETAIN. La Pico y la RP2040-Zero mantienen una partición de almacenamiento de 128 KB, que contiene las dos ranuras de programa, los dos registros RETAIN y un sector de reserva (RT-029).

Grabar es cosa suya:

- **Pico.** Mantenga pulsado BOOTSEL mientras conecta el cable USB, y copie `zephyr.uf2` en la unidad RPI-RP2.
- **ESP32-S3.** Ejecute `esptool --chip esp32s3 --port <puerto> write-flash 0x0 zephyr.bin` en el puerto rotulado USB, y luego pulse RST si la placa queda en modo de descarga.

| # | Paso | Qué hace la cadena | Pasa cuando | Hardware | Emulado |
| --- | --- | --- | --- | --- | --- |
| 1 | Verificación previa | Compila los fixtures para la placa | Cada fixture compila | Todavía no se ejecutó | Se completa con los registros emulados |
| 2 | Grabar | Usted graba la compilación HIL | La placa se reinicia | Todavía no se ejecutó | Se completa con los registros emulados |
| 3 | Intercambio de identidad | Lee `zplc sys info` y `zplc sys build` | El dispositivo responde con una placa | Todavía no se ejecutó | Se completa con los registros emulados |
| 4 | Descripción de E/S | Compara `zplc sys io` con `boards.json` | Coinciden | Todavía no se ejecutó | Se completa con los registros emulados |
| 5 | Opción de traza | Lee las opciones de la imagen | La traza HIL es la que pidió la ejecución | Todavía no se ejecutó | Se completa con los registros emulados |
| 6 | Confirmar la placa | Usted escribe la identidad que informa el dispositivo | Coincide | Todavía no se ejecutó | Un emulador no tiene persona |
| 7 | Las salidas se pueden accionar | Usted escribe la identidad otra vez | Coincide | Todavía no se ejecutó | Un emulador no tiene persona |
| 8 | Cargar, ejecutar | Carga un programa y lo inicia | El contador de ciclos avanza | Todavía no se ejecutó | Se completa con los registros emulados |
| 9 | Parpadeo en cinco lenguajes | Ejecuta los parpadeos en ST, IL, LD, FBD y SFC | Cada salida conmuta como espera su fixture | Todavía no se ejecutó | Se completa con los registros emulados |
| 10 | Fijar y liberar una fuerza | Fija, lista y borra una fuerza | No queda ninguna fuerza | Todavía no se ejecutó | Se completa con los registros emulados |
| 11 | Detener | Detiene la placa | No está en ejecución, imagen de salidas en cero | Todavía no se ejecutó | Se completa con los registros emulados |
| 12 | Lazo digital | Fuerza cada salida, sola, a encendida y apagada y lee las entradas | Cada entrada sigue a su propia salida y ninguna otra cambia | Todavía no se ejecutó | Se completa con los registros emulados |
| 13 | Lectura analógica | Le pide girar el potenciómetro a 0 %, 50 % y 100 % y lee AI0 | El potenciómetro va de 3V3 a GND, así que su extremo superior son 3,3 V. Dentro del 5 % de la lectura esperada en 0 % y 100 %, y del 10 % en el centro. En la ESP32-S3 el conversor abarca de 0 a 3,1 V (`raw_max` 2885), de modo que el 100 % satura: el paso espera la escala completa con 7 % de tolerancia (un chip que se detiene cerca de 2,9 V sigue pasando), y el 50 % (1,65 V) espera el 53 % de la escala completa | Todavía no se ejecutó | Se completa con los registros emulados |
| 14 | Exactitud del temporizador | Ejecuta un TON de 3 s y mide su salida desde RUN con el reloj del banco | Entre 3000 ms menos un ciclo y 3000 ms más un ciclo, 100 ms y dos viajes de ida y vuelta de lectura | Todavía no se ejecutó | Se completa con los registros emulados |
| 15 | Jitter de ciclo, diez minutos | Ejecuta una tarea de 10 ms durante diez minutos y lee la medida propia del runtime de cada ciclo: el período más corto y el más largo de cada tarea (`zplc status --json`, `tasks[]`) | Ningún desborde, ningún plazo incumplido, cada período de ciclo dentro del 20 % del intervalo | Todavía no se ejecutó | Se completa con los registros emulados |
| 16 | Desborde | Ejecuta una tarea de 1 ms que acciona DO0 y repite un bucle durante la mitad del presupuesto de instrucciones de la VM de la imagen (un ciclo que pasa el presupuesto enclava en cambio la falla de watchdog de la VM) | Se enclava la falla `deadline_miss` en menos de 10 s y las salidas quedan apagadas | Todavía no se ejecutó | Se completa con los registros emulados |
| 17 | STOP y pérdida del enlace con fuerzas | Fuerza las salidas a encendidas y detiene; luego las fuerza desde la consola, en la sesión de su enlace, cierra el puerto y lo vuelve a abrir, con un programa que mantiene las salidas en bajo | Salidas apagadas tras STOP, y fuerzas liberadas al perder el enlace: por DTR en la Pico, por el tiempo de inactividad (30 s por omisión) en la ESP32-S3 | Todavía no se ejecutó | Se completa con los registros emulados |
| 18 | Tiempo de reinicio del watchdog | Ejecuta un ciclo que nunca termina | Causa de reinicio `watchdog`, el reinicio entre el 90 % del tiempo límite y el tiempo límite más 500 ms, de vuelta en STOP con salidas apagadas | Todavía no se ejecutó | Se completa con los registros emulados |
| 19 | Falla fatal | Divide por cero tras 20 ciclos de un programa que acciona DO0 | Se enclava la falla `vm_fault` en menos de 10 s y las salidas quedan apagadas | Todavía no se ejecutó | Se completa con los registros emulados |
| 20 | Ciclo de energía y RETAIN | Comprueba que la imagen se compiló con persistencia de RETAIN, cuenta en una variable RETAIN, detiene (lo que la guarda) y le pide desconectar y volver a conectar la placa | STOP tras el encendido, el valor RETAIN conservado, el programa presente | Todavía no se ejecutó | Se completa con los registros emulados |
| 21 | 20 cortes de energía durante el despliegue | Carga el programa A, envía una parte del programa B (desde una vigésima parte hasta todo) y le pide desconectar de inmediato | Tras cada corte la placa está en STOP y ejecuta A o B completo | Todavía no se ejecutó | Se completa con los registros emulados |
| 22 | Escritura atómica | Escribe 100 veces un valor de cuatro bytes por el enlace del dispositivo mientras el programa cuenta valores partidos | Ningún ciclo vio un valor escrito a medias | Todavía no se ejecutó | Se completa con los registros emulados |
| 23 | Intercambio de bus de campo | Pico: activa el cliente Modbus RTU del dispositivo a 19200 baudios, lo guarda y reinicia la placa (el cliente solo arranca al iniciar), y luego lee el registro de retención 100 de un servidor Modbus RTU en esta computadora, en una línea abierta a 19200 baudios. ESP32-S3: espera a que la placa informe una dirección IP (`zplc net status`; el firmware se une por sí solo a la red guardada al arrancar y de nuevo después de una caída), y luego escribe y vuelve a leer un registro en el servidor Modbus TCP y recibe de vuelta una publicación MQTT a través del broker de `zplc_loopback`, alcanzado en la dirección de red local de esta computadora. Los resultados se leen como una sola instantánea: primero `done`, luego los valores, y solo cuando una segunda lectura coincide | El valor leído es 0x5A17, sin error | Todavía no se ejecutó | Se completa con los registros emulados |

Una persona no puede cortar la energía en el momento exacto en que se escribe el programa en la flash, así que en una placa el paso 21 prueba los cortes en los puntos que una mano alcanza. El banco emulado corta en puntos programados.

## Simulación y hardware (HIL-015)

`python3 tools/hil/compare_sim.py <placa>` compila cada proyecto de referencia de la aplicación ZPLC (los parpadeos en LD, FBD y SFC y el control de motor en LD) para la placa, lo ejecuta en el runtime nativo y en el banco con las mismas entradas en los mismos instantes, y compara las trazas de salida. Cada diferencia va a un registro de comparación en `build/hil-records/`: otra secuencia de valores de salida, o un cambio a más de `--tolerance-ms` (100 ms) de su gemelo. Una diferencia hallada en hardware pertenece al perfil de capacidades del simulador ([contrato de sesión nativa](../runtime/index.md)).

| Placa              | Diferencias en hardware   | Diferencias emuladas                         |
| ------------------ | ------------------------- | -------------------------------------------- |
| Raspberry Pi Pico  | Todavía no se ejecutó     | Se completa con los registros emulados       |
| ESP32-S3-DevKitC-1 | Todavía no se ejecutó     | Se completa con los registros emulados       |
