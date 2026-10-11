---
title: "Shell commands"
sidebar_label: "Shell commands"
description: "Every subcommand of the zplc device shell command, read off its command table."
tags: [reference, generated]
---

# Shell commands

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/shell-commands. Do not edit. >>> */}

The device shell has one root command, `zplc`, with 76 subcommands. A group only holds subcommands. The arguments are the words after the command name; a command is present only when the Kconfig symbol of the last column is enabled. The runtime of a desktop simulation has no shell: it speaks the [session protocol](./runtime-protocol.md).

This table is read off the source file `firmware/app/src/shell_cmds.c`; its text is the source's own, so it is the same in English and in Spanish.

| Command | Kind | Arguments | Description | Available when |
| --- | --- | --- | --- | --- |
| `zplc` | group |   | ZPLC runtime commands |   |
| `zplc load` | command | 1 required | Prepare load |   |
| `zplc data` | command | 1 required | Receive data |   |
| `zplc start` | command | none | Start execution |   |
| `zplc stop` | command | none | Stop execution |   |
| `zplc status` | command | 1 optional | Runtime status |   |
| `zplc reset` | command | none | Reset VM |   |
| `zplc version` | command | none | Version info |   |
| `zplc dbg` | group |   | Debug commands |   |
| `zplc dbg pause` | command | none | Pause VM execution |   |
| `zplc dbg resume` | command | none | Resume VM execution |   |
| `zplc dbg step` | command | none | Execute one cycle |   |
| `zplc dbg bp` | group |   | Breakpoint management |   |
| `zplc dbg bp add` | command | 1 required | Add breakpoint: dbg bp add &lt;pc> |   |
| `zplc dbg bp remove` | command | 1 required | Remove breakpoint: dbg bp remove &lt;pc> |   |
| `zplc dbg bp clear` | command | none | Clear all breakpoints |   |
| `zplc dbg bp list` | command | none | List active breakpoints |   |
| `zplc dbg force` | group |   | Force value management | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg force set` | command | 2 required | Set force bytes: dbg force set &lt;addr> &lt;hexbytes> | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg force clear` | command | 1 required | Clear force entry: dbg force clear &lt;addr> | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg force clear_all` | command | none | Clear all force entries | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg force list` | command | 1 optional | List force entries | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg peek` | command | 1 required, 1 optional | Read memory | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg mpeek` | command | 1 required | Multi-read: mpeek addr\:len[,addr\:len...] | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg poke` | command | 2 required | Write memory | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg ticks` | command | 1 optional | System tick | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg mem` | command | 1 required, 1 optional | Dump memory | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg info` | command | 1 optional | VM state |   |
| `zplc dbg task` | command | 1 required, 1 optional | Task info |   |
| `zplc dbg watch` | command | 1 required, 1 optional | Read a typed value: dbg watch &lt;addr> [type] |   |
| `zplc dbg timer` | command | 1 required | Timer instance state: dbg timer &lt;addr> |   |
| `zplc config` | group |   | Configuration commands |   |
| `zplc config get` | command | none | Show current configuration |   |
| `zplc config set` | command | 2 required | Set configuration value |   |
| `zplc config save` | command | none | Persist configuration to flash |   |
| `zplc config reset` | command | none | Reset configuration to defaults |   |
| `zplc cert` | group |   | Certificate management |   |
| `zplc cert begin` | command | 2 required | Begin cert upload: cert begin &lt;ca\|client\|key> &lt;size> |   |
| `zplc cert chunk` | command | 1 required | Upload cert chunk in hex |   |
| `zplc cert commit` | command | none | Commit staged certificate |   |
| `zplc cert erase` | command | 1 required | Erase certificate: cert erase &lt;ca\|client\|key> |   |
| `zplc cert status` | command | none | Show cert presence/size |   |
| `zplc net` | group |   | Network diagnostics |   |
| `zplc net status` | command | none | Show network status (IP/WiFi) |   |
| `zplc wifi` | group |   | WiFi management |   |
| `zplc wifi connect` | command | none | Connect using stored credentials |   |
| `zplc ntp` | group |   | NTP time synchronization |   |
| `zplc ntp status` | command | 1 optional | Show NTP sync status |   |
| `zplc ntp enable` | command | none | Enable NTP time sync |   |
| `zplc ntp disable` | command | none | Disable NTP time sync |   |
| `zplc ntp server` | command | 1 required | Set NTP server: ntp server &lt;hostname> |   |
| `zplc ntp sync` | command | none | Force NTP re-sync now |   |
| `zplc mqtt` | group |   | MQTT client commands |   |
| `zplc mqtt status` | command | 1 optional | Show MQTT runtime status |   |
| `zplc mqtt reset_backoff` | command | none | Reset MQTT reconnect backoff to initial value |   |
| `zplc comm` | group |   | Communication map and overrides |   |
| `zplc comm map` | command | 1 optional | Show communication bindings and Modbus server mappings |   |
| `zplc comm set` | command | 3 required | Override a Modbus server mapping |   |
| `zplc comm clear` | command | 2 required | Clear a Modbus server mapping override |   |
| `zplc sched` | group |   | Scheduler commands | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sched status` | command | 1 optional | Scheduler status | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sched tasks` | command | none | List tasks | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sched load` | command | 1 required | Prepare program load: sched load &lt;size> | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sched data` | command | 1 required | Receive program data (hex): sched data &lt;hex> | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sys` | group |   | System commands | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sys info` | command | 1 optional | System information | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sys build` | command | 1 optional | Firmware identity: commit, board, ABI, options [--json] | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sys io` | command | 1 optional | Identity of the board I/O description [--json] | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sys reboot` | command | none | Reboot | `CONFIG_ZPLC_SCHEDULER` |
| `zplc adc` | group |   | ADC commands | `CONFIG_ADC` |
| `zplc adc temp` | command | none | Read temperature | `CONFIG_ADC` |
| `zplc adc read` | command | 1 required | Read ADC | `CONFIG_ADC` |
| `zplc hil` | group |   | HIL commands | `CONFIG_ZPLC_HIL_DEBUG` |
| `zplc hil mode` | command | 1 required | Set debug mode | `CONFIG_ZPLC_HIL_DEBUG` |
| `zplc hil status` | command | none | Show status | `CONFIG_ZPLC_HIL_DEBUG` |
| `zplc hil watch` | command | 1 required, 2 optional | Manage watches | `CONFIG_ZPLC_HIL_DEBUG` |
| `zplc hil reset` | command | none | Reset VM | `CONFIG_ZPLC_HIL_DEBUG` |

{/* <<< END GENERATED: reference/shell-commands <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
