---
title: "Protocolo de enlace con el dispositivo"
sidebar_label: "Protocolo de enlace"
description: "El protocolo con tramas que hablan Studio y un dispositivo: trama, límites, capacidades, errores, mensajes y eventos, leídos de su definición."
tags: [reference, generated]
---

# Protocolo de enlace con el dispositivo

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/device-protocol. Do not edit. >>> */}

El protocolo de enlace con el dispositivo es como hablan Studio y un dispositivo: un protocolo binario con tramas y versión, con longitud, número de secuencia y suma de verificación en cada trama, negociación de capacidades y códigos de error explícitos. Funciona sobre UART, USB serie y TCP. Esta es la versión `1` del protocolo: 41 mensajes y 8 eventos. La consola de texto del dispositivo se mantiene: es el protocolo anterior y la consola de recuperación, y `zplc sys info --json` conserva sus claves. Esta página se lee de `tools/contract/protocol.json`, la definición única de la que se generan el códec C del firmware y el códec TypeScript de Studio.

## Sesiones

Todo lo que cambia el dispositivo necesita una sesión abierta en el enlace por el que llega la solicitud: una descarga, RUN y STOP y los demás controles de ejecución, una escritura de memoria, un forzado, un cambio de configuración, la subida de una credencial y la clave. Una solicitud que la necesita y no la tiene recibe `NO_SESSION` y no llega a nada. Las lecturas del runtime no necesitan sesión en el enlace serie.

Hay una sola sesión abierta a la vez. Termina cuando su cliente la cierra, cuando no llega nada durante el tiempo de inactividad (se informa en el saludo, 30 segundos por defecto; cada trama de la sesión, un `KEEPALIVE` incluido, lo reinicia), cuando se pierde su enlace, cuando una persona en el enlace serie la toma (`SESSION_OPEN` con la bandera de toma de control; un enlace de red no puede tomar una sesión) y cuando se cambia la clave. El dispositivo envía un `EVT_SESSION_END` al enlace que la tenía, y un segundo `SESSION_OPEN` con una abierta recibe `SESSION_BUSY`.

Los forzados que fijó una sesión terminan con ella, sea cual sea el motivo, y las salidas vuelven a seguir al programa. Un forzado fijado fuera de una sesión (por la consola) no le corresponde liberarlo a la sesión. Un forzado que debe sobrevivir se fija otra vez en la sesión siguiente.

Un valor de varios bytes se escribe con un solo `MEM_WRITE`: el dispositivo lo encola completo y el ciclo lo aplica en su siguiente latch de entradas, de modo que un programa nunca lee la mitad. Una descarga es `PROGRAM_BEGIN` (tamaño y CRC-32), `PROGRAM_CHUNK` en orden y `PROGRAM_COMMIT`, que comprueba el CRC-32, verifica y activa el artefacto y responde con el tamaño y el CRC-32 que el dispositivo leyó de lo que tiene. El runtime está detenido antes y sigue detenido después: RUN es otra solicitud.

Los mensajes que necesitan una sesión: `MEM_WRITE`, `FORCE_SET`, `FORCE_CLEAR`, `FORCE_CLEAR_ALL`, `SESSION_CLOSE`, `KEEPALIVE`, `RUN`, `STOP`, `PAUSE`, `RESUME`, `STEP`, `RESET`, `BP_ADD`, `BP_REMOVE`, `BP_CLEAR`, `PROGRAM_BEGIN`, `PROGRAM_CHUNK`, `PROGRAM_COMMIT`, `PROGRAM_ABORT`, `CONFIG_SET`, `CONFIG_SAVE`, `CONFIG_RESET`, `CRED_BEGIN`, `CRED_CHUNK`, `CRED_COMMIT`, `CRED_ERASE`, `KEY_SET`, `KEY_CLEAR`. `KEY_SET` y `KEY_CLEAR` necesitan además el enlace serie.

## Autenticación en un enlace de red

Un enlace es `SERIAL` (UART o USB serie) o `NETWORK` (TCP, o cualquier enlace al que llegue una red); el dispositivo decide cuál, y lo dice en el saludo. En un enlace de red todos los mensajes salvo `HELLO`, `IDENTITY`, `CHALLENGE` y `LINK_STATS` necesitan una sesión que se abrió con un código, y cada trama de esa sesión lleva un código: HMAC-SHA-256, 32 bytes, sobre el encabezado y la carga útil, es decir también sobre la clase, el número de mensaje y el número de secuencia.

