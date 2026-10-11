---
slug: /guides/mqtt-sparkplug
id: mqtt-sparkplug
title: Publish with MQTT and Sparkplug B
sidebar_label: MQTT and Sparkplug B
description: "Publish variables to a broker and receive values back, with a generic MQTT profile or Sparkplug B, with the contract that exists today."
tags: [how-to, mqtt, sparkplug, communication]
---

# Publish with MQTT and Sparkplug B

A controller can publish variables of your program to an MQTT broker and take
values back from it. This page shows how to mark the variables, configure the
session, and read what the controller sends, for a generic broker profile and for
Sparkplug B.

:::warning Status of this page
Verified on the host and on `native_sim` only: the client against hostile topics
and payloads under each of its five profiles, the decoding of command payloads, and
the function-block handlers against stand-ins. No session with a real broker, no TLS
handshake on a board and no Sparkplug B host application has been tested. The
handshake of the MQTT function blocks is being reworked and is marked **unstable**
below.
:::

## What you need

- A board with a network interface, and a broker you operate or trust.
  The simulator on your computer has no broker and no MQTT session.
- The broker's CA certificate on the device, because a controller that was never
  configured uses TLS on port 8883 and checks the broker's certificate. MQTT is off
  and has no broker until an operator names one
  ([Secure defaults](../runtime/connectivity.md#secure-defaults)).

## 1. Mark the variables

Put `{publish}` after the type of a variable the controller sends, and
`{subscribe}` after one it receives into.

```st runnable expect="Pressure=2.5" scans=2 scan_ms=10
PROGRAM Line
VAR
    Pressure : REAL {publish};
    Setpoint : REAL {subscribe};
END_VAR

Pressure := Setpoint + 2.5;
END_PROGRAM
```

A value that arrives for a `{subscribe}` variable is written into the process image
through the same force-aware interface as every other outside write: a variable
that you forced keeps its forced value, and the write takes effect at the next scan.

## 2. Configure the session

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

The documentation check merges this fragment into a project and builds it. Choose
the `profile`:

| `profile` | Use it for | Messages |
| --- | --- | --- |
| `sparkplug-b` | A Sparkplug B host application | Birth, data and death messages with a protobuf payload |
| `generic-broker` | Any MQTT broker | One JSON telemetry message |
| `aws-iot-core` | AWS IoT Core | The generic messages; AWS IoT Core authenticates a device with a client certificate and key |
| `azure-iot-hub` | Azure IoT Hub | Device-to-cloud messages on the hub's topics |
| `azure-event-grid-mqtt` | Azure Event Grid MQTT | Telemetry on the topic you name in `azureEventGridTopic`, or on the generic topic |

Keep `securityLevel` at `tls-server-verify` or stronger. Turning verification off
is an explicit setting that a release image refuses, and an image that allows it
shows `tls-verify: OFF` in the status
([Connectivity](../runtime/connectivity.md#secure-defaults)).

## 3. Put the settings and the certificate on the board

Provisioning a board is a human action in Studio, which sends these settings over
the serial link. You can check what the device has with the shell:

```bash
zplc mqtt status
zplc cert status
```

`zplc mqtt status` shows the broker, the client identifier and `tls-verify`. A
certificate is uploaded in chunks with `zplc cert begin`, `zplc cert chunk` and
`zplc cert commit`, as the [shell reference](../operations/shell.md#certificates--security-zplc-cert)
describes; no command prints a stored certificate, key or password.

## 4. What the controller sends

`<device>` is the client identifier, or the host name when no client identifier is
set. These shapes are read from the firmware and may change; read them as the
contract of this release.

| Profile | Telemetry | Commands to a variable |
| --- | --- | --- |
| `sparkplug-b` | `spBv1.0/<groupId>/DDATA/<device>`, after `NBIRTH` | `spBv1.0/<groupId>/DCMD/<device>/tag_<address>` |
| `generic-broker`, `aws-iot-core` | `<topicNamespace>/telemetry/<device>` | `<topicNamespace>/cmd/<device>/tag_<address>` |
| `azure-iot-hub` | `devices/<device>/messages/events/` | `devices/<device>/messages/devicebound/#` |

A generic message is JSON: `{"profile":"...","ts":<uptime in ms>,"metrics":{"tag_00a0":1.5}}`.
A metric is keyed by `tag_` and the four-digit hexadecimal address of the variable
in work memory, **not by its name**; the address is in the debug map of the build.
The last-will message is published to `.../status/<device>` or, for Sparkplug B, as
`NDEATH`.

A Sparkplug B node publishes `NBIRTH` after it connects, with sequence number 0 and
a `bdSeq` metric that matches the one in its last will. A rebirth command makes it
publish its birth messages again and nothing else.

## Use the function blocks instead

`MQTT_CONNECT` reports the state of the session that the device configuration
opens; `MQTT_PUBLISH` sends one message to a topic; `MQTT_SUBSCRIBE` delivers the
messages of a topic.

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

On the simulator of your computer there is no broker, so the block ends with `ERROR`
TRUE and `STATUS` 3 (no handler): it proves that the block compiles and reports a
status, not that a message was delivered. `STATUS` 4 means that the session is not
connected, and 5 that the request queue is full.

**Unstable:** the timing of `BUSY`, `DONE` and `ERROR` across scans, and what a
reset does to a request in flight, are being fixed as one handshake for all the
communication blocks. Act on the first scan in which `DONE` is TRUE.

## What is verified, and what is not

| Part | Verified | Level |
| --- | --- | --- |
| Hostile topics and payloads cannot change run state, forces or the loaded program, under all five profiles | Test of the product's client with spies on every authority | Host and `native_sim` |
| Command payloads of every supported type decode, and a malformed one is refused | Unit test of the decoder | Host and `native_sim` |
| Block handlers: layout, bounds, queue | Test with a stand-in client | Host and `native_sim` |
| TLS refuses a non-cryptographic random generator at build time | Build rule | Build |
| A session with a real broker, a TLS handshake, a Sparkplug B host application, QoS 1 delivery | Not tested | None |

## See also

- [Connectivity](../runtime/connectivity.md): secure defaults, credentials and what a message can do.
- [Use the cloud blocks](./cloud-blocks.md): provisioning and the Azure and AWS blocks.
- [Project file](../reference/project-file.md): every field of `communication.mqtt`.
- [Safety and limitations](../safety-and-limitations.md).
