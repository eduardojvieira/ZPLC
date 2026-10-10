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

Esta página describe las funciones cubiertas hoy por la referencia. Validá el proyecto contra el flujo y perfil seleccionados.

---

## 1. Timers (Temporizadores)

### TON (Temporizador On-Delay)
Retrasa un flanco de subida. La salida `Q` se vuelve TRUE solo después de que `IN` haya sido TRUE durante la duración de `PT`.
- **Entradas:**
  - `IN` (BOOL): Condición de disparo.
  - `PT` (TIME): Tiempo preestablecido (duración a esperar).
- **Salidas:**
  - `Q` (BOOL): High si `IN` ha sido alto continuamente durante `PT`.
  - `ET` (TIME): Tiempo transcurrido desde que `IN` se puso en alto. Cuenta hasta `PT` y se detiene ahí; vale 0 mientras `IN` está en bajo.
- **Comportamiento:** `IN` en bajo reinicia `Q` y `ET` de inmediato. Un preset de `T#0ms` hace que `Q` siga a `IN` en el mismo scan.

### TOF (Temporizador Off-Delay)
Conserva un estado alto durante un tiempo después de un flanco de bajada. `Q` sigue a `IN` a TRUE inmediatamente, pero retrasa su paso a FALSE hasta que haya transcurrido `PT`.
- **Entradas:**
  - `IN` (BOOL): Condición de disparo.
  - `PT` (TIME): Tiempo preestablecido (duración a mantener en alto).
- **Salidas:**
  - `Q` (BOOL): Verdadero mientras `IN` sea verdadero, más el tiempo `PT` después de que `IN` se vuelva falso.
  - `ET` (TIME): Tiempo transcurrido desde que `IN` se puso en bajo. Cuenta hasta `PT` y se queda en `PT` hasta que `IN` vuelve a subir; vale 0 mientras `IN` está en alto.

### TP (Temporizador de Pulso)
Genera un pulso de duración fija, sin importar cuánto tiempo permanezca alta la entrada.
- **Entradas:**
  - `IN` (BOOL): Condición de disparo (el flanco de subida inicia el pulso).
  - `PT` (TIME): Tiempo de pulso.
- **Salidas:**
  - `Q` (BOOL): Lanza un pulso verdadero durante el tiempo `PT` en el flanco de subida de `IN`.
  - `ET` (TIME): Tiempo transcurrido desde que inició el pulso. Cuenta hasta `PT` y se detiene ahí; conserva `PT` mientras `IN` sigue en alto después del pulso y vale 0 cuando el pulso terminó y `IN` está en bajo.
- **Comportamiento:** El pulso corre hasta el final haga lo que haga `IN` y no se puede redisparar: un nivel que se mantiene en alto no inicia un segundo pulso, un pulso nuevo necesita un flanco de subida nuevo después de que el anterior terminó. Un preset de `T#0ms` no da pulso.

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
- **Salidas:** (REAL) Raíz cuadrada de IN; 0.0 si `IN` es 0.0 o menor.

### SIN / COS / TAN
- **Entradas:** `IN` (REAL).
- **Salidas:** (REAL) Seno, Coseno o Tangente de IN (en radianes).
- **Dominio:** `IN` menor que 100000 en magnitud. Un NaN, o un ángulo de 100000 o más, da NaN: un REAL de ese tamaño ya no dice dónde está en la circunferencia.

### EXP / LN / LOG
El exponencial natural, el logaritmo natural y el logaritmo en base 10.
- **Entradas:** `IN` (REAL; un entero se convierte).
- **Salidas:** (REAL) `e ** IN`, `ln(IN)` o `log10(IN)`.
- **Rango:** `EXP` da +infinito por encima de 88.72284 y 0.0 por debajo de -103.28. `LN` y `LOG` dan -infinito para 0.0 y NaN para un número negativo.

