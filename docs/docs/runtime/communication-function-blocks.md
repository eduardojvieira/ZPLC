---
slug: /runtime/communication-function-blocks
id: communication-function-blocks
title: Communication Function Blocks
sidebar_label: Communication FBs
description: The twelve communication and cloud blocks, their one handshake, their time limits, and the evidence behind each.
---

# Communication Function Blocks

Use these blocks when your IEC 61131-3 program has to talk to a field device, a broker or a cloud service. There are twelve, and they share one handshake. A block never waits for the network inside the scan. It hands the work to a thread of its own, reports `BUSY`, and reports the result on a later scan.

## The handshake

Every block starts with the same five pins.

| Pin      | Direction | Meaning                                            |
| -------- | --------- | -------------------------------------------------- |
| `EN`     | Input     | A rising edge starts one request.                  |
| `BUSY`   | Output    | `TRUE` from the request until its result.          |
| `DONE`   | Output    | `TRUE` when the request finished without error.    |
| `ERROR`  | Output    | `TRUE` when the request failed; `STATUS` says why. |
| `STATUS` | Output    | The status code of the last request.               |

A **request block** makes one request for each rising edge of `EN`: the four Modbus blocks, `MQTT_PUBLISH`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV` and `SPB_REBIRTH`. A **service block** reports a state on every scan: `MQTT_CONNECT`, `MQTT_SUBSCRIBE` and `AZURE_C2D_RECV`.

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

- **One rising edge, one request.** While `EN` stays `TRUE` after the result, the result is held and nothing repeats. A held `EN` does not send a second message, provision a second time or write a second value. To ask again, let `EN` fall for at least one scan and raise it again.
- **A request in flight completes.** If `EN` falls while `BUSY` is `TRUE`, the request still finishes and its result shows for one scan, so a one-scan pulse works as a trigger. A rising edge while `BUSY` is `TRUE` starts nothing.
- **`EN` `FALSE` clears `DONE` and `ERROR`.** `STATUS` keeps the code of the last request until the next one starts.
- **`COMM_RESET` returns the block to idle.** `EN`, `BUSY`, `DONE`, `ERROR` and `STATUS` become 0, an outstanding request is let go, and its late result is dropped instead of reaching the next block that asks.
- **The result can come in the same scan** as the rising edge, with no `BUSY` at all, when the request needs no wait.
- **Call the block on every scan.** It advances only when it is called.

### Service blocks

The handler of a service block runs on every scan while `EN` is `TRUE`, and its answer is the state of the block:

| State                                               | `BUSY`  | `DONE`  | `ERROR` | `STATUS` |
| --------------------------------------------------- | ------- | ------- | ------- | -------- |
| Not reached yet (connecting, subscribing)           | `TRUE`  | `FALSE` | `FALSE` | 1        |
| Reached (the session is up, the subscription holds) | `FALSE` | `TRUE`  | `FALSE` | 0        |
| Lost or not available                               | `FALSE` | `FALSE` | `TRUE`  | the code |

When `EN` falls, `BUSY`, `DONE` and `ERROR` are cleared, and a received `PAYLOAD` goes with them. `VALID` of `MQTT_SUBSCRIBE` and `AZURE_C2D_RECV` is `TRUE` for exactly one scan, the scan in which a message is new, and `PAYLOAD` keeps the last message.

### Status codes

| `STATUS` | Name                  | Meaning                                                                                    |
| -------- | --------------------- | ------------------------------------------------------------------------------------------ |
| 0        | OK                    | The request finished.                                                                      |
| 1        | Busy                  | The request is in progress.                                                                |
| 2        | Timeout               | The peer did not answer, or the request outlived its time limit.                           |
| 3        | No handler            | This runtime has no handler for the block.                                                 |
| 4        | Not connected         | There is no connection to the peer.                                                        |
| 5        | Queue full            | Every request slot is in use.                                                              |
| 6        | Invalid address       | A pin holds a value the request cannot be made with.                                       |
| 7        | String overflow       | A string is longer than the message can carry.                                             |
| 8        | Protocol error        | The peer answered with something the protocol does not allow, or with an error.            |
| 9        | Authentication failed | The peer refused the credentials.                                                          |
| 10       | Not available         | The service of the block is not available in this runtime, or is off in the configuration. |

## Time limits

| What                                                | Limit                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A call of a block in the scan                       | Takes a lock held for a few instructions and queues the request. It never waits for the network, a socket or a flash.                                                                                                                                                                                                               |
| A Modbus request                                    | The client waits at most twice the configured timeout (to connect, then for the answer). The block reports `ERROR` with `STATUS` 2 at the latest `(2 x timeout + 100 ms) x 8` after the request, which is 8.8 s with the default timeout of 500 ms.                                                                                 |
| `MQTT_PUBLISH`, `AZURE_EG_PUB`, `SPB_REBIRTH`       | The client thread sends the message within one pass of its loop; `ERROR` with `STATUS` 2 after 5 s.                                                                                                                                                                                                                                 |
| A provisioning (`AZURE_DPS_PROV`, `AWS_FLEET_PROV`) | The service waits for the broker for 30 s in each step; `ERROR` with `STATUS` 2 after 90 s.                                                                                                                                                                                                                                         |
| Loss of the broker session                          | `MQTT_CONNECT`, `MQTT_SUBSCRIBE` and `AZURE_C2D_RECV` report `ERROR` with `STATUS` 4 (or the code of the failure) on the scan after the client notices: at once for a closed or reset connection, within the keep-alive interval for a silent loss. A queued message that was not yet sent is failed, not sent on the next session. |
| Reconnection                                        | One attempt at a time. The client waits up to 5 s for the broker's answer, then waits 2 s, doubling up to 60 s, before the next attempt.                                                                                                                                                                                            |

## The twelve blocks

### Modbus

These blocks read and write a remote device without implicit auto-mapping. `COUNT` is 1: a request for more registers or coils is refused with `STATUS` 6.

- `MB_READ_HREG` reads holding registers (function code 3). `VALUE` is the register read.
- `MB_WRITE_HREG` writes a holding register (function code 6). `VALUE` is the value written.
- `MB_READ_COIL` reads coils (function code 1). `VALUE` is the coil read.
- `MB_WRITE_COIL` writes a coil (function code 5). `VALUE` is the value written.

`PROTO` is 0 for RTU and 1 for TCP. For TCP, `HOST` and `PORT` are required, with `PORT` other than 0. `SLAVE_ID` is 0 to 255.

### MQTT

- `MQTT_CONNECT` reports the state of the MQTT session that the device configuration opens. `CONNECTED` is `TRUE` while it is up. The block does not open the session.
- `MQTT_PUBLISH` publishes `PAYLOAD` to `TOPIC` once for each rising edge. `DONE` means the client accepted the message for sending. The acknowledgement of a QoS 1 or 2 message is not waited for.
- `MQTT_SUBSCRIBE` keeps a subscription to `TOPIC` and delivers its messages in `PAYLOAD`, with `VALID` for one scan each.

### Cloud

- `AZURE_C2D_RECV` receives Azure cloud-to-device messages (the Azure IoT Hub profile with cloud-to-device messages on).
- `AZURE_DPS_PROV` registers with the Azure Device Provisioning Service. `ASSIGNED_HUB` is the hub that was assigned, and a non-empty `DEVICE_ID` is the registration identifier used.
- `AZURE_EG_PUB` publishes an event to an Azure Event Grid topic (the Event Grid profile). An empty `TOPIC` or `EVENT_TYPE` means the configured default.
- `AWS_FLEET_PROV` runs AWS IoT fleet provisioning. `THING_NAME` is the thing that was registered, and a non-empty `TEMPLATE_NAME` is the template used.
- `SPB_REBIRTH` asks the Sparkplug B session to publish its birth certificate again (the Sparkplug B profile).

The compiler registers all twelve, so you can instance them in Structured Text. Whether the Ladder Diagram and Function Block Diagram editors offer each block has not been verified for this release.

## In simulation

The native runtime that the simulation and the command line drive runs the same Modbus and MQTT handlers as a controller. It uses a Modbus TCP client and an MQTT 3.1.1 client of the host (plain TCP). It stays off until the session asks for it: a runtime started the old way answers every block with `STATUS` 3.

| Environment of the runtime          | Meaning                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ZPLC_NATIVE_COMM=1`                | Turns the communication blocks on.                                                                           |
| `ZPLC_NATIVE_MQTT_BROKER=host:port` | The broker that `MQTT_CONNECT`, `MQTT_PUBLISH` and `MQTT_SUBSCRIBE` use. Without it they answer `STATUS` 10. |
| `ZPLC_NATIVE_MODBUS_TIMEOUT_MS`     | The time a Modbus request waits to connect and again for the answer. 500 by default.                         |

