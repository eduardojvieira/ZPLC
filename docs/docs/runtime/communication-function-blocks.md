---
slug: /runtime/communication-function-blocks
id: communication-function-blocks
title: Communication Function Blocks
sidebar_label: Communication FBs
description: Using Function Blocks for asynchronous networking, Modbus, and MQTT operations.
---

# Communication Function Blocks

ZPLC provides specialized Function Blocks (FBs) that interact directly with the runtime's network dispatch layer. These blocks allow you to read/write external devices and publish/subscribe telemetry directly from your IEC 61131-3 logic.

## Asynchronous Execution Model

Unlike simple arithmetic operations, network communication is asynchronous. All communication FBs share a standard asynchronous interface:

- **`EN`** (BOOL): Exec trigger.
- **`BUSY`** (BOOL): True while the network request is in flight.
- **`DONE`** (BOOL): True for one cycle when the request successfully completes.
- **`ERROR`** (BOOL): True if the request failed or timed out.
- **`STATUS`** (DINT): Returns the underlying runtime error code for diagnostics.

> [!IMPORTANT]
> Because these blocks execute asynchronously, avoid placing them inside fast cyclic loops without checking the `BUSY` flag, as this can overwhelm the network stack.

## Supported Function Blocks

### Modbus Communications
Used to interact with field devices without using implicit auto-mapping.

- `MB_READ_HREG`: Read Holding Registers (Function Code 3).
- `MB_WRITE_HREG`: Write Holding Registers (Function Code 16).
- `MB_READ_COIL`: Read Coils (Function Code 1).
- `MB_WRITE_COIL`: Write Coils (Function Code 15).

### MQTT Messaging
Used to send and receive asynchronous payloads to cloud brokers.

- `MQTT_CONNECT`: Establishes the broker connection dynamically.
- `MQTT_PUBLISH`: Publishes a string or byte payload to a specific topic.
- `MQTT_SUBSCRIBE`: Subscribes to a topic.

### Cloud Integration Wrappers
Pre-configured wrappers that simplify connecting to major hyperscalers.

- `AZURE_C2D_RECV`: Receive Azure Cloud-to-Device messages.
- `AZURE_DPS_PROV`: Azure Device Provisioning Service registration.
- `AWS_FLEET_PROV`: AWS IoT Fleet Provisioning.
- `SPB_REBIRTH`: Sparkplug B Device Rebirth sequence handling.

## Language Availability

All communication Function Blocks are universally available across ZPLC's supported IEC 61131-3 languages. They can be instanced natively in Structured Text (ST), or dragged and dropped onto networks in Ladder Diagram (LD) and Function Block Diagram (FBD).
