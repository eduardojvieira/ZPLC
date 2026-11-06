---
slug: /runtime/stdlib
id: stdlib
title: Biblioteca estándar
sidebar_label: Biblioteca estándar
description: 'Qué contiene la biblioteca de ZPLC, cómo usar un bloque de función, las reglas que valen en toda la biblioteca (tiempo, flancos, números, cadenas, conversiones) y dónde están las tablas completas de cada función y bloque.'
tags: [reference, stdlib, iec61131-3]
---

# Biblioteca estándar

ZPLC incluye las funciones y los bloques de función en los que se apoyan los programas IEC 61131-3, además de algunos propios para control de procesos y generación de pulsos. Esta página explica qué contiene la biblioteca, cómo se comporta un bloque cuando usted lo llama y las reglas que valen en toda ella. Para la firma, los pines y un ejemplo resuelto de una función o un bloque concretos, consulte las tablas generadas: la [referencia de funciones](../reference/functions.md) y la [referencia de bloques de función](../reference/function-blocks.md).

La fuente de verdad es el registro del compilador en `packages/zplc-compiler/src/compiler/stdlib/index.ts`. Una función o un bloque existe para su programa solo si ese registro lo registra. Contiene 297 funciones (57 con nombre y 240 conversiones de tipo) y 34 bloques de función.

## Qué contiene la biblioteca

| Grupo | Archivo fuente en `stdlib/` | Ejemplos |
| --- | --- | --- |
| Temporizadores | `timers.ts` | `TON`, `TOF`, `TP` |
| Contadores | `counters.ts` | `CTU`, `CTD`, `CTUD` |
| Biestables y detectores de flanco | `bistables.ts` | `RS`, `SR`, `R_TRIG`, `F_TRIG` |
| Generadores de pulsos | `generators.ts` | `BLINK`, `PWM`, `PULSE` |
| Control de procesos | `process.ts` | `HYSTERESIS`, `DEADBAND`, `LAG_FILTER`, `RAMP_REAL`, `INTEGRAL`, `DERIVATIVE`, `PID_Compact` |
| Búferes | `system.ts` | `FIFO`, `LIFO` |
| Funciones matemáticas, de selección y bit a bit | `math.ts`, `functions.ts`, `bitwise.ts`, `mathlib.ts` | `ABS`, `SQRT`, `SIN`, `LIMIT`, `SEL`, `MUX`, `SHL`, `ROL` |
| Cadenas | `strings.ts` | `LEN`, `CONCAT`, `LEFT`, `MID`, `FIND`, `REPLACE` |
| Conversiones | `conversions.ts` | `INT_TO_REAL`, `REAL_TO_INT`, `LINT_TO_LREAL` |
| Sistema | `system.ts` | `UPTIME`, `CYCLE_TIME`, `WATCHDOG_RESET` |
| Bloques de comunicación | `communication.ts` | `MB_READ_HREG`, `MQTT_PUBLISH`; véase [Bloques de función de comunicación](./communication-function-blocks.md) |

Los temporizadores, los biestables, los contadores y los detectores de flanco son los bloques estándar de IEC. `BLINK`, `PWM`, `PULSE`, los bloques de control de procesos y los búferes pertenecen a la biblioteca de ZPLC y no son bloques de IEC 61131-3.

## Usar un bloque

Un bloque de función conserva estado, de modo que se declara como una variable, que es su **instancia**, y se llama en cada ciclo con sus entradas. Sus salidas se leen como miembros de la instancia. Una instancia nueva empieza con todos los pines en el cero de su tipo.

