---
title: "Device link protocol"
sidebar_label: "Device link protocol"
description: "The framed protocol that Studio and a device speak: frame, limits, capabilities, errors, messages and events, read off its definition."
tags: [reference, generated]
---

# Device link protocol

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/device-protocol. Do not edit. >>> */}

The device link protocol is how Studio and a device talk: a framed, versioned binary protocol with a length, a sequence number and a checksum on every frame, capability negotiation and explicit error codes. It runs over UART, USB serial and TCP. This is protocol version `1`: 41 messages and 8 events. The text shell of the device stays: it is the older protocol and the recovery console, and `zplc sys info --json` keeps its keys. This page is read off `tools/contract/protocol.json`, the one definition the C codec of the firmware and the TypeScript codec of Studio are generated from.

## Frame

| Field | Offset | Bytes | Meaning |
| --- | --- | --- | --- |
| `sync` | 0 | 2 bytes | The two bytes 0x5A 0xA5. A stream decoder looks for them to find the start of a frame. |
| `version` | 2 | 1 byte | The protocol version the sender speaks. A frame of another version is dropped and counted; its payload is never read. |
| `flags` | 3 | 1 byte | Bits 0 and 1: the kind of the frame. Bit 2: a message authentication code follows the payload. Bits 3 to 7 are zero. |
| `message` | 4 | 1 byte | The message number (a request and its response carry the same number). |
| `sequence` | 5 | 4 bytes | A request carries the sequence number of the sender; its response repeats it. An event carries the device's own event counter. Inside an authenticated session the sequence is covered by the code and must follow the one before it by exactly one. |
| `length` | 9 | 2 bytes | Bytes of the payload. |

| Kind | Value | Meaning |
| --- | --- | --- |
| `REQUEST` | 0 | Studio asks the device to do something. |
| `RESPONSE` | 1 | The device answers one request, with the same message number and sequence. |
| `EVENT` | 2 | The device reports something that happened, without being asked. |

Sync bytes: `0x5A` `0xA5`. Code: 32 bytes. CRC-32: 4 bytes.

All numbers are little-endian. A frame is the header, the payload, a 32-byte HMAC-SHA-256 code when the AUTH flag is set, and a CRC-32 (the CRC of the artifact container, ISO-HDLC) of every byte before it.

A decoder that reads a stream keeps the bytes of the frame it is assembling. When the header is not valid (sync, version, reserved bits, kind 3, length above its limit) or the checksum does not match, it discards the first byte of that candidate, looks for the next sync pair among the bytes it already holds, and goes on from there. A frame that was hidden inside the bytes of a damaged one is therefore delivered, and no frame after a damaged one is lost. Bytes that are not a sync pair are noise and are not counted; every abandoned candidate is counted, by reason.

A transport that frames its own lines (one frame per line, in hexadecimal, as the device shell does) hands each line to the decoder whole.

The code covers the header and the payload, so the sequence number and the direction of the frame are inside it. The checksum covers everything before it, the code included.

## Limits

| Limit | Value |
| --- | --- |
| `payloadMaxDefault` | 512 |
| `payloadMaxHard` | 1024 |
| `payloadMaxMin` | 64 |
| `sessionIdleSecondsDefault` | 30 |
| `challengeSeconds` | 10 |
| `eventQueueDefault` | 16 |
| `eventPayloadMax` | 64 |
| `watchEntriesMax` | 8 |
| `forceBytesMax` | 260 |
| `sessionNameBytes` | 16 |
| `keyBytes` | 32 |
| `nonceBytes` | 16 |

## Capabilities