La clave (32 bytes) se aprovisiona por el enlace serie, dentro de una sesión, con `KEY_SET`; nunca se acepta por un enlace de red y el dispositivo nunca la devuelve. Para abrir una sesión por la red el cliente pide un `CHALLENGE` (un número de 16 bytes que el dispositivo aceptará una vez, en los próximos diez segundos, y conserva hasta que se usa o vence), y envía `SESSION_OPEN` con ese número, un número propio y un código bajo la clave. El dispositivo deriva la clave de la sesión como HMAC-SHA-256 de la cadena `ZPLC-LINK-SK1`, el número del dispositivo y el número del cliente, bajo la clave del dispositivo; su respuesta y cada trama posterior, en ambos sentidos, llevan un código bajo esa clave de sesión. La clave de sesión se borra cuando la sesión termina.

El número de secuencia de la primera trama tras la apertura es el de la apertura más uno, y cada solicitud posterior es la anterior más uno. Una trama cuyo código es erróneo o falta, cuyo número de secuencia ya fue aceptado (una repetición) o no es el siguiente (fuera de orden), se descarta, se cuenta en `LINK_STATS` (`auth_drops`, `replay_drops`, `order_drops`) y no se responde; no mueve la secuencia. Una apertura con un desafío que no es el vigente también es una repetición: se cuenta y se responde `CHALLENGE_STALE`.

## Modelo de confianza

**El enlace serie es confiable como la persona que sostiene el cable.** Un puerto UART o USB es acceso físico: quien lo tiene ya puede detener el dispositivo, leer su memoria con la consola y regrabarlo. La sesión del enlace serie evita que dos clientes escriban a la vez y hace de una escritura, un forzado o una descarga un paso explícito; no es una defensa contra alguien en el puerto, y no necesita un código. La clave de las sesiones de red se aprovisiona por este enlace, y solo por este enlace, por la misma razón: la persona que está en el cable es quien decide quién puede llegar al dispositivo por la red.

**El enlace de red no es confiable.** Un par sin la clave puede enviar lo que quiera: no llega a nada, no recibe respuesta y se cuenta. Lo que el código no da es secreto (las tramas no se cifran: donde importa la confidencialidad, el enlace va dentro de un túnel TLS), disponibilidad (un par en la red puede inundar el enlace y hacer que el dispositivo gaste tiempo descartando tramas, por debajo de la prioridad del ciclo) ni un dispositivo oculto: el saludo, la identidad y los contadores se responden a cualquiera.

**La clave.** Tiene 256 bits, y el dispositivo la guarda en su almacén persistente donde la placa tiene almacenamiento protegido y en flash sin proteger donde no lo tiene; la documentación de cada placa dice cuál. No está en ninguna respuesta, ninguna línea de registro ni en el saludo (que solo dice si hay una), los búferes que la contuvieron se borran, y borrarla o cambiarla termina una sesión. Los números de un desafío y de una sesión salen de la fuente criptográfica de la plataforma: una compilación que no la tiene no ofrece sesiones autenticadas.

## Trama

| Campo | Desplazamiento | Bytes | Significado |
| --- | --- | --- | --- |
| `sync` | 0 | 2 bytes | The two bytes 0x5A 0xA5. A stream decoder looks for them to find the start of a frame. |
| `version` | 2 | 1 byte | The protocol version the sender speaks. A frame of another version is dropped and counted; its payload is never read. |
| `flags` | 3 | 1 byte | Bits 0 and 1: the kind of the frame. Bit 2: a message authentication code follows the payload. Bits 3 to 7 are zero. |
| `message` | 4 | 1 byte | The message number (a request and its response carry the same number). |
| `sequence` | 5 | 4 bytes | A request carries the sequence number of the sender; its response repeats it. An event carries the device's own event counter. Inside an authenticated session the sequence is covered by the code and must follow the one before it by exactly one. |
| `length` | 9 | 2 bytes | Bytes of the payload. |

| Clase | Valor | Significado |
| --- | --- | --- |
| `REQUEST` | 0 | Studio asks the device to do something. |
| `RESPONSE` | 1 | The device answers one request, with the same message number and sequence. |
| `EVENT` | 2 | The device reports something that happened, without being asked. |

Bytes de sincronía: `0x5A` `0xA5`. Código: 32 bytes. CRC-32: 4 bytes.

Todos los números son little-endian. Una trama es el encabezado, la carga útil, un código HMAC-SHA-256 de 32 bytes cuando la bandera AUTH está activa, y un CRC-32 (el CRC del contenedor de artefacto, ISO-HDLC) de todos los bytes anteriores.

