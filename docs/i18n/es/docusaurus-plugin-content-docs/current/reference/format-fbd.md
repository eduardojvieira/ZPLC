---
title: "Formato del archivo de diagrama de bloques de función"
sidebar_label: "Formato de archivo FBD"
description: "El esquema JSON, los valores aceptados, los puertos de los bloques estándar y un ejemplo resuelto de un archivo FBD (.fbd.json)."
tags: [reference, generated]
---

# Formato del archivo de diagrama de bloques de función

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/format-fbd. Do not edit. >>> */}

Un programa de diagrama de bloques de función es un archivo JSON `src/*.fbd.json`: sus variables, sus bloques y las conexiones entre sus puertos. Una conexión va de un puerto de salida a un puerto de entrada; los bloques de variable leen una variable, los bloques de salida escriben una y los bloques de constante guardan un literal.

El esquema, las listas y los ejemplos de abajo se leen de `packages/zplc-ide/src/formats`, el módulo que también sirve el recurso MCP `zplc://formats/fbd`, así que la página, el recurso y el cargador dicen lo mismo. Las descripciones dentro del esquema están en inglés en los dos idiomas.

## Dónde está el archivo

`src/*.fbd.json`

## Esquema JSON

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "zplc://formats/fbd",
  "title": "ZPLC Function Block Diagram (.fbd.json)",
  "type": "object",
  "required": [
    "name",
    "variables",
    "blocks",
    "connections"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "description": "The program name; tasks in zplc.json name it as `<name>.fbd`."
    },
    "description": {
      "type": "string"
    },
    "version": {
      "type": "string"
    },
    "variables": {
      "type": "object",
      "required": [
        "local",
        "outputs"
      ],
      "properties": {
        "local": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "type"
            ],
            "properties": {
              "name": {
                "type": "string",
                "minLength": 1
              },
              "type": {
                "type": "string",
                "minLength": 1
              },
              "address": {
                "type": "string"
              },
              "comment": {
                "type": "string"
              }
            }
          }
        },
        "inputs": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "type"
            ],
            "properties": {
              "name": {
                "type": "string",
                "minLength": 1
              },
              "type": {
                "type": "string",
                "minLength": 1
              },
              "address": {
                "type": "string"
              },
              "comment": {
                "type": "string"
              }
            }
          }
        },
        "outputs": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "type"
            ],
            "properties": {
              "name": {
                "type": "string",
                "minLength": 1
              },
              "type": {
                "type": "string",
                "minLength": 1
              },
              "address": {
                "type": "string"
              },
              "comment": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "blocks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "type",
          "position"
        ],
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1,
            "description": "Unique in the file."
          },
          "type": {
            "type": "string",
            "minLength": 1,
            "description": "One of acceptedValues.specialBlocks or acceptedValues.standardBlocks, or a block the project declares."
          },
          "instanceName": {
            "type": "string",
            "description": "For a function block (TON, CTU, SR...): its instance."
          },
          "variableName": {
            "type": "string",
            "description": "For constant/variable/input/output blocks: the variable."
          },
          "dataType": {
            "type": "string",
            "description": "For a constant: its type (BOOL, INT, REAL, TIME)."
          },
          "value": {
            "description": "For a constant: its value, such as \"T#2s\" or 10."
          },
          "position": {
            "type": "object",
            "required": [
              "x",
              "y"
            ],
            "properties": {
              "x": {
                "type": "number"
              },
              "y": {
                "type": "number"
              }
            }
          },
          "inputs": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "name",
                "type"
              ],
              "properties": {
                "name": {
                  "type": "string",
                  "minLength": 1
                },
                "type": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "description": "Omitted: the standard ports of the type."
          },
          "outputs": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "name",
                "type"
              ],
              "properties": {
                "name": {
                  "type": "string",
                  "minLength": 1
                },
                "type": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "description": "Omitted: the standard ports of the type."
          },
          "comment": {
            "type": "string"
          }
        }
      }
    },
    "connections": {
      "type": "array",
      "description": "Output port -> input port; each input port has at most one writer, and both ports must exist on their blocks.",
      "items": {
        "type": "object",
        "required": [
          "id",
          "from",
          "to"
        ],
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "from": {
            "type": "object",
            "required": [
              "block",
              "port"
            ],
            "properties": {
              "block": {
                "type": "string",
                "minLength": 1
              },
              "port": {
                "type": "string",
                "minLength": 1
              }
            }
          },
          "to": {
            "type": "object",
            "required": [
              "block",
              "port"
            ],
            "properties": {
              "block": {
                "type": "string",
                "minLength": 1
              },
              "port": {
                "type": "string",
                "minLength": 1
              }
            }
          }
        }
      }
    },
    "metadata": {
      "type": "object"
    }
  }
}
```

## Valores aceptados

### Bloques especiales

`constant`, `variable`, `input`, `output`

### Bloques estándar

`TON`, `TOF`, `TP`, `CTU`, `CTD`, `CTUD`, `R_TRIG`, `F_TRIG`, `SR`, `RS`, `BLINK`, `PWM`, `PULSE`, `PID_Compact`, `HYSTERESIS`, `DEADBAND`, `LAG_FILTER`, `RAMP_REAL`, `INTEGRAL`, `DERIVATIVE`, `FIFO`, `LIFO`, `UPTIME`, `CYCLE_TIME`, `WATCHDOG_RESET`, `MB_COIL`, `MB_DISCRETE_INPUT`, `MB_INPUT_REGISTER`, `MB_HOLDING_REGISTER`, `AND`, `OR`, `NOT`, `XOR`, `NAND`, `NOR`, `EQ`, `NE`, `LT`, `LE`, `GT`, `GE`, `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `ABS`, `ABSF`, `SQRT`, `EXPT`, `LN`, `LOG`, `EXP`, `NEG`, `NEGF`, `TRUNC`, `ROUND`, `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`, `NORM_X`, `SCALE_X`, `SHL`, `SHR`, `ROL`, `ROR`, `AND_WORD`, `OR_WORD`, `XOR_WORD`, `NOT_WORD`, `AND_DWORD`, `OR_DWORD`, `XOR_DWORD`, `NOT_DWORD`, `LEN`, `CONCAT`, `LEFT`, `RIGHT`, `MID`, `FIND`, `INSERT`, `DELETE`, `REPLACE`, `STRCMP`, `COPY`, `CLEAR`, `EQ_STRING`, `NE_STRING`, `BOOL_TO_SINT`, `BOOL_TO_USINT`, `BOOL_TO_BYTE`, `BOOL_TO_INT`, `BOOL_TO_UINT`, `BOOL_TO_WORD`, `BOOL_TO_DINT`, `BOOL_TO_UDINT`, `BOOL_TO_DWORD`, `BOOL_TO_TIME`, `BOOL_TO_LINT`, `BOOL_TO_ULINT`, `BOOL_TO_LWORD`, `BOOL_TO_REAL`, `BOOL_TO_LREAL`, `SINT_TO_BOOL`, `SINT_TO_USINT`, `SINT_TO_BYTE`, `SINT_TO_INT`, `SINT_TO_UINT`, `SINT_TO_WORD`, `SINT_TO_DINT`, `SINT_TO_UDINT`, `SINT_TO_DWORD`, `SINT_TO_TIME`, `SINT_TO_LINT`, `SINT_TO_ULINT`, `SINT_TO_LWORD`, `SINT_TO_REAL`, `SINT_TO_LREAL`, `USINT_TO_BOOL`, `USINT_TO_SINT`, `USINT_TO_BYTE`, `USINT_TO_INT`, `USINT_TO_UINT`, `USINT_TO_WORD`, `USINT_TO_DINT`, `USINT_TO_UDINT`, `USINT_TO_DWORD`, `USINT_TO_TIME`, `USINT_TO_LINT`, `USINT_TO_ULINT`, `USINT_TO_LWORD`, `USINT_TO_REAL`, `USINT_TO_LREAL`, `BYTE_TO_BOOL`, `BYTE_TO_SINT`, `BYTE_TO_USINT`, `BYTE_TO_INT`, `BYTE_TO_UINT`, `BYTE_TO_WORD`, `BYTE_TO_DINT`, `BYTE_TO_UDINT`, `BYTE_TO_DWORD`, `BYTE_TO_TIME`, `BYTE_TO_LINT`, `BYTE_TO_ULINT`, `BYTE_TO_LWORD`, `BYTE_TO_REAL`, `BYTE_TO_LREAL`, `INT_TO_BOOL`, `INT_TO_SINT`, `INT_TO_USINT`, `INT_TO_BYTE`, `INT_TO_UINT`, `INT_TO_WORD`, `INT_TO_DINT`, `INT_TO_UDINT`, `INT_TO_DWORD`, `INT_TO_TIME`, `INT_TO_LINT`, `INT_TO_ULINT`, `INT_TO_LWORD`, `INT_TO_REAL`, `INT_TO_LREAL`, `UINT_TO_BOOL`, `UINT_TO_SINT`, `UINT_TO_USINT`, `UINT_TO_BYTE`, `UINT_TO_INT`, `UINT_TO_WORD`, `UINT_TO_DINT`, `UINT_TO_UDINT`, `UINT_TO_DWORD`, `UINT_TO_TIME`, `UINT_TO_LINT`, `UINT_TO_ULINT`, `UINT_TO_LWORD`, `UINT_TO_REAL`, `UINT_TO_LREAL`, `WORD_TO_BOOL`, `WORD_TO_SINT`, `WORD_TO_USINT`, `WORD_TO_BYTE`, `WORD_TO_INT`, `WORD_TO_UINT`, `WORD_TO_DINT`, `WORD_TO_UDINT`, `WORD_TO_DWORD`, `WORD_TO_TIME`, `WORD_TO_LINT`, `WORD_TO_ULINT`, `WORD_TO_LWORD`, `WORD_TO_REAL`, `WORD_TO_LREAL`, `DINT_TO_BOOL`, `DINT_TO_SINT`, `DINT_TO_USINT`, `DINT_TO_BYTE`, `DINT_TO_INT`, `DINT_TO_UINT`, `DINT_TO_WORD`, `DINT_TO_UDINT`, `DINT_TO_DWORD`, `DINT_TO_TIME`, `DINT_TO_LINT`, `DINT_TO_ULINT`, `DINT_TO_LWORD`, `DINT_TO_REAL`, `DINT_TO_LREAL`, `UDINT_TO_BOOL`, `UDINT_TO_SINT`, `UDINT_TO_USINT`, `UDINT_TO_BYTE`, `UDINT_TO_INT`, `UDINT_TO_UINT`, `UDINT_TO_WORD`, `UDINT_TO_DINT`, `UDINT_TO_DWORD`, `UDINT_TO_TIME`, `UDINT_TO_LINT`, `UDINT_TO_ULINT`, `UDINT_TO_LWORD`, `UDINT_TO_REAL`, `UDINT_TO_LREAL`, `DWORD_TO_BOOL`, `DWORD_TO_SINT`, `DWORD_TO_USINT`, `DWORD_TO_BYTE`, `DWORD_TO_INT`, `DWORD_TO_UINT`, `DWORD_TO_WORD`, `DWORD_TO_DINT`, `DWORD_TO_UDINT`, `DWORD_TO_TIME`, `DWORD_TO_LINT`, `DWORD_TO_ULINT`, `DWORD_TO_LWORD`, `DWORD_TO_REAL`, `DWORD_TO_LREAL`, `TIME_TO_BOOL`, `TIME_TO_SINT`, `TIME_TO_USINT`, `TIME_TO_BYTE`, `TIME_TO_INT`, `TIME_TO_UINT`, `TIME_TO_WORD`, `TIME_TO_DINT`, `TIME_TO_UDINT`, `TIME_TO_DWORD`, `TIME_TO_LINT`, `TIME_TO_ULINT`, `TIME_TO_LWORD`, `TIME_TO_REAL`, `TIME_TO_LREAL`, `LINT_TO_BOOL`, `LINT_TO_SINT`, `LINT_TO_USINT`, `LINT_TO_BYTE`, `LINT_TO_INT`, `LINT_TO_UINT`, `LINT_TO_WORD`, `LINT_TO_DINT`, `LINT_TO_UDINT`, `LINT_TO_DWORD`, `LINT_TO_TIME`, `LINT_TO_ULINT`, `LINT_TO_LWORD`, `LINT_TO_REAL`, `LINT_TO_LREAL`, `ULINT_TO_BOOL`, `ULINT_TO_SINT`, `ULINT_TO_USINT`, `ULINT_TO_BYTE`, `ULINT_TO_INT`, `ULINT_TO_UINT`, `ULINT_TO_WORD`, `ULINT_TO_DINT`, `ULINT_TO_UDINT`, `ULINT_TO_DWORD`, `ULINT_TO_TIME`, `ULINT_TO_LINT`, `ULINT_TO_LWORD`, `ULINT_TO_REAL`, `ULINT_TO_LREAL`, `LWORD_TO_BOOL`, `LWORD_TO_SINT`, `LWORD_TO_USINT`, `LWORD_TO_BYTE`, `LWORD_TO_INT`, `LWORD_TO_UINT`, `LWORD_TO_WORD`, `LWORD_TO_DINT`, `LWORD_TO_UDINT`, `LWORD_TO_DWORD`, `LWORD_TO_TIME`, `LWORD_TO_LINT`, `LWORD_TO_ULINT`, `LWORD_TO_REAL`, `LWORD_TO_LREAL`, `REAL_TO_BOOL`, `REAL_TO_SINT`, `REAL_TO_USINT`, `REAL_TO_BYTE`, `REAL_TO_INT`, `REAL_TO_UINT`, `REAL_TO_WORD`, `REAL_TO_DINT`, `REAL_TO_UDINT`, `REAL_TO_DWORD`, `REAL_TO_TIME`, `REAL_TO_LINT`, `REAL_TO_ULINT`, `REAL_TO_LWORD`, `REAL_TO_LREAL`, `LREAL_TO_BOOL`, `LREAL_TO_SINT`, `LREAL_TO_USINT`, `LREAL_TO_BYTE`, `LREAL_TO_INT`, `LREAL_TO_UINT`, `LREAL_TO_WORD`, `LREAL_TO_DINT`, `LREAL_TO_UDINT`, `LREAL_TO_DWORD`, `LREAL_TO_TIME`, `LREAL_TO_LINT`, `LREAL_TO_ULINT`, `LREAL_TO_LWORD`, `LREAL_TO_REAL`, `AWS_FLEET_PROV`, `AZURE_C2D_RECV`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `MB_READ_COIL`, `MB_READ_HREG`, `MB_WRITE_COIL`, `MB_WRITE_HREG`, `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE`, `SPB_REBIRTH`

