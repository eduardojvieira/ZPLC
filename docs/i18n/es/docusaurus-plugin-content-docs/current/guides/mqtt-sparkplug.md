---
slug: /guides/mqtt-sparkplug
id: mqtt-sparkplug
title: Publicar con MQTT y Sparkplug B
sidebar_label: MQTT y Sparkplug B
description: "Publique variables en un broker y reciba valores de vuelta, con un perfil MQTT genérico o con Sparkplug B, con el contrato que existe hoy."
tags: [how-to, mqtt, sparkplug, communication]
---

# Publicar con MQTT y Sparkplug B

Un controlador puede publicar variables de su programa en un broker MQTT y recibir
valores de vuelta. Esta página muestra cómo marcar las variables, configurar la
sesión y leer lo que envía el controlador, para un perfil de broker genérico y para
Sparkplug B.

:::warning Estado de esta página
Verificado solo en el host y en `native_sim`: el cliente frente a tópicos y cargas
hostiles bajo cada uno de sus cinco perfiles, la decodificación de las cargas de
comandos y los manejadores de los bloques de función contra sustitutos. No se ha
probado ninguna sesión con un broker real, ningún intercambio TLS en una placa ni
ninguna aplicación anfitriona Sparkplug B. El protocolo de los bloques de función
MQTT se está reelaborando y se marca como **inestable** más abajo.
:::

## Qué necesita

- Una placa con interfaz de red, y un broker que usted opere o en el que confíe. El
  simulador de su equipo no tiene broker ni sesión MQTT.
