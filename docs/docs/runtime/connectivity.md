---
slug: /runtime/connectivity
id: connectivity
title: Connectivity & Protocols
sidebar_label: Connectivity
description: The industrial protocols ZPLC implements, what each board class can carry, the secure defaults, and the evidence level of every statement.
---

# Connectivity & Protocols

This page tells you which protocols the firmware implements, what a board needs to carry them, how a fresh controller is configured safely, and what a message from the network can and cannot do. It is the concept page for the three how-to guides: [Modbus](../guides/modbus.md), [MQTT and Sparkplug B](../guides/mqtt-sparkplug.md) and [the cloud blocks](../guides/cloud-blocks.md).

:::warning Evidence level: host and QEMU-class only
Every protocol was exercised on the host and on `native_sim`, against servers and brokers written for the tests. No exchange over a wire, a serial line or a network interface of a board is recorded, and no real Modbus device, broker or cloud service has taken part. The [evidence table](#what-has-been-exercised) says which level each part has.
:::

## What the firmware implements

- **Modbus.** A server over RTU (serial) and TCP, and a client for both with four function blocks.
- **MQTT.** A client with five profiles: `generic-broker`, `sparkplug-b`, `aws-iot-core`, `azure-iot-hub` and `azure-event-grid-mqtt`.
- **Twelve communication function blocks** that let a program use these links ([Communication function blocks](./communication-function-blocks.md)).

## What a board needs

Protocol use depends on the interfaces of the board, and the manifest sorts boards into classes:

| Class           | Interface                          | Protocols the firmware is built for  | Boards of the manifest                                           |
| --------------- | ---------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Serial-focused  | A UART, optionally an RS-485 stage | Modbus RTU                           | Raspberry Pi Pico, Waveshare RP2040-Zero, Arduino GIGA R1 (M7)   |
| Network, Wi-Fi  | A wireless interface               | Modbus TCP, MQTT                     | ESP32-S3-DevKitC-1, Arduino Opta WiFi (M7)                       |
| Network, wired  | An Ethernet interface              | Modbus TCP, MQTT                     | STM32 Nucleo-H743ZI, STM32F746G Discovery                        |

ZPLC shows the Wi-Fi or Ethernet settings only for a board that has the hardware. The class of each board is in [Boards](../reference/boards.md).

## Configure it

Connectivity lives in the `communication` section of the project's `zplc.json`. In ZPLC you can:

1. Configure Modbus RTU and TCP (baud rate, parity, port, unit identifier).
2. Set the MQTT broker, profile, security level and certificates.
3. Bind PLC variables to Modbus registers and coils or to MQTT metrics with **Communication Tags**.

The runtime moves the data while your logic runs. Provisioning a board with these settings is a human action: ZPLC sends them over the serial link, and you can do the same with `zplc config` ([Use the device shell](../operations/shell.md)).

### Modbus areas and addresses

A Modbus server has four address spaces. A coil, a discrete input, an input register and a holding register with the same number are four different variables. The number `N` of the `{modbus:N}` tag of a variable says which one it is, in the notation of the Modbus world:

| `N`                            | Area             | Address on the wire | A client can                              |
| ------------------------------ | ---------------- | ------------------- | ----------------------------------------- |
| 10001 to 19999                 | Discrete input   | `N - 10001`         | read it (function 2)                      |
| 30001 to 39999                 | Input register   | `N - 30001`         | read it (function 4)                      |
| 40001 to 49999                 | Holding register | `N - 40001`         | read it (function 3) and write it (6, 16) |
| any other number, a `BOOL`     | Coil             | `N`                 | read it (function 1) and write it (5, 15) |
| any other number, another type | Holding register | `N`                 | read it (function 3) and write it (6, 16) |

A variable is served in one area only. A request for an address that no variable has in the area it asks for gets exception 2 (illegal data address), even when another area has a variable at that number. Discrete inputs and input registers have no write function. A 32-bit variable takes two consecutive registers, and a bit area carries one bit per variable.

A project names the area with the `MODBUS_COIL`, `MODBUS_DISCRETE_INPUT`, `MODBUS_INPUT_REGISTER` and `MODBUS_HOLDING_REGISTER` helpers or with the area of a communication tag. The address you give is the address on the wire, and the build writes the number of the table: a holding register at address 5 is `{modbus:40006}`. An address already in the notation of its area (40001 for a holding register) is kept. An address in the notation of another area, or one the notation cannot write (an input register past 9998), is a build error at the line of the helper.

Every variable of WORK (`0x2000` to `0x3FFF`) and of RETAIN can be bound, and the server serves the whole wire range up to address 65535 for the addresses that have a variable. The Modbus TCP client of the controller reads a tag with the address of its area on the remote device: a holding register with function 3 and a coil with function 1. It has no read of discrete inputs or input registers, so a tag in those areas is served by the server only.

### Modbus server mapping overrides

The Communication Map of the controller can override a Modbus **server** binding for a loaded tag. The override is range-checked for the width of the tag and changes only the local RTU or TCP server mapping. It never changes the compiled remote address that the polling clients use. Treat it as runtime configuration, and do not assume it survives a restart unless a verified save and load workflow has recorded that for the target.

## Secure defaults

A controller that was never configured is safe on a plant network:

- **No broker.** MQTT is off and no broker address is stored. Nothing resolves or connects until an operator names a server and turns MQTT on. With MQTT on and no broker, the client reports `-EDESTADDRREQ` in `zplc mqtt status` and does not try.
- **TLS, verified.** The default transport is TLS on port 8883, and the broker's certificate is checked against the CA you installed. Plain TCP (`mqtt_transport 0`) and TLS without verification (`mqtt_security 1`) are explicit settings, never the default.
- **Verification stays on in release firmware.** `mqtt_security 1` is refused unless the image was built with `CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS=y`, and an image that does not allow it ignores a stored value of 1. In an image that allows it, `zplc mqtt status` shows `tls-verify: OFF` and `zplc status` shows a warning for as long as the setting stands.

The security setting only means something on a TLS transport. With plain TCP or WS the session has no TLS whatever `mqtt_security` says, and the status shows `tls-verify: n/a`.

### TLS and the random number generator

TLS needs random numbers nobody can predict. A firmware build that enables TLS together with `CONFIG_TEST_RANDOM_GENERATOR`, or with no cryptographic random source, stops at configuration time (`zplc_rule_tls_with_test_random_generator`). The Nucleo-H743ZI and Arduino Opta images used to set that option. They now use the STM32 hardware random generator for the network stack, and **TLS is off in them** until the generator has a record on the board. MQTT on those two boards runs over plain TCP only, and a TLS transport is refused instead of being downgraded. The ESP32-S3 image keeps TLS on, with its hardware generator.

## Credentials

- No command prints a password, a key, a SAS key or a certificate, and no log line contains one. `zplc config get` shows `(set)` or `(not set)`, `zplc cert status` shows presence and size only, and the MQTT client logs error codes and paths, not values. The firmware test sets a known value for each credential and looks for it in the output of every reporting command and in the log.
- Credentials are stored with the other settings, and certificates and keys as files or entries of the device's non-volatile store. **None of the boards has a protected store** (no secure element, no encrypted flash by default), so anybody who can read the flash of the board can read them. Treat the board as holding the secret, and use an account with only the rights the controller needs on the broker or the cloud.
- `config set` over the serial link carries the value in the clear on that link. Provision credentials over a link you trust.

## What a message from the network can do

No message from Modbus, MQTT or a cloud service changes RUN or STOP, sets or clears a force, or downloads a program. Those actions exist only in the diagnostic shell and in the ZPLC application, on the serial link.

| Source                                                       | What it can change                                                                                                                              | What it cannot reach               |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Modbus TCP and RTU server                                    | The variables you bound with `{modbus}`, through the server mapping and the force-aware write of the exchange: an address with a force keeps it | RUN/STOP, forces, program download |
| MQTT topics of subscribed variables (`DCMD`, command topics) | The variables you marked `{subscribe}`, through the force-aware write: an address with a force keeps it                                         | RUN/STOP, forces, program download |
| Sparkplug B `NCMD`/`DCMD` Rebirth                            | Makes the node publish its birth certificates again                                                                                             | RUN/STOP, forces, program download |
| Azure cloud-to-device message                                | The payload of the `AZURE_C2D_RECV` block your program runs                                                                                     | RUN/STOP, forces, program download |
| Azure direct methods and device twin, AWS shadow and jobs    | Nothing: they are logged, and a direct method is answered `501` (not implemented)                                                               | RUN/STOP, forces, program download |
| Provisioning reply (Azure DPS, AWS fleet)                    | Only after your program started the block: the assigned hub or the issued credentials                                                           | RUN/STOP, forces, program download |

Two checks hold this. The object files of the handlers of every board image are read at link level (`tools/firmware-test/check_inbound_authority.py`, run by `run.sh size`): none of them references the scheduler's start, stop, pause, resume, step or load, the force calls, the program loader or store, or a reboot. And two firmware tests put the inbound code in front of a core whose authority entries count their calls. One drives every Modbus function code and write count through the server's framing and mapping (`firmware/tests/inbound_authority`). The other delivers hostile topics and payloads to the MQTT client under each of its five profiles (`firmware/tests/inbound_mqtt`). The only write a message caused was to a bound variable, queued through the exchange (`zplc_exchange_write`), the one interface inbound code may reach.

## Saved settings

`zplc config save` writes every setting that `zplc config get` reports, and the Modbus mapping overrides, into the same non-volatile store as the program, one entry per setting. It reports an error when an entry could not be written, and a reboot reads the entries back over the defaults. A firmware test sets each setting through the shell, saves, restarts the configuration the way a reboot does, and compares each one. Two limits remain:

- A board whose store cannot be mounted cannot save settings. The Nucleo-H743ZI keeps its storage in one 128 KB sector that the store cannot use, so `config save` there reports an error and no longer says `OK`.
- The save writes the entries one after the other. A power loss in the middle leaves some settings new and some old, each valid by itself.

## What has been exercised

| Part                                                                | Evidence level                         | What exists                                                                            |
| ------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| Modbus server framing and mapping                                   | Host and `native_sim`                  | Tests that put frames in front of the server                                           |
| Modbus TCP client transaction code                                  | Host and `native_sim`                  | One source file, run against a server written for the test on loopback                 |
| Modbus RTU client                                                   | `native_sim` (interface parameters)    | Only the parameters are checked; no serial device is used                              |
| MQTT client of the simulation runtime                               | Host                                   | A broker written for the test on loopback, under sanitizers                            |
| MQTT client of the controller and its five profiles                 | `native_sim`                           | A broker written for the test on loopback, and hostile topics and payloads             |
| Build of every board with its network options                       | Target build                           | Continuous integration                                                                 |
| Any exchange over a wire, a serial line, a real broker or a service | None                                   | Not recorded; bench or manual evidence is still open                                   |
