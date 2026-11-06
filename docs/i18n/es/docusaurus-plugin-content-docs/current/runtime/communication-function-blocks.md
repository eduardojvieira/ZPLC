---
slug: /runtime/communication-function-blocks
id: communication-function-blocks
title: Bloques de función de comunicación
sidebar_label: FB de comunicación
description: Los doce bloques de comunicación y de nube, su único handshake, sus límites de tiempo y la evidencia de cada uno.
---

# Bloques de función de comunicación

Use estos bloques cuando su programa IEC 61131-3 deba hablar con un dispositivo de campo, un broker o un servicio de nube. Son doce y comparten un solo handshake. Un bloque nunca espera a la red dentro del ciclo. Entrega el trabajo a un hilo propio, informa `BUSY` e informa el resultado en un ciclo posterior.

## El handshake

Todos los bloques empiezan con los mismos cinco pines.

| Pin      | Dirección | Significado                                               |
| -------- | --------- | --------------------------------------------------------- |
| `EN`     | Entrada   | Un flanco de subida inicia una solicitud.                 |
| `BUSY`   | Salida    | `TRUE` desde la solicitud hasta su resultado.             |
| `DONE`   | Salida    | `TRUE` cuando la solicitud terminó sin error.             |
| `ERROR`  | Salida    | `TRUE` cuando la solicitud falló; `STATUS` dice por qué.  |
| `STATUS` | Salida    | El código de estado de la última solicitud.               |

