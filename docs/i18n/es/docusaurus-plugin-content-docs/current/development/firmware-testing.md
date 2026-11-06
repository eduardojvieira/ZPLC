---
slug: /development/firmware-testing
title: Pruebas del firmware en Linux
sidebar_label: Pruebas del firmware
description: Ejecute las suites del firmware de ZPLC en una máquina Linux, en native_sim de 64 y 32 bits y en QEMU Cortex-M3 y Cortex-M0, y compruebe los presupuestos de flash y RAM.
---


# Pruebas del firmware en Linux

Use esta página para ejecutar las pruebas del firmware de ZPLC en su propia máquina Linux. Un solo script, `tools/firmware-test/run.sh`, compila y ejecuta las mismas suites que los trabajos Zephyr de integración continua, en más objetivos, contra un espacio de trabajo de Zephyr que vive fuera del repositorio.

:::warning Qué significa un resultado correcto
Todo lo de esta página es evidencia de host, de simulador o de compilación. Una ejecución correcta no demuestra que una placa arranque, que sus pines se comporten ni que un ciclo mantenga su período en silicio real. Esas afirmaciones requieren los procedimientos de banco de [Hardware en el lazo](./hardware-in-the-loop.md) y los niveles de [Compatibilidad de hardware](../reference/capabilities-evidence.md).
:::

## Qué necesita

| Necesidad           | Detalle                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Máquina             | Linux en x86-64 con unos 15 GB libres: el espacio de trabajo fijado de Zephyr ocupa unos 6,6 GB (medido con `du`, sin salidas de compilación) y el SDK de Zephyr unos 7 GB instalado completo. |
| Herramientas        | `git`, `cmake` 3.20 o posterior, `ninja`, `dtc`, `gperf`, `python3` 3.10 o posterior y un compilador de C.                                                                           |
| Modos de 32 bits    | El runtime de C de 32 bits: `lib32-glibc` y `lib32-gcc-libs` en Arch, `gcc-multilib` en Debian y Ubuntu.                                                                              |
| SDK de Zephyr 1.0.1 | La cadena de herramientas `arm-zephyr-eabi` y las herramientas de host del SDK, que incluyen `qemu-system-arm`. La fila de tamaño de la ESP32-S3 requiere además `xtensa-espressif_esp32s3_zephyr-elf`. |
| Red                 | Solo la primera vez, para `west update`.                                                                                                                                             |

Los scripts leen el SDK de `~/zephyr-sdk-1.0.1`; defina `ZEPHYR_SDK_INSTALL_DIR` para usar otro lugar. Si falta el SDK, el script de preparación imprime la línea `west sdk install` que debe ejecutar y no la ejecuta.

## Preparación única

```bash
tools/firmware-test/setup.sh
```

El script se puede repetir sin riesgo. Crea o verifica, en `~/zplc-zephyr-ws` (se cambia con `ZPLC_FW_WS`):

- un entorno virtual de Python con `west` 1.5.0 y los paquetes que Zephyr necesita;
- un enlace simbólico `zplc` a su copia de trabajo, de modo que west trate la copia como su repositorio de manifiesto y las pruebas ejecuten siempre su árbol de trabajo;
- el árbol de Zephyr y sus módulos en la revisión fijada en `west.yml`, descargados de forma superficial (`ZPLC_FW_FULL_CLONE=1` descarga el historial), y una comprobación de que la revisión obtenida es esa fijación.

Hay dos decisiones deliberadas. El espacio de trabajo se escribe a mano en lugar de usar `west init -l`, porque `west init -l` resuelve el enlace simbólico y pondría `.west` junto a su copia real. Y se omite `west zephyr-export`, porque registra el espacio de trabajo en `~/.cmake/packages`, donde lo encontraría cualquier otro proyecto CMake de su usuario; `ZEPHYR_BASE` basta para estas compilaciones. Defina `ZPLC_FW_ZEPHYR_EXPORT=1` si quiere la exportación.

