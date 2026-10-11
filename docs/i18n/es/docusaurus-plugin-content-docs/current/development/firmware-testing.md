---
slug: /development/firmware-testing
title: Pruebas del firmware en Linux
sidebar_label: Pruebas del firmware
description: Ejecute las suites del firmware de ZPLC en una máquina Linux, en native_sim de 64 y 32 bits y en QEMU Cortex-M3 y Cortex-M0, y compruebe los presupuestos de flash y RAM.
---

# Pruebas del firmware en Linux

Esta página describe el método único que una persona colaboradora usa para
probar el firmware en una máquina Linux: los scripts de `tools/firmware-test/`.
Ejecutan las mismas suites que los trabajos Zephyr de integración continua, en
más destinos, contra un espacio de trabajo de Zephyr que vive fuera del
repositorio.

Todo lo que se describe aquí es evidencia de host, de simulador o de
compilación. Una ejecución correcta no demuestra que una placa arranque, que
sus pines se comporten ni que un ciclo de scan mantenga su período en silicio
real. Esas afirmaciones requieren los procedimientos de hardware en el lazo
descritos en [Capacidades y niveles de evidencia](../reference/capabilities-evidence.md).

## Qué necesita

- Linux sobre x86-64 con unos 15 GB libres: el árbol de Zephyr fijado ocupa
  unos 6 GB y las salidas de compilación suman algunos más.
- `git`, `cmake` 3.20 o superior, `ninja`, `dtc`, `gperf`, `python3` 3.10 o
  superior y un compilador de C. Los modos de 32 bits requieren además el
  runtime C de 32 bits (`lib32-glibc` y `lib32-gcc-libs` en Arch,
  `gcc-multilib` en Debian y Ubuntu).
- El SDK de Zephyr 1.0.1 con la toolchain `arm-zephyr-eabi` y las
  herramientas de host del SDK, que incluyen `qemu-system-arm`. La fila de
  tamaño del ESP32-S3 requiere además la toolchain
  `xtensa-espressif_esp32s3_zephyr-elf`.
- Acceso a la red la primera vez, para `west update`.

Los scripts leen el SDK desde `~/zephyr-sdk-1.0.1`. Defina
`ZEPHYR_SDK_INSTALL_DIR` para usar otra ubicación. Si falta el SDK, el script
de preparación imprime la línea `west sdk install` que debe ejecutar y no la
ejecuta.

## Preparación única

```bash
tools/firmware-test/setup.sh
```

El script se puede repetir sin riesgo. Crea o verifica, en `~/zplc-zephyr-ws`
(se cambia con `ZPLC_FW_WS`):

- un entorno virtual de Python con `west` 1.5.0 y los paquetes de Python que
  Zephyr necesita;
- un enlace simbólico `zplc` a su checkout, de modo que west trate el checkout
  como su repositorio de manifiesto y las pruebas siempre ejecuten su árbol de
  trabajo;
- el árbol de Zephyr y sus módulos en la revisión fijada en `west.yml`,
  descargados con historial superficial, y una comprobación de que la revisión
  obtenida es esa fijación.

Hay dos decisiones deliberadas. El espacio de trabajo se escribe a mano en
lugar de usar `west init -l`, porque `west init -l` resuelve el enlace
simbólico y crearía `.west` junto a su checkout real. Y se omite
`west zephyr-export`, porque registra el espacio de trabajo en
`~/.cmake/packages`, donde cualquier otro proyecto CMake de su usuario lo
encontraría; `ZEPHYR_BASE` basta para estas compilaciones. Defina
`ZPLC_FW_ZEPHYR_EXPORT=1` si quiere la exportación.

Varios checkouts o worktrees pueden compartir un espacio de trabajo.
`run.sh` apunta el enlace `zplc` al checkout desde el que se ejecuta, así que
ejecute un checkout a la vez. Use otro `ZPLC_FW_WS` para ejecuciones
simultáneas.

## Comandos diarios

```bash
tools/firmware-test/run.sh native
tools/firmware-test/run.sh host host32 native32 qemu-m3 qemu-m0 app
tools/firmware-test/run.sh size rpi-pico-rp2040
tools/firmware-test/run.sh tidy
tools/firmware-test/run.sh all
```