### ASIN / ACOS / ATAN / ATAN2
Funciones trigonométricas inversas, en radianes.
- **Entradas:** `IN` (REAL) para `ASIN`, `ACOS` y `ATAN`; `ATAN2(Y, X)` toma dos valores REAL.
- **Salidas:** (REAL) `ASIN` en [-pi/2, pi/2] y `ACOS` en [0, pi] para un `IN` de -1.0 a 1.0, NaN fuera de ese rango; `ATAN` en (-pi/2, pi/2) para cualquier `IN`; `ATAN2` en (-pi, pi], el ángulo del punto (`X`, `Y`) medido desde el eje X positivo, y 0.0 para (0.0, 0.0).

### NORM_X / SCALE_X
Convierten un valor entre un rango y 0.0 a 1.0.
- **NORM_X(MIN, X, MAX)**: `(X - MIN) / (MAX - MIN)`, un REAL; 0.0 cuando `MAX` es igual a `MIN`. Un valor fuera del rango no se limita (`NORM_X(0.0, 30.0, 20.0)` es 1.5).
- **SCALE_X(MIN, X, MAX)**: `MIN + X * (MAX - MIN)`, un REAL. Los límites pueden ser negativos; los argumentos enteros se convierten.

### EXPT
`EXPT(BASE, EXP)` eleva `BASE` a `EXP`; es el operador `**` en forma de función. Los dos argumentos se convierten a REAL y el resultado es REAL. Un exponente entero, negativo y 0 incluidos, se calcula por cuadrados sucesivos (`EXPT(2.0, -2.0)` es 0.25 y `EXPT(x, 0.0)` es 1.0); cualquier otro exponente como `2 ** (EXP * log2(BASE))`, NaN para una base negativa.

### Precisión de las funciones REAL
Las funciones anteriores son subrutinas en aritmética de precisión simple, medidas contra `Math.*` sobre grillas densas en la suite de tests del compilador (`stdlib/mathlib.test.ts`). El error nunca supera:

| Función | Rango | Error |
|---|---|---|
| `SQRT` | todo REAL positivo, subnormales incluidos | relativo 1.3e-7 |
| `EXP` | -87 a 88 | relativo 1.3e-7 |
| `LN`, `LOG` | todo REAL positivo, subnormales incluidos | relativo 3e-7 |
| `SIN`, `COS` | magnitud hasta 1000 | absoluto 2e-7 |
| `SIN`, `COS` | magnitud menor que 100000 | absoluto 2e-6 |
| `TAN` | magnitud hasta 1000 | relativo 3e-7 |
| `ATAN` | todo REAL | absoluto 2e-7 |
| `ASIN`, `ACOS` | -1.0 a 1.0 | absoluto 4e-7 |
| `ATAN2` | todo par de REAL | absoluto 4e-7 |

Ninguna hace fallar la VM con ningún argumento: una división por cero se reemplaza por el valor que la función define, y un argumento NaN da NaN.

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
- **NAND(IN1, IN2)** / **NOR(IN1, IN2)**: La negación de AND y de OR de dos valores BOOL, 0 o 1.

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

Las funciones de conversión mueven valores entre tipos. Existe una función `<ORIGEN>_TO_<DESTINO>` para cada par ordenado de tipos distintos entre `BOOL`, `SINT`, `USINT`, `BYTE`, `INT`, `UINT`, `WORD`, `DINT`, `UDINT`, `DWORD`, `REAL` y `TIME`: `INT_TO_DINT`, `DINT_TO_REAL`, `SINT_TO_INT`, `REAL_TO_USINT`, `TIME_TO_DINT`, etc. (132 funciones). Los tipos de 64 bits y `DATE`, `TOD` y `DT` todavía no tienen funciones de conversión.