Un decodificador que lee un flujo conserva los bytes de la trama que está armando. Cuando el encabezado no es válido (sincronía, versión, bits reservados, clase 3, longitud sobre su límite) o la suma de verificación no coincide, descarta el primer byte de ese candidato, busca el siguiente par de sincronía entre los bytes que ya tiene y continúa desde ahí. Una trama escondida dentro de los bytes de una dañada se entrega, y ninguna trama posterior a una dañada se pierde. Los bytes que no son un par de sincronía son ruido y no se cuentan; cada candidato abandonado se cuenta, por motivo.

Un transporte que enmarca sus propias líneas (una trama por línea, en hexadecimal, como hace la consola del dispositivo) entrega cada línea completa al decodificador.

El código cubre el encabezado y la carga útil, de modo que el número de secuencia y el sentido de la trama quedan dentro. La suma de verificación cubre todo lo anterior, el código incluido.

## Límites

| Límite | Valor |
| --- | --- |
| `payloadMaxDefault` | 512 |
| `payloadMaxHard` | 1024 |
| `payloadMaxMin` | 64 |
| `sessionIdleSecondsDefault` | 30 |
| `challengeSeconds` | 10 |
| `eventQueueDefault` | 16 |
| `eventPayloadMax` | 64 |
| `watchEntriesMax` | 8 |
| `forceBytesMax` | 260 |
| `sessionNameBytes` | 16 |
| `keyBytes` | 32 |
| `nonceBytes` | 16 |

## Capacidades

| Capacidad | Bit | Significado |
| --- | --- | --- |
| `SESSION` | 0 | Sesiones: un solo escritor a la vez, con tiempo de inactividad. |
| `MEMORY` | 1 | Leer y escribir la memoria del PLC; una escritura es completa respecto al ciclo. |
| `FORCE` | 2 | Fijar, borrar y listar forzados; los forzados de una sesión terminan con ella. |
| `RUN_CONTROL` | 3 | RUN, STOP, PAUSE, RESUME, STEP y RESET. |
| `BREAKPOINTS` | 4 | Agregar, quitar, borrar y listar puntos de interrupción. |
| `PROGRAM` | 5 | Transferir un programa, con suma de verificación y lectura de vuelta. |
| `EVENTS` | 6 | El dispositivo envía eventos por iniciativa propia. |
| `WATCH` | 7 | El dispositivo envía lotes de valores observados. |
| `AUTH` | 8 | Sesiones autenticadas (HMAC-SHA-256) y aprovisionamiento de clave por el enlace serie. |
| `CONFIG` | 9 | Cambiar, guardar y restablecer la configuración. |
| `CREDENTIALS` | 10 | Subir y borrar credenciales. |
| `SIGNATURE` | 11 | El dispositivo acepta solo artefactos firmados con la clave que tiene (COM-026). |

## Clases de acceso

| Clase | Significado |
| --- | --- |
| `OPEN` | Se responde en cualquier enlace, sin sesión: lo que un cliente necesita para reconocer el dispositivo. |
| `READ` | Lee el PLC y no cambia nada: abierto en el enlace serie, requiere sesión autenticada en un enlace de red. |
| `SESSION` | Cambia el dispositivo: requiere una sesión abierta en este enlace, y autenticada en un enlace de red. |
| `SERIAL_SESSION` | Requiere una sesión y el enlace serie: una clave nunca se aprovisiona por la red. |

## Códigos de error

| Error | Valor | Significado |
| --- | --- | --- |
| `OK` | 0 | La solicitud se cumplió. |
| `UNKNOWN_MESSAGE` | 1 | El dispositivo no conoce el número de mensaje. |
| `BAD_REQUEST` | 2 | La carga útil no tiene el formato del mensaje. |
| `UNSUPPORTED` | 3 | Esta compilación no tiene la capacidad que el mensaje necesita (véanse las capacidades del saludo). |
| `NO_SESSION` | 4 | El mensaje necesita una sesión abierta en este enlace. |
| `SESSION_BUSY` | 5 | Ya hay una sesión abierta en otro enlace. |
| `AUTH_REQUIRED` | 6 | Un enlace de red no tiene sesión autenticada: abra una con una clave que se aprovisionó por el enlace serie. |
| `AUTH_FAILED` | 7 | El dispositivo no tiene clave, o no se pudo autenticar la sesión. |
| `CHALLENGE_STALE` | 8 | El desafío de la solicitud de apertura no era el último que emitió el dispositivo, o venció: pida uno nuevo. |
| `RANGE` | 9 | El acceso no está dentro de una región de la memoria del PLC, o la región no admite escritura. La respuesta lleva la dirección y la longitud pedidas y la región que contiene la dirección. |
| `FULL` | 10 | Una cola no tiene espacio; no se hizo nada. |
| `STATE` | 11 | El runtime no está en un estado donde el mensaje aplica (una transferencia de programa en marcha, RUN sin programa). |
| `REFUSED` | 12 | Una regla del dispositivo lo prohíbe en este enlace (una toma de control desde la red, una clave por la red). |
| `PROGRAM_INVALID` | 13 | El cargador rechazó el artefacto. |
| `TOO_LARGE` | 14 | El programa es más grande de lo que el dispositivo acepta. |
| `CRC` | 15 | El CRC-32 del programa transferido no es el anunciado. |
| `BUSY` | 16 | Un recurso que el mensaje necesita está en uso; reintente. |
| `FAILED` | 17 | El dispositivo lo intentó y no pudo. |

