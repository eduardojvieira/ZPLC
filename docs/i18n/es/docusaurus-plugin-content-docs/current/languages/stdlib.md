---
sidebar_position: 3
---

# Biblioteca Estándar

La fuente release-facing autoritativa para la biblioteca estándar de lenguajes es el registro
de stdlib del compilador en `packages/zplc-compiler/src/compiler/stdlib/index.ts`.

Ese registro es lo que usa el IDE/compilador para resolver funciones y bloques integrados.

## Categorías de alto valor

| Categoría | Fuente | Ejemplos |
|---|---|---|
| Temporizadores | `stdlib/timers.ts` | `TON`, `TOF`, `TP` |
| Contadores | `stdlib/counters.ts` | `CTU`, `CTD`, `CTUD` |
| Biestables y triggers | `stdlib/bistables.ts` | `R_TRIG`, `F_TRIG`, `RS`, `SR` |
| Buffers de sistema | `stdlib/system.ts` | `FIFO`, `LIFO` |
| Strings | `stdlib/strings.ts` | `LEN`, `CONCAT`, `LEFT`, `RIGHT`, `MID`, `FIND`, `INSERT`, `DELETE`, `REPLACE`, `STRCMP` |
| Matemática y lógica | `stdlib/math.ts`, `stdlib/functions.ts`, `stdlib/bitwise.ts` | `ABS`, `SQRT`, `LIMIT`, `SEL`, `MUX`, `SHL`, `SHR` |
| Helpers de proceso | `stdlib/process.ts` | `HYSTERESIS`, `DEADBAND`, `PID_Compact`, `NORM_X`, `SCALE_X` |
| FBs de comunicación | `stdlib/communication.ts` | `MB_READ_HREG`, `MB_WRITE_COIL`, `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE` |

## Temporizadores y contadores

Los temporizadores y contadores no son solo nombres: los archivos stdlib definen sus layouts de memoria y el codegen que usa el compilador.

Ejemplos:

- temporizadores: `TON`, `TOF`, `TP`
- contadores: `CTU`, `CTD`, `CTUD`

## Funciones de string

La superficie actual de strings en `stdlib/strings.ts` incluye:

| Función | Descripción | Ejemplo |
|---|---|---|
| `LEN(STR)` | devuelve la longitud | `LEN('ABC')` -> 3 |
| `LEFT(STR, N)` | primeros N caracteres | `LEFT('HELLO', 2)` -> 'HE' |
| `RIGHT(STR, N)` | últimos N caracteres | `RIGHT('HELLO', 2)` -> 'LO' |
| `MID(STR, L, P)` | L caracteres desde P | `MID('HELLO', 2, 2)` -> 'EL' |
| `CONCAT(S1, S2)` | concatena dos strings | `CONCAT('A', 'B')` -> 'AB' |
| `INSERT(S1, S2, P)` | inserta S2 en S1 | `INSERT('AB', 'X', 1)` -> 'AXB' |
| `DELETE(S1, L, P)` | elimina L caracteres desde P | `DELETE('HELLO', 2, 2)` -> 'HLO' |
| `REPLACE(S1, S2, L, P)` | reemplaza caracteres | |
| `FIND(S1, S2)` | busca S2 dentro de S1 | `FIND('HELLO', 'L')` -> 3 |

Funciones utilitarias adicionales del mismo archivo:

- `COPY`
- `CLEAR`
- `STRCMP`
- `EQ_STRING`
- `NE_STRING`

## Matemática, lógica y selección

Ejemplos registrados hoy:

- aritmética y conversión: `ABS`, `ABSF`, `NEG`, `NEGF`, `MOD`, `SQRT`, `EXPT`, `INT_TO_REAL`, `REAL_TO_INT`
- trigonometría y logs: `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `LN`, `LOG`, `EXP`
- helpers de selección: `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`
- helpers bitwise: `ROL`, `ROR`, `SHL`, `SHR`, `AND_WORD`, `OR_WORD`, `XOR_WORD`, `NOT_WORD`

## Bloques de función de comunicación

Los bloques de comunicación también forman parte de la stdlib del compilador.

El repo actual registra bloques como:

- Modbus: `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL`, `MB_WRITE_COIL`
- MQTT: `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE`
- wrappers cloud: `AZURE_C2D_RECV`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV`, `SPB_REBIRTH`

Para los detalles del contrato runtime y los límites del release, seguí con:

- [Bloques de Función de Comunicación](../runtime/communication-function-blocks.md)
- [Conectividad](../runtime/connectivity.md)

## Regla práctica

Si una función o bloque no está registrado en la stdlib del compilador ni justificado por el contrato runtime, no debería documentarse como capacidad firme de v1.5.