Un **bloque de solicitud** hace una solicitud por cada flanco de subida de `EN`: los cuatro bloques Modbus, `MQTT_PUBLISH`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV` y `SPB_REBIRTH`. Un **bloque de servicio** informa un estado en cada ciclo: `MQTT_CONNECT`, `MQTT_SUBSCRIBE` y `AZURE_C2D_RECV`.

### Bloques de solicitud

```text
scan      1  2  3  4  5  6  7  8  9 10 11 12
EN        0  1  1  1  1  1  1  1  0  0  1  1
BUSY      0  1  1  1  0  0  0  0  0  0  1  1     the request, from the scan EN rose in
DONE      0  0  0  0  1  1  1  1  0  0  0  0     the result, held while EN stays TRUE
ERROR     0  0  0  0  0  0  0  0  0  0  0  0     (a failed request holds ERROR instead of DONE)
STATUS    0  1  1  1  0  0  0  0  0  0  1  1     1 while BUSY, then the code of the result
handler   .  S  p  p  R  .  .  .  .  .  S  p     S start, p poll that is still pending, R poll with the result
```

Los valores son los que lee el programa después de llamar al bloque en ese ciclo. Del ciclo 6 al 8 el resultado se mantiene y no se llama al manejador.

- **Un flanco de subida, una solicitud.** Mientras `EN` sigue en `TRUE` después del resultado, el resultado se mantiene y nada se repite. Un `EN` sostenido no envía un segundo mensaje, no aprovisiona por segunda vez ni escribe un segundo valor. Para pedir de nuevo, deje que `EN` baje al menos un ciclo y súbalo otra vez.
- **Una solicitud en curso termina.** Si `EN` baja mientras `BUSY` es `TRUE`, la solicitud igual termina y su resultado se muestra durante un ciclo, así que un pulso de un ciclo sirve como disparador. Un flanco de subida mientras `BUSY` es `TRUE` no inicia nada.
- **`EN` en `FALSE` borra `DONE` y `ERROR`.** `STATUS` conserva el código de la última solicitud hasta que empiece la siguiente.
- **`COMM_RESET` devuelve el bloque a reposo.** `EN`, `BUSY`, `DONE`, `ERROR` y `STATUS` pasan a 0, una solicitud pendiente se suelta y su resultado tardío se descarta en lugar de llegar al siguiente bloque que pida.
- **El resultado puede llegar en el mismo ciclo** del flanco de subida, sin `BUSY` alguno, cuando la solicitud no necesita espera.
- **Llame al bloque en cada ciclo.** Solo avanza cuando se lo llama.

### Bloques de servicio

El manejador de un bloque de servicio se ejecuta en cada ciclo mientras `EN` es `TRUE`, y su respuesta es el estado del bloque:

| Estado                                                     | `BUSY`  | `DONE`  | `ERROR` | `STATUS`  |
| ---------------------------------------------------------- | ------- | ------- | ------- | --------- |
| Aún no alcanzado (conectando, suscribiendo)                | `TRUE`  | `FALSE` | `FALSE` | 1         |
| Alcanzado (la sesión está arriba, la suscripción se mantiene) | `FALSE` | `TRUE`  | `FALSE` | 0         |
| Perdido o no disponible                                    | `FALSE` | `FALSE` | `TRUE`  | el código |

Cuando `EN` baja, `BUSY`, `DONE` y `ERROR` se borran, y un `PAYLOAD` recibido se va con ellos. `VALID` de `MQTT_SUBSCRIBE` y `AZURE_C2D_RECV` es `TRUE` durante exactamente un ciclo, el ciclo en que un mensaje es nuevo, y `PAYLOAD` conserva el último mensaje.

### Códigos de estado

| `STATUS` | Nombre                    | Significado                                                                                      |
| -------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| 0        | OK                        | La solicitud terminó.                                                                            |
| 1        | Ocupado                   | La solicitud está en curso.                                                                      |
| 2        | Tiempo agotado            | El par no respondió, o la solicitud superó su límite de tiempo.                                  |
| 3        | Sin manejador             | Este runtime no tiene manejador para el bloque.                                                  |
| 4        | No conectado              | No hay conexión con el par.                                                                      |
| 5        | Cola llena                | Todas las ranuras de solicitud están en uso.                                                     |
| 6        | Dirección no válida       | Un pin tiene un valor con el que no se puede hacer la solicitud.                                 |
| 7        | Desbordamiento de cadena  | Una cadena es más larga de lo que el mensaje puede llevar.                                       |
| 8        | Error de protocolo        | El par respondió algo que el protocolo no permite, o con un error.                               |
| 9        | Autenticación fallida     | El par rechazó las credenciales.                                                                 |
| 10       | No disponible             | El servicio del bloque no está disponible en este runtime, o está apagado en la configuración.   |

## Límites de tiempo

| Qué                                                 | Límite                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Una llamada de un bloque en el ciclo                | Toma un candado que se mantiene unas pocas instrucciones y encola la solicitud. Nunca espera a la red, a un socket ni a una flash.                                                                                                                                                                     |
| Una solicitud Modbus                                | El cliente espera como máximo el doble del tiempo límite configurado (para conectar y luego para la respuesta). El bloque informa `ERROR` con `STATUS` 2 a más tardar `(2 x tiempo límite + 100 ms) x 8` después de la solicitud, que son 8,8 s con el tiempo límite por defecto de 500 ms.                |
| `MQTT_PUBLISH`, `AZURE_EG_PUB`, `SPB_REBIRTH`       | El hilo del cliente envía el mensaje en una pasada de su bucle; `ERROR` con `STATUS` 2 a los 5 s.                                                                                                                                                                                                      |
| Un aprovisionamiento (`AZURE_DPS_PROV`, `AWS_FLEET_PROV`) | El servicio espera al broker 30 s en cada paso; `ERROR` con `STATUS` 2 a los 90 s.                                                                                                                                                                                                              |
| Pérdida de la sesión con el broker                  | `MQTT_CONNECT`, `MQTT_SUBSCRIBE` y `AZURE_C2D_RECV` informan `ERROR` con `STATUS` 4 (o el código de la falla) en el ciclo posterior a que el cliente lo nota: de inmediato en una conexión cerrada o reiniciada, dentro del intervalo de keep-alive en una pérdida silenciosa. Un mensaje encolado que aún no se envió se marca como fallido y no se envía en la sesión siguiente. |
| Reconexión                                          | Un intento a la vez. El cliente espera hasta 5 s la respuesta del broker, luego espera 2 s, duplicando hasta 60 s, antes del intento siguiente.                                                                                                                                                        |

## Los doce bloques

### Modbus

Estos bloques leen y escriben un dispositivo remoto sin mapeo automático implícito. `COUNT` es 1: una solicitud de más registros o bobinas se rechaza con `STATUS` 6.

- `MB_READ_HREG` lee registros de retención (código de función 3). `VALUE` es el registro leído.
- `MB_WRITE_HREG` escribe un registro de retención (código de función 6). `VALUE` es el valor escrito.
- `MB_READ_COIL` lee bobinas (código de función 1). `VALUE` es la bobina leída.
- `MB_WRITE_COIL` escribe una bobina (código de función 5). `VALUE` es el valor escrito.

`PROTO` es 0 para RTU y 1 para TCP. Para TCP, `HOST` y `PORT` son obligatorios, con `PORT` distinto de 0. `SLAVE_ID` va de 0 a 255.

### MQTT

- `MQTT_CONNECT` informa el estado de la sesión MQTT que abre la configuración del dispositivo. `CONNECTED` es `TRUE` mientras está arriba. El bloque no abre la sesión.
- `MQTT_PUBLISH` publica `PAYLOAD` en `TOPIC` una vez por cada flanco de subida. `DONE` significa que el cliente aceptó el mensaje para enviarlo. No se espera el acuse de un mensaje QoS 1 o 2.
- `MQTT_SUBSCRIBE` mantiene una suscripción a `TOPIC` y entrega sus mensajes en `PAYLOAD`, con `VALID` durante un ciclo cada uno.

### Nube

- `AZURE_C2D_RECV` recibe mensajes de nube a dispositivo de Azure (el perfil Azure IoT Hub con mensajes de nube a dispositivo activados).
- `AZURE_DPS_PROV` se registra en el Azure Device Provisioning Service. `ASSIGNED_HUB` es el hub asignado, y un `DEVICE_ID` no vacío es el identificador de registro usado.
- `AZURE_EG_PUB` publica un evento en un tema de Azure Event Grid (el perfil Event Grid). Un `TOPIC` o `EVENT_TYPE` vacío significa el valor configurado por defecto.
- `AWS_FLEET_PROV` ejecuta el aprovisionamiento de flota de AWS IoT. `THING_NAME` es el objeto registrado, y un `TEMPLATE_NAME` no vacío es la plantilla usada.
- `SPB_REBIRTH` pide a la sesión Sparkplug B que publique de nuevo su certificado de nacimiento (el perfil Sparkplug B).

El compilador registra los doce, así que puede instanciarlos en texto estructurado. No se verificó para esta versión si los editores de diagrama de escalera y de diagrama de bloques de función ofrecen cada bloque.

## En simulación

El runtime nativo que manejan la simulación y la línea de comandos ejecuta los mismos manejadores Modbus y MQTT que un controlador. Usa un cliente Modbus TCP y un cliente MQTT 3.1.1 del anfitrión (TCP simple). Permanece apagado hasta que la sesión lo pide: un runtime iniciado a la manera antigua responde `STATUS` 3 en todos los bloques.

| Entorno del runtime                 | Significado                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ZPLC_NATIVE_COMM=1`                | Enciende los bloques de comunicación.                                                                          |
| `ZPLC_NATIVE_MQTT_BROKER=host:port` | El broker que usan `MQTT_CONNECT`, `MQTT_PUBLISH` y `MQTT_SUBSCRIBE`. Sin él responden `STATUS` 10.            |
| `ZPLC_NATIVE_MODBUS_TIMEOUT_MS`     | El tiempo que una solicitud Modbus espera para conectar y de nuevo para la respuesta. 500 por defecto.         |