### Puertos de los bloques estándar

Cada puerto se escribe `NOMBRE:TIPO`. Las 240 conversiones de tipo `<A>_TO_<B>` tienen la entrada `IN:<A>` y la salida `OUT:<B>`, y no se repiten aquí.

| Bloque | Entradas | Salidas |
| --- | --- | --- |
| `constant` |   | `OUT:ANY` |
| `variable` | `IN:ANY` | `OUT:ANY` |
| `input` | `IN:ANY` | `OUT:ANY` |
| `output` | `IN:ANY` |   |
| `TON` | `IN:BOOL`, `PT:TIME` | `Q:BOOL`, `ET:TIME` |
| `TOF` | `IN:BOOL`, `PT:TIME` | `Q:BOOL`, `ET:TIME` |
| `TP` | `IN:BOOL`, `PT:TIME` | `Q:BOOL`, `ET:TIME` |
| `CTU` | `CU:BOOL`, `R:BOOL`, `PV:INT` | `Q:BOOL`, `CV:INT` |
| `CTD` | `CD:BOOL`, `LD:BOOL`, `PV:INT` | `Q:BOOL`, `CV:INT` |
| `CTUD` | `CU:BOOL`, `CD:BOOL`, `R:BOOL`, `LD:BOOL`, `PV:INT` | `QU:BOOL`, `QD:BOOL`, `CV:INT` |
| `R_TRIG` | `CLK:BOOL` | `Q:BOOL` |
| `F_TRIG` | `CLK:BOOL` | `Q:BOOL` |
| `SR` | `S1:BOOL`, `R:BOOL` | `Q1:BOOL` |
| `RS` | `S:BOOL`, `R1:BOOL` | `Q1:BOOL` |
| `BLINK` | `ENABLE:BOOL`, `T_ON:ANY`, `T_OFF:ANY` | `Q:BOOL` |
| `PWM` | `ENABLE:BOOL`, `PERIOD:ANY`, `DUTY:ANY` | `Q:BOOL` |
| `PULSE` | `TRIG:BOOL`, `PT:ANY` | `Q:BOOL` |
| `PID_Compact` | `SP:ANY`, `PV:ANY`, `KP:ANY`, `KI:ANY`, `KD:ANY`, `DT:ANY`, `OUT_MIN:ANY`, `OUT_MAX:ANY` | `OUT:ANY` |
| `HYSTERESIS` | `IN:ANY`, `HIGH:ANY`, `LOW:ANY` | `Q:BOOL` |
| `DEADBAND` | `IN:ANY`, `WIDTH:ANY` | `OUT:ANY` |
| `LAG_FILTER` | `IN:ANY`, `GAIN:ANY` | `OUT:ANY` |
| `RAMP_REAL` | `IN:ANY`, `RATE:ANY` | `OUT:ANY` |
| `INTEGRAL` | `IN:ANY`, `DT:ANY`, `RESET:BOOL` | `OUT:ANY` |
| `DERIVATIVE` | `IN:ANY`, `DT:ANY` | `OUT:ANY` |
| `FIFO` | `PUSH:BOOL`, `POP:BOOL`, `RST:BOOL`, `DATA_IN:ANY`, `SIZE:ANY` | `EMPTY:BOOL`, `FULL:BOOL`, `DATA_OUT:ANY`, `COUNT:ANY` |
| `LIFO` | `PUSH:BOOL`, `POP:BOOL`, `RST:BOOL`, `DATA_IN:ANY`, `SIZE:ANY` | `EMPTY:BOOL`, `FULL:BOOL`, `DATA_OUT:ANY`, `COUNT:ANY` |
| `UPTIME` |   | `OUT:DINT` |
| `CYCLE_TIME` |   | `OUT:DINT` |
| `MB_COIL` | `EN:BOOL`, `IN:ANY`, `ADDR:UINT` | `OUT:ANY`, `STATUS:BOOL` |
| `MB_DISCRETE_INPUT` | `EN:BOOL`, `IN:ANY`, `ADDR:UINT` | `OUT:ANY`, `STATUS:BOOL` |
| `MB_INPUT_REGISTER` | `EN:BOOL`, `IN:ANY`, `ADDR:UINT` | `OUT:ANY`, `STATUS:BOOL` |
| `MB_HOLDING_REGISTER` | `EN:BOOL`, `IN:ANY`, `ADDR:UINT` | `OUT:ANY`, `STATUS:BOOL` |
| `AND` | `IN1:BOOL`, `IN2:BOOL` | `OUT:BOOL` |
| `OR` | `IN1:BOOL`, `IN2:BOOL` | `OUT:BOOL` |
| `NOT` | `IN:BOOL` | `OUT:BOOL` |
| `XOR` | `IN1:BOOL`, `IN2:BOOL` | `OUT:BOOL` |
| `NAND` | `IN1:BOOL`, `IN2:BOOL` | `OUT:BOOL` |
| `NOR` | `IN1:BOOL`, `IN2:BOOL` | `OUT:BOOL` |
| `EQ` | `IN1:ANY`, `IN2:ANY` | `OUT:BOOL` |
| `NE` | `IN1:ANY`, `IN2:ANY` | `OUT:BOOL` |
| `LT` | `IN1:ANY`, `IN2:ANY` | `OUT:BOOL` |
| `LE` | `IN1:ANY`, `IN2:ANY` | `OUT:BOOL` |
| `GT` | `IN1:ANY`, `IN2:ANY` | `OUT:BOOL` |
| `GE` | `IN1:ANY`, `IN2:ANY` | `OUT:BOOL` |
| `ADD` | `IN1:ANY_NUM`, `IN2:ANY_NUM` | `OUT:ANY_NUM` |
| `SUB` | `IN1:ANY_NUM`, `IN2:ANY_NUM` | `OUT:ANY_NUM` |
| `MUL` | `IN1:ANY_NUM`, `IN2:ANY_NUM` | `OUT:ANY_NUM` |
| `DIV` | `IN1:ANY_NUM`, `IN2:ANY_NUM` | `OUT:ANY_NUM` |
| `MOD` | `IN1:ANY_NUM`, `IN2:ANY_NUM` | `OUT:ANY_NUM` |
| `ABS` | `IN:ANY_NUM` | `OUT:ANY_NUM` |
| `ABSF` | `IN:REAL` | `OUT:REAL` |
| `SQRT` | `IN:REAL` | `OUT:REAL` |
| `EXPT` | `BASE:REAL`, `EXP:REAL` | `OUT:REAL` |
| `LN` | `IN:REAL` | `OUT:REAL` |
| `LOG` | `IN:REAL` | `OUT:REAL` |
| `EXP` | `IN:REAL` | `OUT:REAL` |
| `NEG` | `IN:ANY_NUM` | `OUT:ANY_NUM` |
| `NEGF` | `IN:REAL` | `OUT:REAL` |
| `TRUNC` | `IN:REAL` | `OUT:REAL` |
| `ROUND` | `IN:REAL` | `OUT:REAL` |
| `SIN` | `IN:REAL` | `OUT:REAL` |
| `COS` | `IN:REAL` | `OUT:REAL` |
| `TAN` | `IN:REAL` | `OUT:REAL` |
| `ASIN` | `IN:REAL` | `OUT:REAL` |
| `ACOS` | `IN:REAL` | `OUT:REAL` |
| `ATAN` | `IN:REAL` | `OUT:REAL` |
| `ATAN2` | `Y:REAL`, `X:REAL` | `OUT:REAL` |
| `MAX` | `IN1:ANY_NUM`, `IN2:ANY_NUM` | `OUT:ANY_NUM` |
| `MIN` | `IN1:ANY_NUM`, `IN2:ANY_NUM` | `OUT:ANY_NUM` |
| `LIMIT` | `MN:ANY_NUM`, `IN:ANY_NUM`, `MX:ANY_NUM` | `OUT:ANY_NUM` |
| `SEL` | `G:BOOL`, `IN0:ANY`, `IN1:ANY` | `OUT:ANY` |
| `MUX` | `K:INT`, `IN0:ANY`, `IN1:ANY` | `OUT:ANY` |
| `NORM_X` | `MIN:REAL`, `X:REAL`, `MAX:REAL` | `OUT:REAL` |
| `SCALE_X` | `MIN:REAL`, `X:REAL`, `MAX:REAL` | `OUT:REAL` |
| `SHL` | `IN:ANY_BIT`, `N:INT` | `OUT:ANY_BIT` |
| `SHR` | `IN:ANY_BIT`, `N:INT` | `OUT:ANY_BIT` |
| `ROL` | `IN:DWORD`, `N:INT` | `OUT:DWORD` |
| `ROR` | `IN:DWORD`, `N:INT` | `OUT:DWORD` |
| `AND_WORD` | `IN1:WORD`, `IN2:WORD` | `OUT:WORD` |
| `OR_WORD` | `IN1:WORD`, `IN2:WORD` | `OUT:WORD` |
| `XOR_WORD` | `IN1:WORD`, `IN2:WORD` | `OUT:WORD` |
| `NOT_WORD` | `IN:WORD` | `OUT:WORD` |
| `AND_DWORD` | `IN1:DWORD`, `IN2:DWORD` | `OUT:DWORD` |
| `OR_DWORD` | `IN1:DWORD`, `IN2:DWORD` | `OUT:DWORD` |
| `XOR_DWORD` | `IN1:DWORD`, `IN2:DWORD` | `OUT:DWORD` |
| `NOT_DWORD` | `IN:DWORD` | `OUT:DWORD` |
| `LEN` | `S:STRING` | `OUT:INT` |
| `CONCAT` | `S1:STRING`, `S2:STRING` | `OUT:STRING` |
| `LEFT` | `S:STRING`, `N:INT` | `OUT:STRING` |
| `RIGHT` | `S:STRING`, `N:INT` | `OUT:STRING` |
| `MID` | `S:STRING`, `POS:INT`, `N:INT` | `OUT:STRING` |
| `FIND` | `S1:STRING`, `S2:STRING` | `OUT:INT` |
| `INSERT` | `S1:STRING`, `S2:STRING`, `POS:INT` | `OUT:STRING` |
| `DELETE` | `S:STRING`, `POS:INT`, `N:INT` | `OUT:STRING` |
| `REPLACE` | `S1:STRING`, `S2:STRING`, `POS:INT`, `N:INT` | `OUT:STRING` |
| `STRCMP` | `S1:STRING`, `S2:STRING` | `OUT:INT` |
| `COPY` | `SRC:STRING`, `DST:STRING` | `OUT:STRING` |
| `CLEAR` | `S:STRING` | `OUT:STRING` |
| `EQ_STRING` | `S1:STRING`, `S2:STRING` | `OUT:BOOL` |
| `NE_STRING` | `S1:STRING`, `S2:STRING` | `OUT:BOOL` |
| `AWS_FLEET_PROV` | `EN:BOOL`, `TEMPLATE_NAME:STRING` | `BUSY:BOOL`, `DONE:BOOL`, `ERROR:BOOL`, `STATUS:DINT`, `THING_NAME:STRING` |
| `AZURE_C2D_RECV` | `EN:BOOL` | `BUSY:BOOL`, `DONE:BOOL`, `ERROR:BOOL`, `STATUS:DINT`, `PAYLOAD:STRING`, `VALID:BOOL` |
| `AZURE_DPS_PROV` | `EN:BOOL`, `DEVICE_ID:STRING` | `BUSY:BOOL`, `DONE:BOOL`, `ERROR:BOOL`, `STATUS:DINT`, `ASSIGNED_HUB:STRING` |
| `AZURE_EG_PUB` | `EN:BOOL`, `TOPIC:STRING`, `EVENT_TYPE:STRING`, `PAYLOAD:STRING` | `BUSY:BOOL`, `DONE:BOOL`, `ERROR:BOOL`, `STATUS:DINT` |
| `MB_READ_COIL` | `EN:BOOL`, `PROTO:USINT`, `SLAVE_ID:UINT`, `ADDR:UINT`, `COUNT:UINT`, `HOST:STRING`, `PORT:UINT` | `BUSY:BOOL`, `DONE:BOOL`, `ERROR:BOOL`, `STATUS:DINT`, `VALUE:BOOL` |
| `MB_READ_HREG` | `EN:BOOL`, `PROTO:USINT`, `SLAVE_ID:UINT`, `ADDR:UINT`, `COUNT:UINT`, `HOST:STRING`, `PORT:UINT` | `BUSY:BOOL`, `DONE:BOOL`, `ERROR:BOOL`, `STATUS:DINT`, `VALUE:UINT` |
| `MB_WRITE_COIL` | `EN:BOOL`, `PROTO:USINT`, `SLAVE_ID:UINT`, `ADDR:UINT`, `COUNT:UINT`, `VALUE:BOOL`, `HOST:STRING`, `PORT:UINT` | `BUSY:BOOL`, `DONE:BOOL`, `ERROR:BOOL`, `STATUS:DINT` |
| `MB_WRITE_HREG` | `EN:BOOL`, `PROTO:USINT`, `SLAVE_ID:UINT`, `ADDR:UINT`, `COUNT:UINT`, `VALUE:UINT`, `HOST:STRING`, `PORT:UINT` | `BUSY:BOOL`, `DONE:BOOL`, `ERROR:BOOL`, `STATUS:DINT` |
| `MQTT_CONNECT` | `EN:BOOL`, `PROFILE:USINT` | `BUSY:BOOL`, `DONE:BOOL`, `ERROR:BOOL`, `STATUS:DINT`, `CONNECTED:BOOL` |
| `MQTT_PUBLISH` | `EN:BOOL`, `QOS:USINT`, `RETAIN:BOOL`, `TOPIC:STRING`, `PAYLOAD:STRING` | `BUSY:BOOL`, `DONE:BOOL`, `ERROR:BOOL`, `STATUS:DINT` |
| `MQTT_SUBSCRIBE` | `EN:BOOL`, `QOS:USINT`, `TOPIC:STRING` | `BUSY:BOOL`, `DONE:BOOL`, `ERROR:BOOL`, `STATUS:DINT`, `VALID:BOOL`, `PAYLOAD:STRING` |
| `SPB_REBIRTH` | `EN:BOOL` | `BUSY:BOOL`, `DONE:BOOL`, `ERROR:BOOL`, `STATUS:DINT` |

