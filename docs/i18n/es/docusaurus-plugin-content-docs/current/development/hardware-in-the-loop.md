---
slug: /development/hardware-in-the-loop
title: Hardware en el lazo
sidebar_label: Hardware en el lazo
description: Cómo una persona ejecuta en el banco las pruebas de hardware de ZPLC, qué comprueba y qué escribe cada herramienta, qué pruebas corren también en el host sin placa y qué falta para que una placa tenga evidencia de hardware.
---

# Hardware en el lazo

Esta página es para la persona que está en el banco. Una placa es algo físico,
de modo que una persona inicia todo comando que la toque: las herramientas de
IA y MCP no flashean, no despliegan, no fuerzan, no arrancan ni detienen una
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
| Placa | Los mismos fixtures y escenarios sobre una placa flasheada, y los pasos físicos. | Una persona, en el banco |

El nivel de host no demuestra que un pin maneje una carga, que un temporizador
mantenga su período en silicio real ni que un watchdog reinicie a tiempo. Eso
requiere el nivel de placa.

## Las herramientas

| Herramienta | Uso |
|-------------|-----|
| `python3 tools/hil/run_chain.py <placa>` | Un comando por placa. Pide cada paso físico y escribe un registro de ejecución. |
| `bun packages/zplc-hil/src/cli.ts run --board <id> --workspace <dir> --scenario <archivo>` | Ejecuta en una placa un archivo de escenario de un proyecto. El escenario es el archivo que Studio ejecuta en el host. |
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

### Sin placa

`ZPLC_HIL_DEVICE=host` (con `ZPLC_NATIVE_SIM_BIN` indicando el binario
`zplc_runtime`) y `ZPLC_HIL_DEVICE=null` hacen las veces de una placa. Un
registro hecho sobre un sustituto dice `host-runtime` o `fake` como evidencia,
nunca `hardware`.

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

1. **Verificación previa.** La placa está en el manifiesto y cada fixture de
   hardware compila con el compilador del repositorio.
2. **Flasheo.** Usted flashea la imagen. La herramienta no lo hace.
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
8. **Desplegar, ejecutar.** Se carga un programa y el contador de scans debe
   avanzar.
9. **Fixtures.** Se ejecutan los fixtures marcados para hardware, uno tras otro,
   con sus entradas forzadas y liberadas.
10. **Fuerza y liberación.** Se fija una fuerza, se lista, se borra, y no queda
    ninguna.
11. **Detener.** El dispositivo no está en ejecución y la imagen de salidas es
    cero.

La cadena escribe un registro, pase o falle. Los pasos de las pruebas de
hardware que la cadena todavía no ejecuta figuran en el registro como
`pending`, cada uno con lo que le falta:

- lazo digital y lectura analógica, que nombran los canales de la descripción
  de E/S de la placa en `boards.json` y requieren un paso de cableado y una
  tensión conocida, que no están en el manifiesto (el registro dice
  `TO BE FILLED`);
- exactitud de temporizador y jitter de scan durante diez minutos, que
  requieren un reloj de referencia y tiempos de scan medidos en el dispositivo;
- los comportamientos de falla y de watchdog, que requieren fixtures de
  inyección de fallas y los comportamientos de runtime que miden;
- STOP y RETAIN tras un ciclo de energía, y ningún programa parcial tras veinte
  cortes de energía durante el despliegue, que requieren que una persona corte
  la alimentación;
- la escritura atómica de varios bytes, que requiere el protocolo con tramas en
  el dispositivo;
- un intercambio de bus de campo por placa, que los scripts Modbus hacen contra
  un extremo local que usted provee.

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
programa y de la imagen que usted dice haber flasheado, cada paso con su
resultado y el momento en que usted lo confirmó, las pruebas, las versiones de
las herramientas, la persona operadora y el registro crudo del shell.

Los campos que la imagen de firmware todavía no puede informar valen `null`: el
registro dice que no lo sabe, y no adivina. Un registro queda atado a la imagen
que probó. Se confirma en el repositorio después, nunca en el commit con el que
se compiló la imagen.

## Guía de banco

El cableado, las piezas y el procedimiento que se ejecutó para las dos placas
de aprendizaje los escribe la persona que hace la ejecución en el banco. Hasta
entonces cada detalle de abajo es un marcador, y nada de ello se ha hecho.

### Raspberry Pi Pico (`rpi_pico`)

| Elemento | Valor |
|----------|-------|
| Imagen de firmware y cómo se flasheó | POR COMPLETAR por la persona que hizo la ejecución en el banco |
| Cable USB y puerto que ve el host | POR COMPLETAR |
| Lazo digital: qué salida va a qué entrada | POR COMPLETAR |
| Entrada analógica: la fuente y su tensión conocida | POR COMPLETAR |
| Adaptador Modbus RTU y cableado | POR COMPLETAR |
| Fecha, persona operadora y archivo de registro | POR COMPLETAR |

### ESP32-S3 DevKitC (`esp32s3_devkitc`)

| Elemento | Valor |
|----------|-------|
| Imagen de firmware y cómo se flasheó | POR COMPLETAR por la persona que hizo la ejecución en el banco |
| Cable USB, puente UART y puerto que ve el host (sus identificadores USB van en `tools/hil/usb-ids.json`) | POR COMPLETAR |
| Lazo digital: qué salida va a qué entrada | POR COMPLETAR |
| Entrada analógica: la fuente y su tensión conocida | POR COMPLETAR |
| Red Wi-Fi y extremos locales Modbus TCP y MQTT | POR COMPLETAR |
| Fecha, persona operadora y archivo de registro | POR COMPLETAR |