| Conversión | Resultado |
|---|---|
| Entero a un entero más ancho o del mismo ancho | El mismo valor. |
| Entero a un entero más angosto, o al otro signo | Los bits bajos del valor en el ancho del destino (módulo, complemento a dos): `INT_TO_SINT(300)` es 44, `INT_TO_UINT(-1)` es 65535, `DINT_TO_UDINT(-1)` es 4294967295. |
| Entero o `TIME` a `BOOL` | FALSE para 0, TRUE para cualquier otro valor. |
| `BOOL` a un número | 0 o 1. |
| Entero a `REAL` | El `REAL` más cercano; un valor de 32 bits mayor que 2^24 puede perder sus bits más bajos. |
| `REAL` a un entero | El entero más cercano; una mitad exacta va al entero par (`REAL_TO_INT(2.5)` es 2, `REAL_TO_INT(3.5)` es 4, `REAL_TO_INT(-2.5)` es -2). Un valor fuera del rango del destino da su límite más cercano (`REAL_TO_INT(40000.0)` es 32767, `REAL_TO_USINT(-5.0)` es 0, el infinito da el límite de su signo) y un NaN da 0. |
| `REAL` a `BOOL` | FALSE para 0.0 y -0.0, TRUE para cualquier otro valor. |
| `TIME` | Su cantidad de milisegundos como entero sin signo de 32 bits: `TIME_TO_DINT(T#2s)` es 2000. |

- **TRUNC(IN)**: Quita la parte fraccionaria de un `REAL` hacia cero y devuelve un `REAL` (`TRUNC(-3.7)` es -3.0). Una magnitud de 2^23 o más no tiene fracción y se devuelve igual. Para el entero, usá `REAL_TO_DINT(TRUNC(x))`.
- **ROUND(IN)**: No es una función IEC. El número entero más cercano como `REAL`, una mitad exacta se aleja de cero (`ROUND(2.5)` es 3.0, `ROUND(-2.5)` es -3.0).

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

---

## 11. Bloques de Biblioteca Fuera del Estándar

Estos bloques pertenecen a la biblioteca de ZPLC y no son bloques de IEC 61131-3.

### BLINK (Generador de Pulsos Asimétrico)
Genera un tren de pulsos con tiempos de ON y OFF separados.
- **Entradas:**
  - `ENABLE` (BOOL): Hace correr el generador mientras es TRUE.
  - `T_ON` (TIME): Tiempo en que `Q` es TRUE en cada ciclo.
  - `T_OFF` (TIME): Tiempo en que `Q` es FALSE en cada ciclo.
- **Salidas:**
  - `Q` (BOOL): El tren de pulsos.
- **Comportamiento:** El ciclo empieza con la fase ON en el scan en que `ENABLE` sube: `Q` es TRUE de inmediato, durante `T_ON`, luego FALSE durante `T_OFF`, y así sucesivamente. `ENABLE` en FALSE pone `Q` en FALSE de inmediato, y el próximo `ENABLE` inicia un ciclo nuevo con la fase ON. Una fase termina en el primer scan en que su tiempo transcurrió, así que con un período de scan mayor que `T_ON` o `T_OFF` la fase dura un scan.

```text
ENABLE: __/¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯\____
Q:      __/¯¯¯\______/¯¯¯\______/¯¯¯\___
          |300|  700 |300|  700 |        (T_ON = 300 ms, T_OFF = 700 ms)
```

### PWM (Modulación por Ancho de Pulso)
- **Entradas:** `ENABLE` (BOOL), `PERIOD` (TIME), `DUTY` (REAL, 0.0 a 1.0).
- **Salidas:** `Q` (BOOL).
- **Comportamiento:** Mientras `ENABLE` es TRUE, `Q` es TRUE durante `PERIOD * DUTY` al comienzo de cada `PERIOD`. Un `DUTY` de 0.0 mantiene `Q` en FALSE y 1.0 lo mantiene en TRUE. `ENABLE` en FALSE pone `Q` en FALSE, y el próximo `ENABLE` inicia un período nuevo.

### PULSE (Generador de Pulso Único)
- **Entradas:** `TRIG` (BOOL), `PT` (TIME).
- **Salidas:** `Q` (BOOL).
- **Comportamiento:** Un flanco de subida de `TRIG` inicia un pulso de `PT`. Un flanco de subida durante el pulso se ignora, y un nivel que sigue en TRUE después no inicia nada.

