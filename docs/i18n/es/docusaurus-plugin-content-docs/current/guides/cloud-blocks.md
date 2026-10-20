---
slug: /guides/cloud-blocks
id: cloud-blocks
title: Usar los bloques de nube
sidebar_label: Bloques de nube
description: "Aprovisione un dispositivo e intercambie mensajes con Azure y AWS desde el programa, y qué es lo que no se ha probado de cada bloque."
tags: [how-to, cloud, azure, aws, sparkplug]
---

# Usar los bloques de nube

Cinco bloques permiten que un programa hable con un servicio de nube:
`AZURE_C2D_RECV`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV` y
`SPB_REBIRTH`. Se apoyan en la sesión MQTT del dispositivo, así que todo lo que dice
[Publicar con MQTT y Sparkplug B](./mqtt-sparkplug.md) se aplica primero a ellos.

:::warning No verificados contra un servicio
Ningún bloque de nube ha intercambiado un mensaje con un servicio real de Azure o
AWS, con un emulador de uno, ni con un intercambio grabado, y ninguno tiene una
prueba ejecutada del recorrido completo. El manejador de cada bloque (sus pines, su
handshake y sus códigos de estado) se prueba con el servicio reemplazado por un
sustituto. La tabla de abajo dice qué se ha probado, bloque por bloque. No construya
sobre un bloque para un fin que necesite que funcione contra un servicio hasta que su
fila lo diga.
:::

## Qué hace cada bloque

| Bloque | Qué hace | Configuración que necesita |
| --- | --- | --- |
| `AZURE_DPS_PROV` | Registra el dispositivo en el Azure Device Provisioning Service y devuelve el hub asignado | `azureDpsEnabled`, `azureDpsIdScope`, `azureDpsRegistrationId` |
| `AZURE_C2D_RECV` | Recibe un mensaje de la nube al dispositivo de Azure IoT Hub | `azureC2dEnabled`, perfil `azure-iot-hub` |
| `AZURE_EG_PUB` | Publica un evento en un tema de Azure Event Grid | perfil `azure-event-grid-mqtt`, `azureEventGridTopic` |
| `AWS_FLEET_PROV` | Aprovisiona el dispositivo mediante el aprovisionamiento de flota de AWS IoT | `awsFleetEnabled`, `awsFleetTemplateName`, `awsClaimCertPath` |
| `SPB_REBIRTH` | Pide a la sesión Sparkplug B que publique de nuevo sus mensajes de nacimiento | perfil `sparkplug-b` |

Los pines de cada bloque, con sus tipos, están en la
[referencia de bloques de función](../reference/function-blocks.md#azure_c2d_recv).

## Configure

Un dispositivo que se conecta a Azure IoT Hub, con el aprovisionamiento y los
mensajes de la nube al dispositivo activados:

```json zplc-fragment
{
  "communication": {
    "mqtt": {
      "enabled": true,
      "profile": "azure-iot-hub",
      "protocolVersion": "3.1.1",
      "transport": "tls",
      "broker": "myhub.azure-devices.net",
      "port": 8883,
      "clientId": "zplc-line-1",
      "keepAliveSec": 60,
      "cleanSession": true,
      "sessionExpirySec": 0,
      "topicNamespace": "plant1",
      "publishIntervalMs": 1000,
      "publishQos": 0,
      "subscribeQos": 1,
      "publishRetain": false,
      "securityLevel": "tls-server-verify",
      "azureSasExpirySec": 3600,
      "azureC2dEnabled": true,
      "azureDpsEnabled": true,
      "azureDpsIdScope": "0ne00000000",
      "azureDpsRegistrationId": "zplc-line-1",
      "lwtEnabled": false,
      "lwtQos": 0,
      "lwtRetain": false
    }
  }
}
```

Y un dispositivo que usa el aprovisionamiento de flota de AWS IoT con un
certificado de reclamación:

```json zplc-fragment
{
  "communication": {
    "mqtt": {
      "enabled": true,
      "profile": "aws-iot-core",
      "protocolVersion": "3.1.1",
      "transport": "tls",
      "broker": "example-ats.iot.eu-west-1.amazonaws.com",
      "port": 8883,
      "clientId": "zplc-line-1",
      "keepAliveSec": 60,
      "cleanSession": true,
      "sessionExpirySec": 0,
      "topicNamespace": "plant1",
      "publishIntervalMs": 1000,
      "publishQos": 0,
      "subscribeQos": 1,
      "publishRetain": false,
      "securityLevel": "tls-mutual",
      "awsFleetEnabled": true,
      "awsFleetTemplateName": "zplc-template",
      "awsClaimCertPath": "certs/claim.pem",
      "lwtEnabled": false,
      "lwtQos": 0,
      "lwtRetain": false
    }
  }
}
```

La verificación de la documentación combina y compila ambos fragmentos. Los nombres
de host, el ámbito y la plantilla son marcadores: use los suyos. El dispositivo
guarda las credenciales; ningún comando las imprime
([Credenciales](../runtime/connectivity.md#credenciales)), y ninguna de las placas
soportadas tiene un almacén protegido.

## Use un bloque en el programa

Active `EN`: un flanco ascendente hace una solicitud, y el bloque informa su resultado en
un ciclo posterior. Lea `STATUS` después de `ERROR`.

```st runnable expect="Failed=TRUE Code=3" scans=3 scan_ms=10
PROGRAM Provision
VAR
    Register : AZURE_DPS_PROV;
    Failed : BOOL;
    Code : DINT;