Una respuesta empieza con su byte de estado. Tras `RANGE` la respuesta lleva `address`, `length`, `region_start`, `region_end` (`u16` cada uno): el acceso que se rechazó y la región que contiene la dirección.

## Enumeraciones

| Enumeración | Nombre | Valor | Significado |
| --- | --- | --- | --- |
| `TRANSPORT` | `SERIAL` | 0 | UART or USB serial: the local engineering link. Whoever holds the cable holds the device. |
| `TRANSPORT` | `NETWORK` | 1 | TCP or any other link that a network reaches. Every frame of a session is authenticated. |
| `RUN_STATE` | `STOPPED` | 0 | No program is running. |
| `RUN_STATE` | `RUNNING` | 1 | The program is scanning. |
| `RUN_STATE` | `PAUSED` | 2 | Held at a cycle boundary or at a breakpoint. |
| `RUN_STATE` | `FAULT` | 3 | A fault is latched; the outputs are at their safe values. |
| `FAULT` | `NONE` | 0 | No fault. |
| `FAULT` | `DEADLINE` | 1 | A task missed its deadline too many times in a row. |
| `FAULT` | `VM` | 2 | A task faulted: a VM error or the instruction budget. |
| `FAULT` | `RUNTIME` | 3 | Any other failure of the runtime. |
| `SESSION_STATE` | `NONE` | 0 | No session is open. |
| `SESSION_STATE` | `THIS_LINK` | 1 | The session is open on the link that asks. |
| `SESSION_STATE` | `OTHER_LINK` | 2 | A session is open on another link. |
| `SESSION_END` | `CLOSED` | 0 | The client closed it. |
| `SESSION_END` | `IDLE` | 1 | Nothing arrived for the idle time. |
| `SESSION_END` | `TAKEN_OVER` | 2 | A person at the serial link took the session over. |
| `SESSION_END` | `LINK_LOST` | 3 | The link went away. |
| `SESSION_END` | `KEY_CHANGED` | 4 | The key of the device was changed or erased. |
| `FORCE_CHANGE` | `SET` | 0 | A force was set. |
| `FORCE_CHANGE` | `CLEARED` | 1 | One force was cleared. |
| `FORCE_CHANGE` | `CLEARED_ALL` | 2 | Every force was cleared. |
| `FORCE_CHANGE` | `RELEASED` | 3 | The forces of a session were released because it ended. |
| `FORCE_CHANGE` | `CHANGED` | 4 | The forces changed by another path (the shell). |
| `LOG_LEVEL` | `ERROR` | 0 | An error. |
| `LOG_LEVEL` | `WARNING` | 1 | A warning. |
| `LOG_LEVEL` | `INFO` | 2 | An information line. |
| `LOG_LEVEL` | `DEBUG` | 3 | A debug line. |
| `CREDENTIAL` | `CA` | 0 | The certificate authority certificate. |
| `CREDENTIAL` | `CLIENT` | 1 | The client certificate. |
| `CREDENTIAL` | `KEY` | 2 | The client private key. |

## Máscara de eventos

| Clase de evento | Bit | Significado |
| --- | --- | --- |
| `STATUS` | 0 | The state of the runtime changed. |
| `FAULT` | 1 | A fault was latched. |
| `BREAKPOINT` | 2 | Execution stopped at a breakpoint. |
| `FORCE` | 3 | A force was set, cleared or released. |
| `LOG` | 4 | The device wrote a log line. |
| `WATCH` | 5 | A batch of watched values. |

## Mensajes

