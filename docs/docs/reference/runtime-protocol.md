---
title: "Runtime session protocol"
sidebar_label: "Session protocol"
description: "The request methods of the native POSIX runtime session, read off its source."
tags: [reference, generated]
---

# Runtime session protocol

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/runtime-protocol. Do not edit. >>> */}

The native POSIX runtime, the one that simulations and CI use, is a process that speaks one JSON request per line on standard input and answers on standard output. This is protocol version `1.0`: 26 methods. A request has an `id`, a `type` of `request`, a `method` and a `params` object; every parameter listed for a method is required and no other is accepted. The device shell is a different interface: see the [shell commands](./shell-commands.md).

This table is read off the source file `firmware/apps/posix_host/src/native_runtime_session.c`; its text is the source's own, so it is the same in English and in Spanish.

## Methods

| Method | Parameters |
| --- | --- |
| `program.load` | `bytecode_hex` |
| `memory.read` | `address`, `length` |
| `memory.write` | `address`, `bytes_hex` |
| `force.set` | `address`, `bytes_hex` |
| `breakpoint.add` | `pc` |
| `breakpoint.remove` | `pc` |
| `force.clear` | `address` |
| `trace.arm` | `capacity`, `in_bytes`, `out_bytes` |
| `trace.read` | `from`, `count` |
| `execution.start` | none |
| `execution.stop` | none |
| `execution.reset` | none |
| `execution.pause` | none |
| `execution.resume` | none |
| `execution.step` | none |
| `status.get` | none |
| `breakpoint.clear` | none |
| `breakpoint.list` | none |
| `force.clear_all` | none |
| `force.list` | none |
| `trace.status` | none |
| `trace.clear` | none |
| `session.shutdown` | none |
| `session.hello` | `client_name`, `client_version`, `protocol_version` |
| `simulation.input.set` | `input_id`, `active`, `program_generation` |
| `scenario.step` | `at_ms` |

## Parameters

| Parameter | Meaning |
| --- | --- |
| `bytecode_hex` | The program, as an upper-case hexadecimal string. |
| `address` | Address in the VM memory. |
| `length` | Number of bytes. |
| `bytes_hex` | The bytes, as an upper-case hexadecimal string. |
| `pc` | Program counter of the instruction. |
| `capacity` | Samples the I/O trace keeps; 0 keeps as many as its ring holds. |
| `in_bytes` | Bytes of the input image each I/O trace sample keeps, from its first byte (at most 32). |
| `out_bytes` | Bytes of the output image each I/O trace sample keeps, from its first byte (at most 32). |
| `from` | Sequence number of the first I/O trace sample to read. |
| `count` | Number of I/O trace samples to read, 1 to 32. |
| `client_name` | Name of the client. |
| `client_version` | Version of the client. |
| `protocol_version` | The protocol version the client speaks; it must be the one above. |
| `input_id` | Name of the simulated input. |
| `active` | The value of the input. |
| `program_generation` | The generation of the loaded program that the input belongs to. |
| `at_ms` | Time of the scan, in milliseconds of virtual time. |

{/* <<< END GENERATED: reference/runtime-protocol <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
