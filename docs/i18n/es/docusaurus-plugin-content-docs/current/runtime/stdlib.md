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

### TON (Temporizador On-Delay)
Retrasa un flanco de subida. La salida `Q` se vuelve TRUE solo después de que `IN` haya sido TRUE durante la duración de `PT`.
- **Entradas:**
  - `IN` (BOOL): Condición de disparo.
  - `PT` (TIME): Tiempo preestablecido (duración a esperar).
- **Salidas:**
  - `Q` (BOOL): High si `IN` ha sido alto continuamente durante `PT`.
  - `ET` (TIME): Tiempo transcurrido desde que `IN` se puso en alto.

### TOF (Temporizador Off-Delay)
Conserva un estado alto durante un tiempo después de un flanco de bajada. `Q` sigue a `IN` a TRUE inmediatamente, pero retrasa su paso a FALSE hasta que haya transcurrido `PT`.
- **Entradas:**
  - `IN` (BOOL): Condición de disparo.
  - `PT` (TIME): Tiempo preestablecido (duración a mantener en alto).
- **Salidas:**
  - `Q` (BOOL): Verdadero mientras `IN` sea verdadero, más el tiempo `PT` después de que `IN` se vuelva falso.
  - `ET` (TIME): Tiempo transcurrido desde que `IN` se puso en bajo.

### TP (Temporizador de Pulso)
Genera un pulso de duración fija, sin importar cuánto tiempo permanezca alta la entrada.
- **Entradas:**
  - `IN` (BOOL): Condición de disparo (el flanco de subida inicia el pulso).
  - `PT` (TIME): Tiempo de pulso.
- **Salidas:**
  - `Q` (BOOL): Lanza un pulso verdadero durante el tiempo `PT` en el flanco de subida de `IN`.
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
- **ADD(IN1, IN2)**: Retorna `IN1 + IN2`. Soporta ANY_NUM (INT, REAL).
- **SUB(IN1, IN2)**: Retorna `IN1 - IN2`. Soporta ANY_NUM.
- **MUL(IN1, IN2)**: Retorna `IN1 * IN2`. Soporta ANY_NUM.
- **DIV(IN1, IN2)**: Retorna `IN1 / IN2`. Soporta ANY_NUM.
- **MOD(IN1, IN2)**: Retorna el residuo entero de `IN1 / IN2`. Soporta ANY_INT.

### Matemáticas Avanzadas
### ABS
- **Entradas:** `IN` (ANY_NUM).
- **Salidas:** (ANY_NUM) Valor absoluto de IN.

### SQRT
- **Entradas:** `IN` (REAL).
- **Salidas:** (REAL) Raíz cuadrada de IN.

### SIN / COS / TAN
- **Entradas:** `IN` (REAL).
- **Salidas:** (REAL) Seno, Coseno o Tangente de IN (en radianes).

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
- **AND(IN1, IN2)**: AND Bit a bit. Soporta ANY_BIT (BYTE, WORD, DWORD).
- **OR(IN1, IN2)**: OR Bit a bit. 
- **XOR(IN1, IN2)**: OR Exclusivo Bit a bit. 
- **NOT(IN)**: Inversión.

### Rotación y Desplazamiento
### SHL
- **Entradas:** `IN` (ANY_BIT), `N` (INT, número de bits).
- **Salidas:** (ANY_BIT) `IN` desplazado a la izquierda.

### SHR
- **Entradas:** `IN` (ANY_BIT), `N` (INT).
- **Salidas:** (ANY_BIT) `IN` desplazado a la derecha.

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

- **REAL_TO_INT(IN)** / **INT_TO_REAL(IN)**
- **BOOL_TO_INT(IN)** / **INT_TO_BOOL(IN)**
- **TIME_TO_DINT(IN)** / **DINT_TO_TIME(IN)**

---

## 10. Funciones del Sistema

### UPTIME
- **Entradas:** Ninguna.
- **Salidas:** (UDINT / TIME) Campo de uptime del runtime en milisegundos.

### CYCLE_TIME
- **Entradas:** Ninguna.
- **Salidas:** (UDINT / TIME) Último valor de ciclo informado. Su unidad, resolución, punto de actualización y relación con el tiempo físico dependen del runtime/perfil; no lo uses como garantía de timing de hardware.

### WATCHDOG_RESET
Stub de compatibilidad. Hoy compila a `NOP` y no alimenta, reinicia ni valida un watchdog de hardware o software.
- **Entradas:** Ninguna.
- **Salidas:** Ninguna.

No debe usarse como control de seguridad.