## Ejemplos resueltos

### AND de dos entradas hacia un TON, escrito en una salida

```json
{
  "name": "Guard",
  "description": "The motor runs 2 s after Start is pressed with the guard closed, and stops as soon as either goes FALSE.",
  "version": "1.0.0",
  "variables": {
    "local": [],
    "inputs": [
      {
        "name": "Start",
        "type": "BOOL",
        "address": "%I0.0"
      },
      {
        "name": "GuardClosed",
        "type": "BOOL",
        "address": "%I0.1"
      }
    ],
    "outputs": [
      {
        "name": "Motor",
        "type": "BOOL",
        "address": "%Q0.0"
      }
    ]
  },
  "blocks": [
    {
      "id": "in_start",
      "type": "variable",
      "variableName": "Start",
      "position": {
        "x": 40,
        "y": 40
      },
      "outputs": [
        {
          "name": "OUT",
          "type": "BOOL"
        }
      ]
    },
    {
      "id": "in_guard",
      "type": "variable",
      "variableName": "GuardClosed",
      "position": {
        "x": 40,
        "y": 140
      },
      "outputs": [
        {
          "name": "OUT",
          "type": "BOOL"
        }
      ]
    },
    {
      "id": "and_ready",
      "type": "AND",
      "position": {
        "x": 220,
        "y": 80
      },
      "inputs": [
        {
          "name": "IN1",
          "type": "BOOL"
        },
        {
          "name": "IN2",
          "type": "BOOL"
        }
      ],
      "outputs": [
        {
          "name": "OUT",
          "type": "BOOL"
        }
      ]
    },
    {
      "id": "const_delay",
      "type": "constant",
      "dataType": "TIME",
      "value": "T#2s",
      "position": {
        "x": 220,
        "y": 200
      },
      "outputs": [
        {
          "name": "OUT",
          "type": "TIME"
        }
      ]
    },
    {
      "id": "ton_delay",
      "type": "TON",
      "instanceName": "StartDelay",
      "position": {
        "x": 380,
        "y": 80
      },
      "inputs": [
        {
          "name": "IN",
          "type": "BOOL"
        },
        {
          "name": "PT",
          "type": "TIME"
        }
      ],
      "outputs": [
        {
          "name": "Q",
          "type": "BOOL"
        },
        {
          "name": "ET",
          "type": "TIME"
        }
      ]
    },
    {
      "id": "out_motor",
      "type": "output",
      "variableName": "Motor",
      "position": {
        "x": 560,
        "y": 80
      },
      "inputs": [
        {
          "name": "IN",
          "type": "BOOL"
        }
      ]
    }
  ],
  "connections": [
    {
      "id": "c1",
      "from": {
        "block": "in_start",
        "port": "OUT"
      },
      "to": {
        "block": "and_ready",
        "port": "IN1"
      }
    },
    {
      "id": "c2",
      "from": {
        "block": "in_guard",
        "port": "OUT"
      },
      "to": {
        "block": "and_ready",
        "port": "IN2"
      }
    },
    {
      "id": "c3",
      "from": {
        "block": "and_ready",
        "port": "OUT"
      },
      "to": {
        "block": "ton_delay",
        "port": "IN"
      }
    },
    {
      "id": "c4",
      "from": {
        "block": "const_delay",
        "port": "OUT"
      },
      "to": {
        "block": "ton_delay",
        "port": "PT"
      }
    },
    {
      "id": "c5",
      "from": {
        "block": "ton_delay",
        "port": "Q"
      },
      "to": {
        "block": "out_motor",
        "port": "IN"
      }
    }
  ]
}
```

{/* <<< END GENERATED: reference/format-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
