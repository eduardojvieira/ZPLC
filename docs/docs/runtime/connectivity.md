---
slug: /runtime/connectivity
id: connectivity
title: Connectivity & Protocols
sidebar_label: Connectivity
description: Overview of supported industrial network protocols and board capabilities in ZPLC.
---

# Connectivity & Protocols

ZPLC provides built-in support for standard industrial automation protocols, allowing your controllers to interact with field devices, SCADA systems, and cloud platforms.

## Board Capabilities

Protocol support depends on the physical capabilities of your target board. ZPLC categorizes boards into three levels of connectivity:

- **Serial-only**: Supports protocols like Modbus RTU via UART/RS-485.
- **Wi-Fi capable**: Supports TCP/UDP protocols (Modbus TCP, MQTT) over wireless networks (e.g., ESP32-S3).
- **Ethernet capable**: Supports TCP/UDP protocols over wired connections (e.g., STM32 Nucleo/Discovery).

Studio shows the Wi-Fi or Ethernet settings only for boards that have that hardware.

## Supported Protocols

ZPLC natively supports:

- **Modbus**: Both Modbus RTU (Serial) and Modbus TCP (Network).
- **MQTT**: Standard MQTT publish/subscribe messaging for IIoT integration, including profiles for Sparkplug B, standard brokers, AWS IoT Core, and Azure IoT Hub.

## Configuring Connectivity

Connectivity is defined in your project's `zplc.json` file. Through the IDE, you can:
1. Configure Modbus RTU/TCP networks (baud rates, IP addresses, node IDs).
2. Set up MQTT broker credentials and certificates.
3. Map internal PLC variables directly to Modbus registers/coils or MQTT topics via **Communication Bindings**.

The runtime handles the underlying protocol dispatch automatically while your PLC logic is executing.

### Modbus server mapping overrides

The controller's Communication Map can temporarily override a Modbus **server**
binding for a loaded tag. The override is range-checked for the tag width and
only changes the local RTU/TCP server mapping. It never changes the compiled
remote address used by Modbus RTU/TCP polling clients. Treat it as runtime
configuration: do not assume it is persisted unless a verified configuration
save/load workflow has recorded it for the target.

## Secure defaults

A controller that was never configured is safe on a plant network:

- **No broker.** MQTT is off and no broker address is stored. Nothing resolves or connects until an operator names a server and turns MQTT on; with MQTT on and no broker the client reports `-EDESTADDRREQ` in `zplc mqtt status` and does not try.
- **TLS, verified.** The default transport is TLS on port 8883 and the broker's certificate is checked against the CA you installed. Plain TCP (`mqtt_transport 0`) and TLS without verification (`mqtt_security 1`) are explicit settings, never the default.
- **Verification stays on in release firmware.** `mqtt_security 1` is refused unless the image was built with `CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS=y`, and a stored value of 1 is not applied by an image that does not allow it. In an image that does, `zplc mqtt status` shows `tls-verify: OFF` and `zplc status` shows a warning for as long as the setting stands.

The security setting only means something on a TLS transport. With plain TCP or WS the session has no TLS whatever `mqtt_security` says, and the status shows `tls-verify: n/a`.

### TLS and the random number generator

TLS needs random numbers that nobody can predict. A firmware build that enables TLS together with `CONFIG_TEST_RANDOM_GENERATOR`, or with no cryptographic random source, stops at configuration time (`zplc_rule_tls_with_test_random_generator`). The Nucleo-H743ZI and Arduino Opta images used to set that option; they now use the hardware random generator of the STM32 for the network stack, and **TLS is off in them** until the generator has been verified on the board (HIL-011): MQTT on those two boards runs over plain TCP only, and a TLS transport is refused instead of being downgraded. The ESP32-S3 image keeps TLS on, with its hardware generator.

## Credentials

- No command prints a password, a key, a SAS key or a certificate, and no log line contains one: `zplc config get` shows `(set)` or `(not set)`, `zplc cert status` shows presence and size only, and the MQTT client logs error codes and paths, not values. The test of the firmware sets a known value for each credential and looks for it in the output of every reporting command and in the log.
- Credentials are stored with the other settings, and certificates and keys as files or entries of the device's non-volatile store. **None of the supported boards has a protected store** (no secure element, no encrypted flash by default): anybody who can read the flash of the board can read them. Treat the board as holding the secret, and use an account with only the rights the controller needs on the broker or the cloud.
- `config set` over the serial link carries the value in the clear on that link; provision credentials on a link you trust.

## What a message from the network can do

No message that arrives from Modbus, MQTT or a cloud service changes RUN/STOP, sets or clears a force, or downloads a program. Those actions exist only in the diagnostic shell and in Studio, on the serial link.

| Source | What it can change | What it cannot reach |
| --- | --- | --- |
| Modbus TCP and RTU server | The bytes of the variables you bound with `{modbus}`, through the server mapping and the force-aware write of the exchange: an address with an active force keeps it | RUN/STOP, forces, program download |
| MQTT topics of subscribed variables (`DCMD`, command topics) | The bytes of the variables you marked `{subscribe}`, through the force-aware write: an address with an active force keeps it | RUN/STOP, forces, program download |
| Sparkplug B `NCMD`/`DCMD` Rebirth | Makes the node publish its birth certificates again | RUN/STOP, forces, program download |
| Azure cloud-to-device message | The payload of the `AZURE_C2D_RECV` block that your program runs | RUN/STOP, forces, program download |
| Azure direct methods and device twin, AWS shadow and jobs | Nothing: they are logged, and a direct method is answered `501` (not implemented) | RUN/STOP, forces, program download |
| Provisioning reply (Azure DPS, AWS fleet) | Only after your program started the block: the assigned hub or the issued credentials | RUN/STOP, forces, program download |

This is checked in two places. The object files of the handlers of every board image are read at link level (`tools/firmware-test/check_inbound_authority.py`, run by `run.sh size`): none of them references the scheduler's start, stop, pause, resume, step or load, the force set and clear calls, the program loader or store, or a reboot, and the exchange object they write through is held to the same list. And two tests put the inbound code in front of a core whose authority entries count their calls: one drives every Modbus function code and every write count through the server's framing and mapping (`firmware/tests/inbound_authority`), and one delivers hostile topics and payloads (stop, run, force, load commands in text and JSON, every byte value, the longest payload, node-control metrics of Sparkplug B) to the MQTT client of the product under each of its five profiles (`firmware/tests/inbound_mqtt`). The only write a message caused in them was a write to a bound variable, queued through the exchange (`zplc_exchange_write`), the one interface the inbound code may reach.

## Saved settings

`zplc config save` writes every setting that `zplc config get` reports (and the Modbus mapping overrides) into the same non-volatile store as the program, one entry per setting, and reports an error when an entry could not be written. A reboot reads them back over the defaults. A test sets each of the 70 settings through the shell, saves, restarts the configuration the way a reboot does, and compares each one. Two limits remain:

- A board whose store cannot be mounted cannot save settings: the Nucleo-H743ZI keeps its storage in one 128 KB sector, which the store cannot use (IO-008). `config save` there reports an error; it no longer says `OK`.
- The save writes the entries one after the other. A power loss in the middle leaves some settings new and some old, each one valid by itself.