- El certificado de la CA del broker en el dispositivo, porque un controlador que
  nunca se configuró usa TLS en el puerto 8883 y comprueba el certificado del
  broker. MQTT está desactivado y no tiene broker hasta que un operador nombra uno
  ([Valores seguros por defecto](../runtime/connectivity.md#valores-por-defecto-seguros)).

## 1. Marque las variables

Ponga `{publish}` después del tipo de una variable que el controlador envía, y
`{subscribe}` después de una en la que recibe.

```st runnable expect="Pressure=2.5" scans=2 scan_ms=10
PROGRAM Line
VAR
    Pressure : REAL {publish};
    Setpoint : REAL {subscribe};
END_VAR

Pressure := Setpoint + 2.5;
END_PROGRAM
```

Un valor que llega para una variable `{subscribe}` se escribe en la imagen de
proceso por la misma interfaz que respeta forzados que usa toda escritura externa:
una variable que usted forzó conserva su valor forzado, y la escritura surte efecto
en el siguiente ciclo.

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

La verificación de la documentación combina este fragmento con un proyecto y lo
compila. Elija el `profile`:

| `profile` | Úselo para | Mensajes |
| --- | --- | --- |
| `sparkplug-b` | Una aplicación anfitriona Sparkplug B | Mensajes de nacimiento, de datos y de muerte con carga protobuf |
| `generic-broker` | Cualquier broker MQTT | Un mensaje de telemetría en JSON |
| `aws-iot-core` | AWS IoT Core | Los mensajes genéricos; AWS IoT Core autentica un dispositivo con un certificado de cliente y una clave |
| `azure-iot-hub` | Azure IoT Hub | Mensajes de dispositivo a nube en los tópicos del hub |
| `azure-event-grid-mqtt` | Azure Event Grid MQTT | Telemetría en el tópico que usted nombra en `azureEventGridTopic`, o en el tópico genérico |

Mantenga `securityLevel` en `tls-server-verify` o más estricto. Desactivar la
verificación es un ajuste explícito que una imagen de versión rechaza, y una imagen
que lo permite muestra `tls-verify: OFF` en el estado
([Conectividad](../runtime/connectivity.md#valores-por-defecto-seguros)).

## 3. Lleve los ajustes y el certificado a la placa

Aprovisionar una placa es una acción humana en Studio, que envía estos ajustes por
el enlace serie. Puede comprobar lo que tiene el dispositivo con la consola:

```bash
zplc mqtt status
zplc cert status
```

`zplc mqtt status` muestra el broker, el identificador de cliente y `tls-verify`.
Un certificado se sube por fragmentos con `zplc cert begin`, `zplc cert chunk` y
`zplc cert commit`, como describe la
[referencia de la consola](../operations/shell.md#certificados-y-seguridad-zplc-cert);
ningún comando imprime un certificado, una clave ni una contraseña guardados.

## 4. Qué envía el controlador

`<device>` es el identificador de cliente, o el nombre de host cuando no hay
identificador de cliente. Estas formas se leen del firmware y pueden cambiar;
léalas como el contrato de esta versión.

| Perfil | Telemetría | Comandos a una variable |
| --- | --- | --- |
| `sparkplug-b` | `spBv1.0/<groupId>/DDATA/<device>`, después de `NBIRTH` | `spBv1.0/<groupId>/DCMD/<device>/tag_<address>` |
| `generic-broker`, `aws-iot-core` | `<topicNamespace>/telemetry/<device>` | `<topicNamespace>/cmd/<device>/tag_<address>` |
| `azure-iot-hub` | `devices/<device>/messages/events/` | `devices/<device>/messages/devicebound/#` |

Un mensaje genérico es JSON: `{"profile":"...","ts":<tiempo en ms>,"metrics":{"tag_00a0":1.5}}`.
Una métrica se identifica por `tag_` y la dirección de cuatro dígitos hexadecimales
de la variable en la memoria de trabajo, **no por su nombre**; la dirección está en
el mapa de depuración de la compilación. El mensaje de última voluntad se publica
en `.../status/<device>` o, para Sparkplug B, como `NDEATH`.

Un nodo Sparkplug B publica `NBIRTH` después de conectarse, con número de secuencia
0 y una métrica `bdSeq` que coincide con la de su última voluntad. Un comando de
renacimiento lo hace publicar de nuevo sus mensajes de nacimiento y nada más.

## Use los bloques de función en su lugar

`MQTT_CONNECT` informa el estado de la sesión que abre la configuración del
dispositivo; `MQTT_PUBLISH` envía un mensaje a un tópico; `MQTT_SUBSCRIBE` entrega
los mensajes de un tópico.

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

En el simulador de su equipo no hay broker, así que el bloque termina con `ERROR`
en TRUE y `STATUS` 3 (sin manejador): demuestra que el bloque compila e informa un
estado, no que un mensaje se haya entregado. `STATUS` 4 significa que la sesión no
está conectada, y 5 que la cola de solicitudes está llena.

**Inestable:** el momento de `BUSY`, `DONE` y `ERROR` a lo largo de los ciclos, y lo
que hace un reinicio a una solicitud en curso, se están fijando como un único
protocolo para todos los bloques de comunicación. Actúe en el primer ciclo en que
`DONE` sea TRUE.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| Tópicos y cargas hostiles no pueden cambiar el estado de ejecución, los forzados ni el programa cargado, en los cinco perfiles | Prueba del cliente del producto con espías en cada autoridad | Host y `native_sim` |
| Las cargas de comandos de cada tipo admitido se decodifican, y una malformada se rechaza | Prueba unitaria del decodificador | Host y `native_sim` |
| Manejadores de bloques: disposición, límites, cola | Prueba con un cliente sustituto | Host y `native_sim` |
| TLS rechaza en la compilación un generador aleatorio no criptográfico | Regla de compilación | Compilación |
| Una sesión con un broker real, un intercambio TLS, una aplicación anfitriona Sparkplug B, entrega con QoS 1 | No probado | Ninguno |

## Vea también

- [Conectividad](../runtime/connectivity.md): valores seguros por defecto, credenciales y lo que puede hacer un mensaje.
- [Usar los bloques de nube](./cloud-blocks.md): aprovisionamiento y los bloques de Azure y AWS.
- [Archivo de proyecto](../reference/project-file.md): cada campo de `communication.mqtt`.
- [Seguridad y limitaciones](../safety-and-limitations.md).
