---
slug: /guides/cloud-blocks
id: cloud-blocks
title: Usar los bloques de nube
sidebar_label: Bloques de nube
description: "Aprovisione un dispositivo e intercambie mensajes con Azure y AWS desde el programa, con una declaración exacta de contra qué se ha verificado cada bloque."
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
prueba ejecutada del recorrido completo. La tabla de abajo dice qué se ha probado,
bloque por bloque. No construya sobre un bloque para un fin que necesite que
funcione contra un servicio hasta que su fila lo diga. El protocolo de los bloques
se está reelaborando y se marca como **inestable**.
:::

## Qué hace cada bloque

| Bloque | Qué hace | Configuración que necesita |
| --- | --- | --- |
| `AZURE_DPS_PROV` | Registra el dispositivo en el Azure Device Provisioning Service y devuelve el hub asignado | `azureDpsEnabled`, `azureDpsIdScope`, `azureDpsRegistrationId` |
| `AZURE_C2D_RECV` | Recibe un mensaje de la nube al dispositivo de Azure IoT Hub | `azureC2dEnabled`, perfil `azure-iot-hub` |
| `AZURE_EG_PUB` | Publica un evento en un tópico de Azure Event Grid | perfil `azure-event-grid-mqtt`, `azureEventGridTopic` |
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
certificado de reclamo:

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

Active `EN` durante el ciclo en que quiere la operación y lea `STATUS` después de
`ERROR`.

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

En el simulador de su equipo no hay servicio, así que el bloque termina con `ERROR`
en TRUE y `STATUS` 3 (sin manejador). La verificación de la documentación ejecuta
esto, lo que demuestra que el bloque compila e informa un estado, nada más.

**Inestable:** si un bloque actúa una vez por solicitud o sigue actuando mientras
`EN` permanece en TRUE, y el momento de `BUSY`, `DONE` y `ERROR`, se están fijando
como un único protocolo documentado para los doce bloques de comunicación. Active
`EN` durante un solo ciclo y actúe en el primer ciclo en que `DONE` sea TRUE.

Un mensaje de nube no puede iniciar ni detener el programa, fijar un forzado ni
descargar un programa. Un método directo de Azure se responde `501` (no
implementado), y los mensajes de device twin, de shadow y de jobs de AWS solo se
registran en el log
([Qué puede hacer un mensaje de la red](../runtime/connectivity.md#qué-puede-hacer-un-mensaje-de-la-red)).

## Qué está verificado, bloque por bloque

| Bloque | Un servicio real | Un emulador o un doble local | Un intercambio grabado | Qué se probó en su lugar |
| --- | --- | --- | --- | --- |
| `AZURE_C2D_RECV` | No | No | Ninguno registrado | La disposición del bloque y sus límites, con el sanitizador de direcciones, contra un sustituto |
| `AZURE_DPS_PROV` | No | Existe una herramienta manual; ninguna prueba ejecutada la usa | Ninguno registrado | El generador del token de firma de acceso compartido, contra un vector conocido |
| `AZURE_EG_PUB` | No | Existe una herramienta manual; ninguna prueba ejecutada la usa | Ninguno registrado | La disposición del bloque y los límites de su texto, contra un sustituto |
| `AWS_FLEET_PROV` | No | Existe una herramienta manual; ninguna prueba ejecutada la usa | Ninguno registrado | Nada a nivel del bloque |
| `SPB_REBIRTH` | No | No | Ninguno registrado | Un comando de renacimiento entregado al cliente no hace más que publicar de nuevo los mensajes de nacimiento |

Las herramientas manuales están en `tools/connectivity/`: `fake_azure_dps.py`,
`fake_aws_fleet.py` e `inspect_event_grid.py` se ejecutan contra un broker local y
responden los tópicos de aprovisionamiento. Comprueban el flujo de tópicos y las
transiciones de estado del dispositivo. No demuestran que un bloque funcione con el
Azure DPS, el Event Grid o el AWS IoT Core reales, y las comprobaciones del proyecto
no registran ninguna ejecución de ellas.

## Vea también

- [Publicar con MQTT y Sparkplug B](./mqtt-sparkplug.md): la sesión que usan los bloques.
- [Bloques de función de comunicación](../runtime/communication-function-blocks.md) y la [referencia de bloques de función](../reference/function-blocks.md).
- [Seguridad y limitaciones](../safety-and-limitations.md).
