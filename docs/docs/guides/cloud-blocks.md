---
slug: /guides/cloud-blocks
id: cloud-blocks
title: Use the cloud blocks
sidebar_label: Cloud blocks
description: 'Provision a device and exchange messages with Azure and AWS from the program, with what each block has not been tested against.'
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
whole round trip. The handler of each block (its pins, its handshake and its status
codes) is tested with the service replaced by a stand-in. The table below says what has
been tested, block by block. Do not build on a block for a purpose that needs it to work
against a service until its row says so.
:::

## What each block does

| Block            | What it does                                                                                 | Configuration it needs                                         |
| ---------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `AZURE_DPS_PROV` | Registers the device with the Azure Device Provisioning Service and returns the assigned hub | `azureDpsEnabled`, `azureDpsIdScope`, `azureDpsRegistrationId` |
| `AZURE_C2D_RECV` | Receives a cloud-to-device message of Azure IoT Hub                                          | `azureC2dEnabled`, profile `azure-iot-hub`                     |
| `AZURE_EG_PUB`   | Publishes an event to an Azure Event Grid topic                                              | profile `azure-event-grid-mqtt`, `azureEventGridTopic`         |
| `AWS_FLEET_PROV` | Provisions the device through AWS IoT fleet provisioning                                     | `awsFleetEnabled`, `awsFleetTemplateName`, `awsClaimCertPath`  |
| `SPB_REBIRTH`    | Asks the Sparkplug B session to publish its birth messages again                             | profile `sparkplug-b`                                          |

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

Raise `EN`: a rising edge makes one request, and the block reports its result on a later
scan. Read `STATUS` after `ERROR`.

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

In the ZPLC simulator the runtime has no handler for the block, so it ends with `ERROR`
TRUE and `STATUS` 3. With the communication blocks on, every cloud block answers
`STATUS` 10 (not available), because the simulation has no cloud service. The
documentation check runs this, which proves that the block compiles and reports a status,
nothing more.

The blocks follow the one handshake of the twelve communication blocks
([Communication function blocks](../runtime/communication-function-blocks.md#the-handshake)):

- One rising edge of `EN` is one operation. `AZURE_DPS_PROV`, `AZURE_EG_PUB`,
  `AWS_FLEET_PROV` and `SPB_REBIRTH` do not repeat while `EN` stays TRUE: the result
  (`DONE`, or `ERROR` with a status code) is held while `EN` stays TRUE and cleared when
  it falls. To do it again, let `EN` fall for one scan.
- A request in flight completes even if `EN` falls, and a rising edge while `BUSY` is TRUE
  starts nothing. `BUSY`, `DONE`, `ERROR` and `STATUS` are written by the runtime only.
- A block never waits for the service inside the scan. The two provisioning blocks run on
  a worker thread of their own (8 KB of RAM on a board that has a cloud profile): the
  service is waited for 30 s in each step, and the block reports `ERROR` with `STATUS` 2
  after 90 s. `ASSIGNED_HUB` and `THING_NAME` hold what was assigned.
- A non-empty `DEVICE_ID` of `AZURE_DPS_PROV` is the registration identifier used for the
  request, and a non-empty `TEMPLATE_NAME` of `AWS_FLEET_PROV` is the template. An empty
  `TOPIC` or `EVENT_TYPE` of `AZURE_EG_PUB` is the configured default.
- `AZURE_C2D_RECV` is a service block: while `EN` is TRUE it reports the state of the
  session on every scan, and `VALID` is TRUE for exactly one scan for each new message,
  which `PAYLOAD` keeps.

A cloud message cannot start or stop the program, set a force or download a program.
An Azure direct method is answered `501` (not implemented), and device twin, AWS
shadow and jobs messages are only logged
([What a message from the network can do](../runtime/connectivity.md#what-a-message-from-the-network-can-do)).

## What is verified, block by block

| Block            | A real service | An emulator or a local double                    | A recorded exchange | What was tested instead                                                                                                                    |
| ---------------- | -------------- | ------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `AZURE_C2D_RECV` | No             | No                                               | None recorded       | The handler (pins, handshake, status codes, `VALID` for one scan) and the layout of the block with its bounds, against a stand-in          |
| `AZURE_DPS_PROV` | No             | A manual helper exists; no executed test uses it | None recorded       | The handler, with the provisioning service replaced by one that waits; the shared-access-signature token generator, against a known vector |
| `AZURE_EG_PUB`   | No             | A manual helper exists; no executed test uses it | None recorded       | The handler and the layout of the block with the bounds of its text, against a stand-in                                                    |
| `AWS_FLEET_PROV` | No             | A manual helper exists; no executed test uses it | None recorded       | The handler, with the provisioning service replaced by one that waits                                                                      |
| `SPB_REBIRTH`    | No             | No                                               | None recorded       | The handler; a rebirth command delivered to the client does nothing but publish the birth messages again                                   |

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
