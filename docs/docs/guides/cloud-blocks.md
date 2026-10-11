---
slug: /guides/cloud-blocks
id: cloud-blocks
title: Use the cloud blocks
sidebar_label: Cloud blocks
description: "Provision a device and exchange messages with Azure and AWS from the program, with an exact statement of what each block has been verified against."
tags: [how-to, cloud, azure, aws, sparkplug]
---

# Use the cloud blocks

Five blocks let a program talk to a cloud service: `AZURE_C2D_RECV`,
`AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV` and `SPB_REBIRTH`. They sit on the
MQTT session of the device, so everything on
[Publish with MQTT and Sparkplug B](./mqtt-sparkplug.md) applies to them first.

:::warning Not verified against a service
No cloud block has exchanged a message with a real Azure or AWS service, with an
emulator of one, or with a recorded exchange, and none has an executed test of the
whole round trip. The table below says what has been tested, block by block. Do not
build on a block for a purpose that needs it to work against a service until its
row says so. The handshake of the blocks is being reworked and is marked
**unstable**.
:::

## What each block does

| Block | What it does | Configuration it needs |
| --- | --- | --- |
| `AZURE_DPS_PROV` | Registers the device with the Azure Device Provisioning Service and returns the assigned hub | `azureDpsEnabled`, `azureDpsIdScope`, `azureDpsRegistrationId` |
| `AZURE_C2D_RECV` | Receives a cloud-to-device message of Azure IoT Hub | `azureC2dEnabled`, profile `azure-iot-hub` |
| `AZURE_EG_PUB` | Publishes an event to an Azure Event Grid topic | profile `azure-event-grid-mqtt`, `azureEventGridTopic` |
| `AWS_FLEET_PROV` | Provisions the device through AWS IoT fleet provisioning | `awsFleetEnabled`, `awsFleetTemplateName`, `awsClaimCertPath` |
| `SPB_REBIRTH` | Asks the Sparkplug B session to publish its birth messages again | profile `sparkplug-b` |

The pins of every block, with their types, are in the
[function block reference](../reference/function-blocks.md#azure_c2d_recv).

## Configure

A device connects to Azure IoT Hub, with provisioning and cloud-to-device messages
turned on:

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

And a device that uses AWS IoT fleet provisioning with a claim certificate:

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

Both fragments are merged into a project and built by the documentation check. The
host names, the scope and the template are placeholders: use your own. The device
holds the credentials; no command prints them
([Credentials](../runtime/connectivity.md#credentials)), and none of the supported
boards has a protected store.

## Use a block in the program

Raise `EN` for the one scan in which you want the operation, then read `STATUS`
after `ERROR`.

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

On the simulator of your computer there is no service, so the block ends with
`ERROR` TRUE and `STATUS` 3 (no handler). The documentation check runs this, which
proves that the block compiles and reports a status, nothing more.

**Unstable:** whether a block acts once per request or keeps acting while `EN`
stays TRUE, and the timing of `BUSY`, `DONE` and `ERROR`, are being fixed as one
documented handshake for the twelve communication blocks. Pulse `EN` for one scan
and act on the first scan in which `DONE` is TRUE.

A cloud message cannot start or stop the program, set a force or download a program.
An Azure direct method is answered `501` (not implemented), and device twin, AWS
shadow and jobs messages are only logged
([What a message from the network can do](../runtime/connectivity.md#what-a-message-from-the-network-can-do)).

## What is verified, block by block

| Block | A real service | An emulator or a local double | A recorded exchange | What was tested instead |
| --- | --- | --- | --- | --- |
| `AZURE_C2D_RECV` | No | No | None recorded | The layout of the block and its bounds, with the address sanitizer, against a stand-in |
| `AZURE_DPS_PROV` | No | A manual helper exists; no executed test uses it | None recorded | The shared-access-signature token generator, against a known vector |
| `AZURE_EG_PUB` | No | A manual helper exists; no executed test uses it | None recorded | The layout of the block and the bounds of its text, against a stand-in |
| `AWS_FLEET_PROV` | No | A manual helper exists; no executed test uses it | None recorded | Nothing at the level of the block |
| `SPB_REBIRTH` | No | No | None recorded | A rebirth command delivered to the client does nothing but publish the birth messages again |

The manual helpers are in `tools/connectivity/`: `fake_azure_dps.py`,
`fake_aws_fleet.py` and `inspect_event_grid.py` run against a local broker and
answer the provisioning topics. They check the topic flow and the state
transitions of the device. They do not show that a block works with the real
Azure DPS, Event Grid or AWS IoT Core, and no run of them is recorded by the
project's checks.

## See also

- [Publish with MQTT and Sparkplug B](./mqtt-sparkplug.md): the session the blocks use.
- [Communication function blocks](../runtime/communication-function-blocks.md) and the [function block reference](../reference/function-blocks.md).
- [Safety and limitations](../safety-and-limitations.md).
