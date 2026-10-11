---
title: "Comandos de la consola"
sidebar_label: "Comandos de la consola"
description: "Todos los subcomandos del comando zplc de la consola del dispositivo, leídos de su tabla de comandos."
tags: [reference, generated]
---

# Comandos de la consola

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/shell-commands. Do not edit. >>> */}

La consola del dispositivo tiene un comando raíz, `zplc`, con 77 subcomandos. Un grupo solo contiene subcomandos. Los argumentos son las palabras que siguen al nombre del comando; un comando solo está presente cuando el símbolo de Kconfig de la última columna está habilitado. El runtime de una simulación de escritorio no tiene consola: habla el [protocolo de sesión](./runtime-protocol.md).

Esta tabla se lee del archivo fuente `firmware/app/src/shell_cmds.c`; su texto es el de la propia fuente, por eso es igual en inglés y en español.

| Comando | Clase | Argumentos | Descripción | Disponible cuando |
| --- | --- | --- | --- | --- |
| `zplc` | grupo |   | ZPLC runtime commands |   |
| `zplc load` | comando | 1 obligatorio | Prepare load |   |
| `zplc data` | comando | 1 obligatorio | Receive data |   |
| `zplc start` | comando | ninguno | Start execution |   |
| `zplc stop` | comando | ninguno | Stop execution |   |
| `zplc status` | comando | 1 opcional | Runtime status |   |
| `zplc reset` | comando | ninguno | Reset VM |   |
| `zplc version` | comando | ninguno | Version info |   |
| `zplc link` | comando | 1 obligatorio | One frame of the device link protocol, in hexadecimal | `CONFIG_ZPLC_DEVICE_LINK` |
| `zplc dbg` | grupo |   | Debug commands |   |
| `zplc dbg pause` | comando | ninguno | Pause VM execution |   |
| `zplc dbg resume` | comando | ninguno | Resume VM execution |   |
| `zplc dbg step` | comando | ninguno | Execute one cycle |   |
| `zplc dbg bp` | grupo |   | Breakpoint management |   |
| `zplc dbg bp add` | comando | 1 obligatorio | Add breakpoint: dbg bp add &lt;pc> |   |
| `zplc dbg bp remove` | comando | 1 obligatorio | Remove breakpoint: dbg bp remove &lt;pc> |   |
| `zplc dbg bp clear` | comando | ninguno | Clear all breakpoints |   |
| `zplc dbg bp list` | comando | ninguno | List active breakpoints |   |
| `zplc dbg force` | grupo |   | Force value management | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg force set` | comando | 2 obligatorio | Set force bytes: dbg force set &lt;addr> &lt;hexbytes> | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg force clear` | comando | 1 obligatorio | Clear force entry: dbg force clear &lt;addr> | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg force clear_all` | comando | ninguno | Clear all force entries | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg force list` | comando | 1 opcional | List force entries | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg peek` | comando | 1 obligatorio, 1 opcional | Read memory | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg mpeek` | comando | 1 obligatorio | Multi-read: mpeek addr\:len[,addr\:len...] | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg poke` | comando | 2 obligatorio | Write memory | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg ticks` | comando | 1 opcional | System tick | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg mem` | comando | 1 obligatorio, 1 opcional | Dump memory | `CONFIG_ZPLC_SCHEDULER` |
| `zplc dbg info` | comando | 1 opcional | VM state |   |
| `zplc dbg task` | comando | 1 obligatorio, 1 opcional | Task info |   |
| `zplc dbg watch` | comando | 1 obligatorio, 1 opcional | Read a typed value: dbg watch &lt;addr> [type] |   |
| `zplc dbg timer` | comando | 1 obligatorio | Timer instance state: dbg timer &lt;addr> |   |
| `zplc config` | grupo |   | Configuration commands |   |
| `zplc config get` | comando | ninguno | Show current configuration |   |
| `zplc config set` | comando | 2 obligatorio | Set configuration value |   |
| `zplc config save` | comando | ninguno | Persist configuration to flash |   |
| `zplc config reset` | comando | ninguno | Reset configuration to defaults |   |
| `zplc cert` | grupo |   | Certificate management |   |
| `zplc cert begin` | comando | 2 obligatorio | Begin cert upload: cert begin &lt;ca\|client\|key> &lt;size> |   |
| `zplc cert chunk` | comando | 1 obligatorio | Upload cert chunk in hex |   |
| `zplc cert commit` | comando | ninguno | Commit staged certificate |   |
| `zplc cert erase` | comando | 1 obligatorio | Erase certificate: cert erase &lt;ca\|client\|key> |   |
| `zplc cert status` | comando | ninguno | Show cert presence/size |   |
| `zplc net` | grupo |   | Network diagnostics |   |
| `zplc net status` | comando | ninguno | Show network status (IP/WiFi) |   |
| `zplc wifi` | grupo |   | WiFi management |   |
| `zplc wifi connect` | comando | ninguno | Connect using stored credentials |   |
| `zplc ntp` | grupo |   | NTP time synchronization |   |
| `zplc ntp status` | comando | 1 opcional | Show NTP sync status |   |
| `zplc ntp enable` | comando | ninguno | Enable NTP time sync |   |
| `zplc ntp disable` | comando | ninguno | Disable NTP time sync |   |
| `zplc ntp server` | comando | 1 obligatorio | Set NTP server: ntp server &lt;hostname> |   |
| `zplc ntp sync` | comando | ninguno | Force NTP re-sync now |   |
| `zplc mqtt` | grupo |   | MQTT client commands |   |
| `zplc mqtt status` | comando | 1 opcional | Show MQTT runtime status |   |
| `zplc mqtt reset_backoff` | comando | ninguno | Reset MQTT reconnect backoff to initial value |   |
| `zplc comm` | grupo |   | Communication map and overrides |   |
| `zplc comm map` | comando | 1 opcional | Show communication bindings and Modbus server mappings |   |
| `zplc comm set` | comando | 3 obligatorio | Override a Modbus server mapping |   |
| `zplc comm clear` | comando | 2 obligatorio | Clear a Modbus server mapping override |   |
| `zplc sched` | grupo |   | Scheduler commands | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sched status` | comando | 1 opcional | Scheduler status | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sched tasks` | comando | ninguno | List tasks | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sched load` | comando | 1 obligatorio | Prepare program load: sched load &lt;size> | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sched data` | comando | 1 obligatorio | Receive program data (hex): sched data &lt;hex> | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sys` | grupo |   | System commands | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sys info` | comando | 1 opcional | System information | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sys build` | comando | 1 opcional | Firmware identity: commit, board, ABI, options [--json] | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sys io` | comando | 1 opcional | Identity of the board I/O description [--json] | `CONFIG_ZPLC_SCHEDULER` |
| `zplc sys reboot` | comando | ninguno | Reboot | `CONFIG_ZPLC_SCHEDULER` |
| `zplc adc` | grupo |   | ADC commands | `CONFIG_ADC` |
| `zplc adc temp` | comando | ninguno | Read temperature | `CONFIG_ADC` |
| `zplc adc read` | comando | 1 obligatorio | Read ADC | `CONFIG_ADC` |
| `zplc hil` | grupo |   | HIL commands | `CONFIG_ZPLC_HIL_DEBUG` |
| `zplc hil mode` | comando | 1 obligatorio | Set debug mode | `CONFIG_ZPLC_HIL_DEBUG` |
| `zplc hil status` | comando | ninguno | Show status | `CONFIG_ZPLC_HIL_DEBUG` |
| `zplc hil watch` | comando | 1 obligatorio, 2 opcional | Manage watches | `CONFIG_ZPLC_HIL_DEBUG` |
| `zplc hil reset` | comando | ninguno | Reset VM | `CONFIG_ZPLC_HIL_DEBUG` |

{/* <<< END GENERATED: reference/shell-commands <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
