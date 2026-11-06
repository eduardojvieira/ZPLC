---
slug: /operations/shell
id: shell
title: Use la consola del dispositivo
sidebar_label: Consola del dispositivo
description: Revise, depure y configure una placa ZPLC desde una terminal serie con los comandos de la consola zplc, agrupados por tarea.
tags: [operations, debugging, shell]
---

# Use la consola del dispositivo

El firmware agrega un conjunto de comandos `zplc` a la consola de Zephyr en el UART de consola de la placa. Úselo para leer el estado de una placa, depurar un programa y definir la configuración del dispositivo desde una terminal, sin la aplicación de ZPLC. Esta página agrupa los comandos por lo que se quiere hacer. [Comandos de la consola](../reference/shell-commands.md) es la tabla generada de cada subcomando, con sus argumentos y el símbolo Kconfig que lo habilita; búsquelo allí si un comando no aparece en esta página.

## Abra la consola

Conecte una terminal serie (PuTTY, `screen`, Minicom) al puerto COM virtual de la placa, normalmente a 115200 baudios, y empiece cada comando con `zplc`. Una simulación de escritorio no tiene consola. Habla el [protocolo de sesión](../reference/runtime-protocol.md).

:::note Nivel de evidencia: compilación para el destino
Los comandos se leen de la tabla de comandos del firmware, de la que se genera la página de referencia. No hay una sesión en una placa real registrada.
:::

## Compruebe qué es la placa

