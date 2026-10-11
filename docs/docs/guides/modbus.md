---
slug: /guides/modbus
id: modbus
title: Use Modbus RTU and TCP
sidebar_label: Modbus RTU and TCP
description: "Make a controller answer a Modbus master, and read or write another Modbus device from the program, with the contract that exists today."
tags: [how-to, modbus, communication]
---

# Use Modbus RTU and TCP

ZPLC uses Modbus in two roles. As a **server**, the controller answers a master (a
SCADA system, an HMI, a test tool) and exposes variables of your program. As a
**client**, your program asks another device for registers with function blocks.
This page covers both with the contract that is documented today.

:::warning Status of this page
Verified on the host and on `native_sim` only: the server framing and mapping, and
the function-block handlers against stand-ins. No Modbus exchange with a real
device, a serial wire or a third-party master has been recorded. Two parts are
being reworked and are marked **unstable** below: the common handshake of the
communication blocks and the separation of the four data areas. Check the
[release notes](../release-notes/index.md) before you rely on them.
:::

## What you need

- A board with the interface you want: Modbus TCP needs a network interface
  (Wi-Fi or Ethernet), and Modbus RTU needs a serial interface that the board's
  profile provides. [Hardware support](../reference/capabilities-evidence.md) lists
  the boards and their network class.
- A project, in Studio or by hand. The simulator on your computer has no Modbus
  server or device: a program that uses Modbus is written and checked there, and
  the exchange itself is possible only on a board.

## Make the controller a server

### 1. Bind variables to Modbus addresses

Mark a variable of the program with `{modbus:<address>}` after its type. The
master reads and writes the variable at that address.

```st runnable expect="Pressure=1.5 PumpRun=TRUE" scans=2 scan_ms=10
PROGRAM Plant
VAR
    Pressure : REAL {modbus:40001};
    PumpRun : BOOL {modbus:1};
    Level : INT;
END_VAR

Level := 250;
PumpRun := Level > 100;
Pressure := 1.5;
END_PROGRAM
```

A variable of 32 bits (`REAL`, `DINT`, `UDINT`, `DWORD`) occupies two consecutive
registers; the others occupy one. Give an address, `40001` and up for registers
and `1` and up for coils, and keep the ranges of two variables apart.

In Studio you can make the same bindings without editing the source: the
**Communication** section of **Project Settings** lists them as **Communication
Tags**, and each one is a `communication.bindings` entry of `zplc.json`.

### 2. Configure the server in the project

```json zplc-fragment
{
  "communication": {
    "modbus": {
      "enabled": true,
      "unitId": 1,
      "tcpEnabled": true,
      "tcpPort": 502,
      "rtuEnabled": false,
      "rtuBaud": 19200,
      "rtuParity": "even",
      "pollIntervalMs": 100
    },
    "bindings": [
      { "name": "Pressure", "symbol": "Pressure", "type": "REAL", "mode": "modbus", "modbusAddress": 40001 },
      { "name": "PumpRun", "symbol": "PumpRun", "type": "BOOL", "mode": "modbus", "modbusAddress": 1 }
    ]
  }
}
```

The documentation check merges this fragment into a project and builds it, so it
is a configuration that Studio accepts. `unitId` is the Modbus unit identifier, 1
to 247. Turn on only the interfaces you use.

### 3. Put the settings on the board

Provisioning a board is a human action in Studio: it sends the settings of the
project to the device over the serial link. These are the commands it sends for
the fragment above, which you can also type in the device shell:

```bash
zplc config set modbus_id 1
zplc config set modbus_tcp_enabled 1
zplc config set modbus_tcp_port 502
zplc config save
```

`zplc config save` writes the settings to the device's store; a board whose store
cannot be mounted reports an error instead of `OK`
([Connectivity](../runtime/connectivity.md#saved-settings)). For RTU the keys are
`modbus_rtu_enabled`, `modbus_rtu_baud` and `modbus_rtu_parity`, where the parity
is `0` for none, `1` for even and `2` for odd.

### 4. What a master can and cannot do

A write from a master goes through the force-aware interface and the exchange of
the runtime: a variable that you forced keeps its forced value, and a write is
applied by the next scan. No Modbus message can start or stop the program, set or
clear a force, or download a program
([What a message from the network can do](../runtime/connectivity.md#what-a-message-from-the-network-can-do)).

**Unstable:** the server answers a bound variable in the area a request names; it
does not yet keep coils, discrete inputs, input registers and holding registers as
four separate address spaces. Use holding registers for values and coils for bits,
and do not rely on an area being separate from another.

## Read or write another device (client)

Use the blocks `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL` and `MB_WRITE_COIL`.
Each takes the transport (`PROTO` 0 for RTU, 1 for TCP), the unit identifier, the
address, the count and, for TCP, the host and port; and each reports `BUSY`, `DONE`,
`ERROR` and a `STATUS` code.

```st runnable expect="Failed=TRUE Code=3" scans=3 scan_ms=10
PROGRAM Poll
VAR
    Link : MB_READ_HREG;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, PROTO := 1, SLAVE_ID := 1, ADDR := 0, COUNT := 1, HOST := '192.168.1.50', PORT := 502);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

On the simulator of your computer there is no device to answer, so the block ends
with `ERROR` TRUE and `STATUS` 3 (no handler). That proves that the block compiles,
runs and reports a status; the exchange with a device is possible on a board.
Read `STATUS` after `ERROR`: 0 is OK, 2 a timeout, 4 not connected, 5 request queue
full, 6 invalid address, and the rest are in the
[function block reference](../reference/function-blocks.md#mb_read_hreg).

A request runs outside the scan, through a bounded queue, so a block never blocks
the scan. Do not start a new request while `BUSY` is TRUE.

**Unstable:** the timing of `BUSY`, `DONE` and `ERROR` across scans, and what a
reset or a disable does to a request in flight, are being fixed as one documented
handshake for all twelve communication blocks. Write the program so that it works
whether `DONE` lasts one scan or longer: act on the first scan in which it is TRUE.

## What is verified, and what is not

| Part | Verified | Level |
| --- | --- | --- |
| Server framing and mapping of every function code, bad lengths, unmapped ranges | Tests that put frames in front of the server | Host and `native_sim` |
| A master write cannot change run state, forces or the loaded program | Link-level check and an authority test | Host and `native_sim` |
| A forced variable keeps its value under a master write | A test with a recording exchange | Host and `native_sim` |
| Function-block handlers: layout, bounds, reset while a request is in flight | Tests with a stand-in client | Host and `native_sim` |
| An exchange with a real device, a serial wire, a third-party master | Not tested | None |
| Timing of a request, behaviour under line errors | Not tested | None |

## See also

- [Connectivity](../runtime/connectivity.md): protocols, secure defaults and what a message can do.
- [Communication function blocks](../runtime/communication-function-blocks.md) and the [function block reference](../reference/function-blocks.md).
- [Project file](../reference/project-file.md): every field of `communication.modbus`.
- [Safety and limitations](../safety-and-limitations.md).