| Capability | Bit | Meaning |
| --- | --- | --- |
| `SESSION` | 0 | Sessions: one writer at a time, with an idle timeout. |
| `MEMORY` | 1 | Read and write PLC memory; a write is whole with respect to the scan. |
| `FORCE` | 2 | Set, clear and list forces; the forces of a session end with it. |
| `RUN_CONTROL` | 3 | RUN, STOP, PAUSE, RESUME, STEP and RESET. |
| `BREAKPOINTS` | 4 | Add, remove, clear and list breakpoints. |
| `PROGRAM` | 5 | Transfer a program, with a checksum and a read-back. |
| `EVENTS` | 6 | The device pushes events. |
| `WATCH` | 7 | The device pushes batches of watched values. |
| `AUTH` | 8 | Authenticated sessions (HMAC-SHA-256) and key provisioning over the serial link. |
| `CONFIG` | 9 | Change, save and reset the configuration. |
| `CREDENTIALS` | 10 | Upload and erase credentials. |
| `SIGNATURE` | 11 | The device accepts only artifacts signed with the key it holds (COM-026). |

## Access classes

| Class | Meaning |
| --- | --- |
| `OPEN` | Answered on any link, with no session: what a client needs to recognise the device. |
| `READ` | Reads the PLC and changes nothing: open on the serial link, needs an authenticated session on a network link. |
| `SESSION` | Changes the device: needs a session that is open on this link, and an authenticated one on a network link. |
| `SERIAL_SESSION` | Needs a session and the serial link: a key is never provisioned over the network. |

## Error codes

| Error | Value | Meaning |
| --- | --- | --- |
| `OK` | 0 | The request was done. |
| `UNKNOWN_MESSAGE` | 1 | The device does not know the message number. |
| `BAD_REQUEST` | 2 | The payload does not have the layout of the message. |
| `UNSUPPORTED` | 3 | This build does not have the capability the message needs (see the capabilities of the hello). |
| `NO_SESSION` | 4 | The message needs a session that is open on this link. |
| `SESSION_BUSY` | 5 | A session is already open on another link. |
| `AUTH_REQUIRED` | 6 | A network link has no authenticated session: open one with a key that was provisioned over the serial link. |
| `AUTH_FAILED` | 7 | The device holds no key, or the session could not be authenticated. |
| `CHALLENGE_STALE` | 8 | The challenge of the open request was not the one the device issued last, or it expired: ask for a new one. |
| `RANGE` | 9 | The access is not inside one region of PLC memory, or the region is not writable. The response carries the requested address and length and the region that holds the address. |
| `FULL` | 10 | A queue has no room; nothing was done. |
| `STATE` | 11 | The runtime is not in a state where the message applies (a program transfer while running, RUN with no program). |
| `REFUSED` | 12 | A rule of the device forbids it on this link (a takeover from the network, a key over the network). |
| `PROGRAM_INVALID` | 13 | The loader refused the artifact. |
| `TOO_LARGE` | 14 | The program is larger than the device accepts. |
| `CRC` | 15 | The CRC-32 of the transferred program is not the one announced. |
| `BUSY` | 16 | A resource the message needs is in use; try again. |
| `FAILED` | 17 | The device tried and could not do it. |

A response starts with its status byte. After `RANGE` the response carries `address`, `length`, `region_start`, `region_end` (`u16` each): the access that was refused and the region that holds the address.

## Enumerations

