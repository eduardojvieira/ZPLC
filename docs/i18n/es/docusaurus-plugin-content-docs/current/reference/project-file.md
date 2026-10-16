---
title: "Archivo de proyecto (zplc.json)"
sidebar_label: "Archivo de proyecto"
description: "Todos los campos de zplc.json, leídos de su esquema JSON."
tags: [reference, generated]
---

# Archivo de proyecto (zplc.json)

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/project-file. Do not edit. >>> */}

Todos los campos del archivo de proyecto `zplc.json` que define el esquema `packages/zplc-ide/zplc.schema.json`, 159 en total. Un campo de una lista se escribe con `[]`: `tasks[].name` es el `name` de cada tarea. Un campo es obligatorio solo dentro de un objeto que está presente.

Un archivo de proyecto debe tener `name`, `version`, `tasks`. El editor y las herramientas validan un archivo contra este esquema antes de usarlo.

Esta tabla se lee del archivo fuente `packages/zplc-ide/zplc.schema.json`; su texto es el de la propia fuente, por eso es igual en inglés y en español.

| Campo | Tipo | Obligatorio | Predeterminado | Descripción |
| --- | --- | --- | --- | --- |
| `$schema` | `string` |   |   | JSON Schema reference |
| `schemaVersion` | `integer: 1 \| 2` |   |   | Project schema version; legacy v1 can be previewed, diffed, and explicitly saved as a canonical v2 project |
| `name` | `string (length >= 1)` | sí |   | Project name |
| `version` | `string` | sí |   | Project version (semver) |
| `description` | `string` |   |   | Optional project description |
| `author` | `string` |   |   | Project author |
| `target` | `object` |   |   | Target hardware configuration |
| `target.board` | `string: "rpi_pico" \| "arduino_giga_r1" \| "arduino_opta_wifi" \| "stm32f746g_disco" \| "esp32s3_devkitc" \| "nucleo_h743zi" \| "waveshare_rp2040_zero" \| "posix"` |   |   | Target board (e.g., rpi_pico, posix) |
| `target.cpu` | `string` |   |   | CPU identifier |
| `target.clock_mhz` | `integer (>= 1)` |   |   | CPU clock frequency in MHz |
| `compiler` | `object` |   |   | Compiler settings |
| `compiler.optimization` | `string: "none" \| "size" \| "speed"` |   | `"none"` | Optimization level. The compiler has one code generator: every value produces the same artifact, and size or speed report an OPTION_IGNORED warning. |
| `compiler.debug` | `boolean` |   | `true` | Statement ranges and line mappings of the debug map. false keeps only variables and memory. |
| `compiler.warnings` | `string: "none" \| "default" \| "all"` |   | `"default"` | Which compiler warnings are reported: none, default (unused variables, unreachable statements, non-IEC spellings, implicit narrowing) or all (adds write-only variables). |
| `compiler.strictTypes` | `boolean` |   | `false` | An implicit narrowing between integer types is an error naming both types instead of the IMPLICIT_NARROWING warning. |
| `io` | `object` |   |   | I/O configuration |
| `io.inputs` | `array of object` |   |   | Digital input definitions |
| `io.inputs[].name` | `string (length >= 1)` | sí |   | Variable name |
| `io.inputs[].address` | `string` | sí |   | IEC 61131-3 address (e.g., %I0.0, %Q0.1, %MW0) |
| `io.inputs[].type` | `string: "BOOL" \| "BYTE" \| "WORD" \| "DWORD"` |   | `"BOOL"` | Data type |
| `io.inputs[].pin` | `integer (>= 0)` |   |   | GPIO pin number (hardware-specific) |
| `io.inputs[].safe` | `boolean` |   |   | Digital outputs only: the value the output takes whenever the program does not control it (STOP, a pause, a latched fault, the boot, a deploy in progress). Absent is off, unless the board description says otherwise. The build refuses a value for an output the selected board does not have, and the value travels in the artifact with the program. |
| `io.inputs[].description` | `string` |   |   | Optional description |
| `io.outputs` | `array of object` |   |   | Digital output definitions |
| `io.outputs[].name` | `string (length >= 1)` | sí |   | Variable name |
| `io.outputs[].address` | `string` | sí |   | IEC 61131-3 address (e.g., %I0.0, %Q0.1, %MW0) |
| `io.outputs[].type` | `string: "BOOL" \| "BYTE" \| "WORD" \| "DWORD"` |   | `"BOOL"` | Data type |
| `io.outputs[].pin` | `integer (>= 0)` |   |   | GPIO pin number (hardware-specific) |
| `io.outputs[].safe` | `boolean` |   |   | Digital outputs only: the value the output takes whenever the program does not control it (STOP, a pause, a latched fault, the boot, a deploy in progress). Absent is off, unless the board description says otherwise. The build refuses a value for an output the selected board does not have, and the value travels in the artifact with the program. |
| `io.outputs[].description` | `string` |   |   | Optional description |
| `io.virtual` | `array of object` |   |   | Words or bits of the process image that no pin of the board drives, read in the debugger or by a test. A variable located where the selected board has no channel is a build error that names the board unless its address is listed here. |
| `io.virtual[].name` | `string (length >= 1)` | sí |   | Variable name |
| `io.virtual[].address` | `string` | sí |   | IEC 61131-3 address (e.g., %I0.0, %Q0.1, %MW0) |
| `io.virtual[].type` | `string: "BOOL" \| "BYTE" \| "WORD" \| "DWORD"` |   | `"BOOL"` | Data type |
| `io.virtual[].pin` | `integer (>= 0)` |   |   | GPIO pin number (hardware-specific) |
| `io.virtual[].safe` | `boolean` |   |   | Digital outputs only: the value the output takes whenever the program does not control it (STOP, a pause, a latched fault, the boot, a deploy in progress). Absent is off, unless the board description says otherwise. The build refuses a value for an output the selected board does not have, and the value travels in the artifact with the program. |
| `io.virtual[].description` | `string` |   |   | Optional description |
| `io.analog` | `object` |   |   | Analog I/O configuration |
| `io.analog.adc` | `array of object` |   |   | ADC channel definitions |
| `io.analog.adc[].name` | `string (length >= 1)` | sí |   | Variable name |
| `io.analog.adc[].address` | `string` | sí |   | IEC 61131-3 word address (e.g., %IW0, %QW0) |
| `io.analog.adc[].channel` | `integer (>= 0)` | sí |   | ADC/DAC channel number |
| `io.analog.adc[].bits` | `integer: 8 \| 10 \| 12 \| 14 \| 16` |   | `12` | Resolution in bits |
| `io.analog.adc[].description` | `string` |   |   | Optional description |
| `io.analog.dac` | `array of object` |   |   | DAC channel definitions |
| `io.analog.dac[].name` | `string (length >= 1)` | sí |   | Variable name |
| `io.analog.dac[].address` | `string` | sí |   | IEC 61131-3 word address (e.g., %IW0, %QW0) |
| `io.analog.dac[].channel` | `integer (>= 0)` | sí |   | ADC/DAC channel number |
| `io.analog.dac[].bits` | `integer: 8 \| 10 \| 12 \| 14 \| 16` |   | `12` | Resolution in bits |
| `io.analog.dac[].description` | `string` |   |   | Optional description |
| `communication` | `object` |   |   | Industrial communication configuration |
| `communication.mqtt` | `object` |   |   |   |
| `communication.mqtt.enabled` | `boolean` | sí |   |   |
| `communication.mqtt.profile` | `string: "sparkplug-b" \| "generic-broker" \| "aws-iot-core" \| "azure-iot-hub" \| "azure-event-grid-mqtt"` | sí |   |   |
| `communication.mqtt.protocolVersion` | `string: "3.1.1" \| "5.0"` | sí |   |   |
| `communication.mqtt.transport` | `string: "tcp" \| "tls" \| "ws" \| "wss"` | sí |   |   |
| `communication.mqtt.broker` | `string` | sí |   | Host name or address of the broker. Empty means none: a controller connects nowhere until one is named (COM-014). |
| `communication.mqtt.port` | `integer (1 to 65535)` | sí |   |   |
| `communication.mqtt.clientId` | `string (length >= 1)` | sí |   |   |
| `communication.mqtt.keepAliveSec` | `integer (5 to 3600)` | sí |   |   |
| `communication.mqtt.cleanSession` | `boolean` | sí |   |   |
| `communication.mqtt.sessionExpirySec` | `integer (>= 0)` | sí |   |   |
| `communication.mqtt.username` | `string` |   |   |   |
| `communication.mqtt.groupId` | `string` |   |   |   |
| `communication.mqtt.topicNamespace` | `string (length >= 1)` | sí |   |   |
| `communication.mqtt.publishIntervalMs` | `integer (>= 1)` | sí |   |   |
| `communication.mqtt.publishQos` | `integer: 0 \| 1` | sí |   |   |
| `communication.mqtt.subscribeQos` | `integer: 0 \| 1` | sí |   |   |
| `communication.mqtt.publishRetain` | `boolean` | sí |   |   |
| `communication.mqtt.securityLevel` | `string: "none" \| "tls-no-verify" \| "tls-server-verify" \| "tls-mutual"` | sí |   |   |
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
| `communication.mqtt.lwtEnabled` | `boolean` | sí |   |   |
| `communication.mqtt.lwtTopic` | `string` |   |   |   |
| `communication.mqtt.lwtPayload` | `string` |   |   |   |
| `communication.mqtt.lwtQos` | `integer: 0 \| 1` | sí |   |   |
| `communication.mqtt.lwtRetain` | `boolean` | sí |   |   |
| `communication.modbus` | `object` |   |   |   |
| `communication.modbus.enabled` | `boolean` | sí |   |   |
| `communication.modbus.unitId` | `integer (1 to 247)` | sí |   |   |
| `communication.modbus.tcpEnabled` | `boolean` | sí |   |   |
| `communication.modbus.tcpPort` | `integer (1 to 65535)` | sí |   |   |
| `communication.modbus.rtuEnabled` | `boolean` | sí |   |   |
| `communication.modbus.rtuBaud` | `integer (1200 to 1000000)` | sí |   |   |
| `communication.modbus.rtuParity` | `string: "none" \| "even" \| "odd"` | sí |   |   |
| `communication.modbus.pollIntervalMs` | `integer (>= 1)` | sí |   |   |
| `communication.bindings` | `array of object` |   |   | Canonical communication bindings used by compiler and runtime communication modules |
| `communication.bindings[].name` | `string (length >= 1)` | sí |   |   |
| `communication.bindings[].symbol` | `string` | sí |   |   |
| `communication.bindings[].type` | `string: "BOOL" \| "INT" \| "UINT" \| "REAL"` | sí |   |   |
| `communication.bindings[].mode` | `string: "publish" \| "subscribe" \| "modbus"` |   |   |   |
| `communication.bindings[].publish` | `boolean` |   |   |   |
| `communication.bindings[].subscribe` | `boolean` |   |   |   |
| `communication.bindings[].modbusAddress` | `integer (1 to 65535)` |   |   |   |
| `communication.bindings[].description` | `string` |   |   |   |
| `communication.tags` | `array of object` |   |   | Legacy alias for communication bindings |
| `communication.tags[].name` | `string (length >= 1)` | sí |   |   |
| `communication.tags[].symbol` | `string` | sí |   |   |
| `communication.tags[].type` | `string: "BOOL" \| "INT" \| "UINT" \| "REAL"` | sí |   |   |
| `communication.tags[].mode` | `string: "publish" \| "subscribe" \| "modbus"` |   |   |   |
| `communication.tags[].publish` | `boolean` |   |   |   |
| `communication.tags[].subscribe` | `boolean` |   |   |   |
| `communication.tags[].modbusAddress` | `integer (1 to 65535)` |   |   |   |
| `communication.tags[].description` | `string` |   |   |   |
| `network` | `object` |   |   | Board-specific network configuration |
| `network.hostname` | `string` |   |   |   |
| `network.wifi` | `object` |   |   |   |
| `network.wifi.enabled` | `boolean` | sí |   |   |
| `network.wifi.ssid` | `string` |   |   |   |
| `network.wifi.security` | `string: "open" \| "wpa2-psk" \| "wpa3-sae"` | sí |   |   |
| `network.wifi.hiddenSsid` | `boolean` | sí |   |   |
| `network.wifi.ipv4` | `object` | sí |   |   |
| `network.wifi.ipv4.dhcp` | `boolean` | sí |   |   |
| `network.wifi.ipv4.ip` | `string` |   |   |   |
| `network.wifi.ipv4.netmask` | `string` |   |   |   |
| `network.wifi.ipv4.gateway` | `string` |   |   |   |
| `network.wifi.ipv4.dns` | `string` |   |   |   |
| `network.ethernet` | `object` |   |   |   |
| `network.ethernet.enabled` | `boolean` | sí |   |   |
| `network.ethernet.macAddress` | `string` |   |   |   |
| `network.ethernet.ipv4` | `object` | sí |   |   |
| `network.ethernet.ipv4.dhcp` | `boolean` | sí |   |   |
| `network.ethernet.ipv4.ip` | `string` |   |   |   |
| `network.ethernet.ipv4.netmask` | `string` |   |   |   |
| `network.ethernet.ipv4.gateway` | `string` |   |   |   |
| `network.ethernet.ipv4.dns` | `string` |   |   |   |
| `safety` | `object` |   |   |   |
| `safety.incompatibleOutputs` | `array of array of string (length 1 to 128) (items 2 to 2) (items 1 to 64)` | sí |   |   |
| `libraries` | `array of string` |   |   | Folders of source files, relative to the project, compiled with the project in addition to src/. Their function blocks, functions and types are visible to every program. |
| `tasks` | `array of object (items 1 to 16)` | sí |   | Task definitions |
| `tasks[].name` | `string (length >= 1)` | sí |   | Task name |
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

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
