---
slug: /runtime/communication-function-blocks
id: communication-function-blocks
title: Communication Function Blocks
sidebar_label: Communication FBs
description: The twelve communication and cloud blocks, their one handshake, their time limits and what each was verified against.
---

# Communication Function Blocks

ZPLC provides twelve function blocks that talk to field devices, brokers and cloud services from your IEC 61131-3 logic. They share one handshake. A block never waits for the network inside the scan: it hands the work to a thread of its own, reports `BUSY`, and reports the result on a later scan.

## The handshake

Every block starts with the same five pins.

| Pin | Direction | Meaning |
| --- | --- | --- |
| `EN` | Input | A rising edge starts one request. |
| `BUSY` | Output | `TRUE` from the request until its result. |
| `DONE` | Output | `TRUE` when the request finished without error. |
| `ERROR` | Output | `TRUE` when the request failed; `STATUS` says why. |
| `STATUS` | Output | The status code of the last request. |

A block that makes **one request for each rising edge of `EN`** is a request block: the four Modbus blocks, `MQTT_PUBLISH`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV` and `SPB_REBIRTH`. A block that **reports a state on every scan** is a service block: `MQTT_CONNECT`, `MQTT_SUBSCRIBE` and `AZURE_C2D_RECV`.

### Request blocks

```text
scan      1  2  3  4  5  6  7  8  9 10 11 12
EN        0  1  1  1  1  1  1  1  0  0  1  1
BUSY      0  1  1  1  0  0  0  0  0  0  1  1     the request, from the scan EN rose in
DONE      0  0  0  0  1  1  1  1  0  0  0  0     the result, held while EN stays TRUE
ERROR     0  0  0  0  0  0  0  0  0  0  0  0     (a failed request holds ERROR instead of DONE)
STATUS    0  1  1  1  0  0  0  0  0  0  1  1     1 while BUSY, then the code of the result
handler   .  S  p  p  R  .  .  .  .  .  S  p     S start, p poll that is still pending, R poll with the result
```

The values are what the program reads after the call of the block in that scan. From scan 6 to scan 8 the result is held and the handler is not called.

- **One rising edge, one request.** While `EN` stays `TRUE` after the result, the result is held and nothing is repeated: a held `EN` does not send a second message, provision a second time or write a second value. To make another request, let `EN` fall for at least one scan and raise it again.
- **A request in flight completes.** If `EN` falls while `BUSY` is `TRUE`, the request still finishes and its result is shown for one scan. A trigger that is a one-scan pulse works. A rising edge while `BUSY` is `TRUE` starts nothing.
- **`EN` `FALSE` clears `DONE` and `ERROR`.** `STATUS` keeps the code of the last request until the next one starts.
- **A reset (`COMM_RESET`) returns the block to idle**: `EN`, `BUSY`, `DONE`, `ERROR` and `STATUS` are 0, an outstanding request is let go of, and its late result is dropped, not delivered to the next block that asks.
- **The result can come in the same scan** as the rising edge, with no `BUSY` at all, when the request needs no wait.
- **Call the block on every scan.** The block advances only when it is called.

### Service blocks

The handler of a service block is called on every scan while `EN` is `TRUE` and its answer is the state of the block:

| State | `BUSY` | `DONE` | `ERROR` | `STATUS` |
| --- | --- | --- | --- | --- |
| Not reached yet (connecting, subscribing) | `TRUE` | `FALSE` | `FALSE` | 1 |
| Reached (the session is up, the subscription holds) | `FALSE` | `TRUE` | `FALSE` | 0 |
| Lost or not available | `FALSE` | `FALSE` | `TRUE` | the code |

When `EN` falls, `BUSY`, `DONE` and `ERROR` are cleared and a received `PAYLOAD` goes with them. `VALID` of `MQTT_SUBSCRIBE` and `AZURE_C2D_RECV` is `TRUE` for exactly one scan, the scan a message is new in; `PAYLOAD` keeps the last message.

### Status codes

| `STATUS` | Name | Meaning |
| --- | --- | --- |
| 0 | OK | The request finished. |
| 1 | Busy | The request is in progress. |
| 2 | Timeout | The peer did not answer, or the request outlived its time limit. |
| 3 | No handler | This runtime has no handler for the block. |
| 4 | Not connected | There is no connection to the peer. |
| 5 | Queue full | Every request slot is in use. |
| 6 | Invalid address | A pin holds a value the request cannot be made with. |
| 7 | String overflow | A string is longer than the message can carry. |
| 8 | Protocol error | The peer answered with something the protocol does not allow, or with an error. |
| 9 | Authentication failed | The peer refused the credentials. |
| 10 | Not available | The service of the block is not available in this runtime, or is off in the configuration. |

## Time limits

| What | Limit |
| --- | --- |
| A call of a block in the scan | Takes a lock held for a few instructions and queues the request. It never waits for the network, a socket or a flash. |
| A Modbus request | The client waits at most twice the configured timeout (to connect, then for the answer); the block reports `ERROR` with `STATUS` 2 at the latest `(2 x timeout + 100 ms) x 8` after the request, which is 8.8 s with the default timeout of 500 ms. |
| `MQTT_PUBLISH`, `AZURE_EG_PUB`, `SPB_REBIRTH` | The client thread sends the message within one pass of its loop; `ERROR` with `STATUS` 2 after 5 s. |
| A provisioning (`AZURE_DPS_PROV`, `AWS_FLEET_PROV`) | The service waits for the broker for 30 s in each step; `ERROR` with `STATUS` 2 after 90 s. |
| Loss of the broker session | `MQTT_CONNECT`, `MQTT_SUBSCRIBE` and `AZURE_C2D_RECV` report `ERROR` with `STATUS` 4 (or the code of the failure) on the scan after the client notices: at once for a connection that is closed or reset, and within the keep-alive interval for a silent loss. A message that was queued and not yet sent is failed, not sent on the next session. |
| Reconnection | One attempt at a time. The client waits up to 5 s for the broker's answer and then waits 2 s, doubling up to 60 s, before the next attempt. |

## Supported function blocks

### Modbus communications

Used to interact with field devices without using implicit auto-mapping. `COUNT` is 1: a request for more registers or coils is refused with `STATUS` 6.

- `MB_READ_HREG`: read holding registers (function code 3); `VALUE` is the register read.
- `MB_WRITE_HREG`: write a holding register (function code 6); `VALUE` is the value written.
- `MB_READ_COIL`: read coils (function code 1); `VALUE` is the coil read.
- `MB_WRITE_COIL`: write a coil (function code 5); `VALUE` is the value written.

`PROTO` is 0 for RTU and 1 for TCP; for TCP `HOST` and `PORT` are required, with `PORT` other than 0. `SLAVE_ID` is 0 to 255.

### MQTT messaging

- `MQTT_CONNECT`: reports the state of the MQTT session that the device configuration opens (`CONNECTED` is `TRUE` while it is up). It does not open the session.
- `MQTT_PUBLISH`: publishes `PAYLOAD` to `TOPIC` once for each rising edge. `DONE` means that the client accepted the message for sending; the acknowledgement of a QoS 1 or 2 message is not waited for.
- `MQTT_SUBSCRIBE`: keeps a subscription to `TOPIC` and delivers its messages in `PAYLOAD`, with `VALID` for one scan each.

### Cloud integration wrappers

- `AZURE_C2D_RECV`: receives Azure cloud-to-device messages (the Azure IoT Hub profile with cloud-to-device messages enabled).
- `AZURE_DPS_PROV`: Azure Device Provisioning Service registration; `ASSIGNED_HUB` is the hub that was assigned. A non-empty `DEVICE_ID` is the registration identifier used for the request.
- `AZURE_EG_PUB`: publishes an event to an Azure Event Grid topic (the Event Grid profile). An empty `TOPIC` or `EVENT_TYPE` is the configured default.
- `AWS_FLEET_PROV`: AWS IoT fleet provisioning; `THING_NAME` is the thing that was registered. A non-empty `TEMPLATE_NAME` is the template used for the request.
- `SPB_REBIRTH`: asks the Sparkplug B session to publish its birth certificate again (the Sparkplug B profile).

## What each block was verified against

No block was verified against a live service, and verifying one needs no paid subscription. The verification of each block is one of three kinds: the **handler** (the pins, the handshake, the status codes and the hand-over to a worker, with the client replaced by a stand-in that answers what the test says), a **protocol double** (the blocks against a server written for the test that speaks the protocol on a loopback socket), or a **recorded exchange** (the messages of a service, replayed). A local double proves the behaviour of the block and of the protocol. It does not prove that a real cloud service accepts the exchange.

| Block | Handler | Protocol double | Live service |
| --- | --- | --- | --- |
| `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL`, `MB_WRITE_COIL` | Yes | Modbus TCP server on loopback (host runtime); the RTU client is configured with the timeout in the unit the Zephyr Modbus client reads, and no serial device is used | No |
| `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE` | Yes | MQTT broker on loopback (host runtime) | No |
| `AZURE_C2D_RECV`, `AZURE_EG_PUB`, `SPB_REBIRTH` | Yes | None | No |
| `AZURE_DPS_PROV`, `AWS_FLEET_PROV` | Yes, with the provisioning service replaced by one that waits | None in the test suite; `tools/connectivity/` has scripts that answer on a broker you run yourself, used by hand | No |

## Language availability

The compiler registers every communication function block, so you can instance them in Structured Text (ST). Whether the Ladder Diagram (LD) and Function Block Diagram (FBD) editors offer each block has not been verified for this release.