La aplicación de ZPLC y `zplc-cli test` inician los pares por usted. Una sesión que inician define `ZPLC_NATIVE_COMM=1` y `ZPLC_NATIVE_LOOPBACK=1`, y el runtime arranca entonces, dentro de su propio proceso en 127.0.0.1, un servidor Modbus TCP (1024 registros de retención y 1024 bobinas) y un broker MQTT. Terminan con la sesión y no necesitan un broker instalado, Python ni red. Toda solicitud Modbus TCP de un programa llega a ese servidor sin importar el host y el puerto que nombre el bloque, porque una simulación no tiene planta. Los bloques MQTT usan ese broker, y un broker nombrado en el entorno de la aplicación se ignora. La consola de la sesión dice qué extremos corren.

Si un extremo no puede arrancar, los doce bloques responden `STATUS` 10 ("no disponible en simulación"), la capacidad `communication-endpoints` de la sesión dice `unavailable` y ningún bloque informa éxito sin actuar. Una solicitud Modbus por RTU (no hay dispositivo serie) y todo bloque de nube (no hay servicio) responden `STATUS` 10 en simulación. `zplc_loopback`, que se compila con el runtime, es el mismo par de extremos como programa aparte para pruebas: imprime sus puertos en una línea de JSON y termina cuando se cierra su entrada estándar.

