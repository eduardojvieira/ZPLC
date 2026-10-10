---
sidebar_position: 3
---

# Biblioteca Estándar

La fuente autoritativa para la biblioteca estándar de lenguajes es el registro
de stdlib del compilador en `packages/zplc-compiler/src/compiler/stdlib/index.ts`.

Ese registro es lo que usa el IDE/compilador para resolver funciones y bloques integrados.

Cada función y bloque de función registrado, con su firma o tabla de pines y un ejemplo que CI ejecuta, está en la [referencia de funciones](../reference/functions.md) y en la [referencia de bloques de función](../reference/function-blocks.md) generadas.

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

Los contadores cuentan flancos de subida y mantienen `CV` y `PV` como `INT`. Lo que hace hoy cada bloque:

| Bloque | Cuenta | Prioridad | Límite de `CV` | Salidas |
|---|---|---|---|---|
| `CTU` | +1 en un flanco de subida de `CU` | `R` pone `CV` en 0 | se detiene en 32767 | `Q` es `CV >= PV` |
| `CTD` | -1 en un flanco de subida de `CD` | `LD` pone `CV` en `PV` | se detiene en -32768 | `Q` es `CV <= 0` |
| `CTUD` | +1 con `CU`, -1 con `CD`; dos flancos en una llamada se anulan | `R`, luego `LD`, luego los flancos | se detiene en 32767 y en -32768 | `QU` es `CV >= PV`, `QD` es `CV <= 0` |

El detector de flancos se ejecuta en cada llamada, también mientras `R` o `LD` es TRUE. Las comparaciones son con signo, de modo que un contador cuenta por debajo de cero y acepta un preset negativo. Las reglas completas y la evidencia están en la [sección 2 de la referencia del runtime](../runtime/stdlib.md#2-contadores).

## Funciones de string

La superficie actual de strings en `stdlib/strings.ts` incluye:

| Función | Descripción | Ejemplo |
|---|---|---|
| `LEN(STR)` | devuelve la longitud | `LEN('ABC')` -> 3 |
| `LEFT(STR, N)` | primeros N caracteres | `LEFT('HELLO', 2)` -> 'HE' |
| `RIGHT(STR, N)` | últimos N caracteres | `RIGHT('HELLO', 2)` -> 'LO' |
| `MID(STR, P, N)` | N caracteres desde P | `MID('HELLO', 2, 3)` -> 'ELL' |
| `CONCAT(S1, S2)` | concatena dos strings | `CONCAT('A', 'B')` -> 'AB' |
| `INSERT(S1, S2, P)` | inserta S2 en S1 después del carácter P | `INSERT('AB', 'X', 1)` -> 'AXB' |
| `DELETE(S1, P, N)` | elimina N caracteres desde P | `DELETE('HELLO', 2, 2)` -> 'HLO' |
| `REPLACE(S1, S2, P, N)` | reemplaza N caracteres desde P por S2 | `REPLACE('HELLO', 'AB', 2, 3)` -> 'HABO' |
| `FIND(S1, S2)` | busca S2 dentro de S1 | `FIND('HELLO', 'L')` -> 3 |

Ninguna de estas modifica sus argumentos: cada una devuelve una cadena nueva. En `MID`,
`DELETE` y `REPLACE` la posición va antes de la cantidad; IEC 61131-3 escribe primero el
largo, así que un programa escrito con ese orden debe intercambiar los dos argumentos.

Funciones utilitarias adicionales del mismo archivo:

- `COPY`
- `CLEAR`
- `STRCMP`
- `EQ_STRING`
- `NE_STRING`

## Matemática, lógica y selección

Ejemplos registrados hoy:

- aritmética: `ABS`, `ABSF`, `NEG`, `NEGF`, `SQRT`, `EXPT`, `TRUNC`, `ROUND`
- conversión: `<ORIGEN>_TO_<DESTINO>` para cada par de tipos distintos entre `BOOL`, `SINT`, `USINT`, `BYTE`, `INT`, `UINT`, `WORD`, `DINT`, `UDINT`, `DWORD`, `LINT`, `ULINT`, `LWORD`, `REAL`, `LREAL` y `TIME` (`INT_TO_REAL`, `REAL_TO_INT`, `UDINT_TO_DINT`, `LINT_TO_LREAL`...), ver [Conversiones de tipo](../runtime/stdlib.md#9-conversiones-de-tipos)
- trigonometría y logs: `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `LN`, `LOG`, `EXP`
- helpers de selección: `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`
- helpers bitwise: `ROL`, `ROR`, `SHL`, `SHR`, `AND_WORD`, `OR_WORD`, `XOR_WORD`, `NOT_WORD`

Hoy una cosa del registro no se puede usar como la lista sugiere. `MOD` y los operadores lógicos son operadores (`a MOD b`, `a AND b`), y las formas `MOD(a, b)` y `AND(a, b)` no se analizan. `DATE`, `TOD` y `DT` todavía no tienen funciones de conversión. `ABS`, `NEG`, `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`, `SQRT`, `TRUNC`, `ROUND`, `SHL`, `SHR`, `ROL` y `ROR` aceptan los enteros de 64 bits y `LREAL`; las demás funciones los rechazan con un mensaje. La tabla de [diferencias conocidas](../runtime/stdlib.md#11-diferencias-conocidas-con-iec-61131-3) lista los casos que fallan hoy, con sus ids de requisito.

## Bloques de función de comunicación

Los bloques de comunicación también forman parte de la stdlib del compilador.

El repo actual registra bloques como:

- Modbus: `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL`, `MB_WRITE_COIL`
- MQTT: `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE`
- wrappers cloud: `AZURE_C2D_RECV`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `AWS_FLEET_PROV`, `SPB_REBIRTH`

Para los detalles del contrato runtime y los límites del release, continúe con:

- [Bloques de Función de Comunicación](../runtime/communication-function-blocks.md)
- [Conectividad](../runtime/connectivity.md)

## Disponibilidad

Una función o un bloque integrado está disponible para sus programas solo si la stdlib del compilador lo registra.

Para la semántica específica del runtime y perfil, consulte la [Biblioteca estándar del runtime](../runtime/stdlib.md).