| Enumeration | Name | Value | Meaning |
| --- | --- | --- | --- |
| `TRANSPORT` | `SERIAL` | 0 | UART or USB serial: the local engineering link. Whoever holds the cable holds the device. |
| `TRANSPORT` | `NETWORK` | 1 | TCP or any other link that a network reaches. Every frame of a session is authenticated. |
| `RUN_STATE` | `STOPPED` | 0 | No program is running. |
| `RUN_STATE` | `RUNNING` | 1 | The program is scanning. |
| `RUN_STATE` | `PAUSED` | 2 | Held at a cycle boundary or at a breakpoint. |
| `RUN_STATE` | `FAULT` | 3 | A fault is latched; the outputs are at their safe values. |
| `FAULT` | `NONE` | 0 | No fault. |
| `FAULT` | `DEADLINE` | 1 | A task missed its deadline too many times in a row. |
| `FAULT` | `VM` | 2 | A task faulted: a VM error or the instruction budget. |
| `FAULT` | `RUNTIME` | 3 | Any other failure of the runtime. |
| `SESSION_STATE` | `NONE` | 0 | No session is open. |
| `SESSION_STATE` | `THIS_LINK` | 1 | The session is open on the link that asks. |
| `SESSION_STATE` | `OTHER_LINK` | 2 | A session is open on another link. |
| `SESSION_END` | `CLOSED` | 0 | The client closed it. |
| `SESSION_END` | `IDLE` | 1 | Nothing arrived for the idle time. |
| `SESSION_END` | `TAKEN_OVER` | 2 | A person at the serial link took the session over. |
| `SESSION_END` | `LINK_LOST` | 3 | The link went away. |
| `SESSION_END` | `KEY_CHANGED` | 4 | The key of the device was changed or erased. |
| `FORCE_CHANGE` | `SET` | 0 | A force was set. |
| `FORCE_CHANGE` | `CLEARED` | 1 | One force was cleared. |
| `FORCE_CHANGE` | `CLEARED_ALL` | 2 | Every force was cleared. |
| `FORCE_CHANGE` | `RELEASED` | 3 | The forces of a session were released because it ended. |
| `FORCE_CHANGE` | `CHANGED` | 4 | The forces changed by another path (the shell). |
| `LOG_LEVEL` | `ERROR` | 0 | An error. |
| `LOG_LEVEL` | `WARNING` | 1 | A warning. |
| `LOG_LEVEL` | `INFO` | 2 | An information line. |
| `LOG_LEVEL` | `DEBUG` | 3 | A debug line. |
| `CREDENTIAL` | `CA` | 0 | The certificate authority certificate. |
| `CREDENTIAL` | `CLIENT` | 1 | The client certificate. |
| `CREDENTIAL` | `KEY` | 2 | The client private key. |

## Event mask

| Event kind | Bit | Meaning |
| --- | --- | --- |
| `STATUS` | 0 | The state of the runtime changed. |
| `FAULT` | 1 | A fault was latched. |
| `BREAKPOINT` | 2 | Execution stopped at a breakpoint. |
| `FORCE` | 3 | A force was set, cleared or released. |
| `LOG` | 4 | The device wrote a log line. |
| `WATCH` | 5 | A batch of watched values. |

## Messages

