---
slug: /guides/cloud-blocks
id: cloud-blocks
title: Use the cloud blocks
sidebar_label: Cloud blocks
description: 'Provision a device and exchange messages with Azure and AWS from the program, and see what each block has not been tested against.'
tags: [how-to, cloud, azure, aws, sparkplug]
---

# Use the cloud blocks

Five blocks let a program talk to a cloud service: `AZURE_C2D_RECV`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV` and `SPB_REBIRTH`. They sit on the MQTT session of the device, so read [Publish with MQTT and Sparkplug B](./mqtt-sparkplug.md) first.

:::warning Evidence level: handler only, no service
No cloud block has exchanged a message with a real Azure or AWS service, with an emulator of one, or with a recorded exchange, and none has an executed test of the whole round trip. The handler of each block (its pins, handshake and status codes) was exercised with the service replaced by a stand-in. The table at the end says what exists, block by block. Do not build on a block for a purpose that needs it to work against a service until its row says so.
:::

## What each block does

| Block            | What it does                                                                                 | Configuration it needs                                         |
| ---------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `AZURE_DPS_PROV` | Registers the device with the Azure Device Provisioning Service and returns the assigned hub | `azureDpsEnabled`, `azureDpsIdScope`, `azureDpsRegistrationId` |
| `AZURE_C2D_RECV` | Receives a cloud-to-device message of Azure IoT Hub                                          | `azureC2dEnabled`, profile `azure-iot-hub`                     |
| `AZURE_EG_PUB`   | Publishes an event to an Azure Event Grid topic                                              | profile `azure-event-grid-mqtt`, `azureEventGridTopic`         |
| `AWS_FLEET_PROV` | Provisions the device through AWS IoT fleet provisioning                                     | `awsFleetEnabled`, `awsFleetTemplateName`, `awsClaimCertPath`  |
| `SPB_REBIRTH`    | Asks the Sparkplug B session to publish its birth messages again                             | profile `sparkplug-b`                                          |

The pins of every block, with their types, are in the [function block reference](../reference/function-blocks.md#azure_c2d_recv).

## Configure

A device that connects to Azure IoT Hub, with provisioning and cloud-to-device messages on:

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

A device that uses AWS IoT fleet provisioning with a claim certificate:

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

The documentation check merges both fragments into a project and builds them. The host names, the scope and the template are placeholders, so use your own. The device holds the credentials. No command prints them ([Credentials](../runtime/connectivity.md#credentials)), and none of the boards has a protected store.

## Use a block in the program

A rising edge on `EN` makes one request, and the block reports its result on a later scan. Read `STATUS` after `ERROR`.

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

The documentation check runs this program on the bare native runtime, which has no handler for the block, so it ends with `ERROR` TRUE and `STATUS` 3. In a ZPLC session the communication blocks are on, and every cloud block answers `STATUS` 10 (not available), because a simulation has no cloud service. Either way the run shows that the block compiles and reports a status, and nothing more.

The blocks follow the one handshake of the twelve communication blocks ([Communication function blocks](../runtime/communication-function-blocks.md#the-handshake)):

- One rising edge of `EN` is one operation. `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV` and `SPB_REBIRTH` do not repeat while `EN` stays TRUE. The result (`DONE`, or `ERROR` with a status code) is held while `EN` stays TRUE and cleared when it falls. To do it again, let `EN` fall for one scan.
- A request in flight completes even if `EN` falls, and a rising edge while `BUSY` is TRUE starts nothing. The runtime alone writes `BUSY`, `DONE`, `ERROR` and `STATUS`.
- A block never waits for the service inside the scan. The two provisioning blocks run on a worker thread of their own (8 KB of RAM on a board that has a cloud profile). The service is waited for 30 s in each step, and the block reports `ERROR` with `STATUS` 2 after 90 s. `ASSIGNED_HUB` and `THING_NAME` hold what was assigned.
- A non-empty `DEVICE_ID` of `AZURE_DPS_PROV` is the registration identifier used for the request, and a non-empty `TEMPLATE_NAME` of `AWS_FLEET_PROV` is the template. An empty `TOPIC` or `EVENT_TYPE` of `AZURE_EG_PUB` means the configured default.
- `AZURE_C2D_RECV` is a service block. While `EN` is TRUE it reports the state of the session on every scan, and `VALID` is TRUE for exactly one scan for each new message, which `PAYLOAD` keeps.

A cloud message cannot start or stop the program, set a force or download a program. An Azure direct method is answered `501` (not implemented), and device twin, AWS shadow and jobs messages are only logged ([What a message from the network can do](../runtime/connectivity.md#what-a-message-from-the-network-can-do)).

## What is verified, block by block

| Block            | A real service | An emulator or a local double                                                       | A recorded exchange | What was tested instead                                                                                                                                             |
| ---------------- | -------------- | ----------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AZURE_C2D_RECV` | No             | The client of the controller on `native_sim`, against a broker written for the test | None recorded       | The handler (pins, handshake, status codes, `VALID` for one scan), the layout of the block with its bounds, and a cloud-to-device message through the broker double |
| `AZURE_DPS_PROV` | No             | A manual helper exists; no executed test uses it                                    | None recorded       | The handler, with the provisioning service replaced by one that waits; the shared-access-signature token generator, against a known vector                          |
| `AZURE_EG_PUB`   | No             | The client of the controller on `native_sim`, against a broker written for the test | None recorded       | The handler, the layout of the block with the bounds of its text, and one Event Grid message per request through the broker double                                  |
| `AWS_FLEET_PROV` | No             | A manual helper exists; no executed test uses it                                    | None recorded       | The handler, with the provisioning service replaced by one that waits                                                                                               |
| `SPB_REBIRTH`    | No             | The client of the controller on `native_sim`, against a broker written for the test | None recorded       | The handler, and one `NBIRTH` per request through the broker double; a rebirth command delivered to the client only republishes the birth messages                  |

The manual helpers are in `tools/connectivity/`: `fake_azure_dps.py`, `fake_aws_fleet.py` and `inspect_event_grid.py`. They run against a local broker and answer the provisioning topics. They check the topic flow and the state changes of the device. They do not show that a block works with the real Azure DPS, Event Grid or AWS IoT Core, and the project's checks record no run of them.

## See also

- [Publish with MQTT and Sparkplug B](./mqtt-sparkplug.md): the session the blocks use.
- [Communication function blocks](../runtime/communication-function-blocks.md) and the [function block reference](../reference/function-blocks.md).
- [Safety and limitations](../safety-and-limitations.md).
