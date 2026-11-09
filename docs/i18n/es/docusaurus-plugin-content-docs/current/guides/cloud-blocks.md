---
slug: /guides/cloud-blocks
id: cloud-blocks
title: Usar los bloques de nube
sidebar_label: Bloques de nube
description: 'Aprovisione un dispositivo e intercambie mensajes con Azure y AWS desde el programa, y vea contra qué no se ha probado cada bloque.'
tags: [how-to, cloud, azure, aws, sparkplug]
---

# Usar los bloques de nube

Cinco bloques permiten que un programa hable con un servicio de nube: `AZURE_C2D_RECV`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV` y `SPB_REBIRTH`. Se apoyan en la sesión MQTT del dispositivo, así que lea primero [Publicar con MQTT y Sparkplug B](./mqtt-sparkplug.md).

:::warning Nivel de evidencia: solo el manejador, sin servicio
Ningún bloque de nube ha intercambiado un mensaje con un servicio real de Azure o AWS, con un emulador de uno, ni con un intercambio grabado, y ninguno tiene una prueba ejecutada del recorrido completo. El manejador de cada bloque (sus pines, su handshake y sus códigos de estado) se ejercitó con el servicio reemplazado por un sustituto. La tabla del final dice qué existe, bloque por bloque. No construya sobre un bloque para un fin que exija que funcione contra un servicio hasta que su fila lo diga.
:::

## Qué hace cada bloque

| Bloque           | Qué hace                                                                                   | Configuración que necesita                                     |
| ---------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `AZURE_DPS_PROV` | Registra el dispositivo en el Azure Device Provisioning Service y devuelve el hub asignado | `azureDpsEnabled`, `azureDpsIdScope`, `azureDpsRegistrationId` |
| `AZURE_C2D_RECV` | Recibe un mensaje de nube a dispositivo de Azure IoT Hub                                   | `azureC2dEnabled`, perfil `azure-iot-hub`                      |
| `AZURE_EG_PUB`   | Publica un evento en un tema de Azure Event Grid                                           | perfil `azure-event-grid-mqtt`, `azureEventGridTopic`          |
| `AWS_FLEET_PROV` | Aprovisiona el dispositivo mediante el aprovisionamiento de flota de AWS IoT               | `awsFleetEnabled`, `awsFleetTemplateName`, `awsClaimCertPath`  |
| `SPB_REBIRTH`    | Pide a la sesión Sparkplug B que publique de nuevo sus mensajes de nacimiento              | perfil `sparkplug-b`                                           |

Los pines de cada bloque, con sus tipos, están en la [referencia de bloques de función](../reference/function-blocks.md#azure_c2d_recv).

## Configure

Un dispositivo que se conecta a Azure IoT Hub, con aprovisionamiento y mensajes de nube a dispositivo activados:

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

Un dispositivo que usa el aprovisionamiento de flota de AWS IoT con un certificado de reclamo:

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

La comprobación de la documentación mezcla ambos fragmentos en un proyecto y los compila. Los nombres de host, el alcance y la plantilla son marcadores de posición, así que use los suyos. El dispositivo guarda las credenciales. Ningún comando las imprime ([Credenciales](../runtime/connectivity.md#credenciales)), y ninguna de las placas tiene un almacén protegido.

## Use un bloque en el programa

Un flanco de subida en `EN` hace una solicitud, y el bloque informa su resultado en un ciclo posterior. Lea `STATUS` después de `ERROR`.

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

La comprobación de la documentación ejecuta este programa en el runtime nativo sin configurar, que no tiene manejador para el bloque, así que termina con `ERROR` en TRUE y `STATUS` 3. En una sesión de ZPLC los bloques de comunicación están encendidos, y todo bloque de nube responde `STATUS` 10 (no disponible), porque una simulación no tiene servicio de nube. En ambos casos la ejecución muestra que el bloque compila e informa un estado, y nada más.

Los bloques siguen el único handshake de los doce bloques de comunicación ([Bloques de función de comunicación](../runtime/communication-function-blocks.md#el-handshake)):

- Un flanco de subida de `EN` es una operación. `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV` y `SPB_REBIRTH` no se repiten mientras `EN` sigue en TRUE. El resultado (`DONE`, o `ERROR` con un código de estado) se mantiene mientras `EN` sigue en TRUE y se borra cuando baja. Para repetirlo, deje que `EN` baje un ciclo.
- Una solicitud en curso termina aunque `EN` baje, y un flanco de subida mientras `BUSY` es TRUE no inicia nada. Solo el runtime escribe `BUSY`, `DONE`, `ERROR` y `STATUS`.
- Un bloque nunca espera al servicio dentro del ciclo. Los dos bloques de aprovisionamiento corren en un hilo de trabajo propio (8 KB de RAM en una placa que tiene un perfil de nube). Se espera al servicio 30 s en cada paso, y el bloque informa `ERROR` con `STATUS` 2 a los 90 s. `ASSIGNED_HUB` y `THING_NAME` guardan lo que se asignó.
- Un `DEVICE_ID` no vacío de `AZURE_DPS_PROV` es el identificador de registro usado en la solicitud, y un `TEMPLATE_NAME` no vacío de `AWS_FLEET_PROV` es la plantilla. Un `TOPIC` o `EVENT_TYPE` vacío de `AZURE_EG_PUB` significa el valor configurado por defecto.
- `AZURE_C2D_RECV` es un bloque de servicio. Mientras `EN` es TRUE informa el estado de la sesión en cada ciclo, y `VALID` es TRUE durante exactamente un ciclo por cada mensaje nuevo, que `PAYLOAD` conserva.

Un mensaje de nube no puede iniciar ni detener el programa, definir un forzado ni descargar un programa. Un método directo de Azure recibe la respuesta `501` (no implementado), y los mensajes de gemelo de dispositivo, shadow y jobs de AWS solo se registran ([Qué puede hacer un mensaje de la red](../runtime/connectivity.md#qué-puede-hacer-un-mensaje-de-la-red)).

## Qué está verificado, bloque por bloque

| Bloque           | Un servicio real | Un emulador o un doble local                                                        | Un intercambio grabado | Qué se probó en su lugar                                                                                                                                                           |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AZURE_C2D_RECV` | No               | El cliente del controlador en `native_sim`, contra un broker escrito para la prueba | Ninguno registrado     | El manejador (pines, handshake, códigos de estado, `VALID` durante un ciclo), la disposición del bloque con sus límites y un mensaje de nube a dispositivo por el doble del broker |
| `AZURE_DPS_PROV` | No               | Existe un ayudante manual; ninguna prueba ejecutada lo usa                          | Ninguno registrado     | El manejador, con el servicio de aprovisionamiento reemplazado por uno que espera; el generador del token de firma de acceso compartido, contra un vector conocido                 |
| `AZURE_EG_PUB`   | No               | El cliente del controlador en `native_sim`, contra un broker escrito para la prueba | Ninguno registrado     | El manejador, la disposición del bloque con los límites de su texto y un mensaje de Event Grid por solicitud por el doble del broker                                               |
| `AWS_FLEET_PROV` | No               | Existe un ayudante manual; ninguna prueba ejecutada lo usa                          | Ninguno registrado     | El manejador, con el servicio de aprovisionamiento reemplazado por uno que espera                                                                                                  |
| `SPB_REBIRTH`    | No               | El cliente del controlador en `native_sim`, contra un broker escrito para la prueba | Ninguno registrado     | El manejador, y un `NBIRTH` por solicitud por el doble del broker; un comando de rebirth entregado al cliente solo vuelve a publicar los mensajes de nacimiento                    |

Los ayudantes manuales están en `tools/connectivity/`: `fake_azure_dps.py`, `fake_aws_fleet.py` e `inspect_event_grid.py`. Se ejecutan contra un broker local y responden en los temas de aprovisionamiento. Comprueban el flujo de temas y los cambios de estado del dispositivo. No muestran que un bloque funcione con el DPS real de Azure, con Event Grid o con AWS IoT Core, y las comprobaciones del proyecto no registran ninguna ejecución de ellos.

## Vea también

- [Publicar con MQTT y Sparkplug B](./mqtt-sparkplug.md): la sesión que usan los bloques.
- [Bloques de función de comunicación](../runtime/communication-function-blocks.md) y la [referencia de bloques de función](../reference/function-blocks.md).
- [Seguridad y limitaciones](../safety-and-limitations.md).