- `zplc version` imprime la versión, el commit desde el que se compiló la imagen (y si el árbol tenía cambios sin confirmar), la placa, la ABI del bytecode, el borrador del contrato y las opciones de compilación con su hash. No imprime fecha de compilación, así que dos compilaciones del mismo commit son la misma imagen. `zplc sys build` imprime el mismo texto y, con `--json`, lo imprime como un solo objeto.
- `zplc status` muestra el estado del runtime. Mientras MQTT corre sobre TLS con la verificación de certificado desactivada, también muestra `WARNING: MQTT tls-verify: OFF` (`"warnings":["mqtt_tls_verify_off"]` con `--json`).
- `zplc sys info` muestra el sistema, la compilación y el hardware. Con `--json` informa además el contador de borrador y el programa más grande que acepta la placa (`CONFIG_ZPLC_CODE_SIZE_MAX`). Un programa compilado para otro borrador se rechaza ([Contribuir](../contributing/index.md#contador-de-borrador-del-contrato)).
- `zplc sys io` muestra la identidad de la descripción de E/S de la placa con la que se compiló la imagen. La aplicación de ZPLC compara su hash con la descripción que tiene y rechaza un programa que usa E/S que la placa no tiene ([Placas](../reference/boards.md)).
- `zplc sys reset` dice por qué se reinició el procesador por última vez y qué falla dejó.

## Controle el runtime

- `zplc start` y `zplc stop` inician y detienen el planificador. Detener no es pausar: también pone en cero la imagen de salida, borra la tabla de forzados y devuelve cada tarea a su punto de entrada ([Pausa, reanudación, paso y parada](../runtime/scheduler.md#pausa-reanudación-paso-y-parada)).
- `zplc reset` recarga el programa desde el almacén de programas y deja el planificador detenido. El almacén guarda la única copia residente, así que una carga en curso se cancela. Sin programa cargado, solo detiene el planificador y borra sus tareas.
- `zplc sys reboot` reinicia la placa con un reinicio por software.
- `zplc sched status` y `zplc sched tasks` muestran el estado del planificador y las tareas configuradas, con su prioridad y sus mediciones de tiempo de ciclo, cuando el firmware se compila con `CONFIG_ZPLC_SCHEDULER`.

## Cargue un programa a mano

Normalmente la aplicación lo hace por usted. A mano, `zplc load <tamaño>` prepara el runtime para recibir un archivo `.zplc` de esa cantidad de bytes, y `zplc data <hex>` envía el siguiente fragmento en hexadecimal. Se niega a continuar mientras el runtime está en falla: ejecute antes `zplc reset`. `zplc sched load` y `zplc sched data` son el mismo par bajo el planificador.

## Depure un programa

`zplc dbg` da acceso directo al estado de ejecución, la memoria y los puntos de interrupción.

- **Puntos de interrupción.** `zplc dbg bp add <pc>`, `bp remove <pc>`, `bp list` y `bp clear`.
- **Pausa y paso.** `zplc dbg pause` detiene el planificador entre ciclos, pone las salidas físicas en su estado seguro y conserva la imagen de salida y la tabla de forzados. `zplc dbg resume` continúa un ciclo detenido en un punto de interrupción, y la primera confirmación de ciclo vuelve a manejar las salidas desde la imagen conservada. `zplc dbg step` termina ese ciclo, o ejecuta un ciclo completo, y hace pausa en el siguiente límite de ciclo o en el siguiente punto de interrupción.
- **Forzados.** `zplc dbg force set <dir> <bytes_hex>` anula las asignaciones del propio programa a una dirección. `force list` los muestra, `force clear <dir>` quita uno y `force clear_all` los quita todos.
- **Memoria.** `zplc dbg mpeek dir:largo[,dir:largo...]` lee bloques, `zplc dbg poke <dir> <valor>` escribe, `zplc dbg mem <ipi|opi|work|retain> [desplazamiento]` vuelca una región y `zplc dbg info` muestra el estado de la máquina y el PC actual. `zplc dbg watch <dir> [tipo]` imprime un valor como `bool`, `i8`, `i16`, `i32`, `u8` (el valor por defecto), `u16`, `u32` o `f32`. Es una instantánea, no un flujo.
- **Temporizadores y tareas.** `zplc dbg ticks` imprime el contador de ticks en milisegundos, `zplc dbg task <id_tarea>` muestra una tarea y `zplc dbg timer <dir>` decodifica la instancia `TON`, `TOF` o `TP` de una dirección en `IN`, `Q`, `PT` y `ET`.

Todo comando que recibe una dirección trabaja dentro de las cuatro regiones del PLC (imagen de entrada, imagen de salida, trabajo y retentiva) y rechaza cualquier otra dirección. Las lecturas salen de la instantánea que publicó el último ciclo, así que un valor es completo y de un solo ciclo, y una lectura nunca espera a un ciclo. Un `poke` se encola y se aplica en el latch de entradas del ciclo siguiente por la interfaz que respeta los forzados, así que una dirección forzada conserva su valor forzado. Mientras el runtime está detenido no hay ciclo, y la escritura se aplica de inmediato.

### Memoria cruda (solo firmware de diagnóstico)

El comando `devmem` de Zephyr lee y escribe cualquier dirección del dispositivo. El firmware de versión no lo compila (`CONFIG_DEVMEM_SHELL=n`). La imagen de diagnóstico sí:

```bash
west build -b <board> firmware/app -- -DEXTRA_CONF_FILE=diagnostic.conf
```

`diagnostic.conf` define `CONFIG_ZPLC_SHELL_RAW_MEMORY=y` junto con `CONFIG_DEVMEM_SHELL=y`. La compilación de la aplicación se detiene con un error cuando solo una de las dos está definida, así que el comando no puede llegar a una imagen de versión por accidente. Use una imagen de diagnóstico en un banco de pruebas, nunca en un controlador conectado a una planta.

## Lea y cambie la configuración

- `zplc config get` muestra la configuración. Una contraseña, una clave o un nombre de usuario aparece como `(set)` o `(not set)`, y ningún comando ni línea de registro imprime su valor.
- `zplc config set <clave> <valor>` cambia un ajuste en memoria.
- `zplc config save` escribe cada ajuste que informa `config get`, y las anulaciones del mapeo Modbus, en el almacén no volátil que usa el programa. Imprime `OK: Config saved` solo después de escribir todas las entradas. Si no, imprime `ERROR: Failed to save config: <código>` y termina con ese código, donde `-134` significa que el firmware no guarda ajustes.
- `zplc config reset` pone los valores por defecto en memoria y los guarda, así que también rigen después del próximo reinicio.

Un dispositivo que nunca se configuró tiene MQTT apagado, sin broker, y TLS con certificado verificado cuando se enciende MQTT ([Valores por defecto seguros](../runtime/connectivity.md#valores-por-defecto-seguros)). `zplc config set mqtt_security 1` desactiva la verificación. Una imagen de versión la rechaza con `ERROR: this firmware cannot turn TLS certificate verification off`. Una imagen compilada con `CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS=y` la acepta, imprime una advertencia y muestra `tls-verify: OFF` en `zplc mqtt status` y en `zplc status` mientras siga activa.

## Conéctese a una red

- `zplc net status` muestra la dirección IPv4, la puerta de enlace y la dirección MAC en una placa con hardware de red.
- `zplc wifi connect` se une a la red Wi-Fi con las credenciales guardadas por `zplc config set wifi_ssid`, `wifi_pass` y `wifi_security`, y nunca las guarda. Una placa con un SSID guardado también se une sola al arrancar y después de una caída, en un elemento de trabajo en segundo plano que nunca retrasa un ciclo. Espera 2 s tras la primera falla, duplicando hasta 60 s. `zplc status --json` informa el enlace como `wifi.state` (`unconfigured`, `connecting`, `connected`, `retrying`, o `unsupported` en una placa sin Wi-Fi) y `wifi.ip`. Ni el SSID ni la contraseña se registran.
- `zplc ntp status`, `enable`, `disable`, `server <nombre_de_host>` y `sync` controlan la sincronización de hora por SNTP.

## Inspeccione MQTT y Modbus

- `zplc mqtt status` muestra el broker, el identificador de cliente y `tls-verify`: `on` (TLS, certificado verificado), `OFF` (TLS, sin verificar, con una línea de advertencia) o `n/a` (TCP simple). Con `--json` agrega `"tls_verify"`. `zplc mqtt reset_backoff` reinicia la demora de reconexión.
- `zplc comm map` muestra los enlaces de comunicación y los mapeos del servidor Modbus. `zplc comm set modbus <índice> <dirección>` anula un mapeo del servidor y `zplc comm clear modbus <índice>` quita la anulación.

## Instale certificados TLS

Un broker protegido, como AWS IoT Core, necesita certificados en la placa. `zplc cert status` muestra si el certificado de la CA, el certificado de cliente y la clave privada están instalados, y sus tamaños. Para guardar uno, ejecute `zplc cert begin <ca|client|key> <tamaño>`, envíe los datos con `zplc cert chunk <hex>` las veces que haga falta y luego `zplc cert commit`. `zplc cert erase <ca|client|key>` quita uno. Ningún comando imprime un certificado o una clave guardados.

## Comprobaciones de hardware

Los comandos `zplc adc` existen solo cuando el firmware se compila con `CONFIG_ADC`: `zplc adc temp` lee la temperatura del procesador cuando la placa tiene el sensor, y `zplc adc read <canal>` lee un canal. `zplc hil mode`, `status`, `watch` y `reset` son los ganchos de hardware en el lazo, y `zplc dbg trace` registra por ciclo las imágenes de entrada y salida para la comprobación de hardware del curso.