Cada modo compila lo que necesita, lo ejecuta sin pedir confirmación y termina
con estado distinto de cero ante cualquier fallo. Las últimas líneas son una
línea de resumen por escenario o por placa. Toda la salida queda bajo
`$ZPLC_FW_WS/out`, con un registro por modo.

| Modo | Qué se ejecuta | Qué muestra un resultado correcto | Qué no muestra |
|------|----------------|-----------------------------------|----------------|
| `host` | Las suites CMake de `firmware/lib/zplc_core` bajo ctest, compiladas con los sanitizadores de direcciones y de comportamiento indefinido | La VM, el cargador, el despacho y el runtime de host se comportan en un host de 64 bits sin comportamiento indefinido | Nada sobre un destino de 32 bits ni Cortex-M |
| `host32` | Las mismas suites compiladas con `-m32` | Lo mismo, con `int`, `long` y punteros de 32 bits | El comportamiento de Cortex-M: x86 tolera el acceso no alineado y no tiene enums cortos |
| `native` | Las suites Zephyr de `firmware/tests` en `native_sim/native/64`, como hace CI | La lógica de la aplicación de firmware, el HAL de Zephyr y el planificador contra el kernel de Zephyr en el host | Tiempos, interrupciones y controladores de una placa real |
| `native32` | Lo mismo en `native_sim/native`, la variante de 32 bits | Lo mismo, con un modelo de datos de 32 bits | Lo mismo |
| `qemu-m3` | Las suites Zephyr en `qemu_cortex_m3`, más las suites del núcleo | Comportamiento sobre un conjunto de instrucciones Cortex-M real con 64 KB de RAM, enums cortos y una pila de hilo de 1 KB por defecto | Tiempos: QEMU no es exacto por ciclo. Las regiones de memoria de la VM se reducen para caber |
| `qemu-m0` | El subconjunto Cortex-M0 en `qemu_cortex_m0` (16 KB de RAM) | División, desplazamientos, conversión de float y acceso no alineado en un núcleo ARMv6-M sin división por hardware ni acceso no alineado | La suite completa de la VM: no cabe, vea los límites más abajo |
| `app` | La prueba de host del codificador Sparkplug en `firmware/app/tests`, contra los archivos nanopb generados por una compilación del Arduino Opta | El codificador produce las cargas esperadas en un host de 64 bits | El cliente MQTT, TLS ni ningún comportamiento de red |
| `size` | `firmware/app` compilado para cada placa soportada | Flash y RAM de la imagen frente al presupuesto registrado | Uso de pila y de heap en ejecución, ni que la imagen corra |
| `tidy` | `clang-tidy` con el `.clang-tidy` del repositorio, cada hallazgo es un error, sobre el núcleo, el HAL POSIX y la aplicación de host; también el HAL de Zephyr y `firmware/app` cuando existe la compilación del Arduino Opta de `size` o `app` | Los archivos analizados no tienen ninguno de los defectos que buscan los chequeos habilitados | Que el código sea correcto, ni nada sobre compilaciones Xtensa, que clang no puede apuntar. `tidy` no forma parte de `all` porque necesita `clang-tidy` |

## Cómo leer el resultado

Una ejecución termina con un bloque como este, producido por
`run.sh native32`:

```text
PASS native32  zplc.core.vm_core                              1/1 cases
PASS native32  zplc.scheduler_admission                       46/46 cases
PASS native32  zplc.scheduler_run_control                     9/9 cases
PASS native32  19/19 scenarios passed, 0 filtered out
```

Para mirar un escenario, abra su registro bajo el directorio de salida de
Twister del modo, o ejecútelo solo desde el espacio de trabajo:

```bash
cd ~/zplc-zephyr-ws && west twister -T zplc/firmware/tests -p qemu_cortex_m3 -s zplc.program_store --inline-logs
```

Un escenario que Twister marca como `skipped`, por ejemplo por un desborde de
RAM, se informa aquí como fallo. Un escenario filtrado, que no lista la
plataforma, no se cuenta.

## Qué cubren las suites

Las suites Zephyr viven en `firmware/tests`. Cada una tiene un
`testcase.yaml` que lista las plataformas en las que se permite. Las suites C
planas de `firmware/lib/zplc_core/tests` también se ejecutan en destinos
Zephyr mediante `firmware/tests/core_suites`, que compila los mismos archivos
fuente y llama a cada suite desde un caso de prueba.