| Mensaje | Número | Acceso | Significado |
| --- | --- | --- | --- |
| `HELLO` | 0x01 | `OPEN` | Reconocer el dispositivo: versión del protocolo, tipo de enlace, carga útil máxima, capacidades, estado de la sesión. |
| `IDENTITY` | 0x02 | `OPEN` | Qué firmware es: producto, placa, ABI, descripción de E/S, tamaños. Lo que compara la verificación previa de un despliegue. |
| `STATUS` | 0x03 | `READ` | El estado del runtime y sus contadores. |
| `CHALLENGE` | 0x04 | `OPEN` | Pedir un desafío de un solo uso para abrir una sesión autenticada. |
| `LINK_STATS` | 0x05 | `OPEN` | Los contadores de este enlace: tramas y cada tipo de trama descartada. |
| `MEM_READ` | 0x10 | `READ` | Leer bytes de la memoria del PLC desde la instantánea del último ciclo. |
| `MEM_WRITE` | 0x11 | `SESSION` | Escribir un valor de varios bytes, completo respecto al ciclo: se encola y se aplica en el latch de entradas del próximo ciclo. |
| `FORCE_SET` | 0x12 | `SESSION` | Forzar un valor hasta que se borre o termine la sesión. |
| `FORCE_CLEAR` | 0x13 | `SESSION` | Borrar el forzado que empieza en una dirección. |
| `FORCE_CLEAR_ALL` | 0x14 | `SESSION` | Borrar todos los forzados. |
| `FORCE_LIST` | 0x15 | `READ` | Listar los forzados activos. |
| `SESSION_OPEN` | 0x20 | `OPEN` | Abrir la sesión. En un enlace de red la trama lleva un código bajo la clave del dispositivo y el nonce del último desafío. |
| `SESSION_CLOSE` | 0x21 | `SESSION` | Cerrar la sesión; sus forzados se liberan. |
| `KEEPALIVE` | 0x22 | `SESSION` | Mantener abierta una sesión inactiva. |
| `EVENTS_SET` | 0x23 | `READ` | Elegir qué eventos recibe este enlace. |
| `WATCH_SET` | 0x24 | `READ` | Observar direcciones: el dispositivo envía un lote de sus valores cada período y cuando uno cambia. |
| `WATCH_CLEAR` | 0x25 | `READ` | Dejar de observar. |
| `RUN` | 0x30 | `SESSION` | Iniciar el programa. |
| `STOP` | 0x31 | `SESSION` | Detener el programa; las salidas pasan a sus valores seguros. |
| `PAUSE` | 0x32 | `SESSION` | Detener el programa en el próximo límite de ciclo. |
| `RESUME` | 0x33 | `SESSION` | Continuar un programa en pausa. |
| `STEP` | 0x34 | `SESSION` | Ejecutar un ciclo de un programa en pausa. |
| `RESET` | 0x35 | `SESSION` | Restablecer el programa cargado a su estado inicial; el programa sigue cargado y detenido. |
| `BP_ADD` | 0x38 | `SESSION` | Agregar un punto de interrupción. |
| `BP_REMOVE` | 0x39 | `SESSION` | Quitar un punto de interrupción. |
| `BP_CLEAR` | 0x3A | `SESSION` | Quitar todos los puntos de interrupción. |
| `BP_LIST` | 0x3B | `READ` | Listar los puntos de interrupción. |
| `PROGRAM_BEGIN` | 0x40 | `SESSION` | Iniciar una transferencia de programa: anunciar su tamaño y CRC-32. El runtime debe estar detenido. |
| `PROGRAM_CHUNK` | 0x41 | `SESSION` | Un fragmento del programa, en su desplazamiento. Los fragmentos llegan en orden. |
| `PROGRAM_COMMIT` | 0x42 | `SESSION` | Comprobar el CRC-32, verificar el artefacto y activarlo. El runtime sigue detenido. |
| `PROGRAM_ABORT` | 0x43 | `SESSION` | Descartar una transferencia en curso. |
| `PROGRAM_INFO` | 0x44 | `READ` | Tamaño, CRC-32 y generación del programa cargado, calculados sobre lo que el dispositivo tiene. |
| `CONFIG_SET` | 0x50 | `SESSION` | Cambiar un valor de configuración. |
| `CONFIG_SAVE` | 0x51 | `SESSION` | Guardar la configuración. |
| `CONFIG_RESET` | 0x52 | `SESSION` | Restablecer la configuración a sus valores por defecto. |
| `CRED_BEGIN` | 0x58 | `SESSION` | Iniciar la subida de una credencial. |
| `CRED_CHUNK` | 0x59 | `SESSION` | Un fragmento de la credencial. |
| `CRED_COMMIT` | 0x5A | `SESSION` | Guardar la credencial. |
| `CRED_ERASE` | 0x5B | `SESSION` | Borrar una credencial. |
| `KEY_SET` | 0x60 | `SERIAL_SESSION` | Aprovisionar la clave de las sesiones autenticadas. El dispositivo nunca devuelve la clave. |
| `KEY_CLEAR` | 0x61 | `SERIAL_SESSION` | Borrar la clave; ya no son posibles las sesiones autenticadas. |