END_VAR

Register(EN := TRUE, DEVICE_ID := 'zplc-line-1');
Failed := Register.ERROR;
Code := Register.STATUS;
END_PROGRAM
```

En el simulador de ZPLC el runtime no tiene manejador para el bloque, así que termina
con `ERROR` en TRUE y `STATUS` 3. Con los bloques de comunicación activos, todo bloque de
nube responde `STATUS` 10 (no disponible), porque la simulación no tiene servicio de nube.
La verificación de la documentación ejecuta esto, lo que demuestra que el bloque compila e
informa un estado, nada más.

Los bloques siguen el único handshake de los doce bloques de comunicación
([Bloques de función de comunicación](../runtime/communication-function-blocks.md#el-handshake)):

- Un flanco ascendente de `EN` es una operación. `AZURE_DPS_PROV`, `AZURE_EG_PUB`,
  `AWS_FLEET_PROV` y `SPB_REBIRTH` no se repiten mientras `EN` sigue en TRUE: el resultado
  (`DONE`, o `ERROR` con un código de estado) se mantiene mientras `EN` sigue en TRUE y se
  borra cuando cae. Para hacerlo de nuevo, deje que `EN` baje durante un ciclo.
- Una solicitud en curso se completa aunque `EN` caiga, y un flanco ascendente mientras
  `BUSY` es TRUE no inicia nada. `BUSY`, `DONE`, `ERROR` y `STATUS` los escribe solo el
  runtime.
- Un bloque nunca espera al servicio dentro del ciclo. Los dos bloques de aprovisionamiento
  se ejecutan en un hilo de trabajo propio (8 KB de RAM en una placa con perfil de nube): se
  espera al servicio 30 s en cada paso, y el bloque informa `ERROR` con `STATUS` 2 a los
  90 s. `ASSIGNED_HUB` y `THING_NAME` contienen lo que se asignó.
- Un `DEVICE_ID` no vacío de `AZURE_DPS_PROV` es el identificador de registro usado para la
  solicitud, y un `TEMPLATE_NAME` no vacío de `AWS_FLEET_PROV` es la plantilla. Un `TOPIC` o
  un `EVENT_TYPE` vacío de `AZURE_EG_PUB` es el valor configurado por defecto.
- `AZURE_C2D_RECV` es un bloque de servicio: mientras `EN` es TRUE informa el estado de la
  sesión en cada ciclo, y `VALID` es TRUE durante exactamente un ciclo por cada mensaje
  nuevo, que `PAYLOAD` conserva.

Un mensaje de nube no puede iniciar ni detener el programa, fijar un forzado ni
descargar un programa. Un método directo de Azure se responde `501` (no
implementado), y los mensajes de device twin, de shadow y de jobs de AWS solo se
registran en el registro
([Qué puede hacer un mensaje de la red](../runtime/connectivity.md#qué-puede-hacer-un-mensaje-de-la-red)).

## Qué está verificado, bloque por bloque

| Bloque | Un servicio real | Un emulador o un doble local | Un intercambio grabado | Qué se probó en su lugar |
| --- | --- | --- | --- | --- |
| `AZURE_C2D_RECV` | No | No | Ninguno registrado | El manejador (pines, handshake, códigos de estado, `VALID` durante un ciclo) y la disposición del bloque con sus límites, contra un sustituto |
| `AZURE_DPS_PROV` | No | Existe una herramienta manual; ninguna prueba ejecutada la usa | Ninguno registrado | El manejador, con el servicio de aprovisionamiento reemplazado por uno que espera; el generador del token de firma de acceso compartido, contra un vector conocido |
| `AZURE_EG_PUB` | No | Existe una herramienta manual; ninguna prueba ejecutada la usa | Ninguno registrado | El manejador y la disposición del bloque con los límites de su texto, contra un sustituto |
| `AWS_FLEET_PROV` | No | Existe una herramienta manual; ninguna prueba ejecutada la usa | Ninguno registrado | El manejador, con el servicio de aprovisionamiento reemplazado por uno que espera |
| `SPB_REBIRTH` | No | No | Ninguno registrado | El manejador; un comando de renacimiento entregado al cliente no hace más que publicar de nuevo los mensajes de nacimiento |

Las herramientas manuales están en `tools/connectivity/`: `fake_azure_dps.py`,
`fake_aws_fleet.py` e `inspect_event_grid.py` se ejecutan contra un broker local y
responden los temas de aprovisionamiento. Comprueban el flujo de temas y las
transiciones de estado del dispositivo. No demuestran que un bloque funcione con el
Azure DPS, el Event Grid o el AWS IoT Core reales, y las comprobaciones del proyecto
no registran ninguna ejecución de ellas.

## Vea también

- [Publicar con MQTT y Sparkplug B](./mqtt-sparkplug.md): la sesión que usan los bloques.
- [Bloques de función de comunicación](../runtime/communication-function-blocks.md) y la [referencia de bloques de función](../reference/function-blocks.md).
- [Seguridad y limitaciones](../safety-and-limitations.md).