Las suites de la VM nombran un perfil de memoria en el escenario, de modo que
un resultado siempre dice con qué tamaños se obtuvo:

- sin sufijo: los tamaños por defecto del ISA (8 KB de trabajo, 4 KB
  retentivos, 44 KB de código), usados en `native_sim`;
- `.small`: 4 KB de trabajo, 2 KB retentivos y 16 KB de código, usado en
  `qemu_cortex_m3`;
- `.tiny`: 256 B de trabajo, 64 B retentivos, 512 B de código, cuatro tags y
  una pila de 32 entradas, usado en `qemu_cortex_m0`.

Las imágenes de proceso son de 4 KB cada una en todos los perfiles porque el
ISA las fija.

El endurecimiento del runtime del firmware (RT-010 a RT-034) tiene sus propias suites:

- `runtime_boot` ejecuta un plan de arranque en orden, rechaza un plan que arranca un servicio antes que el runtime
  y sigue adelante cuando un servicio falla;
- `program_store_nvs` ejecuta el program store sobre NVS en el simulador de flash con un artefacto tan grande como
  la región de código, y corta la energía en cada operación de un deploy;
- `modbus_force` escribe por el servidor Modbus sobre el core real y muestra que una variable forzada conserva su
  valor forzado;
- `scheduler_admission` retiene un scan en el commit y en la escritura de salidas, para mostrar que una escritura de
  fuera espera al latch de entradas y nunca al scan, y que el lock de la imagen está libre mientras se escriben los
  pines;
- `scheduler_equivalence` conduce el scheduler Zephyr por los escenarios del núcleo común del scheduler y compara sus
  decisiones con la traza de referencia a la que se somete la sesión de host (RT-008, RT-018);
- `single_task` ejecuta la configuración de una tarea del núcleo: el latch de entradas de los pines, el plazo, el
  fault y el estado seguro (RT-018);
- `failsafe` ejercita el manejador de error fatal con un reinicio interceptado y muestra las salidas llevadas al
  estado seguro, el registro del fault y la causa que informa el arranque siguiente; `failsafe_reboot` provoca un
  fault real y un reinicio real en `qemu_cortex_m3` y lee el registro después (RT-019, RT-021, RT-022);
- `scheduler_watchdog` ejecuta la política de watchdog de hardware de un perfil sobre un modelo del watchdog: la
  alimentación desde la finalización de un scan, el timeout tomado del conjunto de tareas, un scan detenido que lo
  deja expirar, y la política en STOP, en pausa y en un fault (RT-020).

Las suites de host del core suman `test_exchange` (un scanner, lectores y escritores en hilos), `test_program_store`
(un corte de energía y una escritura truncada en cada operación), `test_sched_core` y `test_sched_equivalence` (las
decisiones del núcleo del scheduler y la traza de referencia), `test_single_task`, `test_vm_scan` (el tiempo de un
scan se lee una vez y un opcode de texto se cobra por sus bytes), `test_failsafe` (la causa de reset, el registro de
un fault y la política de watchdog), `test_safe_state` (el valor seguro que declara un proyecto decide el nivel de un
pin, sobre una placa propia), `test_core_start`, `test_core_lock`,
`test_bytes_crc` y las pruebas `config_rule_*`, cada una de las cuales compila una regla de configuración con un
valor que la rompe y espera que la compilación falle nombrando la regla. Los puntos de entrada solo para pruebas se
declaran en `firmware/lib/zplc_core/tests/include/zplc_test_hooks.h`, nunca en un header público;
`test_public_headers` falla si un header público declara uno.

### La descripción de E/S de la placa

`zplc.io_table.base` y `zplc.io_table.extended` compilan el firmware desde dos descripciones sintéticas de placa
(`firmware/tests/io_table/io_base.json` e `io_extended.json`) sobre el emulador de GPIO de `native_sim` y ejecutan el
mismo código de prueba en ambas. La prueba lee la tabla generada, maneja cada pin de entrada emulado, ejecuta un
scan y comprueba que una entrada descrita llega a la imagen de entrada en su dirección, que una salida descrita
llega a su pin, y que un pin que el devicetree tiene pero la descripción no lista nunca se configura ni se maneja. La
descripción extendida lista tres salidas y una entrada más que la base, una de ellas en un segundo y otra en un
tercer byte de imagen, y ningún fuente del firmware las nombra.