### HELLO (0x01)

Reconocer el dispositivo: versión del protocolo, tipo de enlace, carga útil máxima, capacidades, estado de la sesión. Acceso: `OPEN`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `client_version` | `u8` | The protocol version the client speaks. |
| `client_max_payload` | `u16` | The largest payload the client accepts in one frame. |

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `version` | `u8` | The protocol version of the device. |
| `transport` | `u8 (TRANSPORT)` | What the device takes this link to be. |
| `max_payload` | `u16` | The largest payload the device accepts in one frame; both sides use the smaller of the two maxima. |
| `capabilities` | `u32` | Bit mask of the capabilities of this build. |
| `session_state` | `u8 (SESSION_STATE)` | The state of the session as this link sees it. |
| `key_provisioned` | `u8` | 1 when the device holds a key for authenticated sessions. |
| `idle_timeout_s` | `u16` | Seconds of silence after which a session ends. |

### IDENTITY (0x02)

Qué firmware es: producto, placa, ABI, descripción de E/S, tamaños. Lo que compara la verificación previa de un despliegue. Acceso: `OPEN`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `abi_major` | `u16` | Major number of the bytecode ABI. |
| `abi_minor` | `u16` | Minor number of the bytecode ABI. |
| `draft_counter` | `u32` | Draft counter of the artifact contract (CMP-052). |
| `io_hash` | `u32` | Hash of the board I/O description the image was built from (IO-004). |
| `io_input_bytes` | `u16` | Bytes of the input process image. |
| `io_output_bytes` | `u16` | Bytes of the output process image. |
| `io_channels` | `u16` | Channels of the I/O description. |
| `code_size_max` | `u32` | The largest artifact the device accepts. |
| `work_size` | `u32` | Bytes of WORK memory. |
| `retain_size` | `u32` | Bytes of RETAIN memory. |
| `ipi_size` | `u32` | Bytes of the input image. |
| `opi_size` | `u32` | Bytes of the output image. |
| `product_version` | `str:24` | The product version of the firmware. |
| `board` | `str:32` | The board the firmware was built for. |
| `board_profile` | `str:40` | The Zephyr board target of the build (or posix for the simulator). |
| `io_board_id` | `str:32` | The identifier of the board I/O description. |

### STATUS (0x03)

El estado del runtime y sus contadores. Acceso: `READ`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state of the runtime. |
| `fault` | `u8 (FAULT)` | Why the runtime is in FAULT, or NONE. |
| `program_loaded` | `u8` | 1 when a program is loaded. |
| `forces` | `u8` | Number of active forces. |
| `cycles` | `u32` | Scans completed since the program started. |
| `overruns` | `u32` | Deadline misses counted. |
| `program_size` | `u32` | Bytes of the loaded artifact. |
| `program_generation` | `u32` | Increases every time a program is activated. |
| `uptime_ms` | `u32` | Milliseconds since the device started. |

### CHALLENGE (0x04)

Pedir un desafío de un solo uso para abrir una sesión autenticada. Acceso: `OPEN`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `nonce` | `bytes:16` | A number the device will accept once, in the next ten seconds. |

### LINK_STATS (0x05)

Los contadores de este enlace: tramas y cada tipo de trama descartada. Acceso: `OPEN`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `frames_in` | `u32` | Valid frames received. |
| `frames_out` | `u32` | Frames sent. |
| `crc_errors` | `u32` | Candidate frames whose checksum did not match. |
| `resyncs` | `u32` | Times the decoder discarded bytes to find the next frame. |
| `version_errors` | `u32` | Frames of another protocol version. |
| `oversize` | `u32` | Frames that announced a payload above the limit. |
| `auth_drops` | `u32` | Frames dropped for a missing or wrong authentication code. |
| `replay_drops` | `u32` | Frames dropped for a sequence number already seen. |
| `order_drops` | `u32` | Frames dropped for a sequence number ahead of the expected one. |
| `events_sent` | `u32` | Events sent on this link. |
| `events_dropped` | `u32` | Events lost because the queue was full. |
| `sessions_opened` | `u32` | Sessions opened on this link. |

### MEM_READ (0x10)

Leer bytes de la memoria del PLC desde la instantánea del último ciclo. Acceso: `READ`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `address` | `u16` | The first address. |
| `length` | `u16` | The number of bytes; the extent has to lie inside one region. |

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `data` | `tail` | The bytes. |

### MEM_WRITE (0x11)

