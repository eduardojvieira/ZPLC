---
slug: /guides/mqtt-sparkplug
id: mqtt-sparkplug
title: Publicar con MQTT y Sparkplug B
sidebar_label: MQTT y Sparkplug B
description: 'Publique variables en un broker y reciba valores de vuelta con un perfil MQTT genérico o Sparkplug B, con el nivel de evidencia de cada parte.'
tags: [how-to, mqtt, sparkplug, communication]
---

# Publicar con MQTT y Sparkplug B

Siga esta página para hacer que un controlador publique variables de su programa en un broker MQTT y reciba valores de él. Muestra cómo marcar las variables, configurar la sesión y leer lo que envía el controlador, para un perfil de broker genérico y para Sparkplug B.

:::warning Nivel de evidencia: host y `native_sim`
Se ejercitó en el host y en `native_sim`: el cliente frente a temas y contenidos hostiles bajo cada uno de sus cinco perfiles, la decodificación de los contenidos de comandos, los manejadores de los bloques de función contra sustitutos y los clientes MQTT del entorno de ejecución de simulación y del controlador contra brokers escritos para las pruebas en un socket de loopback. No hay registro de una sesión con un broker real, de un handshake TLS en una placa ni de una aplicación anfitriona de Sparkplug B. La evidencia de banco y la manual siguen abiertas.
:::

## Qué necesita