`zplc.io_analog.ok` ejecuta dos entradas analógicas sobre el emulador de ADC y comprueba que cada valor crudo llega
a su palabra de la imagen de entrada y sigue a la tensión; `zplc.io_analog.missing` nombra un canal de conversor que
el emulador no tiene y comprueba que la HAL falla al inicializar, antes de que exista ninguna tarea.
`zplc.hal_persist_keys` guarda, lee y borra cada clave que el runtime almacena (el almacén de programas, los chunks de
RETAIN de ambos slots y las credenciales) sobre el NVS del simulador de flash, y comprueba que una clave sin
identificador responde con un error.

El build también comprueba que la descripción y el devicetree coinciden. Para verlo fallar, cambiá un `dt.pin` o un
`alias` en `io_base.json` y compilá la prueba:

```bash
west build -p -b native_sim/native/64 zplc/firmware/tests/io_table
```

El build se detiene con un mensaje como `I/O description: channel DO0 (P0) disagrees with the devicetree: alias led0
is not on pin 7`. `python3 tools/hil/test_io_table_generator.py` fija el texto que emite el generador, y
`python3 tools/ci/check_hal_contract.py` comprueba que cada función de la HAL está implementada en cada port.

## Análisis estático

`clang-tidy` lee `.clang-tidy` en la raíz del repositorio. Todo chequeo que habilita es un error, así que la
lista de ese archivo es el conjunto que el código cumple. Cada chequeo desactivado figura con su motivo, y una
línea que debe quedar como está lleva un comentario `NOLINT` con su motivo. `run.sh tidy` ejecuta
`tools/ci/run_clang_tidy.py`, que hace dos pasadas:

- La pasada de host siempre se ejecuta. CMake escribe una base de datos de compilación de
  `firmware/lib/zplc_core` en un directorio temporal (no se compila nada) y clang-tidy analiza el núcleo en
  `src/core`, el HAL POSIX en `src/hal/posix`, la aplicación de host en `firmware/apps/posix_host/src` y las
  cabeceras que incluyen. No debe informar nada.
- La pasada de Zephyr analiza lo que solo compila una build de Zephyr: el HAL y el planificador de Zephyr y
  `firmware/app`. Necesita la base de datos de compilación de un `west build`, así que se ejecuta cuando existe
  `$ZPLC_FW_WS/out/size/arduino-opta-wifi-m7` (`run.sh size arduino-opta-wifi-m7` la crea) o cuando se pasa
  `--zephyr-build <directorio>` al script. En otro caso se omite y la ejecución lo dice. El núcleo y el HAL de
  Zephyr no deben informar nada. Los hallazgos que `firmware/app` ya tenía cuando se agregó el chequeo se
  cuentan por placa, archivo y chequeo en `tools/ci/clang-tidy-app-baseline.json`: un hallazgo nuevo hace
  fallar la pasada, y uno corregido pide bajar el conteo con `--update-baseline`.

`-Werror` se aplica a todo destino que el repositorio compila: los destinos de host del núcleo mediante un
único `add_compile_options` en `firmware/lib/zplc_core/CMakeLists.txt` (con `-Wall -Wextra -pedantic`), la
biblioteca Zephyr `zplc` mediante `firmware/CMakeLists.txt` y `app`. Las suites de prueba de Zephyr también
compilan las fuentes del núcleo con él.

## Integración continua

El trabajo `host-core-sanitized` ejecuta la pasada de host después de su compilación con sanitizadores, con
`clang-tidy` instalado desde la distribución. Cada trabajo `zephyr-cross-build` ejecuta la pasada de Zephyr
sobre la compilación que acaba de hacer, contra la línea base de su placa (la placa Xtensa no tiene destino
clang y se omite). El trabajo `zephyr-twister` ejecuta `native` con su propio paso de Twister y
luego `native32`, `qemu-m3` y `qemu-m0` con `run.sh`, en el mismo espacio de
trabajo. Cada trabajo `zephyr-cross-build` comprueba la flash y la RAM de su
placa frente a `size-budget.json` y escribe la tabla en el resumen del
trabajo. La herramienta de informes tiene sus propias pruebas unitarias,
`tools/firmware-test/test_fwtest.py`, que demuestran que la compuerta falla
cuando un tamaño excede su presupuesto en un solo byte.