### HYSTERESIS
- **Entradas:** `IN`, `HIGH`, `LOW` (REAL).
- **Salidas:** `Q` (BOOL).
- **Comportamiento:** `Q` pasa a TRUE cuando `IN` está por encima de `HIGH` y a FALSE cuando está por debajo de `LOW`; entre ambos conserva su valor. Los umbrales negativos funcionan como cualquier otro.

### DEADBAND
- **Entradas:** `IN`, `WIDTH` (REAL).
- **Salidas:** `OUT` (REAL).
- **Comportamiento:** `OUT` toma el valor de `IN` cuando `IN` difiere del último valor de `OUT` en más de `WIDTH`, y en caso contrario conserva su valor.

### LAG_FILTER
- **Entradas:** `IN` (REAL), `GAIN` (REAL, 0.0 a 1.0).
- **Salidas:** `OUT` (REAL).
- **Comportamiento:** `OUT := OUT + GAIN * (IN - OUT)` en cada llamada: `GAIN` 1.0 sigue a `IN`, 0.0 nunca se mueve.

### RAMP_REAL
- **Entradas:** `IN` (REAL), `RATE` (REAL, el mayor cambio por llamada).
- **Salidas:** `OUT` (REAL).
- **Comportamiento:** `OUT` se mueve hacia `IN` como máximo `RATE` en cada llamada, hacia arriba o hacia abajo, y vale `IN` cuando está a menos de `RATE` de él.

### INTEGRAL
- **Entradas:** `IN` (REAL), `DT` (REAL, segundos), `RESET` (BOOL).
- **Salidas:** `OUT` (REAL).
- **Comportamiento:** `OUT := OUT + IN * DT` en cada llamada; `RESET` en TRUE pone `OUT` en 0.0. Un `IN` negativo resta.

### DERIVATIVE
- **Entradas:** `IN` (REAL), `DT` (REAL, segundos).
- **Salidas:** `OUT` (REAL).
- **Comportamiento:** `OUT := (IN - IN anterior) / DT`; 0.0 cuando `DT` es 0.0. La primera llamada compara con un `IN` de 0.0.

### PID_Compact
Un controlador PID discreto.
- **Entradas:** `SP` (consigna), `PV` (valor de proceso), `KP`, `KI`, `KD` (ganancias), `DT` (tiempo de muestreo en segundos), `OUT_MIN`, `OUT_MAX` (REAL).
- **Salidas:** `OUT` (REAL).
- **Comportamiento:** Con `e = SP - PV`, `OUT = KP * e + KI * suma(e * DT) + KD * (e - e anterior) / DT`, limitado a `OUT_MIN` hasta `OUT_MAX`. Un `DT` de 0.0 (omitido) deja en 0.0 los términos integral y derivativo. El acumulador integral no se limita mientras la salida está limitada. La primera llamada toma el error anterior como el actual, así que no tiene salto derivativo.

### FIFO (Buffer Primero en Entrar, Primero en Salir)
Guarda hasta 8 valores `DINT`; salen en el orden en que entraron.
- **Entradas:**
  - `PUSH` (BOOL): Un flanco de subida guarda `DATA_IN`.
  - `POP` (BOOL): Un flanco de subida mueve el valor más antiguo a `DATA_OUT`.
  - `RST` (BOOL): Vacía el buffer.
  - `DATA_IN` (DINT): El valor a guardar.
  - `SIZE` (DINT): Capacidad, de 1 a 8. Una llamada que lo omite recibe 8, igual que un valor fuera de 1 a 8: una instancia tiene lugar para 8 valores.
- **Salidas:**
  - `DATA_OUT` (DINT): El valor del último pop.
  - `COUNT` (DINT): Valores guardados.
  - `EMPTY` (BOOL): TRUE cuando `COUNT` es 0.
  - `FULL` (BOOL): TRUE cuando `COUNT` llegó a la capacidad.
- **Comportamiento:** Un push en un buffer lleno y un pop de uno vacío no hacen nada.

### LIFO (Buffer Último en Entrar, Primero en Salir)
Una pila de hasta 8 valores `DINT`; el último valor guardado sale primero. Sus entradas y salidas son las de `FIFO`, con las mismas reglas de capacidad.