- Una placa con interfaz de red, y un broker que usted opere o en el que confíe.
- El certificado de la CA del broker en el dispositivo. Un controlador que nunca se configuró usa TLS en el puerto 8883 y comprueba el certificado del broker, y MQTT sigue apagado y sin broker hasta que un operador nombra uno ([Valores por defecto seguros](../runtime/connectivity.md#valores-por-defecto-seguros)).
- Para probar el programa sin una placa, use la simulación. La aplicación y `zplc-cli test` inician un broker MQTT en la interfaz de loopback para la sesión, de modo que `MQTT_PUBLISH` y `MQTT_SUBSCRIBE` pueden correr contra él ([En simulación](../runtime/communication-function-blocks.md#en-simulación)). Ese broker es para el programa, no una prueba de su broker real.

## 1. Marque las variables

Ponga `{publish}` después del tipo de una variable que el controlador envía, y `{subscribe}` después de una en la que recibe.

```st runnable expect="Pressure=2.5" scans=2 scan_ms=10
PROGRAM Line
VAR
    Pressure : REAL {publish};
    Setpoint : REAL {subscribe};
END_VAR

Pressure := Setpoint + 2.5;
END_PROGRAM
```

Un valor que llega para una variable `{subscribe}` se escribe en la imagen de proceso por la misma interfaz que respeta los forzados, como toda escritura externa. Una variable que usted forzó conserva su valor forzado, y la escritura surte efecto en el ciclo siguiente.

## 2. Configure la sesión

```json zplc-fragment
{
  "communication": {
    "mqtt": {
      "enabled": true,
      "profile": "sparkplug-b",
      "protocolVersion": "3.1.1",
      "transport": "tls",
      "broker": "broker.example.org",
      "port": 8883,
      "clientId": "zplc-line-1",
      "keepAliveSec": 60,
      "cleanSession": true,
      "sessionExpirySec": 0,
      "groupId": "Plant1",
      "topicNamespace": "plant1",
      "publishIntervalMs": 1000,
      "publishQos": 0,
      "subscribeQos": 1,
      "publishRetain": false,
      "securityLevel": "tls-server-verify",
      "lwtEnabled": true,
      "lwtQos": 1,
      "lwtRetain": false
    },
    "bindings": [
      { "name": "Pressure", "symbol": "Pressure", "type": "REAL", "mode": "publish" },
      { "name": "Setpoint", "symbol": "Setpoint", "type": "REAL", "mode": "subscribe" }
    ]
  }
}
```

La comprobación de la documentación mezcla este fragmento en un proyecto y lo compila. Elija el `profile`:

| `profile`               | Úselo para                          | Mensajes                                                                                                |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `sparkplug-b`           | Una aplicación anfitriona Sparkplug B | Mensajes de nacimiento, de datos y de muerte con contenido protobuf                                   |
| `generic-broker`        | Cualquier broker MQTT               | Un mensaje de telemetría en JSON                                                                        |
| `aws-iot-core`          | AWS IoT Core                        | Los mensajes genéricos; AWS IoT Core autentica un dispositivo con un certificado de cliente y una clave |
| `azure-iot-hub`         | Azure IoT Hub                       | Mensajes de dispositivo a nube en los temas del hub                                                     |
| `azure-event-grid-mqtt` | Azure Event Grid MQTT               | Telemetría en el tema que usted nombra en `azureEventGridTopic`, o en el tema genérico                  |

Mantenga `securityLevel` en `tls-server-verify` o más estricto. Desactivar la verificación es un ajuste explícito que una imagen de publicación rechaza, y una imagen que lo permite muestra `tls-verify: OFF` en el estado ([Conectividad](../runtime/connectivity.md#valores-por-defecto-seguros)).

## 3. Cargue los ajustes y el certificado en la placa

Cargar los ajustes en una placa es una acción humana, y ZPLC envía estos ajustes por el enlace serie. Puede comprobar lo que tiene el dispositivo con la consola:

```bash
zplc mqtt status
zplc cert status
```

`zplc mqtt status` muestra el broker, el identificador de cliente y `tls-verify`. Un certificado se sube por fragmentos con `zplc cert begin`, `zplc cert chunk` y `zplc cert commit`, como describe la [guía de la consola del dispositivo](../operations/shell.md#instale-certificados-tls). Ningún comando imprime un certificado, una clave o una contraseña guardados.

## 4. Qué envía el controlador

`<device>` es el identificador de cliente, o el nombre del host cuando no hay identificador de cliente. Estas formas se leen del firmware y pueden cambiar, así que léalas como el contrato de esta versión.

| Perfil                           | Telemetría                                         | Comandos a una variable                         |
| -------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| `sparkplug-b`                    | `spBv1.0/<groupId>/DDATA/<device>`, tras `NBIRTH`  | `spBv1.0/<groupId>/DCMD/<device>/tag_<address>` |
| `generic-broker`, `aws-iot-core` | `<topicNamespace>/telemetry/<device>`              | `<topicNamespace>/cmd/<device>/tag_<address>`   |
| `azure-iot-hub`                  | `devices/<device>/messages/events/`                | `devices/<device>/messages/devicebound/#`       |

Un mensaje genérico es JSON: `{"profile":"...","ts":<uptime in ms>,"metrics":{"tag_00a0":1.5}}`. Una métrica se identifica con `tag_` y la dirección hexadecimal de cuatro dígitos de la variable en la memoria de trabajo, **no con su nombre**. La dirección está en el mapa de depuración de la compilación. El mensaje de última voluntad se publica en `.../status/<device>` o, para Sparkplug B, como `NDEATH`.

Un nodo Sparkplug B publica `NBIRTH` después de conectarse, con número de secuencia 0 y una métrica `bdSeq` que coincide con la de su última voluntad. Un comando de rebirth hace que publique de nuevo sus mensajes de nacimiento y nada más.

## Use los bloques de función en su lugar

`MQTT_CONNECT` informa el estado de la sesión que abre la configuración del dispositivo (no la abre). `MQTT_PUBLISH` envía un mensaje a un tema por cada flanco de subida de `EN`. `MQTT_SUBSCRIBE` mantiene una suscripción y entrega sus mensajes.

```st runnable expect="Failed=TRUE Code=3" scans=3 scan_ms=10
PROGRAM Alarm
VAR
    Send : MQTT_PUBLISH;
    Failed : BOOL;
    Code : DINT;
END_VAR

Send(EN := TRUE, QOS := 0, RETAIN := FALSE, TOPIC := 'plant1/alarms', PAYLOAD := 'overpressure');
Failed := Send.ERROR;
Code := Send.STATUS;
END_PROGRAM
```

La comprobación de la documentación ejecuta este programa en el entorno de ejecución nativo sin configurar, que no tiene manejador para el bloque, así que termina con `ERROR` en TRUE y `STATUS` 3. Eso muestra que el bloque compila e informa un estado, no que un mensaje se haya entregado. En una sesión de ZPLC el bloque usa el broker de loopback. Con los bloques de comunicación encendidos y sin broker disponible, el bloque responde `STATUS` 10 (no disponible). `STATUS` 4 significa que la sesión no está conectada, y 5 que todas las ranuras de solicitud están en uso.

Los bloques siguen el único handshake de los doce bloques de comunicación ([Bloques de función de comunicación](../runtime/communication-function-blocks.md#el-handshake)):

- `MQTT_PUBLISH` envía un mensaje por cada flanco de subida de `EN`. Mientras `EN` sigue en TRUE después del resultado, el resultado se mantiene y no se envía nada más. Deje que `EN` baje un ciclo para enviar otro. Una solicitud en curso termina aunque `EN` baje.
- `DONE` significa que el cliente aceptó el mensaje para enviarlo. No se espera el acuse de un mensaje QoS 1 o 2.
- Una publicación sin resultado a los 5 s es `ERROR` con `STATUS` 2, y un resultado tardío se descarta. Un mensaje que estaba encolado cuando cayó la sesión se marca como fallido y no se envía en la sesión siguiente.
- `MQTT_CONNECT`, `MQTT_SUBSCRIBE` y `AZURE_C2D_RECV` son bloques de servicio. Mientras `EN` es TRUE informan el estado de la sesión en cada ciclo, y una sesión perdida es `ERROR` con `STATUS` 4 en el ciclo siguiente a aquel en que el cliente lo detecta (dentro del intervalo de keep-alive en una pérdida silenciosa). `VALID` de `MQTT_SUBSCRIBE` es TRUE durante exactamente un ciclo por cada mensaje nuevo, y `PAYLOAD` conserva el último.
- Tras una pérdida, el cliente hace un intento de reconexión a la vez. Espera hasta 5 s la respuesta del broker, luego 2 s, duplicando hasta 60 s, antes del intento siguiente.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| Los temas y contenidos hostiles no pueden cambiar el estado de ejecución, los forzados ni el programa cargado, bajo los cinco perfiles | Prueba del cliente del producto con espías en cada autoridad | Host y `native_sim` |
| Los contenidos de comandos de cada tipo admitido se decodifican, y uno malformado se rechaza | Prueba unitaria del decodificador | Host y `native_sim` |
| Manejadores de bloques: pines, handshake, códigos de estado, límites, entrega al hilo del cliente | Prueba con un cliente sustituto | Host y `native_sim` |
| El cliente MQTT del controlador: sesión, publicación una vez por solicitud, suscripción, conexión rechazada, sesión perdida, reinicio con el bloque ocupado | Ejecutado en `native_sim` contra un broker escrito para la prueba en loopback | `native_sim` |
| El cliente MQTT del entorno de ejecución de simulación: sesión, publicación, suscripción, pérdida de la sesión, reconexión, pérdida silenciosa, un mensaje publicado con la sesión caída | Ejecutado contra un broker escrito para la prueba en loopback, en sockets reales, bajo los sanitizadores de direcciones, de comportamiento indefinido y de hilos | Host |
| TLS rechaza un generador aleatorio no criptográfico al compilar | Regla de compilación | Compilación para el destino |
| Una sesión con un broker real, un handshake TLS, una aplicación anfitriona Sparkplug B, entrega QoS 1 | No probado | Ninguno |

## Vea también

- [Conectividad](../runtime/connectivity.md): valores por defecto seguros, credenciales y qué puede hacer un mensaje.
- [Use los bloques de nube](./cloud-blocks.md): aprovisionamiento y los bloques de Azure y AWS.
- [Archivo de proyecto](../reference/project-file.md): cada campo de `communication.mqtt`.
- [Seguridad y limitaciones](../safety-and-limitations.md).
