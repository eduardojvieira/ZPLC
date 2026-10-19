---
slug: /operations/shell
id: shell
title: Consola ZPLC Shell
sidebar_label: ZPLC Shell
description: Referencia de los comandos de shell de Zephyr incorporados en ZPLC.
tags: [operations, debugging, shell]
---

# La consola (ZPLC Shell)

ZPLC agrega un conjunto de comandos `zplc` a la shell de Zephyr, en la UART interactiva de la placa (normalmente a 115200 baudios).

Cada subcomando, con sus argumentos y el símbolo de Kconfig que lo habilita, está en la [referencia de comandos de la consola](../reference/shell-commands.md) generada.

Desde un terminal puede inspeccionar la memoria, revisar la red, leer los errores de ejecución y controlar la máquina virtual sin el IDE de escritorio.

## Acceso a la consola

Conecte un programa de terminal serial (como PuTTY, screen o Minicom) al puerto COM virtual de su placa Zephyr.

Inicie cada comando con `zplc`.

---

## Control del runtime (`zplc`)

- `zplc load <size>` - Prepara el runtime para recibir un programa `.zplc` del tamaño indicado, en bytes. Se rechaza mientras el runtime esté en falla; ejecute antes `zplc reset`.
- `zplc data <hex>` - Envía el siguiente fragmento del programa, en hexadecimal. Úselo solo después de `zplc load`.
- `zplc start` - Inicia el planificador.
- `zplc stop` - Detiene el planificador.
- `zplc status` - Muestra el estado del runtime. Mientras MQTT esté habilitado sobre TLS con la verificación del certificado apagada, muestra además `WARNING: MQTT tls-verify: OFF` (`"warnings":["mqtt_tls_verify_off"]` en `--json`).
- `zplc reset` - Recarga el programa cargado desde el program store y deja el scheduler detenido. El store es la única copia residente del programa, así que una carga en curso se cancela. Sin programa cargado solo detiene el scheduler y limpia sus tareas.
- `zplc version` - Muestra qué compilación es: la versión, el commit desde el que se construyó la imagen (y si el árbol de trabajo tenía cambios sin confirmar), la placa, la ABI del bytecode, el borrador del contrato y las opciones de compilación con su hash. No imprime fecha de compilación, de modo que dos compilaciones del mismo commit son la misma imagen. El mismo texto es `zplc sys build`.

---

## Máquina virtual y depuración (`zplc dbg`)

Los comandos `dbg` dan acceso directo al estado de ejecución, a la memoria y a los breakpoints.

### Breakpoints (`bp`)
- `zplc dbg bp list` - Lista los breakpoints activos.
- `zplc dbg bp add <pc>` - Agrega un breakpoint en la dirección indicada del contador de programa (PC).
- `zplc dbg bp remove <pc>` - Elimina el breakpoint de la dirección indicada.
- `zplc dbg bp clear` - Elimina todos los breakpoints.

### Forzado de variables (`force`)
- `zplc dbg force list` - Lista las direcciones de memoria forzadas.
- `zplc dbg force set <addr> <hexbytes>` - Fuerza una dirección de memoria a mantener los bytes indicados, por encima de las asignaciones del propio programa.
- `zplc dbg force clear <addr>` - Quita el forzado de una dirección.
- `zplc dbg force clear_all` - Quita todos los forzados, de modo que el programa vuelve a controlar todas las direcciones.

### Control de la ejecución
- `zplc dbg pause` - Pausa el scheduler entre scans. Las salidas físicas pasan a su estado seguro; la imagen de salidas y la tabla de forzados se conservan.
- `zplc dbg resume` - Reanuda. Un scan detenido en un breakpoint continúa desde donde se detuvo, y el primer commit de scan vuelve a energizar las salidas desde la imagen conservada.
- `zplc dbg step` - Termina el scan detenido en un breakpoint, o ejecuta un scan completo, y se detiene en el siguiente límite de ciclo o en el siguiente breakpoint. La imagen muestra el scan ejecutado; las salidas quedan seguras.