| Message | Number | Access | Meaning |
| --- | --- | --- | --- |
| `HELLO` | 0x01 | `OPEN` | Recognise the device: protocol version, link kind, largest payload, capabilities, session state. |
| `IDENTITY` | 0x02 | `OPEN` | Which firmware this is: product, board, ABI, I/O description, sizes. What a deploy preflight compares. |
| `STATUS` | 0x03 | `READ` | The state of the runtime and its counters. |
| `CHALLENGE` | 0x04 | `OPEN` | Ask for a one-time challenge to open an authenticated session. |
| `LINK_STATS` | 0x05 | `OPEN` | The counters of this link: frames, and every kind of frame that was dropped. |
| `MEM_READ` | 0x10 | `READ` | Read bytes of PLC memory from the snapshot of the last scan. |
| `MEM_WRITE` | 0x11 | `SESSION` | Write a multi-byte value, whole with respect to the scan: queued and applied at the input latch of the next scan. |
| `FORCE_SET` | 0x12 | `SESSION` | Force a value until it is cleared or the session ends. |
| `FORCE_CLEAR` | 0x13 | `SESSION` | Clear the force that starts at an address. |
| `FORCE_CLEAR_ALL` | 0x14 | `SESSION` | Clear every force. |
| `FORCE_LIST` | 0x15 | `READ` | List the active forces. |
| `SESSION_OPEN` | 0x20 | `OPEN` | Open the session. On a network link the frame carries a code under the device key and the nonce of the last challenge. |
| `SESSION_CLOSE` | 0x21 | `SESSION` | Close the session; its forces are released. |
| `KEEPALIVE` | 0x22 | `SESSION` | Keep an idle session open. |
| `EVENTS_SET` | 0x23 | `READ` | Choose which events this link receives. |
| `WATCH_SET` | 0x24 | `READ` | Watch addresses: the device pushes a batch of their values every period and when one changes. |
| `WATCH_CLEAR` | 0x25 | `READ` | Stop watching. |
| `RUN` | 0x30 | `SESSION` | Start the program. |
| `STOP` | 0x31 | `SESSION` | Stop the program; the outputs go to their safe values. |
| `PAUSE` | 0x32 | `SESSION` | Hold the program at the next cycle boundary. |
| `RESUME` | 0x33 | `SESSION` | Continue a paused program. |
| `STEP` | 0x34 | `SESSION` | Execute one cycle of a paused program. |
| `RESET` | 0x35 | `SESSION` | Reset the loaded program to its initial state; the program stays loaded and stopped. |
| `BP_ADD` | 0x38 | `SESSION` | Add a breakpoint. |
| `BP_REMOVE` | 0x39 | `SESSION` | Remove a breakpoint. |
| `BP_CLEAR` | 0x3A | `SESSION` | Remove every breakpoint. |
| `BP_LIST` | 0x3B | `READ` | List the breakpoints. |
| `PROGRAM_BEGIN` | 0x40 | `SESSION` | Start a program transfer: announce its size and CRC-32. The runtime must be stopped. |
| `PROGRAM_CHUNK` | 0x41 | `SESSION` | One chunk of the program, at its offset. Chunks arrive in order. |
| `PROGRAM_COMMIT` | 0x42 | `SESSION` | Check the CRC-32, verify the artifact and activate it. The runtime stays stopped. |
| `PROGRAM_ABORT` | 0x43 | `SESSION` | Drop a transfer that is in progress. |
| `PROGRAM_INFO` | 0x44 | `READ` | Size, CRC-32 and generation of the loaded program, computed over what the device holds. |
| `CONFIG_SET` | 0x50 | `SESSION` | Change one configuration value. |
| `CONFIG_SAVE` | 0x51 | `SESSION` | Persist the configuration. |
| `CONFIG_RESET` | 0x52 | `SESSION` | Reset the configuration to its defaults. |
| `CRED_BEGIN` | 0x58 | `SESSION` | Start a credential upload. |
| `CRED_CHUNK` | 0x59 | `SESSION` | One chunk of the credential. |
| `CRED_COMMIT` | 0x5A | `SESSION` | Store the credential. |
| `CRED_ERASE` | 0x5B | `SESSION` | Erase a credential. |
| `KEY_SET` | 0x60 | `SERIAL_SESSION` | Provision the key of authenticated sessions. The device never sends the key back. |
| `KEY_CLEAR` | 0x61 | `SERIAL_SESSION` | Erase the key; authenticated sessions are no longer possible. |

### HELLO (0x01)

Recognise the device: protocol version, link kind, largest payload, capabilities, session state. Access: `OPEN`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `client_version` | `u8` | The protocol version the client speaks. |
| `client_max_payload` | `u16` | The largest payload the client accepts in one frame. |

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `version` | `u8` | The protocol version of the device. |
| `transport` | `u8 (TRANSPORT)` | What the device takes this link to be. |
| `max_payload` | `u16` | The largest payload the device accepts in one frame; both sides use the smaller of the two maxima. |
| `capabilities` | `u32` | Bit mask of the capabilities of this build. |
| `session_state` | `u8 (SESSION_STATE)` | The state of the session as this link sees it. |
| `key_provisioned` | `u8` | 1 when the device holds a key for authenticated sessions. |
| `idle_timeout_s` | `u16` | Seconds of silence after which a session ends. |

### IDENTITY (0x02)