Escribir un valor de varios bytes, completo respecto al ciclo: se encola y se aplica en el latch de entradas del próximo ciclo. Acceso: `SESSION`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `address` | `u16` | The first address; the extent has to lie inside one writable region. |
| `data` | `tail` | The value, in memory order. |

**Respuesta** (después del byte de estado)

sin campos

### FORCE_SET (0x12)

Forzar un valor hasta que se borre o termine la sesión. Acceso: `SESSION`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `address` | `u16` | The first address. |
| `data` | `tail` | The forced bytes. |

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `forces` | `u8` | Active forces afterwards. |

### FORCE_CLEAR (0x13)

Borrar el forzado que empieza en una dirección. Acceso: `SESSION`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `address` | `u16` | The first address of the force. |

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `forces` | `u8` | Active forces afterwards. |

### FORCE_CLEAR_ALL (0x14)

Borrar todos los forzados. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

sin campos

### FORCE_LIST (0x15)

Listar los forzados activos. Acceso: `READ`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `count` | `u8` | Number of entries. |
| `entries` | `tail` | For each entry: address (u16), size (u16), then size bytes. |

### SESSION_OPEN (0x20)

Abrir la sesión. En un enlace de red la trama lleva un código bajo la clave del dispositivo y el nonce del último desafío. Acceso: `OPEN`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `flags` | `u8` | Bit 0: take over a session that is open on another link (the serial link only). |
| `client_nonce` | `bytes:16` | A number the client picks; it goes into the session key. |
| `device_nonce` | `bytes:16` | The nonce of the challenge the device issued; zero on a serial link. |
| `name` | `str:16` | A name for the client, shown to a person at the device. |

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `session_id` | `u32` | The number of the session. |
| `idle_timeout_s` | `u16` | Seconds of silence after which the session ends. |
| `authenticated` | `u8` | 1 when the frames of the session carry a code. |

### SESSION_CLOSE (0x21)

Cerrar la sesión; sus forzados se liberan. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `forces_released` | `u8` | Forces that ended with the session. |

### KEEPALIVE (0x22)

Mantener abierta una sesión inactiva. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `remaining_s` | `u16` | Seconds left before the session would end. |

### EVENTS_SET (0x23)

Elegir qué eventos recibe este enlace. Acceso: `READ`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `mask` | `u32` | Bit mask of the events wanted (see the event mask). |

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `mask` | `u32` | The mask in force: the events of this build only. |

### WATCH_SET (0x24)

Observar direcciones: el dispositivo envía un lote de sus valores cada período y cuando uno cambia. Acceso: `READ`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `period_ms` | `u16` | Milliseconds between batches; 0 sends a batch only when a value changed. |
| `entries` | `tail` | For each entry: address (u16), length (u8). At most eight entries. |

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `count` | `u8` | Entries accepted. |

### WATCH_CLEAR (0x25)

Dejar de observar. Acceso: `READ`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

sin campos

### RUN (0x30)

Iniciar el programa. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state afterwards. |

### STOP (0x31)

Detener el programa; las salidas pasan a sus valores seguros. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state afterwards. |

### PAUSE (0x32)

Detener el programa en el próximo límite de ciclo. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state afterwards. |

### RESUME (0x33)

Continuar un programa en pausa. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state afterwards. |

### STEP (0x34)

Ejecutar un ciclo de un programa en pausa. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state afterwards. |

### RESET (0x35)

Restablecer el programa cargado a su estado inicial; el programa sigue cargado y detenido. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state afterwards. |

### BP_ADD (0x38)

Agregar un punto de interrupción. Acceso: `SESSION`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `pc` | `u16` | The program counter. |

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `count` | `u8` | Breakpoints afterwards. |

### BP_REMOVE (0x39)

Quitar un punto de interrupción. Acceso: `SESSION`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `pc` | `u16` | The program counter. |

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `count` | `u8` | Breakpoints afterwards. |

### BP_CLEAR (0x3A)

Quitar todos los puntos de interrupción. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

sin campos

### BP_LIST (0x3B)

Listar los puntos de interrupción. Acceso: `READ`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `count` | `u8` | Number of breakpoints. |
| `pcs` | `tail` | The program counters, u16 each. |

### PROGRAM_BEGIN (0x40)

Iniciar una transferencia de programa: anunciar su tamaño y CRC-32. El runtime debe estar detenido. Acceso: `SESSION`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `size` | `u32` | Bytes of the artifact. |
| `crc32` | `u32` | CRC-32 of the artifact. |

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `chunk_max` | `u16` | The largest chunk the device takes in one frame. |