The ZPLC application and `zplc-cli test` start the peers for you. A session they start sets `ZPLC_NATIVE_COMM=1` and `ZPLC_NATIVE_LOOPBACK=1`, and the runtime then starts, inside its own process on 127.0.0.1, a Modbus TCP server (1024 holding registers and 1024 coils) and an MQTT broker. They end with the session and need no installed broker, Python or network. Every Modbus TCP request of a program reaches that server whatever host and port the block names, because a simulation has no plant. The MQTT blocks use that broker, and a broker named in the environment of the application is ignored. The console of the session says which endpoints run.

If an endpoint cannot start, all twelve blocks answer `STATUS` 10 ("not available in simulation"), the capability `communication-endpoints` of the session reads `unavailable`, and no block reports success without acting. A Modbus request on RTU (there is no serial device) and every cloud block (there is no service) answer `STATUS` 10 in simulation. `zplc_loopback`, built with the runtime, is the same pair of endpoints as a separate program for tests: it prints its ports as one line of JSON and ends when its standard input closes.

## What each block was verified against

No block was run against a live service, and verifying one needs no paid subscription. The evidence for each block is of one or two kinds. The **handler** evidence covers the pins, the handshake, the status codes and the hand-over to a worker, with the client replaced by a stand-in that answers what the test says. The **protocol double** evidence runs the block against a server written for the test that speaks the protocol on a loopback socket. A local double shows how the block and the protocol behave. It does not show that a real device, broker or cloud service accepts the exchange.