```st runnable expect="Done=TRUE Elapsed=50 Pulses=8 Held=1" scans=15 scan_ms=10
PROGRAM Example
VAR
    Delay : TON;
    Rising : CTU;
    Level : CTU;
    Tick : INT;
    Pulse : BOOL;
    Done : BOOL;
    Elapsed : UDINT;
    Pulses : INT;
    Held : INT;
END_VAR

Delay(IN := TRUE, PT := T#50ms);
Done := Delay.Q;
Elapsed := TIME_TO_UDINT(Delay.ET);

Tick := Tick + 1;
Pulse := (Tick MOD 2) = 1;
Rising(CU := Pulse, R := FALSE, PV := 100);
Pulses := Rising.CV;

Level(CU := TRUE, R := FALSE, PV := 100);
Held := Level.CV;
END_PROGRAM
```

Tras 15 ciclos de 10 ms, `Done` es TRUE y `Elapsed` se detuvo en el valor preestablecido, 50. `Pulses` vale 8 porque `Pulse` subió en cada ciclo impar, del 1 al 15, y un contador cuenta flancos de subida, y `Held` vale 1 porque una entrada que permanece en TRUE cuenta una sola vez.

## Reglas que valen en toda la biblioteca

### Tiempo

Un valor `TIME`, como el `PT` de un temporizador y su `ET`, es una cuenta de 32 bits sin signo en milisegundos, de 0 a 4294967295 (unos 49,7 días). Véase [Tipos de tiempo y fecha](../languages/st.md#tipos-de-tiempo-y-fecha).

- **TON** retrasa un flanco de subida: `Q` pasa a TRUE después de que `IN` haya sido TRUE durante `PT`. `IN` en bajo pone `Q` y `ET` a cero de inmediato, y un valor preestablecido de `T#0ms` hace que `Q` siga a `IN` en el mismo ciclo.
- **TOF** mantiene una salida alta durante `PT` después de que `IN` baja. `Q` sigue a `IN` a TRUE de inmediato.
- **TP** da un pulso de `PT` después de un flanco de subida, haga lo que haga `IN` entretanto. No se puede redisparar: un nivel que permanece alto no inicia un segundo pulso, y un pulso nuevo necesita un flanco de subida nuevo después de que el primero haya terminado.
- En los tres, `ET` cuenta hasta `PT` y se detiene ahí.

### Flancos y contadores

`CTU`, `CTD` y `CTUD` guardan su cuenta en `CV` y toman su valor preestablecido de `PV`. Ambos son `INT`: 16 bits, de -32768 a 32767, y toda comparación es con signo, de modo que un contador admite un valor preestablecido negativo y `CTD` cuenta por debajo de cero.

- **La cuenta se dispara por flanco.** Se cuenta cuando la entrada es TRUE en esta llamada y era FALSE en la llamada anterior de la misma instancia. El flanco se ve entre dos llamadas, no entre dos ciclos, así que una llamada que un `IF` omite no ve un flanco que subió y bajó entretanto.
- **El reinicio y la carga son niveles y van primero.** Mientras `R` (`CTU`, `CTUD`) o `LD` (`CTD`, `CTUD`) es TRUE, no se cuenta nada. En `CTUD`, `R` gana a `LD`.
- **El detector de flancos sigue funcionando durante el reinicio y la carga.** Un pulso que sube mientras `R` o `LD` es TRUE no se cuenta cuando se suelta; el que sube en la llamada en que se suelta sí se cuenta, si la entrada era FALSE en la llamada anterior.
- **Las salidas se recalculan en cada llamada** a partir de `CV` y `PV`, después del reinicio, la carga o la cuenta de esa llamada.

| Bloque | Cuenta | Prioridad | Límite de `CV` | Salidas |
| --- | --- | --- | --- | --- |
| `CTU` | +1 en un flanco de subida de `CU` | `R` pone `CV` en 0 | Se detiene en 32767; un flanco allí no se cuenta | `Q` es `CV >= PV` |
| `CTD` | -1 en un flanco de subida de `CD` | `LD` pone `CV` en `PV` | Se detiene en -32768 | `Q` es `CV <= 0`, así que es TRUE hasta la primera carga |
| `CTUD` | +1 con `CU`, -1 con `CD`; dos flancos en una llamada se anulan | `R`, luego `LD`, luego los flancos | Se detiene en 32767 y en -32768 | `QU` es `CV >= PV`, `QD` es `CV <= 0` |

Los biestables resuelven un empate por su nombre: `RS` da prioridad al reinicio, así que `Q1` es FALSE cuando `S` y `R1` son ambos TRUE, y `SR` da prioridad a la activación. `R_TRIG` y `F_TRIG` dan `Q` durante exactamente un ciclo en un flanco de subida o de bajada de `CLK`.

Nivel de evidencia: host. Los casos `cmp-058-ctu-*`, `cmp-058-ctd-*` y `cmp-058-ctud-*` de `conformance/cmp/` corren en el runtime nativo, y `packages/zplc-compiler/src/compiler/stdlib/counters.test.ts` reproduce ciclo a ciclo el código generado, incluidas las detenciones en 32767 y en -32768.

### Los operadores no son funciones

`+`, `-`, `*`, `/`, `MOD`, `AND`, `OR`, `XOR` y `NOT` son operadores: escriba `a MOD b` y `a AND b`. Las formas de llamada `MOD(a, b)` y `AND(a, b)`, y las formas de función `ADD(a, b)`, `SUB`, `MUL` y `DIV`, no se analizan, y la compilación nombra la función que rechaza. La división entera trunca hacia cero, y `MOD` tiene el signo de su operando izquierdo. Los anchos, el desbordamiento y el comportamiento en los límites están en los [tipos numéricos](../languages/st.md#tipos-numéricos) del texto estructurado.

### Funciones REAL y su precisión

Las funciones trigonométricas, exponenciales y logarítmicas son subrutinas en aritmética de precisión simple, medidas contra `Math.*` sobre cuadrículas densas en la suite de pruebas del compilador (`stdlib/mathlib.test.ts`). Un argumento `LREAL` se redondea a `REAL` y el resultado se vuelve a ensanchar, así que un resultado `LREAL` tiene la precisión de un `REAL`, unas siete cifras significativas. El error nunca supera:

| Función | Rango | Error |
| --- | --- | --- |
| `SQRT` | todo REAL positivo, incluidos los subnormales | relativo 1,3e-7 |
| `EXP` | -87 a 88 | relativo 1,3e-7 |
| `LN`, `LOG` | todo REAL positivo, incluidos los subnormales | relativo 3e-7 |
| `SIN`, `COS` | magnitud hasta 1000 | absoluto 2e-7 |
| `SIN`, `COS` | magnitud menor que 2^40 (1,1e12) | absoluto 2e-6 |
| `SIN`, `COS` | magnitud de 2^40 a 2^48 (2,8e14) | absoluto 1e-4 |
| `TAN` | magnitud hasta 1000 | relativo 3e-7 |
| `ATAN` | todo REAL | absoluto 2e-7 |
| `ASIN`, `ACOS` | -1,0 a 1,0 | absoluto 4e-7 |
| `ATAN2` | todos los pares REAL | absoluto 4e-7 |

Ninguna de ellas provoca una falla de la VM con ningún argumento: una división por cero se reemplaza por el valor que la función define, y un argumento NaN da un NaN. Ningún bucle depende del argumento, de modo que el número de instrucciones tiene una cota fija. Un REAL de 2 pi por 2^48 o más no lleva información de ángulo, y las funciones seno dan entonces el valor para un ángulo de 0,0, finito y sin error.

### Cadenas

Un `STRING` guarda 80 caracteres y `STRING[n]` guarda `n`. El búfer conserva la longitud actual y la capacidad máxima, y una asignación copia tantos caracteres como caben. Una función que construye una cadena (`CONCAT`, `LEFT`, `RIGHT`, `MID`, `INSERT`, `DELETE`, `REPLACE`) devuelve una cadena nueva y nunca cambia sus argumentos, y las posiciones empiezan en 1. `COPY` y `CLEAR` escriben en su argumento, como dicen sus nombres.

La posición va antes de la cantidad en `MID`, `DELETE` y `REPLACE`, mientras que IEC 61131-3 escribe primero la longitud (`MID(IN, L, P)`): un programa escrito con ese orden debe intercambiar los dos argumentos. Los operadores `=` y `<>` comparan dos variables `STRING` por igualdad, y `STRCMP` da -1, 0 o 1.

### Conversiones

Existe una función `<FROM>_TO_<TO>` para cada par ordenado de tipos distintos entre `BOOL`, `SINT`, `USINT`, `BYTE`, `INT`, `UINT`, `WORD`, `DINT`, `UDINT`, `DWORD`, `LINT`, `ULINT`, `LWORD`, `REAL`, `LREAL` y `TIME`: 240 funciones. `DATE`, `TOD` y `DT` todavía no tienen ninguna. Las reglas, en breve:

| Conversión | Resultado |
| --- | --- |
| Entero a un entero más ancho o del mismo ancho | El mismo valor. |
| Entero a un entero más estrecho, o al otro signo | Los bits bajos en el ancho del destino: `INT_TO_SINT(300)` es 44, `INT_TO_UINT(-1)` es 65535. |
| `REAL` o `LREAL` a entero | El entero más cercano, y una mitad exacta al par (`REAL_TO_INT(2.5)` es 2, `REAL_TO_INT(3.5)` es 4). Fuera del rango da el límite más cercano (`REAL_TO_INT(40000.0)` es 32767), y un NaN da 0. |
| Entero o `TIME` a `BOOL` | FALSE para 0, TRUE para cualquier otro valor. |
| `TIME` a un número | Su cuenta de milisegundos: `TIME_TO_DINT(T#2s)` es 2000. |

La tabla completa, con un ejemplo para cada tipo de origen, está en la [referencia de funciones](../reference/functions.md). `TRUNC` quita la fracción hacia cero y devuelve un `REAL`; `ROUND` no es una función IEC y redondea una mitad alejándose de cero.

### Enteros de 64 bits

`ABS`, `NEG`, `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`, `SQRT`, `TRUNC`, `ROUND`, `SHL`, `SHR`, `ROL` y `ROR` aceptan los enteros de 64 bits y `LREAL`. Las demás funciones los rechazan con un mensaje.

## Funciones de sistema

`UPTIME` devuelve el tiempo de actividad del runtime en milisegundos. `CYCLE_TIME` lee el campo de tiempo de ciclo del runtime para el ciclo anterior; su unidad, su resolución y su relación con el tiempo físico dependen del runtime y del perfil, así que no lo use como garantía de tiempo del hardware.

`WATCHDOG_RESET` es un sustituto de compatibilidad. Se compila a `NOP` y no alimenta, reinicia ni valida ningún watchdog: el runtime alimenta por sí mismo el watchdog de hardware después de cada ciclo completado. La compilación informa cada llamada con la advertencia `WATCHDOG_RESET_NO_EFFECT` (seleccionable con `compiler.warnings`). Quite la llamada, y nunca la use como control de seguridad.

## Diferencias conocidas con IEC 61131-3 {#11-diferencias-conocidas-con-iec-61131-3}

La tabla se genera a partir de los casos de conformidad que esperan el comportamiento de IEC 61131-3 y fallan hoy (`tools/ci/expected-failures.json`) y de la descripción de cada requisito en `docs/known-limits.json`. Una fila desaparece cuando pasa el último caso de su requisito.

{/* >>> GENERATED (tools/docs/generate_known_limits.py): known-limits-library. Do not edit. >>> */}
Ningún caso de conformidad de esta área figura en la lista de fallas esperadas: no hay un límite registrado.
{/* <<< END GENERATED: known-limits-library <<< */}

Un bloque o una función que no está en la tabla no se sabe que difiera. Cada función estándar y cada bloque de biblioteca fuera de los de comunicación tiene un caso ejecutado en `conformance/cmp/` (requisito CMP-058).
