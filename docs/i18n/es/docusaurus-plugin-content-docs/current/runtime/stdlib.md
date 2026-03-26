---
slug: /runtime/stdlib
id: stdlib
title: Referencia de la Biblioteca Estándar
sidebar_label: Standard Library
description: Referencia completa de todas las funciones estándar y function blocks de ZPLC (Timers, Math, Bitwise, Strings, System).
tags: [reference, stdlib, iec61131-3]
---

# Referencia de la Biblioteca Estándar de ZPLC

ZPLC proporciona un conjunto completo de bloques de función estándar (FBs) y funciones que cumplen con IEC 61131-3. Estos están disponibles en todos los editores (ST, IL, LD, FBD, SFC).

A continuación se muestra la referencia exhaustiva a todas las funciones estándar disponibles en el runtime de ZPLC.

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

### CTU (Contador Ascendente)
Incrementa un valor con cada flanco de subida de la entrada.
- **Entradas:**
  - `CU` (BOOL): Disparo de conteo ascendente (flanco de subida).
  - `R` (BOOL): Entrada de Reset; cuando es TRUE, `CV` se reinicia a 0.
  - `PV` (INT): Valor de Preselección (Preset).
- **Salidas:**
  - `Q` (BOOL): TRUE si `CV >= PV`.
  - `CV` (INT): Valor actual del contador.

### CTD (Contador Descendente)
Decrementa un valor con cada flanco de subida de la entrada.
- **Entradas:**
  - `CD` (BOOL): Disparo de conteo descendente (flanco de subida).
  - `LD` (BOOL): Load; cuando es TRUE, `CV` se establece en `PV`.
  - `PV` (INT): Valor inicial.
- **Salidas:**
  - `Q` (BOOL): TRUE si `CV <= 0`.
  - `CV` (INT): Valor actual del contador.

### CTUD (Contador Ascendente/Descendente)
Combina características de CTU y CTD.
- **Entradas:**
  - `CU` (BOOL): Disparo ascendente.
  - `CD` (BOOL): Disparo descendente.
  - `R` (BOOL): Reset a 0.
  - `LD` (BOOL): Cargar `PV` en `CV`.
  - `PV` (INT): Valor preestablecido.
- **Salidas:**
  - `QU` (BOOL): TRUE si `CV >= PV`.
  - `QD` (BOOL): TRUE si `CV <= 0`.
  - `CV` (INT): Valor actual del contador.

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

- **LEN(s)**: Retorna la longitud actual (INT).
- **CONCAT(s1, s2)**: Adjunta `s2` a `s1`.
- **COPY(src, dst)**: Copia `src` a `dst`.
- **CLEAR(s)**: Vacía la cadena a longitud 0.
- **LEFT(s, n)**: Mantiene solo los `n` caracteres izquierdos de `s`.
- **RIGHT(s, n)**: Mantiene solo los `n` caracteres derechos de `s`.
- **MID(s, pos, n)**: Extrae `n` caracteres iniciando en la posición (1-based) `pos`.
- **FIND(s1, s2)**: Retorna la posición de `s2` en `s1`, o 0 si no se encuentra.
- **INSERT(s1, s2, pos)**: Inserta `s2` en `s1` en `pos`.
- **DELETE(s, pos, n)**: Elimina `n` caracteres de `s` en `pos`.
- **REPLACE(s1, s2, pos, n)**: Sobrescribe con `s2` los `n` caracteres en `s1` en la posición `pos`.
- **STRCMP(s1, s2)**: Comparación léxica (-1, 0, 1).

---

## 9. Conversiones de Tipos

- **REAL_TO_INT(IN)** / **INT_TO_REAL(IN)**
- **BOOL_TO_INT(IN)** / **INT_TO_BOOL(IN)**
- **TIME_TO_DINT(IN)** / **DINT_TO_TIME(IN)**

---

## 10. Funciones del Sistema

### UPTIME
- **Entradas:** Ninguna.
- **Salidas:** (UDINT / TIME) Uptime del hardware en milisegundos.

### CYCLE_TIME
- **Entradas:** Ninguna.
- **Salidas:** (UDINT / TIME) Duración del último ciclo de escaneo del PLC en ms.

### WATCHDOG_RESET
- **Entradas:** Ninguna.
- **Salidas:** (BOOL) `TRUE` si se reseteó con éxito el watchdog de hardware de forma explícita.