Which firmware this is: product, board, ABI, I/O description, sizes. What a deploy preflight compares. Access: `OPEN`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `abi_major` | `u16` | Major number of the bytecode ABI. |
| `abi_minor` | `u16` | Minor number of the bytecode ABI. |
| `draft_counter` | `u32` | Draft counter of the artifact contract (CMP-052). |
| `io_hash` | `u32` | Hash of the board I/O description the image was built from (IO-004). |
| `io_input_bytes` | `u16` | Bytes of the input process image. |
| `io_output_bytes` | `u16` | Bytes of the output process image. |
| `io_channels` | `u16` | Channels of the I/O description. |
| `code_size_max` | `u32` | The largest artifact the device accepts. |
| `work_size` | `u32` | Bytes of WORK memory. |
| `retain_size` | `u32` | Bytes of RETAIN memory. |
| `ipi_size` | `u32` | Bytes of the input image. |
| `opi_size` | `u32` | Bytes of the output image. |
| `product_version` | `str:24` | The product version of the firmware. |
| `board` | `str:32` | The board the firmware was built for. |
| `board_profile` | `str:40` | The Zephyr board target of the build (or posix for the simulator). |
| `io_board_id` | `str:32` | The identifier of the board I/O description. |

### STATUS (0x03)

The state of the runtime and its counters. Access: `READ`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state of the runtime. |
| `fault` | `u8 (FAULT)` | Why the runtime is in FAULT, or NONE. |
| `program_loaded` | `u8` | 1 when a program is loaded. |
| `forces` | `u8` | Number of active forces. |
| `cycles` | `u32` | Scans completed since the program started. |
| `overruns` | `u32` | Deadline misses counted. |
| `program_size` | `u32` | Bytes of the loaded artifact. |
| `program_generation` | `u32` | Increases every time a program is activated. |
| `uptime_ms` | `u32` | Milliseconds since the device started. |

### CHALLENGE (0x04)

Ask for a one-time challenge to open an authenticated session. Access: `OPEN`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `nonce` | `bytes:16` | A number the device will accept once, in the next ten seconds. |

### LINK_STATS (0x05)

The counters of this link: frames, and every kind of frame that was dropped. Access: `OPEN`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `frames_in` | `u32` | Valid frames received. |
| `frames_out` | `u32` | Frames sent. |
| `crc_errors` | `u32` | Candidate frames whose checksum did not match. |
| `resyncs` | `u32` | Times the decoder discarded bytes to find the next frame. |
| `version_errors` | `u32` | Frames of another protocol version. |
| `oversize` | `u32` | Frames that announced a payload above the limit. |
| `auth_drops` | `u32` | Frames dropped for a missing or wrong authentication code. |
| `replay_drops` | `u32` | Frames dropped for a sequence number already seen. |
| `order_drops` | `u32` | Frames dropped for a sequence number ahead of the expected one. |
| `events_sent` | `u32` | Events sent on this link. |
| `events_dropped` | `u32` | Events lost because the queue was full. |
| `sessions_opened` | `u32` | Sessions opened on this link. |

### MEM_READ (0x10)

Read bytes of PLC memory from the snapshot of the last scan. Access: `READ`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `address` | `u16` | The first address. |
| `length` | `u16` | The number of bytes; the extent has to lie inside one region. |

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `data` | `tail` | The bytes. |

### MEM_WRITE (0x11)

Write a multi-byte value, whole with respect to the scan: queued and applied at the input latch of the next scan. Access: `SESSION`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `address` | `u16` | The first address; the extent has to lie inside one writable region. |
| `data` | `tail` | The value, in memory order. |

**Response** (after the status byte)

no fields

### FORCE_SET (0x12)

Force a value until it is cleared or the session ends. Access: `SESSION`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `address` | `u16` | The first address. |
| `data` | `tail` | The forced bytes. |

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `forces` | `u8` | Active forces afterwards. |

### FORCE_CLEAR (0x13)

Clear the force that starts at an address. Access: `SESSION`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `address` | `u16` | The first address of the force. |

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `forces` | `u8` | Active forces afterwards. |

