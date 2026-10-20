---
slug: /development/hardware-in-the-loop
title: Hardware en el lazo
sidebar_label: Hardware en el lazo
description: Cómo una persona ejecuta en el banco las pruebas de hardware de ZPLC, qué comprueba y qué escribe cada herramienta, qué pruebas corren también en el host sin placa y qué falta para que una placa tenga evidencia de hardware.
---

# Hardware en el lazo

Esta página es para la persona que está en el banco. Una placa es algo físico,
de modo que una persona inicia todo comando que la toque: las herramientas de
IA y MCP no graban, no cargan, no fuerzan, no arrancan ni detienen una
placa, ni abren su shell serie, y ninguna opción permite que un script lo haga
por ellas.

Nada de esto es evidencia de hardware mientras no exista un registro para una
placa y una imagen de firmware (véase [Registros de ejecución](#registros-de-ejecución)).
Todo lo que corre la integración continua es evidencia de host: demuestra las
herramientas, no una placa.

## Qué corre dónde

| Nivel | Qué demuestra | Dónde |
|-------|---------------|-------|
| Host | Cada fixture de lenguaje compila con el compilador del repositorio y cumple sus valores esperados en el runtime nativo; los scripts de dispositivo terminan con estado distinto de cero cuando una comprobación falla; el motor de escenarios corre sobre el puerto de hardware contra el runtime nativo. | CI, y cualquier máquina con el repositorio |
| Placa | Los mismos fixtures y escenarios sobre una placa con la imagen grabada, y los pasos físicos. | Una persona, en el banco |

El nivel de host no demuestra que un pin maneje una carga, que un temporizador
mantenga su período en silicio real ni que un watchdog reinicie a tiempo. Eso
requiere el nivel de placa.

## Las herramientas

| Herramienta | Uso |
|-------------|-----|
| `python3 tools/hil/run_chain.py <placa> [--bench human\|emulated]` | Un comando por placa. Pide cada paso físico, mide los pasos de HIL-010 y escribe un registro de ejecución. |
| `python3 tools/hil/compare_sim.py <placa> [--bench human\|emulated]` | Ejecuta los proyectos de referencia en simulación nativa y en el banco y registra cada diferencia (HIL-015). |
| `bun packages/zplc-hil/src/cli.ts run --board <id> --workspace <dir> --scenario <archivo>` | Ejecuta en una placa un archivo de escenario de un proyecto. El escenario es el archivo que la aplicación ZPLC ejecuta en el host. |
| `python3 tools/hil/run_all_languages.py` | Los fixtures IL, LD, FBD, SFC y ST y los proyectos de referencia, en el dispositivo. |
| `python3 tools/hil/run_all_hil_tests.py` | Los scripts de nivel de opcode. Requieren una imagen de firmware que imprima la traza HIL. |
| `python3 tools/hil/verify_compilation.py` | Compila cada fixture y proyecto de referencia. Sin dispositivo. |

`<placa>` es el `ide_id` de la placa en
`firmware/app/boards/boards.json`, por ejemplo `rpi_pico`.

### El puerto serie

El puerto es, en este orden: `--port`, la variable de entorno
`ZPLC_SERIAL_PORT`, y por último el que se encuentra por los identificadores
USB de la placa en `tools/hil/usb-ids.json`. Cuando coincide más de un
dispositivo, o ninguno, la herramienta se detiene y lista lo que vio; nunca
adivina. Ningún script escribe la ruta de un puerto, y las herramientas corren
en Linux, macOS y Windows.
La integración continua ejecuta sus pruebas solo en Linux; todavía no hay registrada ninguna ejecución en macOS ni en Windows.

### Sin placa

`ZPLC_HIL_DEVICE=host` (con `ZPLC_NATIVE_SIM_BIN` indicando el binario
`zplc_runtime`) y `ZPLC_HIL_DEVICE=null` hacen las veces de una placa. Un
registro hecho sobre un sustituto dice `host-runtime` o `fake` como evidencia,
nunca `hardware`.

Cada registro indica además su nivel de evidencia: `hardware` para el banco de
una persona, `emulated` para el banco emulado (con el emulador, su versión y el
hash de su parche), `community-reported` para el reporte de un usuario, y
ninguno para un sustituto. Solo `hardware` eleva el nivel de soporte de una
placa; un registro emulado nunca lo hace.

## Estado de salida

| Estado | Significado |
|--------|-------------|
| 0 | Todas las comprobaciones se cumplieron. |
| 1 | Una comprobación falló, o el script no hizo ninguna. |
| 2 | No se pudo usar un dispositivo: no se eligió puerto, el puerto no abrió, o un programa no compiló. |
| 77 | Omitido: la imagen de firmware no tiene traza HIL. No es un éxito. |

Los scripts que solo miran una placa y no juzgan nada (`check_alive.py`,
`check_hw.py`, `debug_peek.py`, `inspect_zplc.py`, `rescue.py`,
`rescue_device.py`, `sniff.py`) figuran con su razón en
`tools/hil/non-gating.json`.

## La cadena

`run_chain.py` hace lo siguiente, en orden, y se detiene en el primer paso que
falla:

1. **Verificación previa.** La placa está en el manifiesto y los fixtures de la
   ejecución compilan con el compilador del repositorio, para la placa.
2. **Grabación.** Usted graba la imagen. La herramienta no lo hace.
3. **Protocolo de identidad.** La herramienta pregunta al dispositivo quién es
   (`zplc sys info --json`) y qué imagen es (`zplc sys build --json`: versión,
   commit, si el árbol estaba modificado, placa, ABI, draft y las opciones de
   compilación con su hash), y registra ambas cosas. El comando de compilación
   que la herramienta le dijo que ejecutara también queda en el registro.
4. **Descripción de E/S.** El dispositivo dice de qué descripción de E/S de la
   placa se compiló su imagen (`zplc sys io --json`: id de placa, hash, cantidad
   de canales y bytes de imagen). La herramienta la compara con `boards.json`
   para la placa y falla la ejecución cuando difieren. Una imagen que no
   informa ninguna queda registrada como omitida, no como aprobada.
5. **Opción de traza.** Las opciones de la imagen dicen si la traza HIL está
   activa. La ejecución falla cuando no es lo que pidió: el firmware de
   publicación no lleva traza, y `--hil-trace` pide la imagen que la lleva.
6. **Confirmar la placa.** Usted escribe la identidad que informó el
   dispositivo. Pulsar Enter solo no confirma.
7. **Las salidas son seguras de accionar.** Usted escribe la identidad otra vez,
   diciendo que nada conectado a las salidas puede lastimar a nadie.
8. **Cargar, ejecutar.** Se carga un programa y el contador de scans debe
   avanzar.
9. **Fixtures.** Se ejecuta el parpadeo en cada uno de los cinco lenguajes
   (cada fixture marcado para hardware con `--all-fixtures`), con sus entradas
   forzadas y liberadas.
10. **Fuerza y liberación.** Se fija una fuerza, se lista, se borra, y no queda
    ninguna.
11. **Detener.** El dispositivo no está en ejecución y la imagen de salidas es
    cero.

12. **Los pasos de medición de HIL-010.** Lazo digital, lectura analógica,
    exactitud del temporizador, diez minutos de jitter de scan, salidas
    apagadas tras un desborde y tras una falla fatal, salidas seguras tras STOP
    y tras la pérdida del enlace con fuerzas activas, tiempo de reinicio del
    watchdog, un ciclo de energía con RETAIN, veinte cortes de energía durante
    despliegues, una escritura atómica y un intercambio de bus de campo. Cada
    uno escribe sus mediciones y su veredicto en el registro; la
    [guía de banco](#guía-de-banco) los lista con su cableado y sus reglas.

La cadena escribe un registro, pase o falle, e indica antes de empezar cuánto
dura (unos 31 minutos en el banco de una persona). Un paso que el banco no
puede hacer queda registrado como `skipped` (o `not-emulable` en un emulador),
nunca como aprobado. Una ejecución de prueba o sobre un sustituto ejecuta los
pasos de medición solo cuando `--steps` los nombra.

### El registro de evidencia

Una ejecución en hardware real que termina en pass o fail, de una imagen de
firmware indicada con `--firmware-image` cuyo dispositivo informa un commit de
40 dígitos de un árbol sin cambios sin confirmar, escribe además
`<ejecución>.evidence.json` junto al registro de ejecución. Es el registro plano
del que `firmware/zephyr/scripts/zplc_boards.py` deriva el nivel de soporte de
una placa: esquema `zplc.hil-record/1`, `board_id`, versión de firmware, commit,
el SHA-256 de la imagen y el resultado, con la lista de lo que la ejecución no
cubrió. Cuando falta alguno de esos datos, el registro de ejecución dice por qué
no se escribió registro de evidencia (log `evidence-record`). Agregar el archivo
a `evidence_refs` de la placa en `boards.json` es una edición suya, después de
leer el registro de ejecución; una ejecución sobre un sustituto nunca escribe
uno.

### Un reporte de un usuario

El resultado de otra persona en su placa entra en la misma lista, en un nivel
inferior. El formulario «Board report» pide la placa, la versión de firmware, el
commit, el SHA-256 de la imagen y el resultado. Quien mantiene el proyecto, tras
leer el issue, ejecuta `python3 tools/hil/community_report.py` con esos valores y
la dirección del issue, lo que escribe un registro `zplc.community-report/1`, y
agrega el archivo a `evidence_refs` de la placa. La tabla de placas generada lo
lista como `community-reported`. Es una pista: nunca sube el nivel de soporte y
nunca enciende el watchdog de hardware del perfil.

Cuando una herramienta se inicia sin un terminal interactivo termina con estado
2 y dice por qué, antes de abrir un puerto.

## Fixtures

`tools/hil/il_tests`, `ld_tests`, `fbd_tests`, `sfc_tests`, `st_tests` y
`blinky_ld_gen.st` contienen los fixtures de lenguaje, y
`tools/hil/fixtures.json` contiene el valor esperado de cada fase de cada uno.
Una fase fija entradas, deja correr el programa un número de scans y comprueba
salidas. Los archivos compilados se hacen cuando una ejecución los necesita, en
un directorio temporal que se elimina, y no se guardan en el repositorio.

Los valores se leen mientras el programa corre. STOP pone las salidas en su
estado seguro, de modo que una salida lee cero después, cualquiera que sea lo
que el programa calculó.

Los scripts de nivel de opcode leen tramas de traza HIL, que solo imprime una
imagen de firmware compilada con `CONFIG_ZPLC_HIL_DEBUG=y`. El firmware de
publicación no lleva la traza en su bucle de VM y ningún perfil de placa la
activa; en una imagen de publicación esos scripts terminan con 77. Una imagen
HIL es el perfil más `tools/hil/hil_debug.conf`:

```bash
west build -b rpi_pico/rp2040 firmware/app --pristine -- -DEXTRA_CONF_FILE=$PWD/tools/hil/hil_debug.conf
```

`run_chain.py <placa> --hil-trace` imprime el comando para la placa y lo
registra. No publique una imagen compilada con la superposición: su hash de
opciones difiere del de la publicación, y el registro dice que la traza está
activa.

## Escenarios en una placa

Un archivo de escenario que corre en el host con `zplc-cli scenario-run` corre
en una placa a través del puerto de runtime de hardware del motor de
escenarios:

- el tiempo es el reloj del dispositivo: un tick se muestrea cuando el
  dispositivo lo alcanzó y completó un scan desde que se forzaron las entradas;
- las entradas se fuerzan, no se escriben, porque la placa reescribe su imagen
  de entradas en cada scan; el byte forzado reemplaza sus ocho bits durante la
  ejecución;
- una muestra tomada más tarde que la tolerancia declarada, `--tolerance-ms`
  (50 ms por omisión), anula la ejecución, y la tolerancia queda en el
  registro;
- cada fuerza que fijó la herramienta se borra al final y al abortar, y la
  placa queda detenida. Si se pierde el enlace, el propio dispositivo libera
  las fuerzas.

## Registros de ejecución

Cada ejecución de hardware escribe un registro JSON, descrito por
`tools/hil/run-record.schema.json`, en `build/hil-records/` o en el directorio
de `--out`. Contiene la placa y lo que informó el dispositivo, el commit, la
versión y el ABI del firmware según los informa la imagen, el hash de cada
programa y de la imagen que usted dice haber grabado, cada paso con su
resultado y el momento en que usted lo confirmó, las pruebas, las versiones de
las herramientas, la persona operadora y el registro crudo del shell.

Los campos que la imagen de firmware todavía no puede informar valen `null`: el
registro dice que no lo sabe, y no adivina. Un registro queda atado a la imagen
que probó. Se confirma en el repositorio después, nunca en el commit con el que
se compiló la imagen: las pruebas Python de HIL que ejecuta la CI comprueban
que el commit de la imagen de cada registro que referencia el manifiesto sea un
ancestro estricto del commit que agregó el registro.

## Guía de banco

Este es el banco que `run_chain.py` pide, paso a paso, en las dos placas de
aprendizaje. El banco emulado (`--bench emulated`)
aplica el mismo cableado de forma virtual; sus registros dicen `emulated`.

**Ningún paso de esta guía se ha ejecutado todavía en una placa física.** La
columna "Hardware" de abajo lo dice para cada paso, y cambia solo cuando una
persona ejecuta la cadena y confirma su registro en el repositorio.

### Piezas

El kit del curso (`packages/zplc-ide/lessons/kit.json`: la placa, un cable USB
de datos, una protoboard, LED con resistencias de 330 Ω, pulsadores, un
potenciómetro lineal de 10 kΩ, un capacitor de 100 nF y cables de puente) y,
para el banco:

- cuatro resistencias de 1 kΩ, una en serie en cada cable del lazo;
- solo para la Raspberry Pi Pico: un adaptador USB-serie con lógica de 3.3 V
  (por ejemplo CP2102, CH340 o FT232 configurado a 3.3 V) para el intercambio
  Modbus RTU;
- solo para la ESP32-S3: una red Wi-Fi a la que también esté conectada esta
  computadora;
- un multímetro es útil para el punto de 50 % del paso analógico, pero no es
  necesario.

### Límites de tensión

- Los pines de E/S de las dos placas del estudiante funcionan solo con lógica
  de 3.3 V.
- Nunca conecte 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más
  de 3.3 V ni nada que provenga de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 de la placa y una las tierras
  (GND).
- Mantenga cada salida por debajo de 10 mA: un LED con una resistencia de
  330 Ω consume unos 4 mA. En la Pico, mantenga el total de todos los pines por
  debajo de 50 mA.
- Cablee con el cable USB desconectado y revise el cableado dos veces antes de
  conectarlo.

### Cableado

Cada salida se cablea a la entrada del mismo número a través de una
resistencia de 1 kΩ. Durante la ejecución no se conecta nada más a esos pines.
El mapa de pines de la placa en la aplicación ZPLC (de `firmware/app/boards/boards.json`)
es la referencia cuando difiere de esta tabla.

| Cable | Raspberry Pi Pico | ESP32-S3-DevKitC-1 |
|-------|-------------------|--------------------|
| DO0 → 1 kΩ → DI0 | GP0 (pin 1) → GP15 (pin 20) | GPIO15 (J1-8) → GPIO5 (J1-5) |
| DO1 → 1 kΩ → DI1 | GP1 (pin 2) → GP14 (pin 19) | GPIO16 (J1-9) → GPIO6 (J1-6) |
| DO2 → 1 kΩ → DI2 | GP2 (pin 4) → GP13 (pin 17) | GPIO17 (J1-10) → GPIO7 (J1-7) |
| DO3 → 1 kΩ → DI3 | GP3 (pin 5) → GP12 (pin 16) | GPIO18 (J1-11) → GPIO8 (J1-12) |
| Extremos del potenciómetro | 3V3(OUT) (pin 36) y AGND (pin 33) | 3V3 (J1-1) y GND (J1-22) |
| Cursor del potenciómetro → AI0 | GP26/ADC0 (pin 31) | GPIO4/ADC1_CH3 (J1-4) |
| Modbus RTU | GP4 (pin 6, TX) → RX del adaptador, GP5 (pin 7, RX) ← TX del adaptador, GND (pin 8) → GND del adaptador | (ninguno) |
| Red | (ninguna) | Wi-Fi, credenciales guardadas con `wifi connect` |

Las entradas usan su pull-up interno y son activas en bajo en el firmware, de
modo que a través del lazo una entrada lee el inverso de su salida. La cadena
acepta cualquiera de las dos polaridades, siempre que cada entrada siga a su
propia salida y ninguna otra entrada cambie.

### Procedimiento

El procedimiento es la cadena, un comando por placa:

```bash
python3 tools/hil/run_chain.py rpi_pico --firmware-image <zephyr.uf2> --rtu-port <adaptador USB-serie>
python3 tools/hil/run_chain.py esp32s3_devkitc --firmware-image <zephyr.bin> [--host-ip <esta computadora en la Wi-Fi>]
```

Antes de empezar, la cadena indica cuánto dura en este banco: unos
31 minutos, de los cuales diez son el paso de jitter de scan y unos ocho los
veinte cortes de energía. El paso de jitter corre solo, porque cada uno de los
demás pasos detiene, despliega o corta la energía. Por omisión ejecuta el
parpadeo en los cinco lenguajes; `--all-fixtures` agrega cada fixture marcado
para hardware (HIL-005), unos siete minutos más.

La imagen bajo prueba es la imagen HIL: el comando de compilación de la placa con
`-DCONFIG_ZPLC_HIL_IMAGE=y`, que la cadena imprime, porque RT-020 pide que el
registro se haga con el watchdog activado. La imagen HIL activa el watchdog de
hardware con los tiempos y las políticas de la entrada de la placa en
`boards.json`, y dice lo que es: `zplc version` imprime una línea para ella y sus
opciones de compilación incluyen `HIL_IMAGE=y`, que el saludo registra.
`firmware/app/CMakeLists.txt` sigue rechazando una compilación que activa el
watchdog por sí sola. La imagen HIL nunca es una imagen de versión: la recolección
de la versión (`scripts/release/firmware-images.ts`) rechaza una compilación cuya
configuración u opciones la nombran. `--no-watchdog-build` imprime el comando
sin la opción, y el paso del watchdog falla y dice por qué.

La imagen HIL también activa la persistencia de RETAIN
(`CONFIG_ZPLC_RETAIN_PERSIST`), que los perfiles que se distribuyen mantienen
desactivada hasta que una placa tenga su registro de hardware, para que el paso
de RETAIN pueda medirla. Con una imagen sin ella el paso falla y dice que la
imagen no puede conservar RETAIN. La Pico y la RP2040-Zero tienen una partición
de almacenamiento de 128 KB, que guarda las dos ranuras de programa, los dos
registros de RETAIN y un sector de reserva (RT-029).

La grabación la hace usted. La Pico: mantenga presionado BOOTSEL mientras
conecta el cable USB y copie `zephyr.uf2` a la unidad RPI-RP2. La ESP32-S3:
`esptool --chip esp32s3 --port <puerto> write-flash 0x0 zephyr.bin` en el
puerto marcado USB, y presione RST si la placa queda en modo de descarga.

| # | Paso | Qué hace la cadena | Pasa cuando | Hardware | Emulado |
|---|------|--------------------|-------------|----------|---------|
| 1 | Verificación previa | Compila los fixtures para la placa | Cada fixture compila | Todavía no se ejecutó | Se completa con los registros emulados |
| 2 | Grabar | Usted graba la compilación HIL | La placa se reinicia | Todavía no se ejecutó | Se completa con los registros emulados |
| 3 | Intercambio de identidad | Lee `zplc sys info` y `zplc sys build` | El dispositivo responde con una placa | Todavía no se ejecutó | Se completa con los registros emulados |
| 4 | Descripción de E/S | Compara `zplc sys io` con `boards.json` | Coinciden | Todavía no se ejecutó | Se completa con los registros emulados |
| 5 | Opción de traza | Lee las opciones de la imagen | La traza HIL es la que pidió la ejecución | Todavía no se ejecutó | Se completa con los registros emulados |
| 6 | Confirmar la placa | Usted escribe la identidad que informa el dispositivo | Coincide | Todavía no se ejecutó | Un emulador no tiene persona |
| 7 | Las salidas se pueden accionar | Usted escribe la identidad otra vez | Coincide | Todavía no se ejecutó | Un emulador no tiene persona |
| 8 | Cargar, ejecutar | Carga un programa y lo inicia | El contador de scans avanza | Todavía no se ejecutó | Se completa con los registros emulados |
| 9 | Parpadeo en cinco lenguajes | Ejecuta los parpadeos en ST, IL, LD, FBD y SFC | Cada salida conmuta como espera su fixture | Todavía no se ejecutó | Se completa con los registros emulados |
| 10 | Fijar y liberar una fuerza | Fija, lista y borra una fuerza | No queda ninguna fuerza | Todavía no se ejecutó | Se completa con los registros emulados |
| 11 | Detener | Detiene la placa | No está en ejecución, imagen de salidas en cero | Todavía no se ejecutó | Se completa con los registros emulados |
| 12 | Lazo digital | Fuerza cada salida, sola, a encendida y apagada y lee las entradas | Cada entrada sigue a su propia salida y ninguna otra cambia | Todavía no se ejecutó | Se completa con los registros emulados |
| 13 | Lectura analógica | Le pide girar el potenciómetro a 0 %, 50 % y 100 % y lee AI0 | Dentro del 5 % de la escala completa en los extremos y del 10 % en el centro | Todavía no se ejecutó | Se completa con los registros emulados |
| 14 | Exactitud del temporizador | Ejecuta un TON de 3 s y mide su salida desde RUN con el reloj del banco | Entre 3000 ms menos un scan y 3000 ms más un scan, 100 ms y dos viajes de ida y vuelta de lectura | Todavía no se ejecutó | Se completa con los registros emulados |
| 15 | Jitter de scan, diez minutos | Ejecuta una tarea de 10 ms durante diez minutos y lee la medida propia del runtime de cada scan: el período más corto y el más largo de cada tarea (`zplc status --json`, `tasks[]`) | Ningún desborde, ningún plazo incumplido, cada período de scan dentro del 20 % del intervalo | Todavía no se ejecutó | Se completa con los registros emulados |
| 16 | Desborde | Ejecuta una tarea de 1 ms que acciona DO0 y repite un bucle durante la mitad del presupuesto de instrucciones de la VM de la imagen (un scan que pasa el presupuesto enclava en cambio la falla de watchdog de la VM) | Se enclava la falla `deadline_miss` en menos de 10 s y las salidas quedan apagadas | Todavía no se ejecutó | Se completa con los registros emulados |
| 17 | STOP y pérdida del enlace con fuerzas | Fuerza las salidas a encendidas y detiene; luego las fuerza desde la consola, en la sesión de su enlace, cierra el puerto y lo vuelve a abrir, con un programa que mantiene las salidas en bajo | Salidas apagadas tras STOP, y fuerzas liberadas al perder el enlace: por DTR en la Pico, por el tiempo de inactividad (30 s por omisión) en el ESP32-S3 | Todavía no se ejecutó | Se completa con los registros emulados |
| 18 | Tiempo de reinicio del watchdog | Ejecuta un scan que nunca termina | Causa de reinicio `watchdog`, el reinicio entre el 90 % del tiempo límite y el tiempo límite más 500 ms, de vuelta en STOP con salidas apagadas | Todavía no se ejecutó | Se completa con los registros emulados |
| 19 | Falla fatal | Divide por cero tras 20 scans de un programa que acciona DO0 | Se enclava la falla `vm_fault` en menos de 10 s y las salidas quedan apagadas | Todavía no se ejecutó | Se completa con los registros emulados |
| 20 | Ciclo de energía y RETAIN | Comprueba que la imagen se compiló con persistencia de RETAIN, cuenta en una variable RETAIN, detiene (lo que la guarda) y le pide desconectar y volver a conectar la placa | STOP tras el encendido, el valor RETAIN conservado, el programa presente | Todavía no se ejecutó | Se completa con los registros emulados |
| 21 | 20 cortes de energía durante el despliegue | Carga el programa A, envía una parte del programa B (desde una vigésima parte hasta todo) y le pide desconectar de inmediato | Tras cada corte la placa está en STOP y ejecuta A o B completo | Todavía no se ejecutó | Se completa con los registros emulados |
| 22 | Escritura atómica | Escribe 100 veces un valor de cuatro bytes por el enlace del dispositivo mientras el programa cuenta valores partidos | Ningún scan vio un valor escrito a medias | Todavía no se ejecutó | Se completa con los registros emulados |
| 23 | Intercambio de bus de campo | Pico: activa el cliente Modbus RTU del dispositivo a 19200 baudios, lo guarda y reinicia la placa (el cliente solo arranca al iniciar), y luego lee el registro de retención 100 de un servidor Modbus RTU en esta computadora, en una línea abierta a 19200 baudios. ESP32-S3: escribe y vuelve a leer un registro en el servidor Modbus TCP y recibe de vuelta una publicación MQTT a través del broker de `zplc_loopback`, alcanzado en la dirección de red local de esta computadora | El valor leído es 0x5A17, sin error | Todavía no se ejecutó | Se completa con los registros emulados |

Una persona no puede cortar la energía en el instante exacto en que el
programa se escribe en la flash, de modo que en una placa el paso 21 prueba los
cortes en los puntos que una mano alcanza; el banco emulado corta en puntos
programados.

## Simulación y hardware (HIL-015)

`python3 tools/hil/compare_sim.py <placa>` compila cada proyecto de referencia
de la aplicación ZPLC (los parpadeos LD, FBD y SFC y el control de motor LD) para la
placa, lo ejecuta en el runtime nativo y en el banco con las mismas entradas en
los mismos instantes, y compara las trazas de salida. Cada diferencia, otra
secuencia de valores de salida o un cambio a más de `--tolerance-ms` (100 ms)
de su par, va a un registro de comparación en `build/hil-records/`. Una
diferencia encontrada en hardware corresponde al perfil de capacidades del
simulador ([contrato de sesión nativa](../runtime/intro.md)).

| Placa | Diferencias en hardware | Diferencias emuladas |
|-------|-------------------------|----------------------|
| Raspberry Pi Pico | Todavía no se ejecutó | Se completa con los registros emulados |
| ESP32-S3-DevKitC-1 | Todavía no se ejecutó | Se completa con los registros emulados |