## Contra qué se verificó cada bloque

Ningún bloque se ejecutó contra un servicio real, y verificar uno no exige una suscripción de pago. La evidencia de cada bloque es de uno o dos tipos. La evidencia del **manejador** cubre los pines, el handshake, los códigos de estado y la entrega a un trabajador, con el cliente reemplazado por un sustituto que responde lo que la prueba indica. La evidencia del **doble de protocolo** ejecuta el bloque contra un servidor escrito para la prueba que habla el protocolo en un socket de loopback. Un doble local muestra cómo se comportan el bloque y el protocolo. No muestra que un dispositivo, broker o servicio de nube reales acepten el intercambio.

| Bloque                                                           | Manejador | Doble de protocolo                                                                                                                                                                                                                                                                                                                                                                  | Servicio real |
| ---------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL`, `MB_WRITE_COIL` | Sí        | Modbus TCP: el código de transacción del cliente es un solo archivo compilado en el controlador y en el runtime de simulación, y corre contra un servidor en loopback en ambos (`native_sim` y anfitrión). Casos: éxito, una respuesta en partes, excepción, silencio, una conexión cerrada, un puerto rechazado, reinicio con el bloque ocupado. RTU: solo se comprueban los parámetros de la interfaz; no se usa ningún dispositivo serie | No            |
| `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE`                 | Sí        | El cliente MQTT del runtime de simulación contra un broker en loopback: sesión, publicación, suscripción, pérdida de la sesión, reconexión, pérdida silenciosa. El cliente del controlador (`zplc_mqtt.c`, el archivo que ejecuta una placa) también corre en `native_sim` contra un broker escrito para la prueba: sesión, publicación una vez por solicitud, suscripción y mensaje, sin `CONNACK`, conexión rechazada, sesión perdida, reinicio con el bloque ocupado | No            |
| `AZURE_C2D_RECV`, `AZURE_EG_PUB`, `SPB_REBIRTH`                  | Sí        | El cliente del controlador en `native_sim` contra el mismo broker, con el perfil de cada servicio: un mensaje de nube a dispositivo, un mensaje de Event Grid y un `NBIRTH` por solicitud, `STATUS` 10 bajo un perfil que no ofrece el servicio, `NOT_CONNECTED` sin sesión, reinicio con el bloque ocupado. El intercambio con el servicio real de Azure o Sparkplug no se prueba | No            |
| `AZURE_DPS_PROV`, `AWS_FLEET_PROV`                               | Sí, con el servicio de aprovisionamiento reemplazado por uno que espera | Ninguno en el conjunto de pruebas. `tools/connectivity/` tiene scripts que responden en un broker que usted ejecuta, usados a mano | No            |