### PROGRAM_CHUNK (0x41)

Un fragmento del programa, en su desplazamiento. Los fragmentos llegan en orden. Acceso: `SESSION`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `offset` | `u32` | Where the chunk starts; it must be the number of bytes received so far. |
| `data` | `tail` | The bytes. |

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `received` | `u32` | Bytes received so far. |

### PROGRAM_COMMIT (0x42)

Comprobar el CRC-32, verificar el artefacto y activarlo. El runtime sigue detenido. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `size` | `u32` | Bytes of the stored program, read back. |
| `crc32` | `u32` | CRC-32 of the stored program, computed over what the device holds. |
| `generation` | `u32` | The program generation after the activation. |

### PROGRAM_ABORT (0x43)

Descartar una transferencia en curso. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

sin campos

### PROGRAM_INFO (0x44)

Tamaño, CRC-32 y generación del programa cargado, calculados sobre lo que el dispositivo tiene. Acceso: `READ`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

| Campo | Tipo | Significado |
| --- | --- | --- |
| `loaded` | `u8` | 1 when a program is loaded. |
| `size` | `u32` | Bytes of the loaded program. |
| `crc32` | `u32` | CRC-32 of the loaded program. |
| `generation` | `u32` | The program generation. |

### CONFIG_SET (0x50)

Cambiar un valor de configuración. Acceso: `SESSION`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `key` | `str:24` | The name of the setting. |
| `value` | `tail` | The value, as text. |

**Respuesta** (después del byte de estado)

sin campos

### CONFIG_SAVE (0x51)

Guardar la configuración. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

sin campos

### CONFIG_RESET (0x52)

Restablecer la configuración a sus valores por defecto. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

sin campos

### CRED_BEGIN (0x58)

Iniciar la subida de una credencial. Acceso: `SESSION`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `kind` | `u8 (CREDENTIAL)` | Which credential. |
| `size` | `u16` | Bytes of the credential. |

**Respuesta** (después del byte de estado)

sin campos

### CRED_CHUNK (0x59)

Un fragmento de la credencial. Acceso: `SESSION`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `data` | `tail` | The bytes. |

**Respuesta** (después del byte de estado)

sin campos

### CRED_COMMIT (0x5A)

Guardar la credencial. Acceso: `SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

sin campos

### CRED_ERASE (0x5B)

Borrar una credencial. Acceso: `SESSION`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `kind` | `u8 (CREDENTIAL)` | Which credential. |

**Respuesta** (después del byte de estado)

sin campos

### KEY_SET (0x60)

Aprovisionar la clave de las sesiones autenticadas. El dispositivo nunca devuelve la clave. Acceso: `SERIAL_SESSION`.

**Solicitud**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `key` | `bytes:32` | The 256-bit key. |

**Respuesta** (después del byte de estado)

sin campos

### KEY_CLEAR (0x61)

Borrar la clave; ya no son posibles las sesiones autenticadas. Acceso: `SERIAL_SESSION`.

**Solicitud**

sin campos

**Respuesta** (después del byte de estado)

sin campos

## Eventos

| Evento | Número | Bit de máscara | Campos | Significado |
| --- | --- | --- | --- | --- |
| `EVT_STATUS` | 0x80 | `STATUS` | `state` (`u8`), `fault` (`u8`), `cycles` (`u32`) | El estado del runtime cambió. |
| `EVT_FAULT` | 0x81 | `FAULT` | `fault` (`u8`), `task` (`u8`), `code` (`u16`) | Se enclavó una falla. |
| `EVT_BREAKPOINT` | 0x82 | `BREAKPOINT` | `task` (`u8`), `pc` (`u16`) | La ejecución se detuvo en un punto de interrupción. |
| `EVT_FORCE` | 0x83 | `FORCE` | `change` (`u8`), `address` (`u16`), `forces` (`u8`) | Se fijó, borró o liberó un forzado. |
| `EVT_LOG` | 0x84 | `LOG` | `level` (`u8`), `text` (`tail`) | Una línea de registro del dispositivo. |
| `EVT_WATCH` | 0x85 | `WATCH` | `cycle` (`u32`), `data` (`tail`) | Un lote de valores observados, tomados de un mismo ciclo. |
| `EVT_SESSION_END` | 0x86 | siempre | `reason` (`u8`), `forces_released` (`u8`) | La sesión terminó. Siempre se envía al enlace que la tenía. |
| `EVT_DROPPED` | 0x87 | siempre | `count` (`u32`) | Se perdieron eventos porque la cola estaba llena. Se envía cuando vuelve a haber espacio. |

{/* <<< END GENERATED: reference/device-protocol <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
