---
title: "Project file (zplc.json)"
sidebar_label: "Project file"
description: "Every field of zplc.json, read off its JSON schema."
tags: [reference, generated]
---

# Project file (zplc.json)

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/project-file. Do not edit. >>> */}

Every field of the project file `zplc.json` that the schema `packages/zplc-ide/zplc.schema.json` defines, 156 in all. A field of an array is written with `[]`: `tasks[].name` is the `name` of each task. A field is required only inside an object that is present.

A project file must have `name`, `version`, `tasks`. The editor and the tools validate a file against this schema before they use it.

This table is read off the source file `packages/zplc-ide/zplc.schema.json`; its text is the source's own, so it is the same in English and in Spanish.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `$schema` | `string` |   |   | JSON Schema reference |
| `schemaVersion` | `integer: 1 \| 2` |   |   | Project schema version; legacy v1 can be previewed, diffed, and explicitly saved as a canonical v2 project |
| `name` | `string (length >= 1)` | yes |   | Project name |
| `version` | `string` | yes |   | Project version (semver) |
| `description` | `string` |   |   | Optional project description |
| `author` | `string` |   |   | Project author |
| `target` | `object` |   |   | Target hardware configuration |
| `target.board` | `string: "rpi_pico" \| "arduino_giga_r1" \| "arduino_opta_wifi" \| "stm32f746g_disco" \| "esp32s3_devkitc" \| "nucleo_h743zi" \| "posix"` |   |   | Target board (e.g., rpi_pico, posix) |
| `target.cpu` | `string` |   |   | CPU identifier |
| `target.clock_mhz` | `integer (>= 1)` |   |   | CPU clock frequency in MHz |
| `compiler` | `object` |   |   | Compiler settings |
| `compiler.optimization` | `string: "none" \| "size" \| "speed"` |   | `"none"` | Optimization level. The compiler has one code generator: every value produces the same artifact, and size or speed report an OPTION_IGNORED warning. |
| `compiler.debug` | `boolean` |   | `true` | Statement ranges and line mappings of the debug map. false keeps only variables and memory. |
| `compiler.warnings` | `string: "none" \| "default" \| "all"` |   | `"default"` | Which compiler warnings are reported: none, default (unused variables, unreachable statements, non-IEC spellings, implicit narrowing) or all (adds write-only variables). |
| `compiler.strictTypes` | `boolean` |   | `false` | An implicit narrowing between integer types is an error naming both types instead of the IMPLICIT_NARROWING warning. |
| `io` | `object` |   |   | I/O configuration |
| `io.inputs` | `array of object` |   |   | Digital input definitions |
| `io.inputs[].name` | `string (length >= 1)` | yes |   | Variable name |
| `io.inputs[].address` | `string` | yes |   | IEC 61131-3 address (e.g., %I0.0, %Q0.1, %MW0) |
| `io.inputs[].type` | `string: "BOOL" \| "BYTE" \| "WORD" \| "DWORD"` |   | `"BOOL"` | Data type |
| `io.inputs[].pin` | `integer (>= 0)` |   |   | GPIO pin number (hardware-specific) |
| `io.inputs[].description` | `string` |   |   | Optional description |
| `io.outputs` | `array of object` |   |   | Digital output definitions |
| `io.outputs[].name` | `string (length >= 1)` | yes |   | Variable name |
| `io.outputs[].address` | `string` | yes |   | IEC 61131-3 address (e.g., %I0.0, %Q0.1, %MW0) |
| `io.outputs[].type` | `string: "BOOL" \| "BYTE" \| "WORD" \| "DWORD"` |   | `"BOOL"` | Data type |
| `io.outputs[].pin` | `integer (>= 0)` |   |   | GPIO pin number (hardware-specific) |
| `io.outputs[].description` | `string` |   |   | Optional description |
| `io.virtual` | `array of object` |   |   | Words or bits of the process image that no pin of the board drives, read in the debugger or by a test. A variable located where the selected board has no channel is a build error that names the board unless its address is listed here. |
| `io.virtual[].name` | `string (length >= 1)` | yes |   | Variable name |
| `io.virtual[].address` | `string` | yes |   | IEC 61131-3 address (e.g., %I0.0, %Q0.1, %MW0) |
| `io.virtual[].type` | `string: "BOOL" \| "BYTE" \| "WORD" \| "DWORD"` |   | `"BOOL"` | Data type |
| `io.virtual[].pin` | `integer (>= 0)` |   |   | GPIO pin number (hardware-specific) |
| `io.virtual[].description` | `string` |   |   | Optional description |
| `io.analog` | `object` |   |   | Analog I/O configuration |
| `io.analog.adc` | `array of object` |   |   | ADC channel definitions |
| `io.analog.adc[].name` | `string (length >= 1)` | yes |   | Variable name |
| `io.analog.adc[].address` | `string` | yes |   | IEC 61131-3 word address (e.g., %IW0, %QW0) |
| `io.analog.adc[].channel` | `integer (>= 0)` | yes |   | ADC/DAC channel number |
| `io.analog.adc[].bits` | `integer: 8 \| 10 \| 12 \| 14 \| 16` |   | `12` | Resolution in bits |
| `io.analog.adc[].description` | `string` |   |   | Optional description |
| `io.analog.dac` | `array of object` |   |   | DAC channel definitions |
| `io.analog.dac[].name` | `string (length >= 1)` | yes |   | Variable name |
| `io.analog.dac[].address` | `string` | yes |   | IEC 61131-3 word address (e.g., %IW0, %QW0) |
| `io.analog.dac[].channel` | `integer (>= 0)` | yes |   | ADC/DAC channel number |
| `io.analog.dac[].bits` | `integer: 8 \| 10 \| 12 \| 14 \| 16` |   | `12` | Resolution in bits |
| `io.analog.dac[].description` | `string` |   |   | Optional description |
| `communication` | `object` |   |   | Industrial communication configuration |
| `communication.mqtt` | `object` |   |   |   |
| `communication.mqtt.enabled` | `boolean` | yes |   |   |
| `communication.mqtt.profile` | `string: "sparkplug-b" \| "generic-broker" \| "aws-iot-core" \| "azure-iot-hub" \| "azure-event-grid-mqtt"` | yes |   |   |
| `communication.mqtt.protocolVersion` | `string: "3.1.1" \| "5.0"` | yes |   |   |
| `communication.mqtt.transport` | `string: "tcp" \| "tls" \| "ws" \| "wss"` | yes |   |   |
| `communication.mqtt.broker` | `string` | yes |   | Host name or address of the broker. Empty means none: a controller connects nowhere until one is named (COM-014). |
| `communication.mqtt.port` | `integer (1 to 65535)` | yes |   |   |
| `communication.mqtt.clientId` | `string (length >= 1)` | yes |   |   |
| `communication.mqtt.keepAliveSec` | `integer (5 to 3600)` | yes |   |   |
| `communication.mqtt.cleanSession` | `boolean` | yes |   |   |
| `communication.mqtt.sessionExpirySec` | `integer (>= 0)` | yes |   |   |
| `communication.mqtt.username` | `string` |   |   |   |
| `communication.mqtt.groupId` | `string` |   |   |   |
| `communication.mqtt.topicNamespace` | `string (length >= 1)` | yes |   |   |
| `communication.mqtt.publishIntervalMs` | `integer (>= 1)` | yes |   |   |
| `communication.mqtt.publishQos` | `integer: 0 \| 1` | yes |   |   |
| `communication.mqtt.subscribeQos` | `integer: 0 \| 1` | yes |   |   |
| `communication.mqtt.publishRetain` | `boolean` | yes |   |   |
| `communication.mqtt.securityLevel` | `string: "none" \| "tls-no-verify" \| "tls-server-verify" \| "tls-mutual"` | yes |   |   |
| `communication.mqtt.websocketPath` | `string` |   |   |   |
| `communication.mqtt.alpnProtocols` | `string` |   |   |   |
| `communication.mqtt.caCertPath` | `string` |   |   |   |
| `communication.mqtt.clientCertPath` | `string` |   |   |   |
| `communication.mqtt.azureSasExpirySec` | `integer (>= 1)` |   |   |   |
| `communication.mqtt.azureTwinEnabled` | `boolean` |   |   |   |
| `communication.mqtt.azureDirectMethodsEnabled` | `boolean` |   |   |   |
| `communication.mqtt.azureC2dEnabled` | `boolean` |   |   |   |
| `communication.mqtt.azureDpsEnabled` | `boolean` |   |   |   |
| `communication.mqtt.azureDpsIdScope` | `string` |   |   |   |
| `communication.mqtt.azureDpsRegistrationId` | `string` |   |   |   |
| `communication.mqtt.azureDpsEndpoint` | `string` |   |   |   |
| `communication.mqtt.azureEventGridTopic` | `string` |   |   |   |
| `communication.mqtt.azureEventGridSource` | `string` |   |   |   |
| `communication.mqtt.azureEventGridEventType` | `string` |   |   |   |
| `communication.mqtt.awsShadowEnabled` | `boolean` |   |   |   |
| `communication.mqtt.awsJobsEnabled` | `boolean` |   |   |   |
| `communication.mqtt.awsFleetEnabled` | `boolean` |   |   |   |
| `communication.mqtt.awsFleetTemplateName` | `string` |   |   |   |
| `communication.mqtt.awsClaimCertPath` | `string` |   |   |   |
| `communication.mqtt.lwtEnabled` | `boolean` | yes |   |   |
| `communication.mqtt.lwtTopic` | `string` |   |   |   |
| `communication.mqtt.lwtPayload` | `string` |   |   |   |
| `communication.mqtt.lwtQos` | `integer: 0 \| 1` | yes |   |   |
| `communication.mqtt.lwtRetain` | `boolean` | yes |   |   |
| `communication.modbus` | `object` |   |   |   |
| `communication.modbus.enabled` | `boolean` | yes |   |   |
| `communication.modbus.unitId` | `integer (1 to 247)` | yes |   |   |
| `communication.modbus.tcpEnabled` | `boolean` | yes |   |   |
| `communication.modbus.tcpPort` | `integer (1 to 65535)` | yes |   |   |
| `communication.modbus.rtuEnabled` | `boolean` | yes |   |   |
| `communication.modbus.rtuBaud` | `integer (1200 to 1000000)` | yes |   |   |
| `communication.modbus.rtuParity` | `string: "none" \| "even" \| "odd"` | yes |   |   |
| `communication.modbus.pollIntervalMs` | `integer (>= 1)` | yes |   |   |
| `communication.bindings` | `array of object` |   |   | Canonical communication bindings used by compiler and runtime communication modules |
| `communication.bindings[].name` | `string (length >= 1)` | yes |   |   |
| `communication.bindings[].symbol` | `string` | yes |   |   |
| `communication.bindings[].type` | `string: "BOOL" \| "INT" \| "UINT" \| "REAL"` | yes |   |   |
| `communication.bindings[].mode` | `string: "publish" \| "subscribe" \| "modbus"` |   |   |   |
| `communication.bindings[].publish` | `boolean` |   |   |   |
| `communication.bindings[].subscribe` | `boolean` |   |   |   |
| `communication.bindings[].modbusAddress` | `integer (1 to 65535)` |   |   |   |
| `communication.bindings[].description` | `string` |   |   |   |
| `communication.tags` | `array of object` |   |   | Legacy alias for communication bindings |
| `communication.tags[].name` | `string (length >= 1)` | yes |   |   |
| `communication.tags[].symbol` | `string` | yes |   |   |
| `communication.tags[].type` | `string: "BOOL" \| "INT" \| "UINT" \| "REAL"` | yes |   |   |
| `communication.tags[].mode` | `string: "publish" \| "subscribe" \| "modbus"` |   |   |   |
| `communication.tags[].publish` | `boolean` |   |   |   |
| `communication.tags[].subscribe` | `boolean` |   |   |   |
| `communication.tags[].modbusAddress` | `integer (1 to 65535)` |   |   |   |
| `communication.tags[].description` | `string` |   |   |   |
| `network` | `object` |   |   | Board-specific network configuration |
| `network.hostname` | `string` |   |   |   |
| `network.wifi` | `object` |   |   |   |
| `network.wifi.enabled` | `boolean` | yes |   |   |
| `network.wifi.ssid` | `string` |   |   |   |
| `network.wifi.security` | `string: "open" \| "wpa2-psk" \| "wpa3-sae"` | yes |   |   |
| `network.wifi.hiddenSsid` | `boolean` | yes |   |   |
| `network.wifi.ipv4` | `object` | yes |   |   |
| `network.wifi.ipv4.dhcp` | `boolean` | yes |   |   |
| `network.wifi.ipv4.ip` | `string` |   |   |   |
| `network.wifi.ipv4.netmask` | `string` |   |   |   |
| `network.wifi.ipv4.gateway` | `string` |   |   |   |
| `network.wifi.ipv4.dns` | `string` |   |   |   |
| `network.ethernet` | `object` |   |   |   |
| `network.ethernet.enabled` | `boolean` | yes |   |   |
| `network.ethernet.macAddress` | `string` |   |   |   |
| `network.ethernet.ipv4` | `object` | yes |   |   |
| `network.ethernet.ipv4.dhcp` | `boolean` | yes |   |   |
| `network.ethernet.ipv4.ip` | `string` |   |   |   |
| `network.ethernet.ipv4.netmask` | `string` |   |   |   |
| `network.ethernet.ipv4.gateway` | `string` |   |   |   |
| `network.ethernet.ipv4.dns` | `string` |   |   |   |
| `safety` | `object` |   |   |   |
| `safety.incompatibleOutputs` | `array of array of string (length 1 to 128) (items 2 to 2) (items 1 to 64)` | yes |   |   |
| `libraries` | `array of string` |   |   | Folders of source files, relative to the project, compiled with the project in addition to src/. Their function blocks, functions and types are visible to every program. |
| `tasks` | `array of object (items 1 to 16)` | yes |   | Task definitions |
| `tasks[].name` | `string (length >= 1)` | yes |   | Task name |
| `tasks[].trigger` | `string: "cyclic" \| "event" \| "freewheeling"` |   | `"cyclic"` | Task trigger type |
| `tasks[].interval_ms` | `integer (>= 1)` |   | `100` | Task interval in milliseconds (for cyclic tasks) |
| `tasks[].interval` | `integer (>= 1)` |   |   | Legacy alias for interval_ms |
| `tasks[].type` | `string` |   |   | Legacy alias for trigger |
| `tasks[].priority` | `integer (0 to 255)` |   | `1` | Task priority (0 = highest) |
| `tasks[].programs` | `array of string (length >= 1) (items >= 1)` |   |   | List of program files to execute in this task |
| `tasks[].file` | `string (length >= 1)` |   |   | Legacy alias for a single programs entry |
| `build` | `object` |   |   | Build configuration |
| `build.outDir` | `string` |   | `"build"` | Output directory for compiled files |
| `build.generateDebugInfo` | `boolean` |   | `false` | The command line writes the debug map beside the artifact as &lt;output>.map.json. |

{/* <<< END GENERATED: reference/project-file <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
