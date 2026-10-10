---
slug: /runtime/stdlib
id: stdlib
title: Referencia de la Biblioteca Estándar
sidebar_label: Standard Library
description: Referencia de las funciones y bloques de la biblioteca estándar de ZPLC documentados actualmente.
tags: [reference, stdlib, iec61131-3]
---

# Referencia de la Biblioteca Estándar de ZPLC

ZPLC documenta las funciones y bloques de la biblioteca estándar implementados por sus rutas de compilador/runtime. La disponibilidad depende del flujo de lenguaje y del perfil de capacidades del destino; ST es el frontend central.

Esta página describe las funciones cubiertas hoy por la referencia. Valide el proyecto contra el flujo y el perfil seleccionados.

---

## 1. Timers (Temporizadores)

`PT` y `ET` son valores `TIME`: una cuenta de 32 bits sin signo en milisegundos, de 0 a 4294967295 (unos 49,7 días). Ver [Tipos de tiempo y fecha](../languages/st.md#tipos-de-tiempo-y-fecha).

### TON (Temporizador On-Delay)
Retrasa un flanco de subida. La salida `Q` se vuelve TRUE solo después de que `IN` haya sido TRUE durante la duración de `PT`.
- **Entradas:**
  - `IN` (BOOL): Condición de disparo.
  - `PT` (TIME): Tiempo preestablecido (duración a esperar).
- **Salidas:**
  - `Q` (BOOL): High si `IN` ha sido alto continuamente durante `PT` (`cmp-058-ton-delays-output`).
  - `ET` (TIME): Tiempo transcurrido desde que `IN` se puso en alto. Sigue contando mientras `IN` permanece en alto, donde IEC 61131-3 lo detiene en `PT` (ver la sección 11).

### TOF (Temporizador Off-Delay)
Conserva un estado alto durante un tiempo después de un flanco de bajada. `Q` sigue a `IN` a TRUE inmediatamente, pero retrasa su paso a FALSE hasta que haya transcurrido `PT`.
- **Entradas:**
  - `IN` (BOOL): Condición de disparo.
  - `PT` (TIME): Tiempo preestablecido (duración a mantener en alto).
- **Salidas:**
  - `Q` (BOOL): Verdadero mientras `IN` sea verdadero, más el tiempo `PT` después de que `IN` se vuelva falso (`cmp-058-tof-holds-output`).
  - `ET` (TIME): Tiempo transcurrido desde que `IN` se puso en bajo.

### TP (Temporizador de Pulso)
Genera un pulso de duración fija, sin importar cuánto tiempo permanezca alta la entrada.
- **Entradas:**
  - `IN` (BOOL): Condición de disparo (el flanco de subida inicia el pulso).
  - `PT` (TIME): Tiempo de pulso.
- **Salidas:**
  - `Q` (BOOL): Verdadero durante `PT` después de un flanco de subida de `IN`, haga lo que haga `IN` mientras tanto (`cmp-057-tp-pulse-ignores-the-input-falling`). Mientras `IN` permanece en alto, el pulso vuelve a empezar después de `PT`, donde IEC 61131-3 da un solo pulso (ver la sección 11).
  - `ET` (TIME): Tiempo transcurrido desde que inició el pulso.

---

## 2. Contadores

`CTU`, `CTD` y `CTUD` guardan su cuenta en `CV` y toman el valor de preselección de `PV`. Ambos son `INT`: 16 bits, de -32768 a 32767. Las reglas de esta lista valen para los tres bloques, y cada bloque agrega las suyas más abajo.

- **La cuenta es por flanco.** Se cuenta cuando la entrada es TRUE en esta llamada y era FALSE en la llamada anterior de la misma instancia. Una entrada que permanece en TRUE cuenta una sola vez, y una entrada que ya es TRUE en la primera llamada cuenta una vez. El flanco se ve entre dos llamadas, no entre dos scans, de modo que una llamada que un `IF` omite no ve un flanco que subió y bajó entre medio.
- **Reset y load son niveles y tienen prioridad.** Mientras `R` (`CTU`, `CTUD`) o `LD` (`CTD`, `CTUD`) es TRUE, no se cuenta nada. En `CTUD`, `R` gana sobre `LD`.
- **El detector de flancos sigue funcionando durante el reset y el load.** Un pulso que sube mientras `R` o `LD` es TRUE no se cuenta cuando `R` o `LD` se suelta. Un pulso que sube en la llamada en que `R` o `LD` se suelta sí se cuenta, siempre que la entrada fuera FALSE en la llamada anterior.
- **Las salidas se recalculan en cada llamada** a partir de `CV` y `PV`, después del reset, el load o la cuenta de esa llamada.

### CTU (Contador Ascendente)
Suma 1 en cada flanco de subida de `CU`.
- **Entradas:**
  - `CU` (BOOL): Entrada de cuenta ascendente.
  - `R` (BOOL): Reset; mientras es TRUE, `CV` vale 0.
  - `PV` (INT): Valor de preselección.
- **Salidas:**
  - `Q` (BOOL): TRUE cuando `CV >= PV`.
  - `CV` (INT): Valor actual. Se detiene en 32767: un flanco ahí no se cuenta y `CV` no pasa a -32768.

### CTD (Contador Descendente)
Resta 1 en cada flanco de subida de `CD`.
- **Entradas:**
  - `CD` (BOOL): Entrada de cuenta descendente.
  - `LD` (BOOL): Load; mientras es TRUE, `CV` vale `PV`.
  - `PV` (INT): Valor de preselección.
- **Salidas:**
  - `Q` (BOOL): TRUE cuando `CV <= 0`. Una instancia nueva empieza con `CV` en 0, de modo que `Q` es TRUE hasta el primer load.
  - `CV` (INT): Valor actual. Se detiene en 0: un flanco ahí no se cuenta.

### CTUD (Contador Ascendente/Descendente)
Suma 1 en un flanco de subida de `CU` y resta 1 en un flanco de subida de `CD`.
- **Entradas:**
  - `CU` (BOOL): Entrada de cuenta ascendente.
  - `CD` (BOOL): Entrada de cuenta descendente.
  - `R` (BOOL): Reset; mientras es TRUE, `CV` vale 0.
  - `LD` (BOOL): Load; mientras es TRUE y `R` es FALSE, `CV` vale `PV`.
  - `PV` (INT): Valor de preselección.
- **Salidas:**
  - `QU` (BOOL): TRUE cuando `CV >= PV`.
  - `QD` (BOOL): TRUE cuando `CV <= 0`.
  - `CV` (INT): Valor actual. Se detiene en 32767 igual que `CTU`. Un flanco de subida de `CU` y otro de `CD` en la misma llamada se anulan entre sí.

### Cuenta por debajo de cero y presets negativos (requisito abierto)

IEC 61131-3 permite que un contador baje hasta -32768 y compara valores con signo. ZPLC todavía no lo sigue ahí. Hoy:

- `CTD` se detiene en 0, como se indicó arriba.
- `CTUD` no tiene límite inferior: `CV` sigue en -1, -2 y así, pero `QU` y `QD` comparan `CV` y `PV` como números de 16 bits sin signo. Con un `CV` negativo, `QU` es TRUE y `QD` es FALSE, mientras que IEC 61131-3 da `QU` FALSE y `QD` TRUE.
- Un `PV` negativo se lee como 65536 más `PV`. Un `CTU` con `PV := -1` nunca activa `Q`, y un `CTD` que carga un `PV` negativo sigue contando hacia abajo por debajo de cero con `Q` en FALSE.

Esto es el requisito CMP-011 (comparación sobre `INT` con valores negativos) y, para los valores límite de los bloques estándar, CMP-058. Use un preset de 0 o más y no dependa de `QU` ni de `QD` por debajo de cero.

Nivel de evidencia: host. Los casos `cmp-058-ctu-*`, `cmp-058-ctd-*` y `cmp-058-ctud-*` de `conformance/cmp/` se ejecutan en el runtime nativo, y `packages/zplc-compiler/src/compiler/stdlib/counters.test.ts` reproduce el código generado scan por scan, incluida la detención de `CTD` en 0. El comportamiento por debajo de cero y con un preset negativo se observó en el runtime nativo y está registrado en los comentarios de `packages/zplc-compiler/src/compiler/stdlib/counters.ts`; todavía ningún caso de conformidad lo fija.

---

## 3. Elementos Biestables (Flip-Flops)

### RS (Flip-Flop Dominante Reset)
- **Entradas:** `S` (BOOL, Set), `R1` (BOOL, Reset).
- **Salidas:** `Q1` (BOOL).
- **Comportamiento:** Enclava `Q1` a TRUE cuando `S` es TRUE. Reinicia `Q1` a FALSE cuando `R1` es TRUE. *Si tanto `S` como `R1` son TRUE, la salida es FALSE (gana el Reset).*

### SR (Flip-Flop Dominante Set)
- **Entradas:** `S1` (BOOL, Set), `R` (BOOL, Reset).
- **Salidas:** `Q1` (BOOL).
- **Comportamiento:** Enclava `Q1` a TRUE cuando `S1` es TRUE. Reinicia `Q1` a FALSE cuando `R` es TRUE. *Si tanto `S1` como `R` son TRUE, la salida es TRUE (gana el Set).*

---

## 4. Detección de Flancos

### R_TRIG (Detector de Flanco de Subida)
- **Entradas:** `CLK` (BOOL).
- **Salidas:** `Q` (BOOL).
- **Comportamiento:** `Q` es TRUE durante un solo ciclo de ejecución cuando `CLK` transiciona de FALSE a TRUE.

### F_TRIG (Detector de Flanco de Bajada)
- **Entradas:** `CLK` (BOOL).
- **Salidas:** `Q` (BOOL).
- **Comportamiento:** `Q` es TRUE durante un solo ciclo de ejecución cuando `CLK` transiciona de TRUE a FALSE.

---

## 5. Funciones Matemáticas

### Operadores Aritméticos
- **`+`, `-`, `*`, `/`**: suma, resta, multiplicación y división de los tipos numéricos. La división entera trunca hacia cero.
- **`a MOD b`**: el residuo entero, con el signo de `a`. Es un operador: la forma `MOD(a, b)` no se analiza.
- Las formas de función `ADD(a, b)`, `SUB`, `MUL` y `DIV` no existen; la compilación las rechaza y nombra la función (`cmp-006-operator-function-form-is-rejected`).

Los anchos, el desbordamiento y el comportamiento en los límites están en los [tipos numéricos](../languages/st.md#tipos-numéricos) de Structured Text.

### Matemáticas Avanzadas
### ABS
- **Entradas:** `IN` (ANY_NUM).
- **Salidas:** (ANY_NUM) Valor absoluto de IN.

### SQRT
- **Entradas:** `IN` (REAL).
- **Salidas:** (REAL) Raíz cuadrada de IN.

### SIN / COS / TAN
- **Entradas:** `IN` (REAL).
- **Salidas:** (REAL) Seno, Coseno o Tangente de IN (en radianes) (`cmp-058-trigonometric-functions`).

`ASIN`, `ACOS`, `ATAN`, `ATAN2`, `LN`, `LOG` y `EXP` también están registradas. Hoy son aproximaciones y algunas se desvían más de 0,05 (ver la sección 11).

---

## 6. Funciones de Selección

### MAX
- **Entradas:** `IN1` (ANY_NUM), `IN2` (ANY_NUM).
- **Salidas:** (ANY_NUM) El mayor de los dos.

### MIN
- **Entradas:** `IN1` (ANY_NUM), `IN2` (ANY_NUM).
- **Salidas:** (ANY_NUM) El menor de los dos.

### LIMIT
- **Entradas:** `MN` (ANY_NUM, mínimo), `IN` (ANY_NUM, entrada), `MX` (ANY_NUM, máximo).
- **Salidas:** (ANY_NUM) Retorna `MN` si `IN < MN`, retorna `MX` si `IN > MX`, en otro caso retorna `IN`.

### SEL
- **Entradas:** `G` (BOOL, condición), `IN0` (ANY, retorna si G es FALSE), `IN1` (ANY, retorna si G es TRUE).
- **Salidas:** (ANY) `IN0` o `IN1`.

### MUX
- **Entradas:** `K` (INT, selector), `IN0`, `IN1`, `...` (ANY).
- **Salidas:** (ANY) Retorna `INk`.

---

## 7. Funciones de Bits

### Operadores Lógicos
- **`a AND b`, `a OR b`, `a XOR b`, `NOT a`**: operadores sobre `BOOL`, `BYTE`, `WORD`, `DWORD` y `LWORD`, con todo el ancho declarado. Las formas de función `AND(a, b)`, `OR(a, b)` y `XOR(a, b)` no se analizan.
- **AND_WORD, OR_WORD, XOR_WORD, NOT_WORD** y **AND_DWORD, OR_DWORD, XOR_DWORD, NOT_DWORD**: las mismas operaciones como funciones sobre `WORD` y `DWORD` (`cmp-014-shr-and-word-logic-functions`).

### Rotación y Desplazamiento
### SHL
- **Entradas:** `IN` (ANY_BIT), `N` (INT, número de bits).
- **Salidas:** (ANY_BIT) `IN` desplazado a la izquierda. Un desplazamiento de 32 o más, o con una cuenta negativa, da 0 (`cmp-016-shift-by-the-width-or-more`), y un `BYTE` o un `WORD` descarta los bits desplazados más allá de su ancho (`cmp-014-shl-byte-keeps-8-bits`).

### SHR
- **Entradas:** `IN` (ANY_BIT), `N` (INT).
- **Salidas:** (ANY_BIT) `IN` desplazado a la derecha. Un desplazamiento de 32 o más, o con una cuenta negativa, da 0.

### ROL
- **Entradas:** `IN` (ANY_BIT), `N` (INT).
- **Salidas:** (ANY_BIT) Valor rotado a la izquierda.

### ROR
- **Entradas:** `IN` (ANY_BIT), `N` (INT).
- **Salidas:** (ANY_BIT) Valor rotado a la derecha.

---

## 8. Funciones de Cadenas (Strings)

Las cadenas son buffers acotados: `STRING` tiene 80 caracteres, `STRING[n]` tiene `n`. Una asignación copia los caracteres que entran.

Una función que arma una cadena (`CONCAT`, `LEFT`, `RIGHT`, `MID`, `INSERT`, `DELETE`, `REPLACE`) devuelve una cadena nueva y nunca modifica sus argumentos. Las posiciones empiezan en 1.

- **LEN(s)**: Retorna la longitud actual (INT).
- **CONCAT(s1, s2)**: Retorna `s1` seguida de `s2`.
- **COPY(src, dst)**: Copia `src` a `dst` (escribe en `dst`, como dice su nombre).
- **CLEAR(s)**: Vacía la cadena a longitud 0 (escribe en `s`).
- **LEFT(s, n)**: Retorna los `n` caracteres izquierdos de `s`.
- **RIGHT(s, n)**: Retorna los `n` caracteres derechos de `s`.
- **MID(s, pos, n)**: Retorna `n` caracteres de `s` desde la posición (1-based) `pos`.
- **FIND(s1, s2)**: Retorna la posición de `s2` en `s1`, o 0 si no se encuentra.
- **INSERT(s1, s2, pos)**: Retorna `s1` con `s2` insertada después de su carácter número `pos` (`pos` 0 inserta al frente).
- **DELETE(s, pos, n)**: Retorna `s` sin los `n` caracteres que empiezan en `pos`.
- **REPLACE(s1, s2, pos, n)**: Retorna `s1` con los `n` caracteres que empiezan en `pos` reemplazados por `s2`.
- **STRCMP(s1, s2)**: Comparación léxica (-1, 0, 1).

En `MID`, `DELETE` y `REPLACE` la posición va antes de la cantidad. IEC 61131-3 escribe primero el largo (`MID(IN, L, P)`): un programa escrito con ese orden debe intercambiar los dos argumentos.

---

## 9. Conversiones de Tipos

Existen seis funciones de conversión. Cualquier otro nombre `X_TO_Y`, como `DINT_TO_REAL`, `SINT_TO_INT`, `TIME_TO_DINT` o `DINT_TO_TIME`, es un error de compilación que nombra la función (requisito CMP-057).

- **INT_TO_REAL(IN)**: convierte un entero a `REAL`.
- **REAL_TO_INT(IN)**: convierte un `REAL` a un entero. Trunca hacia cero, satura en los límites de `DINT` y da 0 para un NaN (`cmp-016-real-to-dint-truncates-toward-zero`, `cmp-016-real-out-of-range-to-dint`, `cmp-016-real-nan-to-dint`).
- **BOOL_TO_INT(IN)** / **INT_TO_BOOL(IN)**: TRUE pasa a 1 y FALSE pasa a 0; un entero distinto de cero pasa a TRUE (`cmp-057-bool-and-round-conversions`).
- **TRUNC(IN)** / **ROUND(IN)**: devuelven un `REAL` con la parte entera hacia cero o con el entero más cercano (`cmp-057-trunc-truncates`, `cmp-057-bool-and-round-conversions`).

---

## 10. Funciones del Sistema

### UPTIME
- **Entradas:** Ninguna.
- **Salidas:** (UDINT / TIME) Campo de uptime del runtime en milisegundos (`cmp-058-uptime-follows-the-clock`).

### CYCLE_TIME
- **Entradas:** Ninguna.
- **Salidas:** (UDINT / TIME) Último valor de ciclo informado. Su unidad, resolución, punto de actualización y relación con el tiempo físico dependen del runtime/perfil; no lo use como garantía de timing de hardware.

### WATCHDOG_RESET
Stub de compatibilidad. Hoy compila a `NOP` y no alimenta, reinicia ni valida un watchdog de hardware o software.
- **Entradas:** Ninguna.
- **Salidas:** Ninguna.

No debe usarse como control de seguridad.

---

## 11. Diferencias conocidas con IEC 61131-3

La tabla se genera a partir de los casos de conformidad que esperan el comportamiento de IEC 61131-3 y fallan hoy (`tools/ci/expected-failures.json`) y de la descripción de cada requisito en `docs/known-limits.json`. Una fila desaparece cuando pasa el último caso de su requisito.

{/* >>> GENERATED (tools/docs/generate_known_limits.py): known-limits-library. Do not edit. >>> */}
| Requisito | Qué ocurre hoy | Casos que fallan hoy |
|---|---|---|
| CMP-025 | Un `FIFO` llamado sin `SIZE` provoca una falla de la VM: no se aplica el valor por defecto documentado de ocho elementos. | `a FIFO called without SIZE holds its documented default of eight items` |
| CMP-057 | Algunos bloques estándar y funciones de conversión difieren de IEC 61131-3. Solo existen seis funciones de conversión (`INT_TO_REAL`, `REAL_TO_INT`, `BOOL_TO_INT`, `INT_TO_BOOL`, `TRUNC`, `ROUND`); cualquier otro nombre `X_TO_Y` es un error de compilación (`Unknown function`). `REAL_TO_INT` trunca hacia cero, donde IEC 61131-3 redondea al entero más cercano. `TON.ET` sigue contando después de llegar a `PT`. `TP` vuelve a iniciar su pulso después de `PT` mientras `IN` permanece en TRUE. | `DINT_TO_REAL exists`<br />`INT_TO_DINT exists`<br />`REAL_TO_INT rounds to the nearest integer`<br />`TON elapsed time stops at the preset`<br />`TP is not retriggered while its input stays true`<br />`conversion functions between integer types keep an in-range value` |
| CMP-058 | Algunas funciones y bloques estándar difieren de IEC 61131-3. `ASIN`, `ACOS`, `ATAN` y `ATAN2` son aproximaciones: `ASIN(0.5)` da 0.5259 (exacto 0.5236) y `ATAN(1.0)` da 0.7238 (exacto 0.7854). `BLINK` (no es un bloque IEC) empieza en su fase apagada, de modo que `Q` sube un `T_OFF` después de `ENABLE`. `LN`, `LOG` y `EXP` son aproximaciones: `LN(10.0)` da 2.2183 (exacto 2.3026), `EXP(1.0)` da 2.7167 (exacto 2.7183) y `LOG(1000.0)` da 1.449 donde la respuesta es 3.0. `SQRT` está dentro de 0.001 en los valores comprobados. | `ASIN, ACOS and ATAN return radians`<br />`BLINK is on for T_ON and off for T_OFF while ENABLE holds`<br />`LN, LOG, EXP and SQRT` |
{/* <<< END GENERATED: known-limits-library <<< */}

Dos límites todavía no tienen un caso de conformidad, de modo que la tabla no puede mostrarlos; cada uno aparece en la tabla cuando exista un caso:

- Un programa que llama a `EXPT` es rechazado por el cargador. El requisito CMP-058 pide un caso ejecutado de cada función estándar.
- `CTUD` por debajo de cero y los presets negativos difieren de IEC 61131-3: ver la sección 2 (requisito CMP-011).

Un bloque o una función que no está en la tabla ni en esta lista no se sabe que difiera. Eso no equivale a tener un caso ejecutado: el requisito CMP-058 pide un caso para cada función y bloque estándar, y el repositorio todavía no los tiene todos.
