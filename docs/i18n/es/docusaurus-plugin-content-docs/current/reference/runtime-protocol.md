---
title: "Protocolo de sesión del runtime"
sidebar_label: "Protocolo de sesión"
description: "Los métodos de solicitud de la sesión del runtime POSIX nativo, leídos de su fuente."
tags: [reference, generated]
---

# Protocolo de sesión del runtime

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/runtime-protocol. Do not edit. >>> */}

El runtime POSIX nativo, el que usan las simulaciones y CI, es un proceso que recibe una solicitud JSON por línea en la entrada estándar y responde en la salida estándar. Esta es la versión `1.0` del protocolo: 22 métodos. Una solicitud tiene un `id`, un `type` con valor `request`, un `method` y un objeto `params`; cada parámetro indicado para un método es obligatorio y no se acepta ningún otro. La consola del dispositivo es otra interfaz: véanse los [comandos de la consola](./shell-commands.md).

Esta tabla se lee del archivo fuente `firmware/apps/posix_host/src/native_runtime_session.c`; su texto es el de la propia fuente, por eso es igual en inglés y en español.

## Métodos

| Método | Parámetros |
| --- | --- |
| `program.load` | `bytecode_hex` |
| `memory.read` | `address`, `length` |
| `memory.write` | `address`, `bytes_hex` |
| `force.set` | `address`, `bytes_hex` |
| `breakpoint.add` | `pc` |
| `breakpoint.remove` | `pc` |
| `force.clear` | `address` |
| `execution.start` | ninguno |
| `execution.stop` | ninguno |
| `execution.reset` | ninguno |
| `execution.pause` | ninguno |
| `execution.resume` | ninguno |
| `execution.step` | ninguno |
| `status.get` | ninguno |
| `breakpoint.clear` | ninguno |
| `breakpoint.list` | ninguno |
| `force.clear_all` | ninguno |
| `force.list` | ninguno |
| `session.shutdown` | ninguno |
| `session.hello` | `client_name`, `client_version`, `protocol_version` |
| `simulation.input.set` | `input_id`, `active`, `program_generation` |
| `scenario.step` | `at_ms` |

## Parámetros

| Parámetro | Significado |
| --- | --- |
| `bytecode_hex` | The program, as an upper-case hexadecimal string. |
| `address` | Address in the VM memory. |
| `length` | Number of bytes. |
| `bytes_hex` | The bytes, as an upper-case hexadecimal string. |
| `pc` | Program counter of the instruction. |
| `client_name` | Name of the client. |
| `client_version` | Version of the client. |
| `protocol_version` | The protocol version the client speaks; it must be the one above. |
| `input_id` | Name of the simulated input. |
| `active` | The value of the input. |
| `program_generation` | The generation of the loaded program that the input belongs to. |
| `at_ms` | Time of the scan, in milliseconds of virtual time. |

{/* <<< END GENERATED: reference/runtime-protocol <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