## Presupuestos de tamaño

`tools/firmware-test/size-budget.json` registra, para cada placa de
`firmware/app/boards/boards.json`, la flash y la RAM medidas
en la tabla de memoria del enlazador y el presupuesto que la compilación debe
respetar. La política de margen está en el archivo: el presupuesto es la
medición más 5 por ciento, redondeada hacia arriba a 256 bytes.

Cuando un cambio hace que una imagen crezca más allá de su presupuesto, la
compilación falla. Suba el presupuesto en el mismo commit e indique el motivo:

```bash
python3 tools/firmware-test/fwtest.py size \
  --budget tools/firmware-test/size-budget.json \
  --logs ~/zplc-zephyr-ws/out/size --rebaseline
```

Las cifras son asignación estática en tiempo de enlace. No incluyen las pilas
ni la marca máxima del heap.

## Agregar una prueba

- Ponga una suite Zephyr en `firmware/tests/<nombre>` con un `testcase.yaml`
  y liste en `platform_allow` cada plataforma en la que pasa. No liste una
  plataforma donde el escenario pasaría por un motivo que no nombra.
- Zephyr elige los archivos de placa por calificador exacto. Un archivo para
  la variante de 64 bits es `boards/native_sim_native_64.overlay` y la
  variante de 32 bits necesita `boards/native_sim_native.overlay`. Los ajustes
  por placa van en `boards/<placa>.conf`, por ejemplo
  `boards/qemu_cortex_m3.conf`.
- Imprima solo ASCII. Twister decodifica la salida de QEMU byte a byte como
  UTF-8 y falla la ejecución ante un carácter multibyte.
- Tenga presente la pila de cada hilo. `native_sim` ejecuta los hilos en la
  pila del host, así que una pila demasiado pequeña solo aparece en un
  destino. La pila por defecto del hilo de pruebas en `qemu_cortex_m3` es de
  1 KB.

## Límites conocidos

- `vm_core` y `loader_verify` no se ejecutan en `qemu_cortex_m0`. La VM
  mantiene 8 KB de imágenes de proceso fijas y unos 5 KB de estado estático
  con la profundidad de pila por defecto, así que la suite completa excede
  16 KB con los tamaños que necesita, y la suite del cargador construye
  programas más grandes que la región de código `.tiny`.
- `hal_gpio_policy.partial_required` y `post_shutdown` necesitan el emulador
  de GPIO y el alias de LED de `native_sim`.
- `scheduler_run_control` observa el nivel físico del canal de salida 0 con el
  mismo emulador y alias de LED. En `qemu_cortex_m3`, que no tiene ninguno de
  los dos, sólo comprueba la imagen de salidas, la tabla de forzados y los scans
  de las tareas, así que "salidas seguras durante la pausa" se observa sólo en
  `native_sim`.
- El modo `app` todavía no forma parte de la integración continua: ningún
  trabajo compila una placa y luego ejecuta la prueba de host.
- La línea base de `firmware/app` de la pasada de Zephyr es la lista de
  hallazgos que faltan por corregir allí; `tools/ci/clang-tidy-app-baseline.json`
  guarda un conteo por placa, archivo y chequeo. La pasada se probó contra
  compilaciones locales de placa con una versión de `clang-tidy`; la primera
  ejecución en integración continua mostrará si las líneas base también valen
  con la del runner.
- Dos casos de integración de `test_vm_core.c` se omiten en todos los
  destinos, el host incluido, porque los binarios de ejemplo que cargan son
  anteriores al campo CRC. Las líneas `SKIP:` están en el registro de la
  suite y el resumen igualmente informa un resultado correcto.

## Páginas relacionadas

- [Configuración del Workspace Zephyr](../reference/zephyr-workspace-setup.md)
- [Placas Soportadas](../reference/boards.md)
- [Capacidades y niveles de evidencia](../reference/capabilities-evidence.md)