| Block                                                            | Handler                                                       | Protocol double                                                                                                                                                                                                                                                                                                                                                                                                         | Live service |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL`, `MB_WRITE_COIL` | Yes                                                           | Modbus TCP: the transaction code of the client is one file compiled in the controller and in the simulation runtime, and runs against a server on loopback in both (`native_sim` and host). Cases: success, a response in pieces, exception, silence, a closed connection, a refused port, reset while busy. RTU: only the interface parameters are checked; no serial device is used                                   | No           |
| `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE`                 | Yes                                                           | The MQTT client of the simulation runtime against a broker on loopback: session, publish, subscribe, loss of the session, reconnection, silent loss. The client of the controller (`zplc_mqtt.c`, the file a board runs) also runs on `native_sim` against a broker written for the test: session, publish once per request, subscription and message, no `CONNACK`, refused connection, lost session, reset while busy | No           |
| `AZURE_C2D_RECV`, `AZURE_EG_PUB`, `SPB_REBIRTH`                  | Yes                                                           | The client of the controller on `native_sim` against the same broker, with the profile of each service: a cloud-to-device message, one Event Grid message and one `NBIRTH` per request, `STATUS` 10 under a profile that does not offer the service, `NOT_CONNECTED` with no session, reset while busy. The exchange with the real Azure or Sparkplug service is not tested                                             | No           |
| `AZURE_DPS_PROV`, `AWS_FLEET_PROV`                               | Yes, with the provisioning service replaced by one that waits | None in the test suite. `tools/connectivity/` has scripts that answer on a broker you run yourself, used by hand                                                                                                                                                                                                                                                                                                        | No           |
