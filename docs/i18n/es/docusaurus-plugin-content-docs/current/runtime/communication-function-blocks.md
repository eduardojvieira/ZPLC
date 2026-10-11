---
slug: /runtime/communication-function-blocks
id: communication-function-blocks
title: Bloques de Función de Comunicación
sidebar_label: FBs de Comunicación
description: Los doce bloques de comunicación y de nube, su único handshake, sus límites de tiempo y contra qué se verificó cada uno.
---

# Bloques de Función de Comunicación

ZPLC ofrece doce bloques de función que hablan con dispositivos de campo, brokers y servicios de nube desde tu lógica IEC 61131-3. Comparten un solo handshake. Un bloque nunca espera a la red dentro del ciclo: entrega el trabajo a un hilo propio, informa `BUSY` e informa el resultado en un ciclo posterior.

## El handshake

Todos los bloques empiezan con los mismos cinco pines.

| Pin | Dirección | Significado |
| --- | --- | --- |
| `EN` | Entrada | Un flanco ascendente inicia una solicitud. |
| `BUSY` | Salida | `TRUE` desde la solicitud hasta su resultado. |
| `DONE` | Salida | `TRUE` cuando la solicitud terminó sin error. |
| `ERROR` | Salida | `TRUE` cuando la solicitud falló; `STATUS` dice por qué. |
| `STATUS` | Salida | El código de estado de la última solicitud. |

