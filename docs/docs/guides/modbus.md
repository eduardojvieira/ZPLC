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
Verified on the host and on `native_sim` only: the server framing and mapping, the
function-block handlers against stand-ins, and the Modbus TCP client against a server
written for the test on a loopback socket. No Modbus exchange with a real device, a
serial wire or a third-party master has been recorded, and the RTU client was checked
at its interface parameters only.
:::

## What you need

- A board with the interface you want: Modbus TCP needs a network interface
  (Wi-Fi or Ethernet), and Modbus RTU needs a serial interface that the board's
  profile provides. [Hardware support](../reference/capabilities-evidence.md) lists
  the boards and their network class.
- A project, in Studio or by hand. Studio's simulator starts the native runtime
  without the communication blocks, so a Modbus block answers `STATUS` 3 there: the
  program is written and checked in Studio, and the exchange is possible on a board.
  The native runtime can also run the Modbus TCP client against a server on the
  loopback interface ([In simulation](../runtime/communication-function-blocks.md#in-simulation));
  Studio does not start those endpoints yet.

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
registers; the others occupy one. The number of the tag says the area, in the notation
of the Modbus world:

| `N` | Area | Address on the wire | A master can |
| --- | --- | --- | --- |
| 10001 to 19999 | Discrete input | `N - 10001` | read it (function 2) |
| 30001 to 39999 | Input register | `N - 30001` | read it (function 4) |
| 40001 to 49999 | Holding register | `N - 40001` | read it (function 3) and write it (6, 16) |
| any other number, a `BOOL` | Coil | `N` | read it (function 1) and write it (5, 15) |
| any other number, another type | Holding register | `N` | read it (function 3) and write it (6, 16) |

In the example, `Pressure` is the holding register at address 0 and `PumpRun` is the
coil at address 1. Keep the ranges of two variables of the same area apart.

In Studio you can make the same bindings without editing the source: the
**Communication** section of **Project Settings** lists them as **Communication
Tags**, and each one is a `communication.bindings` entry of `zplc.json`. A tag has an
area and an address on the wire, and the build writes the number of the table: a holding
register at address 5 is `{modbus:40006}`.

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

The four areas are four address spaces: a coil, a discrete input, an input register
and a holding register with the same number are four different variables, and a
variable is served in one area only. A request for an address that no variable has in
the area it asks for is answered with exception 2 (illegal data address), even when
another area has a variable at that number. Discrete inputs and input registers can be
read and not written. Every variable of WORK and RETAIN can be bound, and the server
serves the whole of the wire range, up to address 65535, for the addresses that have a
variable ([Modbus areas and addresses](../runtime/connectivity.md#modbus-areas-and-addresses)).

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

In Studio's simulator the runtime has no handler for the block, so it ends with
`ERROR` TRUE and `STATUS` 3. That proves that the block compiles, runs and reports a
status; the exchange with a device is possible on a board. Read `STATUS` after
`ERROR`: 0 is OK, 2 a timeout, 4 not connected, 5 every request slot in use, 6 invalid
address, 8 protocol error, 10 not available, and the rest are in the
[status codes](../runtime/communication-function-blocks.md#status-codes).

The block follows the one handshake of the twelve communication blocks
([Communication function blocks](../runtime/communication-function-blocks.md#the-handshake)):

- A rising edge of `EN` makes one request. While `EN` stays TRUE after the result, the
  result is held and nothing is repeated; let `EN` fall for one scan to ask again.
- A request in flight completes even if `EN` falls, and a rising edge while `BUSY` is
  TRUE starts nothing.
- `BUSY`, `DONE`, `ERROR` and `STATUS` are written by the runtime only. Call the block
  on every scan, because it advances only when it is called.
- A request runs outside the scan, so a block never waits for the network inside it.
  The client waits at most twice the configured timeout, and the block reports `ERROR`
  with `STATUS` 2 at the latest `(2 x timeout + 100 ms) x 8` after the request: 8.8 s
  with the default timeout of 500 ms.
- `COUNT` is 1: a request for more registers or coils is refused with `STATUS` 6.

On the native runtime started with `ZPLC_NATIVE_COMM=1`, with a Modbus TCP server on the
loopback interface, the same program makes the request; a Modbus RTU request there, with
no serial device, answers `STATUS` 10. Studio does not start that configuration or the
endpoints yet.

## What is verified, and what is not

| Part | Verified | Level |
| --- | --- | --- |
| Server framing and mapping of every function code, bad lengths, unmapped ranges | Tests that put frames in front of the server | Host and `native_sim` |
| A master write cannot change run state, forces or the loaded program | Link-level check and an authority test | Host and `native_sim` |
| A forced variable keeps its value under a master write | A test with a recording exchange | Host and `native_sim` |
| The four areas are four address spaces, and the whole of WORK and RETAIN is served | A firmware test that loads a program with the tags of the four areas, the edges of WORK and RETAIN and address 65535, and reads and writes them through the seams both servers end in | `native_sim` |
| Function-block handlers: pins, handshake, status codes, reset while a request is in flight | Tests with a stand-in client | Host and `native_sim` |
| The Modbus TCP client: success, a response in pieces, exception, silence, a closed connection, a refused port, reset while busy | Its transaction code is one file compiled in the controller and in the simulation runtime, and runs against a server written for the test on loopback in both | `native_sim` and host |
| The Modbus RTU client | Only its interface parameters are checked (the timeout is in the unit the Zephyr Modbus client reads); no serial device is used | `native_sim` |
| An exchange with a real device, a serial wire, a third-party master | Not tested | None |
| Timing of a request on a real line, behaviour under line errors | Not tested | None |

## See also

- [Connectivity](../runtime/connectivity.md): protocols, secure defaults and what a message can do.
- [Communication function blocks](../runtime/communication-function-blocks.md) and the [function block reference](../reference/function-blocks.md).
- [Project file](../reference/project-file.md): every field of `communication.modbus`.
- [Safety and limitations](../safety-and-limitations.md).