### FORCE_CLEAR_ALL (0x14)

Clear every force. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

no fields

### FORCE_LIST (0x15)

List the active forces. Access: `READ`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `count` | `u8` | Number of entries. |
| `entries` | `tail` | For each entry: address (u16), size (u16), then size bytes. |

### SESSION_OPEN (0x20)

Open the session. On a network link the frame carries a code under the device key and the nonce of the last challenge. Access: `OPEN`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `flags` | `u8` | Bit 0: take over a session that is open on another link (the serial link only). |
| `client_nonce` | `bytes:16` | A number the client picks; it goes into the session key. |
| `device_nonce` | `bytes:16` | The nonce of the challenge the device issued; zero on a serial link. |
| `name` | `str:16` | A name for the client, shown to a person at the device. |

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `session_id` | `u32` | The number of the session. |
| `idle_timeout_s` | `u16` | Seconds of silence after which the session ends. |
| `authenticated` | `u8` | 1 when the frames of the session carry a code. |

### SESSION_CLOSE (0x21)

Close the session; its forces are released. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `forces_released` | `u8` | Forces that ended with the session. |

### KEEPALIVE (0x22)

Keep an idle session open. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `remaining_s` | `u16` | Seconds left before the session would end. |

### EVENTS_SET (0x23)

Choose which events this link receives. Access: `READ`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `mask` | `u32` | Bit mask of the events wanted (see the event mask). |

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `mask` | `u32` | The mask in force: the events of this build only. |

### WATCH_SET (0x24)

Watch addresses: the device pushes a batch of their values every period and when one changes. Access: `READ`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `period_ms` | `u16` | Milliseconds between batches; 0 sends a batch only when a value changed. |
| `entries` | `tail` | For each entry: address (u16), length (u8). At most eight entries. |

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `count` | `u8` | Entries accepted. |

### WATCH_CLEAR (0x25)

Stop watching. Access: `READ`.

**Request**

no fields

**Response** (after the status byte)

no fields

### RUN (0x30)

Start the program. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state afterwards. |

### STOP (0x31)

Stop the program; the outputs go to their safe values. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state afterwards. |

### PAUSE (0x32)

Hold the program at the next cycle boundary. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state afterwards. |

### RESUME (0x33)

Continue a paused program. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state afterwards. |

### STEP (0x34)

Execute one cycle of a paused program. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state afterwards. |

### RESET (0x35)

Reset the loaded program to its initial state; the program stays loaded and stopped. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `state` | `u8 (RUN_STATE)` | The state afterwards. |

### BP_ADD (0x38)

Add a breakpoint. Access: `SESSION`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `pc` | `u16` | The program counter. |

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `count` | `u8` | Breakpoints afterwards. |

### BP_REMOVE (0x39)

Remove a breakpoint. Access: `SESSION`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `pc` | `u16` | The program counter. |

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `count` | `u8` | Breakpoints afterwards. |

### BP_CLEAR (0x3A)

Remove every breakpoint. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

no fields

### BP_LIST (0x3B)

List the breakpoints. Access: `READ`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `count` | `u8` | Number of breakpoints. |
| `pcs` | `tail` | The program counters, u16 each. |

### PROGRAM_BEGIN (0x40)

Start a program transfer: announce its size and CRC-32. The runtime must be stopped. Access: `SESSION`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `size` | `u32` | Bytes of the artifact. |
| `crc32` | `u32` | CRC-32 of the artifact. |

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `chunk_max` | `u16` | The largest chunk the device takes in one frame. |

### PROGRAM_CHUNK (0x41)

One chunk of the program, at its offset. Chunks arrive in order. Access: `SESSION`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `offset` | `u32` | Where the chunk starts; it must be the number of bytes received so far. |
| `data` | `tail` | The bytes. |

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `received` | `u32` | Bytes received so far. |

### PROGRAM_COMMIT (0x42)