`zplc stop` no es una pausa: además pone a cero la imagen de salidas, borra la tabla de forzados y devuelve cada tarea a su punto de entrada. Ver [Pausa, reanudación, paso y parada](../runtime/scheduler.md#pausa-reanudación-paso-y-parada).

### Inspección de memoria
- `zplc dbg info` - Muestra el estado de la máquina virtual y el PC actual.
- `zplc dbg mpeek addr:len[,addr:len...]` - Lee uno o más bloques de memoria en las direcciones hexadecimales indicadas.
- `zplc dbg poke <addr> <value>` - Escribe un valor en una dirección de memoria.
- `zplc dbg mem <ipi|opi|work|retain> [offset]` - Vuelca una región de memoria en la consola, a partir del offset opcional.
- `zplc dbg watch <addr> [type]` - Lee un valor de una región de memoria del PLC y lo imprime en el tipo indicado: `bool`, `i8`, `i16`, `i32`, `u8` (por defecto), `u16`, `u32` o `f32`. Es una instantánea, no un flujo: la pestaña Watch de Studio consulta la misma memoria.

Todo comando del conjunto `zplc` que recibe una dirección trabaja dentro de las cuatro regiones del PLC (imagen de entradas, imagen de salidas, work y retain) y rechaza una dirección fuera de ellas. Leer o escribir cualquier otra dirección del dispositivo es el comando `devmem` del shell de Zephyr, que el firmware de release no tiene: ver [Memoria cruda](#memoria-cruda-solo-firmware-de-diagnóstico).

Las lecturas (`mpeek`, `mem`, `info`) salen del snapshot que el scan publicó en su último commit, de modo que un
valor es entero y de un solo scan, y una lectura nunca espera a un scan. Un `poke` se encola y se aplica en el latch
de entradas del siguiente scan por la interfaz que respeta los forces: una dirección forzada conserva su valor
forzado. Mientras el runtime está detenido no hay scan y la escritura se aplica de inmediato.

### Ticks, tareas y temporizadores
- `zplc dbg ticks` - Imprime el conteo de ticks del sistema, en milisegundos.
- `zplc dbg task <task_id>` - Muestra la definición y los límites de una tarea.
- `zplc dbg timer <addr>` - Lee la instancia de 16 bytes de un `TON`, `TOF` o `TP` en la dirección e imprime `IN`, `Q`, `PT` y `ET` (en milisegundos) y si el temporizador está corriendo.

---

## Planificador (`zplc sched`)

El planificador decide cuándo se ejecuta cada tarea. Estos comandos están disponibles cuando el firmware se compila con `CONFIG_ZPLC_SCHEDULER`. Sirven para revisar los tiempos de las tareas o para cargar un programa a mano.

- `zplc sched status` - Muestra el estado del planificador, como `RUNNING` o `HALTED`.
- `zplc sched tasks` - Lista las tareas configuradas con su prioridad y las mediciones de tiempo de ciclo.
- `zplc sched load <size>` - Prepara el runtime para recibir un programa `.zplc` del tamaño indicado, en bytes.
- `zplc sched data <hex>` - Envía el siguiente fragmento del programa, en hexadecimal, sin pasar por Studio.

---

## Configuración y persistencia (`zplc config`)

Estos comandos administran los ajustes que ZPLC guarda en el almacenamiento no volátil de la placa.

- `zplc config get` - Muestra la configuración actual. Una contraseña, una clave o un nombre de usuario se muestra como `(set)` o `(not set)`; ningún comando ni línea de log imprime su valor.
- `zplc config set <key> <val>` - Cambia un ajuste, como un intervalo o una dirección de red. El cambio queda en memoria hasta que se guarda.
- `zplc config save` - Escribe todos los ajustes que `config get` informa, y los overrides del mapeo Modbus, en el almacén no volátil donde se guarda el programa. Imprime `OK: Config saved` solo después de haber escrito todas las entradas; si alguna no se escribió, imprime `ERROR: Failed to save config: <código>` y termina con ese código (`-134` significa que este firmware no guarda ajustes).
- `zplc config reset` - Pone los ajustes por defecto en memoria y los guarda, de modo que también se aplican después del siguiente reinicio. Informa un error cuando no pudo guardar los valores por defecto.

Los ajustes de un dispositivo que nunca se configuró son los valores por defecto: MQTT apagado, sin broker, y MQTT con TLS y el certificado del broker verificado (ver [Valores por defecto seguros](../runtime/connectivity.md#valores-por-defecto-seguros)).

`zplc config set mqtt_security 1` apaga la verificación del certificado. Una imagen de release lo rechaza (`ERROR: this firmware cannot turn TLS certificate verification off`); una imagen compilada con `CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS=y` lo acepta, imprime una advertencia y muestra `tls-verify: OFF` en `zplc mqtt status` y en `zplc status` mientras siga así.

### Memoria cruda (solo firmware de diagnóstico)

El shell de Zephyr tiene un comando `devmem` que lee y escribe cualquier dirección del dispositivo, no solo las regiones del PLC. El firmware de release no lo compila (`CONFIG_DEVMEM_SHELL=n`). La imagen de diagnóstico sí:

```bash
west build -b <board> firmware/app -- -DEXTRA_CONF_FILE=diagnostic.conf
```

`diagnostic.conf` activa `CONFIG_ZPLC_SHELL_RAW_MEMORY=y` junto con `CONFIG_DEVMEM_SHELL=y`, y la compilación de la aplicación se detiene con un error cuando solo uno de los dos está activo, de modo que el comando no aparece en una imagen de release por accidente. Use una imagen de diagnóstico en un banco de pruebas, nunca en un controlador conectado a una planta.

---

## Integración de hardware (`zplc hil` / `adc`)

Los comandos `adc` existen solo cuando el firmware se compila con `CONFIG_ADC`.

- `zplc hil mode <mode>` - Cambia el modo de hardware-in-the-loop (HIL).
- `zplc hil status` - Muestra el estado de HIL.
- `zplc hil reset` - Reinicia la máquina virtual.
- `zplc hil watch <id> <addr>` - Registra un watch de HIL.
- `zplc adc temp` - Lee la temperatura interna del procesador, si la placa lo permite.
- `zplc adc read <channel>` - Lee un canal del ADC.

---

## Red (`zplc net` / `wifi`)

Para las placas con hardware de red, como la ESP32-S3 o las placas STM32F7.

- `zplc net status` - Muestra la dirección IPv4, la puerta de enlace y la dirección MAC.
- `zplc wifi connect` - Se conecta a la red Wi-Fi con las credenciales guardadas por `zplc config`.

---

## MQTT y comunicación (`zplc mqtt` / `comm`)

- `zplc mqtt status` - Muestra el estado del cliente MQTT, incluidos el broker y el ID de cliente, y `tls-verify`: `on` (TLS, se verifica el certificado del broker), `OFF` (TLS, no se verifica, con una línea de advertencia) o `n/a` (TCP plano, sin TLS). `--json` agrega `"tls_verify"`.
- `zplc mqtt reset_backoff` - Restablece la espera de reconexión a su valor inicial.
- `zplc comm map` - Muestra los enlaces de comunicación y las asignaciones del servidor Modbus.
- `zplc comm set modbus <index> <address>` - Reemplaza una asignación del servidor Modbus.
- `zplc comm clear modbus <index>` - Quita el reemplazo de una asignación del servidor Modbus.

---

## Certificados y seguridad (`zplc cert`)

Un broker MQTT seguro, como AWS IoT Core, requiere certificados TLS guardados en la placa.

- `zplc cert status` - Muestra si están instalados el certificado de la CA, el certificado del cliente y la clave privada, y sus tamaños.
- `zplc cert begin <ca|client|key> <size>` - Inicia una carga del tamaño indicado.
- `zplc cert chunk <hex>` - Envía el siguiente fragmento de la carga, en hexadecimal.
- `zplc cert commit` - Escribe en el almacenamiento los datos cargados.
- `zplc cert erase <ca|client|key>` - Borra el certificado o la clave guardados.

---

## Servicios de hora (`zplc ntp`)

ZPLC puede sincronizar el reloj mediante SNTP.

- `zplc ntp status` - Muestra el estado de sincronización y el desfase respecto de la hora Unix.
- `zplc ntp enable` / `zplc ntp disable` - Activa o desactiva el servicio SNTP.
- `zplc ntp server <hostname>` - Define el servidor de hora.
- `zplc ntp sync` - Solicita la hora de inmediato.

---

## Sistema (`zplc sys`)

Estos comandos están disponibles cuando el firmware se compila con `CONFIG_ZPLC_SCHEDULER`.

- `zplc sys info` - Muestra la información del sistema, incluidos datos de la compilación y del hardware. Con `--json` informa también el `draft_counter` de la imagen y, en `memory`, `code_size` y `max_artifact_size`, el mayor programa que acepta la placa (`CONFIG_ZPLC_CODE_SIZE_MAX`); un programa construido para otro borrador se rechaza (ver [Contribuir](../contributing/index.md#contador-de-borrador-del-contrato)).
- `zplc sys build` - Muestra la identidad de la imagen de firmware, igual que `zplc version`. Con `--json` la imprime como un objeto con `version`, `commit`, `dirty`, `board`, `abi_major`, `abi_minor`, `draft_counter`, `options_hash` y `options`. `commit` vale `unknown` cuando la imagen se construyó desde un archivo de fuentes sin historial de git. Es un comando aparte porque el saludo de Studio acepta exactamente las claves de `zplc sys info --json`.
- `zplc sys io` - Muestra la identidad de la descripción de E/S de la placa con la que se construyó la imagen. Con `--json` la imprime como un objeto con `schema`, `board_id`, `hash`, `channels`, `input_bytes` y `output_bytes`. Studio compara el hash con la descripción que tiene para la placa y rechaza un programa que usa E/S en un firmware que informa otra o ninguna, o que toca una dirección para la que la placa no tiene canal (ver [Placas Soportadas](../reference/boards.md)). Es un comando aparte por la misma razón que `zplc sys build`: las claves de `zplc sys info --json` no cambian.
- `zplc sys reboot` - Reinicia la placa con un reinicio por software.