Un bloque que hace **una solicitud por cada flanco ascendente de `EN`** es un bloque de solicitud: los cuatro bloques Modbus, `MQTT_PUBLISH`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV` y `SPB_REBIRTH`. Un bloque que **informa un estado en cada ciclo** es un bloque de servicio: `MQTT_CONNECT`, `MQTT_SUBSCRIBE` y `AZURE_C2D_RECV`.

### Bloques de solicitud

```text
ciclo     1  2  3  4  5  6  7  8  9 10 11 12
EN        0  1  1  1  1  1  1  1  0  0  1  1
BUSY      0  1  1  1  0  0  0  0  0  0  1  1     la solicitud, desde el ciclo en que EN subió
DONE      0  0  0  0  1  1  1  1  0  0  0  0     el resultado, retenido mientras EN sigue en TRUE
ERROR     0  0  0  0  0  0  0  0  0  0  0  0     (una solicitud fallida retiene ERROR en lugar de DONE)
STATUS    0  1  1  1  0  0  0  0  0  0  1  1     1 mientras BUSY, luego el código del resultado
handler   .  S  p  p  R  .  .  .  .  .  S  p     S inicio, p consulta aún pendiente, R consulta con el resultado
```

Los valores son los que el programa lee después de la llamada del bloque en ese ciclo. Del ciclo 6 al 8 el resultado se retiene y el manejador no se llama.

- **Un flanco ascendente, una solicitud.** Mientras `EN` sigue en `TRUE` después del resultado, el resultado se retiene y nada se repite: un `EN` retenido no envía un segundo mensaje, no aprovisiona por segunda vez ni escribe un segundo valor. Para hacer otra solicitud, deja que `EN` baje al menos un ciclo y vuelve a subirlo.
- **Una solicitud en curso se completa.** Si `EN` baja mientras `BUSY` es `TRUE`, la solicitud igual termina y su resultado se muestra durante un ciclo. Un disparo de un solo ciclo funciona. Un flanco ascendente mientras `BUSY` es `TRUE` no inicia nada.
- **`EN` en `FALSE` borra `DONE` y `ERROR`.** `STATUS` conserva el código de la última solicitud hasta que empieza la siguiente.
- **Un reset (`COMM_RESET`) devuelve el bloque a reposo**: `EN`, `BUSY`, `DONE`, `ERROR` y `STATUS` valen 0, una solicitud pendiente se suelta y su resultado tardío se descarta, no se entrega al próximo bloque que pida.
- **El resultado puede llegar en el mismo ciclo** del flanco ascendente, sin `BUSY`, cuando la solicitud no necesita espera.
- **Llama al bloque en cada ciclo.** El bloque avanza solo cuando se lo llama.

### Bloques de servicio

El manejador de un bloque de servicio se llama en cada ciclo mientras `EN` es `TRUE` y su respuesta es el estado del bloque:

| Estado | `BUSY` | `DONE` | `ERROR` | `STATUS` |
| --- | --- | --- | --- | --- |
| Aún no alcanzado (conectando, suscribiendo) | `TRUE` | `FALSE` | `FALSE` | 1 |
| Alcanzado (la sesión está activa, la suscripción se mantiene) | `FALSE` | `TRUE` | `FALSE` | 0 |
| Perdido o no disponible | `FALSE` | `FALSE` | `TRUE` | el código |

Cuando `EN` baja, `BUSY`, `DONE` y `ERROR` se borran y un `PAYLOAD` recibido se va con ellos. `VALID` de `MQTT_SUBSCRIBE` y `AZURE_C2D_RECV` es `TRUE` durante exactamente un ciclo, el ciclo en que un mensaje es nuevo; `PAYLOAD` conserva el último mensaje.

### Códigos de estado

| `STATUS` | Nombre | Significado |
| --- | --- | --- |
| 0 | OK | La solicitud terminó. |
| 1 | Ocupado | La solicitud está en curso. |
| 2 | Tiempo agotado | El par no respondió, o la solicitud superó su límite de tiempo. |
| 3 | Sin manejador | Este runtime no tiene manejador para el bloque. |
| 4 | Sin conexión | No hay conexión con el par. |
| 5 | Cola llena | Todas las ranuras de solicitud están en uso. |
| 6 | Dirección inválida | Un pin tiene un valor con el que no se puede hacer la solicitud. |
| 7 | Desborde de cadena | Una cadena es más larga de lo que el mensaje puede llevar. |
| 8 | Error de protocolo | El par respondió algo que el protocolo no permite, o con un error. |
| 9 | Autenticación fallida | El par rechazó las credenciales. |
| 10 | No disponible | El servicio del bloque no está disponible en este runtime, o está apagado en la configuración. |

## Límites de tiempo

| Qué | Límite |
| --- | --- |
| Una llamada de un bloque en el ciclo | Toma un bloqueo retenido unas pocas instrucciones y encola la solicitud. Nunca espera a la red, a un socket ni a una flash. |
| Una solicitud Modbus | El cliente espera como máximo el doble del tiempo configurado (para conectar y luego por la respuesta); el bloque informa `ERROR` con `STATUS` 2 a más tardar `(2 x tiempo + 100 ms) x 8` después de la solicitud, es decir 8,8 s con el tiempo por defecto de 500 ms. |
| `MQTT_PUBLISH`, `AZURE_EG_PUB`, `SPB_REBIRTH` | El hilo del cliente envía el mensaje en una pasada de su bucle; `ERROR` con `STATUS` 2 a los 5 s. |
| Un aprovisionamiento (`AZURE_DPS_PROV`, `AWS_FLEET_PROV`) | El servicio espera al broker 30 s en cada paso; `ERROR` con `STATUS` 2 a los 90 s. |
| Pérdida de la sesión con el broker | `MQTT_CONNECT`, `MQTT_SUBSCRIBE` y `AZURE_C2D_RECV` informan `ERROR` con `STATUS` 4 (o el código del fallo) en el ciclo siguiente a que el cliente lo nota: de inmediato si la conexión se cierra o se reinicia, y dentro del intervalo de keep-alive si la pérdida es silenciosa. Un mensaje que estaba en cola y no se había enviado se falla, no se envía en la sesión siguiente. |
| Reconexión | Un intento a la vez. El cliente espera hasta 5 s la respuesta del broker y luego espera 2 s, duplicando hasta 60 s, antes del intento siguiente. |

## Bloques de función soportados

### Comunicaciones Modbus

Se usan para interactuar con dispositivos de campo sin un mapeo implícito. `COUNT` es 1: una solicitud de más registros o bobinas se rechaza con `STATUS` 6.

- `MB_READ_HREG`: leer registros de retención (código de función 3); `VALUE` es el registro leído.
- `MB_WRITE_HREG`: escribir un registro de retención (código de función 6); `VALUE` es el valor escrito.
- `MB_READ_COIL`: leer bobinas (código de función 1); `VALUE` es la bobina leída.
- `MB_WRITE_COIL`: escribir una bobina (código de función 5); `VALUE` es el valor escrito.

`PROTO` es 0 para RTU y 1 para TCP; para TCP `HOST` y `PORT` son obligatorios, con `PORT` distinto de 0. `SLAVE_ID` va de 0 a 255.

### Mensajería MQTT

- `MQTT_CONNECT`: informa el estado de la sesión MQTT que abre la configuración del dispositivo (`CONNECTED` es `TRUE` mientras está activa). No abre la sesión.
- `MQTT_PUBLISH`: publica `PAYLOAD` en `TOPIC` una vez por cada flanco ascendente. `DONE` significa que el cliente aceptó el mensaje para enviarlo; no espera la confirmación de un mensaje QoS 1 o 2.
- `MQTT_SUBSCRIBE`: mantiene una suscripción a `TOPIC` y entrega sus mensajes en `PAYLOAD`, con `VALID` durante un ciclo por cada uno.

### Wrappers de integración en la nube

- `AZURE_C2D_RECV`: recibe mensajes de la nube al dispositivo de Azure (el perfil Azure IoT Hub con mensajes de la nube al dispositivo habilitados).
- `AZURE_DPS_PROV`: registro en el Servicio de aprovisionamiento de dispositivos de Azure; `ASSIGNED_HUB` es el hub asignado. Un `DEVICE_ID` no vacío es el identificador de registro que se usa en la solicitud.
- `AZURE_EG_PUB`: publica un evento en un tema de Azure Event Grid (el perfil Event Grid). Un `TOPIC` o `EVENT_TYPE` vacío es el valor por defecto configurado.
- `AWS_FLEET_PROV`: aprovisionamiento de flota de AWS IoT; `THING_NAME` es el objeto que se registró. Un `TEMPLATE_NAME` no vacío es la plantilla que se usa en la solicitud.
- `SPB_REBIRTH`: pide a la sesión Sparkplug B que publique de nuevo su certificado de nacimiento (el perfil Sparkplug B).

## En simulación

El runtime nativo que manejan la simulación y la línea de comandos ejecuta los mismos manejadores Modbus y MQTT que un controlador, sobre un cliente Modbus TCP y un cliente MQTT 3.1.1 del host (TCP plano). Está apagado hasta que la sesión lo pide: un runtime que se inicia como siempre responde a todo bloque `STATUS` 3 (sin manejador), como antes.

| Entorno del runtime | Significado |
| --- | --- |
| `ZPLC_NATIVE_COMM=1` | Enciende los bloques de comunicación. |
| `ZPLC_NATIVE_MQTT_BROKER=host:puerto` | El broker que usan `MQTT_CONNECT`, `MQTT_PUBLISH` y `MQTT_SUBSCRIBE`. Sin él responden `STATUS` 10. |
| `ZPLC_NATIVE_MODBUS_TIMEOUT_MS` | El tiempo que una solicitud Modbus espera para conectar y, otra vez, por la respuesta. 500 por defecto. |

Los pares son los extremos de loopback: `zplc_loopback`, que se compila con el runtime, inicia un servidor Modbus TCP (1024 registros de retención y 1024 bobinas) y un broker MQTT en 127.0.0.1, imprime sus puertos como una línea de JSON y termina cuando se cierra su entrada estándar. Una solicitud Modbus por RTU (no hay dispositivo serie) y todo bloque de un servicio de nube (no hay servicio) responden `STATUS` 10 en simulación. **Studio todavía no inicia los extremos por ti:** la sesión debe iniciarse con el entorno de arriba, y los extremos los inicia quien la inicia.

## Contra qué se verificó cada bloque

Ningún bloque se verificó contra un servicio real, y verificar uno no necesita una suscripción de pago. La verificación de cada bloque es de uno o dos tipos: el **manejador** (los pines, el handshake, los códigos de estado y la entrega a un trabajador, con el cliente reemplazado por un sustituto que responde lo que dice la prueba) y un **doble de protocolo** (el bloque contra un servidor escrito para la prueba que habla el protocolo por un socket de loopback). Un doble local prueba el comportamiento del bloque y del protocolo. No prueba que un dispositivo, un broker o un servicio de nube reales acepten el intercambio.

| Bloque | Manejador | Doble de protocolo | Servicio real |
| --- | --- | --- | --- |
| `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL`, `MB_WRITE_COIL` | Sí | Modbus TCP: el código de la transacción del cliente es un solo archivo compilado en el controlador y en el runtime de simulación, y corre contra un servidor en loopback en ambos (native_sim y el host); éxito, respuesta en pedazos, excepción, silencio, conexión cerrada, puerto rechazado, reset estando ocupado. RTU: solo se comprueban los parámetros de la interfaz (el tiempo se da en la unidad que lee el cliente Modbus de Zephyr); no se usa ningún dispositivo serie | No |
| `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE` | Sí | El cliente MQTT del runtime de simulación, contra un broker en loopback: sesión, publicación, suscripción, pérdida de la sesión, reconexión, pérdida silenciosa. **El cliente del controlador no se ejecuta contra un broker en la suite de pruebas** | No |
| `AZURE_C2D_RECV`, `AZURE_EG_PUB`, `SPB_REBIRTH` | Sí | Ninguno | No |
| `AZURE_DPS_PROV`, `AWS_FLEET_PROV` | Sí, con el servicio de aprovisionamiento reemplazado por uno que espera | Ninguno en la suite de pruebas; `tools/connectivity/` tiene scripts que responden en un broker que ejecutas tú, de uso manual | No |

## Disponibilidad de Lenguajes

El compilador registra todos los bloques de función de comunicación, por lo que puede instanciarlos en Structured Text (ST). No se ha verificado en esta versión que los editores de Ladder Diagram (LD) y de Function Block Diagram (FBD) ofrezcan cada bloque.