Check the CRC-32, verify the artifact and activate it. The runtime stays stopped. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `size` | `u32` | Bytes of the stored program, read back. |
| `crc32` | `u32` | CRC-32 of the stored program, computed over what the device holds. |
| `generation` | `u32` | The program generation after the activation. |

### PROGRAM_ABORT (0x43)

Drop a transfer that is in progress. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

no fields

### PROGRAM_INFO (0x44)

Size, CRC-32 and generation of the loaded program, computed over what the device holds. Access: `READ`.

**Request**

no fields

**Response** (after the status byte)

| Field | Type | Meaning |
| --- | --- | --- |
| `loaded` | `u8` | 1 when a program is loaded. |
| `size` | `u32` | Bytes of the loaded program. |
| `crc32` | `u32` | CRC-32 of the loaded program. |
| `generation` | `u32` | The program generation. |

### CONFIG_SET (0x50)

Change one configuration value. Access: `SESSION`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `key` | `str:24` | The name of the setting. |
| `value` | `tail` | The value, as text. |

**Response** (after the status byte)

no fields

### CONFIG_SAVE (0x51)

Persist the configuration. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

no fields

### CONFIG_RESET (0x52)

Reset the configuration to its defaults. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

no fields

### CRED_BEGIN (0x58)

Start a credential upload. Access: `SESSION`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `kind` | `u8 (CREDENTIAL)` | Which credential. |
| `size` | `u16` | Bytes of the credential. |

**Response** (after the status byte)

no fields

### CRED_CHUNK (0x59)

One chunk of the credential. Access: `SESSION`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `data` | `tail` | The bytes. |

**Response** (after the status byte)

no fields

### CRED_COMMIT (0x5A)

Store the credential. Access: `SESSION`.

**Request**

no fields

**Response** (after the status byte)

no fields

### CRED_ERASE (0x5B)

Erase a credential. Access: `SESSION`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `kind` | `u8 (CREDENTIAL)` | Which credential. |

**Response** (after the status byte)

no fields

### KEY_SET (0x60)

Provision the key of authenticated sessions. The device never sends the key back. Access: `SERIAL_SESSION`.

**Request**

| Field | Type | Meaning |
| --- | --- | --- |
| `key` | `bytes:32` | The 256-bit key. |

**Response** (after the status byte)

no fields

### KEY_CLEAR (0x61)

Erase the key; authenticated sessions are no longer possible. Access: `SERIAL_SESSION`.

**Request**

no fields

**Response** (after the status byte)

no fields

## Events

| Event | Number | Mask bit | Fields | Meaning |
| --- | --- | --- | --- | --- |
| `EVT_STATUS` | 0x80 | `STATUS` | `state` (`u8`), `fault` (`u8`), `cycles` (`u32`) | The state of the runtime changed. |
| `EVT_FAULT` | 0x81 | `FAULT` | `fault` (`u8`), `task` (`u8`), `code` (`u16`) | A fault was latched. |
| `EVT_BREAKPOINT` | 0x82 | `BREAKPOINT` | `task` (`u8`), `pc` (`u16`) | Execution stopped at a breakpoint. |
| `EVT_FORCE` | 0x83 | `FORCE` | `change` (`u8`), `address` (`u16`), `forces` (`u8`) | A force was set, cleared or released. |
| `EVT_LOG` | 0x84 | `LOG` | `level` (`u8`), `text` (`tail`) | A log line of the device. |
| `EVT_WATCH` | 0x85 | `WATCH` | `cycle` (`u32`), `data` (`tail`) | A batch of watched values, taken from one scan. |
| `EVT_SESSION_END` | 0x86 | always | `reason` (`u8`), `forces_released` (`u8`) | The session ended. Always sent to the link that held it. |
| `EVT_DROPPED` | 0x87 | always | `count` (`u32`) | Events were lost because the queue was full. Sent when there is room again. |

{/* <<< END GENERATED: reference/device-protocol <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