Varias copias de trabajo o worktrees pueden compartir un espacio de trabajo, porque `run.sh` apunta el enlace `zplc` a la copia desde la que se ejecuta. Ejecute una copia a la vez, o dé a cada ejecución concurrente su propio `ZPLC_FW_WS`.

## Ejecutar las pruebas

```bash
tools/firmware-test/run.sh native
tools/firmware-test/run.sh host host32 native32 qemu-m3 qemu-m0 app
tools/firmware-test/run.sh size rpi-pico-rp2040
tools/firmware-test/run.sh tidy
tools/firmware-test/run.sh all
```

`run.sh --help` enumera los modos. Cada modo compila lo que necesita, se ejecuta sin preguntar y termina con código distinto de cero ante cualquier falla. Las últimas líneas son una línea de resumen por escenario o placa. Toda la salida va a `$ZPLC_FW_WS/out`, con un registro por modo. `all` ejecuta todos los modos salvo `tidy` y `app-native`.

| Modo         | Qué se ejecuta                                                                                                                                                                                              | Qué demuestra un resultado correcto                                                                                                              | Qué no demuestra                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `host`       | Las suites CMake de `firmware/lib/zplc_core` con ctest, con los saneadores de direcciones y de comportamiento indefinido                                                                                     | La VM, el cargador, el despacho y el runtime de host se comportan en un host de 64 bits sin comportamiento indefinido                            | Nada sobre un objetivo de 32 bits o Cortex-M                                                             |
| `host32`     | Las mismas suites compiladas con `-m32`                                                                                                                                                                     | Lo mismo, con `int`, `long` y punteros de 32 bits                                                                                                | El comportamiento de Cortex-M: x86 tolera el acceso desalineado y no tiene enums cortos                  |
| `native`     | Las suites Zephyr de `firmware/tests` en `native_sim/native/64`                                                                                                                                             | La lógica de la aplicación, el HAL de Zephyr y el planificador contra el kernel de Zephyr en el host                                             | Tiempos, interrupciones y controladores de una placa real                                                |
| `native32`   | Lo mismo en `native_sim/native`, la variante de 32 bits                                                                                                                                                     | Lo mismo, con un modelo de datos de 32 bits                                                                                                      | Lo mismo                                                                                                 |
| `qemu-m3`    | Las suites Zephyr en `qemu_cortex_m3`, más las suites del núcleo                                                                                                                                            | El comportamiento en un conjunto de instrucciones Cortex-M real con un presupuesto de 64 KB de RAM, enums cortos y una pila de hilo de 1 KB     | El tiempo: QEMU no es exacto por ciclo, y las regiones de memoria de la VM se reducen para que quepan    |
| `qemu-m0`    | El subconjunto Cortex-M0 en `qemu_cortex_m0` (16 KB de RAM)                                                                                                                                                 | División, desplazamientos, conversión de punto flotante y acceso desalineado en un núcleo ARMv6-M sin división por hardware                      | La suite completa de la VM, que no cabe (vea [Límites conocidos](#límites-conocidos))                    |
| `app`        | La prueba de host del codificador Sparkplug en `firmware/app/tests`, contra los archivos nanopb generados por una compilación Arduino Opta                                                                  | El codificador produce los contenidos esperados en un host de 64 bits                                                                            | El cliente MQTT, TLS o cualquier comportamiento de red                                                   |
| `app-native` | Solo emulación: `firmware/app` en `native_sim/native/64` con el mapa de canales de la Raspberry Pi Pico sobre GPIO y ADC emulados, arrancado y manejado por su shell                                         | La aplicación, el shell, el despliegue y el almacén de programas funcionan sobre el kernel de Zephyr, y los proyectos de referencia dan las mismas trazas que el runtime nativo (vea [Banco HIL emulado](./hil-emulation.md)) | Pines, controladores, tiempos o cualquier placa física. Nunca es un registro de hardware |
| `size`       | `firmware/app` compilado para cada placa de `boards.json`; los ids de placa después de `size` lo restringen                                                                                                 | Flash y RAM frente al presupuesto registrado, y que cada almacén de la imagen tiene su propia partición de flash (IO-008)                        | El uso de pila y de heap en ejecución, o que la imagen se ejecute                                        |
| `tidy`       | `clang-tidy` con el `.clang-tidy` del repositorio, con cada hallazgo como error, sobre el núcleo, el HAL POSIX y la aplicación de host; también el HAL de Zephyr y `firmware/app` cuando existe una compilación Opta | Los archivos analizados no tienen ninguno de los defectos que buscan las comprobaciones habilitadas                                              | Que el código sea correcto, ni nada sobre compilaciones Xtensa, que clang no puede apuntar               |

### Leer el resultado

Una ejecución termina con un bloque como este, de `run.sh native32`:

```text
PASS native32  zplc.core.vm_core                              1/1 cases
PASS native32  zplc.scheduler_admission                       46/46 cases
PASS native32  zplc.scheduler_run_control                     9/9 cases
PASS native32  19/19 scenarios passed, 0 filtered out
```

Para examinar un escenario, abra su registro en el directorio de salida de Twister del modo, o ejecútelo solo desde el espacio de trabajo:

```bash
cd ~/zplc-zephyr-ws && west twister -T zplc/firmware/tests -p qemu_cortex_m3 -s zplc.program_store --inline-logs
```

Un escenario que Twister marca como `skipped`, por ejemplo por un desborde de RAM, cuenta aquí como una falla. Un escenario filtrado, que no lista la plataforma, no se cuenta.

## Qué cubren las suites

Las suites Zephyr están en `firmware/tests`, y cada una tiene un `testcase.yaml` que lista las plataformas permitidas. Las suites en C simple de `firmware/lib/zplc_core/tests` también se ejecutan en objetivos Zephyr mediante `firmware/tests/core_suites`, que compila los mismos archivos fuente y llama a cada suite desde un caso de prueba.

Un escenario de la VM nombra un perfil de memoria, de modo que un resultado siempre dice con qué tamaños se obtuvo:

| Perfil   | Tamaños                                                                     | Se usa en         |
| -------- | --------------------------------------------------------------------------- | ----------------- |
| (ninguno) | Los valores predeterminados del ISA: 8 KB de trabajo, 4 KB retentivos, 44 KB de código | `native_sim`      |
| `.small` | 4 KB de trabajo, 2 KB retentivos, 16 KB de código                           | `qemu_cortex_m3`  |
| `.tiny`  | 256 B de trabajo, 64 B retentivos, 512 B de código, cuatro etiquetas, una pila de 32 entradas | `qemu_cortex_m0`  |

Las imágenes de proceso son de 4 KB cada una en todos los perfiles, porque el ISA las fija.

### Bloques de comunicación

Los bloques de comunicación tienen suites propias (COM-006):

- `mqtt_broker_double` ejecuta el cliente MQTT del controlador (`zplc_mqtt.c`, tal como lo enlaza una placa) y los manejadores de `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE`, `AZURE_C2D_RECV`, `AZURE_EG_PUB` y `SPB_REBIRTH` contra un broker que es un hilo de la prueba en la interfaz de bucle local. Cubre el éxito, la falta de `CONNACK`, una conexión rechazada, una sesión perdida y un reinicio mientras está ocupado.
- `comm_cloud_fb` y `comm_modbus_fb` ejecutan los manejadores con un servicio sustituto. `modbus_client_tcp` ejecuta el cliente Modbus TCP contra un servidor escrito para la prueba.
- Los bloques de aprovisionamiento `AZURE_DPS_PROV` y `AWS_FLEET_PROV` se verifican solo en el manejador.
- En el host, `test_host_loopback` muestra los extremos que una sesión de la aplicación ZPLC inicia dentro de su runtime (COM-009), y `test_io_unsupported` muestra que un canal que la placa no puede atender se cuenta y se informa (IO-007).

Un doble demuestra el comportamiento del protocolo, no la aceptación por un servicio real.

### Endurecimiento del runtime

El endurecimiento del runtime del firmware (RT-010 a RT-034) tiene estas suites:

- `runtime_boot` ejecuta un plan de arranque en orden, rechaza un plan que inicia un servicio antes que el runtime y sigue adelante cuando un servicio falla.
- `program_store_nvs` ejecuta el almacén de programas sobre NVS en el simulador de flash con un artefacto tan grande como la región de código, y corta la energía en cada operación de un despliegue.
- `modbus_force` escribe a través del servidor Modbus sobre el núcleo real y muestra que una variable forzada conserva su valor forzado.
- `scheduler_admission` detiene un ciclo en la confirmación y en la escritura de salidas, para mostrar que una escritura externa espera al enganche de entradas y nunca al ciclo, y que el cerrojo de la imagen está libre mientras se escriben los pines.
- `scheduler_equivalence` maneja el planificador de Zephyr con los escenarios del núcleo de planificador compartido y compara sus decisiones con la traza de referencia a la que se somete la sesión de host (RT-008, RT-018).
- `single_task` ejecuta la configuración de una sola tarea del núcleo: el enganche de entradas de los pines, el plazo, la falla y el estado seguro (RT-018).
- `failsafe` toma el manejador de error fatal con un reinicio interceptado y muestra las salidas llevadas a estado seguro, el registro de la falla y la causa que informa el arranque siguiente. `failsafe_reboot` toma una falla real y un reinicio real en `qemu_cortex_m3` y lee el registro después (RT-019, RT-021, RT-022).
- `scheduler_watchdog` ejecuta la política de perro guardián por hardware de un perfil sobre un modelo del perro guardián: la alimentación desde el fin de un ciclo, el tiempo límite tomado del conjunto de tareas, un ciclo detenido que lo deja vencer y la política en STOP, en una pausa y en una falla (RT-020).
- `port_timing` ejecuta la autoprueba de tiempo de la suite de conformidad de puertos sobre el reloj del HAL de Zephyr: el tic nunca retrocede y una espera lo avanza en el tiempo indicado. El host POSIX ejecuta la misma función en `test_port_timing`. La página de la [interfaz de puerto](../runtime/port-interface.md) enumera toda la suite (IO-013).

Las suites de host del núcleo agregan `test_exchange` (un escáner, lectores y escritores en hilos), `test_program_store` (un corte de energía y una escritura incompleta en cada operación), `test_sched_core` y `test_sched_equivalence`, `test_single_task`, `test_vm_scan`, `test_failsafe`, `test_safe_state`, `test_core_start`, `test_core_lock`, `test_bytes_crc` y las pruebas `config_rule_*`. Cada prueba `config_rule_*` construye una regla de configuración con un valor que la rompe y espera que la compilación falle nombrando la regla.

Los puntos de entrada solo para pruebas se declaran en `firmware/lib/zplc_core/tests/include/zplc_test_hooks.h`, nunca en un encabezado público. `test_public_headers` falla cuando un encabezado público declara uno.

### La descripción de E/S de la placa

- `zplc.io_table.base` y `zplc.io_table.extended` compilan el firmware a partir de dos descripciones sintéticas de placa (`firmware/tests/io_table/io_base.json` e `io_extended.json`) sobre el emulador de GPIO de `native_sim` y ejecutan el mismo código de prueba en ambas. La prueba maneja cada pin de entrada emulado, ejecuta un ciclo y comprueba que una entrada descrita llega a la imagen de entrada en su dirección, que una salida descrita llega a su pin y que un pin que el árbol de dispositivos tiene pero la descripción no lista nunca se configura ni se maneja. La descripción extendida lista tres salidas y una entrada más que la base, y nada en las fuentes del firmware las nombra.
- `zplc.io_analog.ok` ejecuta dos entradas analógicas sobre el emulador de ADC y comprueba que cada valor crudo llega a su palabra de la imagen de entrada y sigue el voltaje. `zplc.io_analog.missing` nombra un canal del conversor que el emulador no tiene y comprueba que el HAL falla en la inicialización, antes de que corra cualquier tarea.
- `zplc.hal_persist_keys` guarda, carga y borra cada clave que el runtime almacena (el almacén de programas, los fragmentos RETAIN de ambas ranuras y las credenciales) sobre el NVS del simulador de flash, y comprueba que una clave sin identificador responde con un error.

La compilación también comprueba que la descripción y el árbol de dispositivos coincidan. Para verla fallar, cambie un `dt.pin` o un `alias` en `io_base.json` y compile la prueba:

```bash
west build -p -b native_sim/native/64 zplc/firmware/tests/io_table
```

La compilación se detiene con un mensaje como `I/O description: channel DO0 (P0) disagrees with the devicetree: alias led0 is not on pin 7`. Dos comprobaciones en Python lo acompañan: `python3 tools/hil/test_io_table_generator.py` fija el texto que emite el generador, y `python3 tools/ci/check_hal_contract.py` comprueba que cada función del HAL esté implementada en cada puerto.

## Análisis estático

`clang-tidy` lee `.clang-tidy` en la raíz del repositorio. Toda comprobación que habilita es un error, de modo que la lista de ese archivo es el conjunto que el código satisface. Cada comprobación desactivada figura con su motivo, y una sola línea que deba quedar como está lleva un comentario `NOLINT` con su motivo. `run.sh tidy` ejecuta `tools/ci/run_clang_tidy.py`, que hace dos pasadas:

- **Pasada de host.** Siempre se ejecuta. CMake escribe una base de datos de compilación de `firmware/lib/zplc_core` en un directorio temporal (no se compila nada), y clang-tidy analiza `src/core`, el HAL POSIX en `src/hal/posix`, la aplicación de host en `firmware/apps/posix_host/src` y los encabezados que incluyen. No debe informar nada.
- **Pasada de Zephyr.** Analiza lo que solo compila una compilación de Zephyr: el HAL y el planificador de Zephyr y `firmware/app`. Necesita la base de datos de compilación de un `west build`, así que se ejecuta cuando existe `$ZPLC_FW_WS/out/size/arduino-opta-wifi-m7` (lo crea `run.sh size arduino-opta-wifi-m7`) o cuando pasa `--zephyr-build <directorio>`. En otro caso se omite y la ejecución lo dice. El núcleo y el HAL de Zephyr no deben informar nada. Los hallazgos que `firmware/app` ya tenía cuando se agregó la comprobación se cuentan por placa, archivo y comprobación en `tools/ci/clang-tidy-app-baseline.json`: un hallazgo nuevo hace fallar la pasada, y uno corregido pide bajar el conteo con `--update-baseline`.

`-Werror` se aplica a todo objetivo que compila el repositorio: los objetivos de host del núcleo mediante un solo `add_compile_options` en `firmware/lib/zplc_core/CMakeLists.txt` (con `-Wall -Wextra -pedantic`), la biblioteca Zephyr `zplc` mediante `firmware/CMakeLists.txt` y `app`. Las suites de prueba de Zephyr también compilan con él las fuentes del núcleo.

## Presupuestos de tamaño

`tools/firmware-test/size-budget.json` registra, para cada placa de `firmware/app/boards/boards.json`, la flash y la RAM medidas en la tabla de memoria del enlazador y el presupuesto que debe respetar la compilación. El presupuesto es la medición más 5 por ciento, redondeado hacia arriba a 256 bytes (la `margin_policy` del archivo).

Cuando un cambio hace que una imagen crezca más allá de su presupuesto, la compilación falla. Suba el presupuesto en el mismo commit y explique por qué:

```bash
python3 tools/firmware-test/fwtest.py size \
  --budget tools/firmware-test/size-budget.json \
  --logs ~/zplc-zephyr-ws/out/size --rebaseline
```

Las cifras son asignación estática en el enlazado. No incluyen las pilas ni la marca máxima del heap.

La biblioteca ZPLC y la aplicación se compilan con optimización en el enlazado (`CONFIG_ZPLC_LTO`, activada de forma predeterminada), que vale cerca de 3 por ciento de la flash de una imagen. El código propio de Zephyr no participa. Los objetivos `native_sim` enlazan su imagen como un objeto reubicable, del que el optimizador no puede formar parte, así que se ejecutan sin ella; las suites de `firmware/tests` enlazan la biblioteca igual que las placas en `qemu-m3` y `qemu-m0`, que es donde se ejercita el código que se distribuye. Para comparar, o para depurar una falla sin el efecto del inlining, compile con `-DCONFIG_ZPLC_LTO=n`.

### Adónde van los bytes

El informe de huella lee cada mapa del enlazador en los mismos árboles de compilación e imprime, por placa, los bytes usados de cada región de memoria, el margen respecto del presupuesto, las secciones de entrada por tipo y por biblioteca, y las secciones de entrada más grandes de flash y RAM con el archivo objeto que es dueño de cada una. Las cadenas de la imagen son un solo bloque fusionado, así que informa ese bloque una vez y las cadenas de cada objeto antes de fusionar.

```bash
python3 tools/firmware-test/footprint_report.py \
  --logs ~/zplc-zephyr-ws/out/size --board rpi-pico-rp2040 --top 25
```

El informe solo lee archivos. Sus propias pruebas son `tools/firmware-test/test_footprint_report.py`.

## Particiones de flash de los almacenes

`run.sh size` también ejecuta `tools/hil/check_storage_partitions.py` (IO-008) en cada placa que compiló. La comprobación lee el `zephyr.dts` y el `.config` que cada compilación conserva en `$ZPLC_FW_WS/out/size/<id de la placa>/zephyr`, nunca el texto de la superposición, y reprueba una placa cuando:

- **(a)** dos almacenes comparten o se superponen en una partición, o un almacén se superpone con otra partición. Los almacenes son los registros del HAL (en `zplc_nvs_partition`, o en `storage_partition` donde la placa no la tiene) y el sistema de archivos de configuración (LittleFS, en `storage_partition`).
- **(b)** un almacén tiene menos de dos bloques de borrado de su flash, no consta de bloques de borrado completos, o tiene bloques que su backend no puede montar (NVS rechaza un sector mayor de 64 KB; una NOR serie que no declara tamaño de borrado se toma como de 64 KB).
- **(c)** un almacén queda dentro de la ranura de la imagen, la flash que el enlazador puede llenar. Donde el enlazador no acota la imagen (la ESP32-S3 ignora el tamaño de carga de Zephyr), la ranura es el presupuesto de flash de la placa, que la comprobación de tamaño de la misma ejecución hace cumplir.

Una línea por placa dice PASS o FAIL con el mapa de particiones. Una placa cuya falla es conocida y le corresponde a otro puede figurar con las comprobaciones que fallan en `tools/hil/storage-partitions-open.json`; la lista está vacía y solo se reduce. Ejecute la comprobación sola sobre árboles de compilación que ya existan:

```bash
python3 tools/hil/check_storage_partitions.py ~/zplc-zephyr-ws/out/size/*/
```

Sus pruebas unitarias son `tools/hil/test_hil_storage_partitions.py`. Es evidencia de nivel de compilación: el comportamiento de la flash de una placa requiere el banco de HIL-010.

## Integración continua

| Trabajo                                      | Qué ejecuta                                                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host-core-sanitized`                        | La compilación de host con saneadores y, después, la pasada de host de `clang-tidy` (fijado en 23.1.3 con `pipx`, porque los hallazgos cambian entre versiones)                                                |
| `zephyr-twister`                             | `native` con su propio paso de Twister y luego `native32`, `qemu-m3` y `qemu-m0` con `run.sh`, en el mismo espacio de trabajo; las pruebas unitarias de las herramientas de informe (`test_fwtest.py`, `test_footprint_report.py`) |
| `zephyr-cross-build` (uno por placa)         | La puerta de tamaño contra `size-budget.json`, con la tabla escrita en el resumen del trabajo; la pasada de `clang-tidy` de Zephyr contra la línea base de la placa (la placa Xtensa no tiene destino clang y se omite); la comprobación de particiones |
| `native-sim-twister` (nightly-quality.yml)   | Twister en `native_sim/native/64`, ejecutado dos veces                                                                                                                                                        |
| `loader-fuzz` (nightly-quality.yml)          | Aplica fuzzing a la verificación del cargador (vea la nota siguiente)                                                                                                                                         |

`test_fwtest.py` demuestra que la puerta de tamaño falla cuando un tamaño excede su presupuesto en un byte. El paso de particiones está escrito en `.github/workflows/ci.yml` y aquí no se ha ejecutado en CI; `run.sh size` ejecuta la misma comprobación en local.

El trabajo nocturno `loader-fuzz` de `.github/workflows/nightly-quality.yml` aplica fuzzing solo a la verificación del cargador, y todavía no hay registrada ninguna ejecución suya.

## Agregar una prueba

- Ponga una suite Zephyr en `firmware/tests/<nombre>` con un `testcase.yaml`, y liste en `platform_allow` cada plataforma en la que pasa. No liste una plataforma donde el escenario pasaría por un motivo que no nombra.
- Zephyr elige los archivos de placa por calificador exacto. Un archivo para la variante de 64 bits es `boards/native_sim_native_64.overlay`, y la variante de 32 bits necesita `boards/native_sim_native.overlay`. Los ajustes por placa van en `boards/<placa>.conf`, por ejemplo `boards/qemu_cortex_m3.conf`.
- Imprima solo ASCII. Twister decodifica la salida de QEMU byte por byte como UTF-8 y hace fallar la ejecución ante un carácter multibyte.
- Cuide la pila de los hilos. `native_sim` ejecuta los hilos en la pila del host, así que una pila demasiado pequeña aparece solo en un objetivo. La pila predeterminada de los hilos de prueba en `qemu_cortex_m3` es de 1 KB.

## Límites conocidos

- `vm_core` y `loader_verify` no se ejecutan en `qemu_cortex_m0`. La VM mantiene 8 KB de imágenes de proceso fijas y unos 5 KB de estado estático con la profundidad de pila predeterminada, así que la suite completa excede 16 KB con los tamaños que necesita, y la suite del cargador compila programas mayores que la región de código `.tiny`.
- `hal_gpio_policy.partial_required` y `post_shutdown` necesitan el emulador de GPIO y el alias de LED de `native_sim`.
- `scheduler_run_control` observa el nivel físico del canal de salida 0 mediante el mismo emulador y alias de LED. En `qemu_cortex_m3`, que no tiene ninguno, comprueba solo la imagen de salida, la tabla de forzados y los ciclos de las tareas, de modo que "salidas seguras durante la pausa" se observa solo en `native_sim`.
- El modo `app` todavía no forma parte de la integración continua: ningún trabajo compila una placa y luego ejecuta la prueba de host.
- La línea base de la pasada de `clang-tidy` de Zephyr para `firmware/app` es la lista de hallazgos que aún faltan por corregir allí. Se comprobó contra compilaciones locales de placas con una sola versión de `clang-tidy`. En una estación de trabajo Linux, solo con la compilación del Arduino Opta, el núcleo y el HAL de Zephyr no informaron nada y `firmware/app` informó 24 hallazgos, todos dentro de la línea base de esa placa. Al leerlos no se halló ningún defecto: el único `strcpy` está protegido por la comprobación de longitud que lo precede, y el único `memcpy` escribe un registro binario. Las líneas base de las demás placas no se midieron en esa ejecución, y no hay registrada ninguna ejecución alojada en CI de la pasada.
- Dos casos de integración de `test_vm_core.c` se omiten en todos los objetivos, el host incluido, porque los binarios de ejemplo que cargan son anteriores al campo CRC. Las líneas `SKIP:` están en el registro de la suite y el resumen sigue informando un resultado correcto.

## Páginas relacionadas

- [Configuración del espacio de trabajo de Zephyr](../reference/zephyr-workspace-setup.md)
- [Placas](../reference/boards.md)
- [Compatibilidad de hardware](../reference/capabilities-evidence.md)
