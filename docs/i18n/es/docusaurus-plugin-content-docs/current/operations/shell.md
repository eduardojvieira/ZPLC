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
- `zplc status` - Muestra el estado del runtime.
- `zplc reset` - Reinicia la máquina virtual.
- `zplc version` - Muestra la versión.

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
- `zplc dbg watch <addr> [type]` - No implementado. El comando solo imprime un mensaje; use `mpeek` o la pestaña Watch de Studio.

### Ticks, tareas y temporizadores
- `zplc dbg ticks` - Imprime el conteo de ticks del sistema, en milisegundos.
- `zplc dbg task <task_id>` - Muestra la definición y los límites de una tarea.
- `zplc dbg timer <addr>` - No implementado. El comando solo imprime un mensaje.

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

- `zplc config get` - Muestra la configuración actual.
- `zplc config set <key> <val>` - Cambia un ajuste, como un intervalo o una dirección de red.
- `zplc config save` - Escribe los ajustes actuales en el almacenamiento no volátil.
- `zplc config reset` - Borra los ajustes guardados; los valores por defecto se aplican después del siguiente reinicio.

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

- `zplc mqtt status` - Muestra el estado del cliente MQTT, incluidos el broker y el ID de cliente.
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

- `zplc sys info` - Muestra la información del sistema, incluidos datos de la compilación y del hardware. Con `--json` informa también el `draft_counter` de la imagen; un programa construido para otro borrador se rechaza (ver [Contribuir](../contributing/index.md#contador-de-borrador-del-contrato)). También informa `io`, la identidad de la descripción de E/S de la placa con la que se construyó la imagen (`board_id`, `hash`, `channels`, `input_bytes`, `output_bytes`): Studio compara el hash con la descripción que tiene para la placa y rechaza un programa que usa E/S en un firmware que informa otra o ninguna, o que toca una dirección para la que la placa no tiene canal (ver [Placas Soportadas](../reference/boards.md)).
- `zplc sys reboot` - Reinicia la placa con un reinicio por software.
