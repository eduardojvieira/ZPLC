---
title: "Referencia de funciones"
sidebar_label: "Funciones"
description: "Todas las funciones del registro del compilador ZPLC: firma, comportamiento y un ejemplo que CI ejecuta."
tags: [reference, generated]
---

# Referencia de funciones

{/* >>> GENERATED (tools/docs/generate_function_reference.ts): reference/functions. Do not edit. >>> */}

Todas las funciones del registro del compilador, con su firma, lo que hacen y un ejemplo. El registro tiene 297 funciones: las 57 funciones con nombre de abajo y las 240 conversiones de tipo. `ANY`, `ANY_NUM`, `ANY_INT` y `ANY_BIT` representan la familia de tipos que la función acepta. Los elementos del lenguaje que las llaman están en la [vista general de lenguajes](../languages/index.md); los bloques con estado están en la [referencia de bloques de función](./function-blocks.md).

Cada ejemplo es un programa completo. CI lo compila y lo ejecuta en el runtime POSIX nativo, y el resultado indicado debajo es el valor que la ejecución comprueba.

## Selección y límites

### MAX

`MAX(IN1 : ANY_NUM, IN2 : ANY_NUM) : ANY_NUM`

Devuelve el mayor de dos valores.

```pascal runnable expect="Result=7"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := MAX(3, 7);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `7`.

### MIN

`MIN(IN1 : ANY_NUM, IN2 : ANY_NUM) : ANY_NUM`

Devuelve el menor de dos valores.

```pascal runnable expect="Result=3"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := MIN(3, 7);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `3`.

### LIMIT

`LIMIT(MN : ANY_NUM, IN : ANY_NUM, MX : ANY_NUM) : ANY_NUM`

Limita IN entre el mínimo MN y el máximo MX.

```pascal runnable expect="Result=10"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := LIMIT(0, 15, 10);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `10`.

### SEL

`SEL(G : BOOL, IN0 : ANY, IN1 : ANY) : ANY`

Devuelve IN0 cuando G es FALSE e IN1 cuando G es TRUE.

```pascal runnable expect="Result=20"
PROGRAM Example
VAR
    Choice : BOOL := TRUE;
    Result : INT;
END_VAR

Result := SEL(Choice, 10, 20);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `20`.

### MUX

`MUX(K : INT, IN0 : ANY, IN1 : ANY, ...) : ANY`

Devuelve la entrada que selecciona K: IN0 para 0, IN1 para 1, y así hasta ocho entradas.

```pascal runnable expect="Result=30"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := MUX(2, 10, 20, 30);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `30`.

## Lógica

### NAND

`NAND(IN1 : BOOL, IN2 : BOOL) : BOOL`

Devuelve NOT (IN1 AND IN2): FALSE solo cuando ambas entradas son TRUE.

```pascal runnable expect="Result=FALSE"
PROGRAM Example
VAR
    Result : BOOL;
END_VAR

Result := NAND(TRUE, TRUE);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `FALSE`.

### NOR

`NOR(IN1 : BOOL, IN2 : BOOL) : BOOL`

Devuelve NOT (IN1 OR IN2): TRUE solo cuando ambas entradas son FALSE.

```pascal runnable expect="Result=TRUE"
PROGRAM Example
VAR
    Result : BOOL;
END_VAR

Result := NOR(FALSE, FALSE);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `TRUE`.

## Desplazamientos y lógica de bits

### ROL

`ROL(IN : DWORD, N : INT) : DWORD`

Rota a la izquierda N posiciones los 32 bits de IN; los bits que salen por la izquierda entran por la derecha.

```pascal runnable expect="Result=3"
PROGRAM Example
VAR
    Value : DWORD := 16#80000001;
    Result : DWORD;
END_VAR

Result := ROL(Value, 1);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `3`.

### ROR

`ROR(IN : DWORD, N : INT) : DWORD`

Rota a la derecha N posiciones los 32 bits de IN; los bits que salen por la derecha entran por la izquierda.

```pascal runnable expect="Result=2147483649"
PROGRAM Example
VAR
    Result : DWORD;
END_VAR

Result := ROR(16#00000003, 1);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `2147483649`.

### SHL

`SHL(IN : ANY_BIT, N : INT) : ANY_BIT`

Desplaza IN a la izquierda N posiciones; entran ceros por la derecha.

```pascal runnable expect="Result=16"
PROGRAM Example
VAR
    Result : WORD;
END_VAR

Result := SHL(16#0001, 4);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `16`.

### SHR

`SHR(IN : ANY_BIT, N : INT) : ANY_BIT`

Desplaza IN a la derecha N posiciones; entran ceros por la izquierda.

```pascal runnable expect="Result=1"
PROGRAM Example
VAR
    Result : WORD;
END_VAR

Result := SHR(16#0010, 4);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `1`.

### AND_WORD

`AND_WORD(IN1 : WORD, IN2 : WORD) : WORD`

AND bit a bit de dos palabras de 16 bits.

```pascal runnable expect="Result=3840"
PROGRAM Example
VAR
    Result : WORD;
END_VAR

Result := AND_WORD(16#FF0F, 16#0FF0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `3840`.

### OR_WORD

`OR_WORD(IN1 : WORD, IN2 : WORD) : WORD`

OR bit a bit de dos palabras de 16 bits.

```pascal runnable expect="Result=61455"
PROGRAM Example
VAR
    Result : WORD;
END_VAR

Result := OR_WORD(16#F000, 16#000F);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `61455`.

### XOR_WORD

`XOR_WORD(IN1 : WORD, IN2 : WORD) : WORD`

OR exclusivo bit a bit de dos palabras de 16 bits.

```pascal runnable expect="Result=61680"
PROGRAM Example
VAR
    Result : WORD;
END_VAR

Result := XOR_WORD(16#FF00, 16#0FF0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `61680`.

### NOT_WORD

`NOT_WORD(IN : WORD) : WORD`

Complemento bit a bit de una palabra de 16 bits.

```pascal runnable expect="Result=65280"
PROGRAM Example
VAR
    Result : WORD;
END_VAR

Result := NOT_WORD(16#00FF);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `65280`.

### AND_DWORD

`AND_DWORD(IN1 : DWORD, IN2 : DWORD) : DWORD`

AND bit a bit de dos palabras de 32 bits.

```pascal runnable expect="Result=267386880"
PROGRAM Example
VAR
    Result : DWORD;
END_VAR

Result := AND_DWORD(16#FFFF0000, 16#0FF00FF0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `267386880`.

### OR_DWORD

`OR_DWORD(IN1 : DWORD, IN2 : DWORD) : DWORD`

OR bit a bit de dos palabras de 32 bits.

```pascal runnable expect="Result=16711935"
PROGRAM Example
VAR
    Result : DWORD;
END_VAR

Result := OR_DWORD(16#00FF0000, 16#000000FF);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `16711935`.

### XOR_DWORD

`XOR_DWORD(IN1 : DWORD, IN2 : DWORD) : DWORD`

OR exclusivo bit a bit de dos palabras de 32 bits.

```pascal runnable expect="Result=16776960"
PROGRAM Example
VAR
    Result : DWORD;
END_VAR

Result := XOR_DWORD(16#0000FFFF, 16#00FF00FF);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `16776960`.

### NOT_DWORD

`NOT_DWORD(IN : DWORD) : DWORD`

Complemento bit a bit de una palabra de 32 bits.

```pascal runnable expect="Result=4294901760"
PROGRAM Example
VAR
    Result : DWORD;
END_VAR

Result := NOT_DWORD(16#0000FFFF);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `4294901760`.

## Aritmética

### ABS

`ABS(IN : ANY_NUM) : ANY_NUM`

Devuelve el valor absoluto de un entero o de un real.

```pascal runnable expect="Result=5"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := ABS(-5);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `5`.

### ABSF

`ABSF(IN : REAL) : REAL`

Devuelve el valor absoluto de un REAL.

```pascal runnable expect="Result=2.5"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := ABSF(-2.5);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `2.5`.

### NEG

`NEG(IN : ANY_NUM) : ANY_NUM`

Devuelve la negación de un entero, -IN.

```pascal runnable expect="Result=-5"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := NEG(5);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `-5`.

### NEGF

`NEGF(IN : REAL) : REAL`

Devuelve la negación de un REAL, -IN.

```pascal runnable expect="Result=-2.5"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := NEGF(2.5);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `-2.5`.

### MOD

`MOD(IN1 : ANY_INT, IN2 : ANY_INT) : ANY_INT`

El resto de dividir IN1 entre IN2. Está registrada como función, pero ST lee MOD como operador: se escribe `IN1 MOD IN2`; la forma de llamada `MOD(IN1, IN2)` no se analiza.

```pascal runnable expect="Result=2"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := 17 MOD 5;
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `2`.

### SQRT

`SQRT(IN : REAL) : REAL`

Devuelve la raíz cuadrada de un REAL; 0.0 para una entrada de 0.0 o menor.

```pascal runnable expect="Result=4"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := SQRT(16.0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `4`.

### EXPT

`EXPT(BASE : REAL, EXP : REAL) : REAL`

Devuelve BASE elevada a EXP, igual que el operador `**`.

```pascal runnable expect="Result=1024"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := EXPT(2.0, 10.0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `1024`.

## Redondeo

### TRUNC

`TRUNC(IN : REAL) : REAL`

Quita la parte fraccionaria de un REAL, hacia cero, y lo mantiene REAL.

```pascal runnable expect="Result=2"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := TRUNC(2.7);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `2`.

### ROUND

`ROUND(IN : REAL) : REAL`

Redondea un REAL al entero más cercano, una mitad exacta se aleja de cero, y lo mantiene REAL.

```pascal runnable expect="Result=3"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := ROUND(2.5);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `3`.

## Trigonometría

### SIN

`SIN(IN : REAL) : REAL`

Seno de un ángulo en radianes.

```pascal runnable expect="Result=1000"
PROGRAM Example
VAR
    Result : INT;
END_VAR

(* sine of a quarter turn, in thousandths *)
Result := REAL_TO_INT(SIN(1.5707964) * 1000.0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `1000`.

### COS

`COS(IN : REAL) : REAL`

Coseno de un ángulo en radianes.

```pascal runnable expect="Result=1"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := COS(0.0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `1`.

### TAN

`TAN(IN : REAL) : REAL`

Tangente de un ángulo en radianes.

```pascal runnable expect="Result=0"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := TAN(0.0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `0`.

### ASIN

`ASIN(IN : REAL) : REAL`

Arco seno, en radianes, de un valor de -1.0 a 1.0.

```pascal runnable expect="Result=1571"
PROGRAM Example
VAR
    Result : INT;
END_VAR

(* a quarter turn, in thousandths of a radian *)
Result := REAL_TO_INT(ASIN(1.0) * 1000.0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `1571`.

### ACOS

`ACOS(IN : REAL) : REAL`

Arco coseno, en radianes, de un valor de -1.0 a 1.0.

```pascal runnable expect="Result=0"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := ACOS(1.0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `0`.

### ATAN

`ATAN(IN : REAL) : REAL`

Arco tangente, en radianes, de cualquier REAL.

```pascal runnable expect="Result=785"
PROGRAM Example
VAR
    Result : INT;
END_VAR

(* an eighth of a turn, in thousandths of a radian *)
Result := REAL_TO_INT(ATAN(1.0) * 1000.0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `785`.

### ATAN2

`ATAN2(Y : REAL, X : REAL) : REAL`

Ángulo en radianes del punto (X, Y) desde el eje X positivo, en el cuadrante de los signos de X e Y.

```pascal runnable expect="Result=785"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := REAL_TO_INT(ATAN2(1.0, 1.0) * 1000.0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `785`.

## Logaritmos y exponenciales

### LN

`LN(IN : REAL) : REAL`

Logaritmo natural de un REAL.

```pascal runnable expect="Result=0"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := LN(1.0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `0`.

### LOG

`LOG(IN : REAL) : REAL`

Logaritmo en base 10 de un REAL.

```pascal runnable expect="Result=3"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := REAL_TO_INT(LOG(1000.0));
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `3`.

### EXP

`EXP(IN : REAL) : REAL`

El número e elevado a IN.

```pascal runnable expect="Result=1"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := EXP(0.0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `1`.

## Escalado

### NORM_X

`NORM_X(MIN : REAL, X : REAL, MAX : REAL) : REAL`

Lleva X del rango MIN a MAX al rango 0.0 a 1.0; 0.0 cuando el rango es vacío.

```pascal runnable expect="Result=0.25"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := NORM_X(0.0, 25.0, 100.0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `0.25`.

### SCALE_X

`SCALE_X(MIN : REAL, X : REAL, MAX : REAL) : REAL`

Lleva X del rango 0.0 a 1.0 al rango MIN a MAX: MIN + X * (MAX - MIN).

```pascal runnable expect="Result=100"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := SCALE_X(0.0, 0.5, 200.0);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `100`.

## Cadenas

### LEN

`LEN(S : STRING) : INT`

Cantidad de caracteres de una cadena.

```pascal runnable expect="Result=5"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := LEN('HELLO');
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `5`.

### CONCAT

`CONCAT(S1 : STRING, S2 : STRING) : STRING`

Une S2 al final de S1.

```pascal runnable expect="Same=TRUE"
PROGRAM Example
VAR
    Text : STRING;
    Same : BOOL;
END_VAR

Text := CONCAT('AB', 'CD');
Same := EQ_STRING(Text, 'ABCD');
END_PROGRAM
```

Resultado tras un ciclo: `Same` = `TRUE`.

### LEFT

`LEFT(S : STRING, N : INT) : STRING`

Los N caracteres de más a la izquierda de S.

```pascal runnable expect="Same=TRUE"
PROGRAM Example
VAR
    Text : STRING;
    Same : BOOL;
END_VAR

Text := LEFT('HELLO', 2);
Same := EQ_STRING(Text, 'HE');
END_PROGRAM
```

Resultado tras un ciclo: `Same` = `TRUE`.

### RIGHT

`RIGHT(S : STRING, N : INT) : STRING`

Los N caracteres de más a la derecha de S.

```pascal runnable expect="Same=TRUE"
PROGRAM Example
VAR
    Text : STRING;
    Same : BOOL;
END_VAR

Text := RIGHT('HELLO', 2);
Same := EQ_STRING(Text, 'LO');
END_PROGRAM
```

Resultado tras un ciclo: `Same` = `TRUE`.

### MID

`MID(S : STRING, POS : INT, N : INT) : STRING`

N caracteres de S desde la posición POS, base 1. La posición va antes de la cantidad, al revés que en IEC 61131-3.

```pascal runnable expect="Same=TRUE"
PROGRAM Example
VAR
    Text : STRING;
    Same : BOOL;
END_VAR

Text := MID('HELLO', 2, 3);
Same := EQ_STRING(Text, 'ELL');
END_PROGRAM
```

Resultado tras un ciclo: `Same` = `TRUE`.

### FIND

`FIND(S1 : STRING, S2 : STRING) : INT`

La posición, base 1, de la primera aparición de S2 dentro de S1, o 0 si no está.

```pascal runnable expect="Result=3"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := FIND('HELLO', 'L');
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `3`.

### INSERT

`INSERT(S1 : STRING, S2 : STRING, POS : INT) : STRING`

Una cadena nueva con S2 insertada en S1 después del carácter POS; S1 no cambia.

```pascal runnable expect="Same=TRUE"
PROGRAM Example
VAR
    Text : STRING;
    Same : BOOL;
END_VAR

Text := INSERT('AB', 'X', 1);
Same := EQ_STRING(Text, 'AXB');
END_PROGRAM
```

Resultado tras un ciclo: `Same` = `TRUE`.

### DELETE

`DELETE(S : STRING, POS : INT, N : INT) : STRING`

S sin N caracteres desde la posición POS, base 1. La posición va antes de la cantidad, al revés que en IEC 61131-3.

```pascal runnable expect="Same=TRUE"
PROGRAM Example
VAR
    Text : STRING;
    Same : BOOL;
END_VAR

Text := DELETE('HELLO', 2, 2);
Same := EQ_STRING(Text, 'HLO');
END_PROGRAM
```

Resultado tras un ciclo: `Same` = `TRUE`.

### REPLACE

`REPLACE(S1 : STRING, S2 : STRING, POS : INT, N : INT) : STRING`

S1 con N caracteres desde la posición POS, base 1, reemplazados por S2. La posición va antes de la cantidad, al revés que en IEC 61131-3.

```pascal runnable expect="Same=TRUE"
PROGRAM Example
VAR
    Text : STRING;
    Same : BOOL;
END_VAR

Text := REPLACE('HELLO', 'AB', 2, 3);
Same := EQ_STRING(Text, 'HABO');
END_PROGRAM
```

Resultado tras un ciclo: `Same` = `TRUE`.

### STRCMP

`STRCMP(S1 : STRING, S2 : STRING) : INT`

Compara dos cadenas: -1 cuando S1 va antes que S2, 0 cuando son iguales, 1 cuando S1 va después de S2.

```pascal runnable expect="Result=-1"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := STRCMP('A', 'B');
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `-1`.

### COPY

`COPY(SRC : STRING, DST : STRING) : STRING`

Copia SRC en DST y devuelve DST.

```pascal runnable expect="Same=TRUE"
PROGRAM Example
VAR
    Text : STRING;
    Same : BOOL;
END_VAR

COPY('HI', Text);
Same := EQ_STRING(Text, 'HI');
END_PROGRAM
```

Resultado tras un ciclo: `Same` = `TRUE`.

### CLEAR

`CLEAR(S : STRING) : STRING`

Deja S como la cadena vacía y la devuelve.

```pascal runnable expect="Result=0"
PROGRAM Example
VAR
    Text : STRING := 'HELLO';
    Result : INT;
END_VAR

CLEAR(Text);
Result := LEN(Text);
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `0`.

### EQ_STRING

`EQ_STRING(S1 : STRING, S2 : STRING) : BOOL`

TRUE cuando las dos cadenas son iguales.

```pascal runnable expect="Result=TRUE"
PROGRAM Example
VAR
    Result : BOOL;
END_VAR

Result := EQ_STRING('A', 'A');
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `TRUE`.

### NE_STRING

`NE_STRING(S1 : STRING, S2 : STRING) : BOOL`

TRUE cuando las dos cadenas difieren.

```pascal runnable expect="Result=TRUE"
PROGRAM Example
VAR
    Result : BOOL;
END_VAR

Result := NE_STRING('A', 'B');
END_PROGRAM
```

Resultado tras un ciclo: `Result` = `TRUE`.

## Sistema

### UPTIME

`UPTIME() : DINT`

Milisegundos desde que arrancó el runtime.

```pascal runnable expect="Running=TRUE" scans=30
PROGRAM Example
VAR
    Up : DINT;
    Running : BOOL;
END_VAR

Up := UPTIME();
Running := Up >= 100;
END_PROGRAM
```

Resultado tras 30 ciclos de 10 ms: `Running` = `TRUE`.

### CYCLE_TIME

`CYCLE_TIME() : DINT`

Microsegundos que tomó el scan anterior de la tarea.

```pascal runnable expect="Valid=TRUE" scans=3
PROGRAM Example
VAR
    Last : DINT;
    Valid : BOOL;
END_VAR

Last := CYCLE_TIME();
Valid := Last >= 0;
END_PROGRAM
```

Resultado tras 3 ciclos de 10 ms: `Valid` = `TRUE`.

### WATCHDOG_RESET

`WATCHDOG_RESET()`

Un resto de compatibilidad: no hace nada y no es un control de seguridad.

```pascal runnable expect="Count=1"
PROGRAM Example
VAR
    Count : INT;
END_VAR

WATCHDOG_RESET();
Count := Count + 1;
END_PROGRAM
```

Resultado tras un ciclo: `Count` = `1`.

## Conversiones de tipo

Existe una función de conversión para cada par ordenado de tipos distintos entre `BOOL`, `SINT`, `USINT`, `BYTE`, `INT`, `UINT`, `WORD`, `DINT`, `UDINT`, `DWORD`, `TIME`, `LINT`, `ULINT`, `LWORD`, `REAL`, `LREAL`: 240 funciones, con el nombre `<DESDE>_TO_<HACIA>` (`INT_TO_REAL`, `LREAL_TO_DINT`). `DATE`, `TOD` y `DT` aún no tienen. Lo que hace una conversión con un valor que el destino no puede contener depende del par:

| Desde | Hacia | Resultado |
| --- | --- | --- |
| Un entero | Un entero más ancho o del mismo ancho | El valor conserva su valor. |
| Un entero | Un entero más angosto, o de otro signo | Los bits bajos (envoltura en complemento a dos): `INT_TO_SINT(300)` es 44, `INT_TO_UINT(-1)` es 65535. |
| Un entero o TIME | BOOL | FALSE para 0, TRUE para cualquier otro valor. |
| BOOL | Un tipo numérico | 0 o 1. |
| Un entero | REAL o LREAL | El valor representable más cercano. |
| REAL o LREAL | Un entero | El entero más cercano, una mitad exacta al entero par (2.5 da 2, 3.5 da 4); un valor fuera de rango da el límite más cercano del destino; NaN da 0. |
| REAL o LREAL | BOOL | FALSE para 0.0 y -0.0, TRUE para cualquier otro valor, NaN incluido. |
| TIME | Un tipo numérico | Su cuenta de milisegundos, como entero de 32 bits sin signo. |

### Desde BOOL

Funciones: `BOOL_TO_SINT`, `BOOL_TO_USINT`, `BOOL_TO_BYTE`, `BOOL_TO_INT`, `BOOL_TO_UINT`, `BOOL_TO_WORD`, `BOOL_TO_DINT`, `BOOL_TO_UDINT`, `BOOL_TO_DWORD`, `BOOL_TO_TIME`, `BOOL_TO_LINT`, `BOOL_TO_ULINT`, `BOOL_TO_LWORD`, `BOOL_TO_REAL`, `BOOL_TO_LREAL`.

```pascal runnable expect="To_SINT=1 To_USINT=1 To_BYTE=1 To_INT=1 To_UINT=1 To_WORD=1 To_DINT=1 To_UDINT=1 To_DWORD=1 Is_TIME=TRUE Is_LINT=TRUE Is_ULINT=TRUE Is_LWORD=TRUE To_REAL=1 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : BOOL := TRUE;
    To_SINT : SINT;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_UINT : UINT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_SINT := BOOL_TO_SINT(Source);
To_USINT := BOOL_TO_USINT(Source);
To_BYTE := BOOL_TO_BYTE(Source);
To_INT := BOOL_TO_INT(Source);
To_UINT := BOOL_TO_UINT(Source);
To_WORD := BOOL_TO_WORD(Source);
To_DINT := BOOL_TO_DINT(Source);
To_UDINT := BOOL_TO_UDINT(Source);
To_DWORD := BOOL_TO_DWORD(Source);
Is_TIME := BOOL_TO_TIME(Source) = T#1ms;
Is_LINT := BOOL_TO_LINT(Source) = 1;
Is_ULINT := BOOL_TO_ULINT(Source) = 1;
Is_LWORD := BOOL_TO_LWORD(Source) = 1;
To_REAL := BOOL_TO_REAL(Source);
Is_LREAL := BOOL_TO_LREAL(Source) = 1.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `1` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde SINT

Funciones: `SINT_TO_BOOL`, `SINT_TO_USINT`, `SINT_TO_BYTE`, `SINT_TO_INT`, `SINT_TO_UINT`, `SINT_TO_WORD`, `SINT_TO_DINT`, `SINT_TO_UDINT`, `SINT_TO_DWORD`, `SINT_TO_TIME`, `SINT_TO_LINT`, `SINT_TO_ULINT`, `SINT_TO_LWORD`, `SINT_TO_REAL`, `SINT_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_USINT=5 To_BYTE=5 To_INT=5 To_UINT=5 To_WORD=5 To_DINT=5 To_UDINT=5 To_DWORD=5 Is_TIME=TRUE Is_LINT=TRUE Is_ULINT=TRUE Is_LWORD=TRUE To_REAL=5 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : SINT := 5;
    To_BOOL : BOOL;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_UINT : UINT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := SINT_TO_BOOL(Source);
To_USINT := SINT_TO_USINT(Source);
To_BYTE := SINT_TO_BYTE(Source);
To_INT := SINT_TO_INT(Source);
To_UINT := SINT_TO_UINT(Source);
To_WORD := SINT_TO_WORD(Source);
To_DINT := SINT_TO_DINT(Source);
To_UDINT := SINT_TO_UDINT(Source);
To_DWORD := SINT_TO_DWORD(Source);
Is_TIME := SINT_TO_TIME(Source) = T#5ms;
Is_LINT := SINT_TO_LINT(Source) = 5;
Is_ULINT := SINT_TO_ULINT(Source) = 5;
Is_LWORD := SINT_TO_LWORD(Source) = 5;
To_REAL := SINT_TO_REAL(Source);
Is_LREAL := SINT_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde USINT

Funciones: `USINT_TO_BOOL`, `USINT_TO_SINT`, `USINT_TO_BYTE`, `USINT_TO_INT`, `USINT_TO_UINT`, `USINT_TO_WORD`, `USINT_TO_DINT`, `USINT_TO_UDINT`, `USINT_TO_DWORD`, `USINT_TO_TIME`, `USINT_TO_LINT`, `USINT_TO_ULINT`, `USINT_TO_LWORD`, `USINT_TO_REAL`, `USINT_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_BYTE=5 To_INT=5 To_UINT=5 To_WORD=5 To_DINT=5 To_UDINT=5 To_DWORD=5 Is_TIME=TRUE Is_LINT=TRUE Is_ULINT=TRUE Is_LWORD=TRUE To_REAL=5 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : USINT := 5;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_UINT : UINT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := USINT_TO_BOOL(Source);
To_SINT := USINT_TO_SINT(Source);
To_BYTE := USINT_TO_BYTE(Source);
To_INT := USINT_TO_INT(Source);
To_UINT := USINT_TO_UINT(Source);
To_WORD := USINT_TO_WORD(Source);
To_DINT := USINT_TO_DINT(Source);
To_UDINT := USINT_TO_UDINT(Source);
To_DWORD := USINT_TO_DWORD(Source);
Is_TIME := USINT_TO_TIME(Source) = T#5ms;
Is_LINT := USINT_TO_LINT(Source) = 5;
Is_ULINT := USINT_TO_ULINT(Source) = 5;
Is_LWORD := USINT_TO_LWORD(Source) = 5;
To_REAL := USINT_TO_REAL(Source);
Is_LREAL := USINT_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde BYTE

Funciones: `BYTE_TO_BOOL`, `BYTE_TO_SINT`, `BYTE_TO_USINT`, `BYTE_TO_INT`, `BYTE_TO_UINT`, `BYTE_TO_WORD`, `BYTE_TO_DINT`, `BYTE_TO_UDINT`, `BYTE_TO_DWORD`, `BYTE_TO_TIME`, `BYTE_TO_LINT`, `BYTE_TO_ULINT`, `BYTE_TO_LWORD`, `BYTE_TO_REAL`, `BYTE_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_USINT=5 To_INT=5 To_UINT=5 To_WORD=5 To_DINT=5 To_UDINT=5 To_DWORD=5 Is_TIME=TRUE Is_LINT=TRUE Is_ULINT=TRUE Is_LWORD=TRUE To_REAL=5 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : BYTE := 5;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_USINT : USINT;
    To_INT : INT;
    To_UINT : UINT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := BYTE_TO_BOOL(Source);
To_SINT := BYTE_TO_SINT(Source);
To_USINT := BYTE_TO_USINT(Source);
To_INT := BYTE_TO_INT(Source);
To_UINT := BYTE_TO_UINT(Source);
To_WORD := BYTE_TO_WORD(Source);
To_DINT := BYTE_TO_DINT(Source);
To_UDINT := BYTE_TO_UDINT(Source);
To_DWORD := BYTE_TO_DWORD(Source);
Is_TIME := BYTE_TO_TIME(Source) = T#5ms;
Is_LINT := BYTE_TO_LINT(Source) = 5;
Is_ULINT := BYTE_TO_ULINT(Source) = 5;
Is_LWORD := BYTE_TO_LWORD(Source) = 5;
To_REAL := BYTE_TO_REAL(Source);
Is_LREAL := BYTE_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde INT

Funciones: `INT_TO_BOOL`, `INT_TO_SINT`, `INT_TO_USINT`, `INT_TO_BYTE`, `INT_TO_UINT`, `INT_TO_WORD`, `INT_TO_DINT`, `INT_TO_UDINT`, `INT_TO_DWORD`, `INT_TO_TIME`, `INT_TO_LINT`, `INT_TO_ULINT`, `INT_TO_LWORD`, `INT_TO_REAL`, `INT_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_USINT=5 To_BYTE=5 To_UINT=5 To_WORD=5 To_DINT=5 To_UDINT=5 To_DWORD=5 Is_TIME=TRUE Is_LINT=TRUE Is_ULINT=TRUE Is_LWORD=TRUE To_REAL=5 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : INT := 5;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_UINT : UINT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := INT_TO_BOOL(Source);
To_SINT := INT_TO_SINT(Source);
To_USINT := INT_TO_USINT(Source);
To_BYTE := INT_TO_BYTE(Source);
To_UINT := INT_TO_UINT(Source);
To_WORD := INT_TO_WORD(Source);
To_DINT := INT_TO_DINT(Source);
To_UDINT := INT_TO_UDINT(Source);
To_DWORD := INT_TO_DWORD(Source);
Is_TIME := INT_TO_TIME(Source) = T#5ms;
Is_LINT := INT_TO_LINT(Source) = 5;
Is_ULINT := INT_TO_ULINT(Source) = 5;
Is_LWORD := INT_TO_LWORD(Source) = 5;
To_REAL := INT_TO_REAL(Source);
Is_LREAL := INT_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde UINT

Funciones: `UINT_TO_BOOL`, `UINT_TO_SINT`, `UINT_TO_USINT`, `UINT_TO_BYTE`, `UINT_TO_INT`, `UINT_TO_WORD`, `UINT_TO_DINT`, `UINT_TO_UDINT`, `UINT_TO_DWORD`, `UINT_TO_TIME`, `UINT_TO_LINT`, `UINT_TO_ULINT`, `UINT_TO_LWORD`, `UINT_TO_REAL`, `UINT_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_USINT=5 To_BYTE=5 To_INT=5 To_WORD=5 To_DINT=5 To_UDINT=5 To_DWORD=5 Is_TIME=TRUE Is_LINT=TRUE Is_ULINT=TRUE Is_LWORD=TRUE To_REAL=5 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : UINT := 5;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := UINT_TO_BOOL(Source);
To_SINT := UINT_TO_SINT(Source);
To_USINT := UINT_TO_USINT(Source);
To_BYTE := UINT_TO_BYTE(Source);
To_INT := UINT_TO_INT(Source);
To_WORD := UINT_TO_WORD(Source);
To_DINT := UINT_TO_DINT(Source);
To_UDINT := UINT_TO_UDINT(Source);
To_DWORD := UINT_TO_DWORD(Source);
Is_TIME := UINT_TO_TIME(Source) = T#5ms;
Is_LINT := UINT_TO_LINT(Source) = 5;
Is_ULINT := UINT_TO_ULINT(Source) = 5;
Is_LWORD := UINT_TO_LWORD(Source) = 5;
To_REAL := UINT_TO_REAL(Source);
Is_LREAL := UINT_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde WORD

Funciones: `WORD_TO_BOOL`, `WORD_TO_SINT`, `WORD_TO_USINT`, `WORD_TO_BYTE`, `WORD_TO_INT`, `WORD_TO_UINT`, `WORD_TO_DINT`, `WORD_TO_UDINT`, `WORD_TO_DWORD`, `WORD_TO_TIME`, `WORD_TO_LINT`, `WORD_TO_ULINT`, `WORD_TO_LWORD`, `WORD_TO_REAL`, `WORD_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_USINT=5 To_BYTE=5 To_INT=5 To_UINT=5 To_DINT=5 To_UDINT=5 To_DWORD=5 Is_TIME=TRUE Is_LINT=TRUE Is_ULINT=TRUE Is_LWORD=TRUE To_REAL=5 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : WORD := 5;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_UINT : UINT;
    To_DINT : DINT;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := WORD_TO_BOOL(Source);
To_SINT := WORD_TO_SINT(Source);
To_USINT := WORD_TO_USINT(Source);
To_BYTE := WORD_TO_BYTE(Source);
To_INT := WORD_TO_INT(Source);
To_UINT := WORD_TO_UINT(Source);
To_DINT := WORD_TO_DINT(Source);
To_UDINT := WORD_TO_UDINT(Source);
To_DWORD := WORD_TO_DWORD(Source);
Is_TIME := WORD_TO_TIME(Source) = T#5ms;
Is_LINT := WORD_TO_LINT(Source) = 5;
Is_ULINT := WORD_TO_ULINT(Source) = 5;
Is_LWORD := WORD_TO_LWORD(Source) = 5;
To_REAL := WORD_TO_REAL(Source);
Is_LREAL := WORD_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde DINT

Funciones: `DINT_TO_BOOL`, `DINT_TO_SINT`, `DINT_TO_USINT`, `DINT_TO_BYTE`, `DINT_TO_INT`, `DINT_TO_UINT`, `DINT_TO_WORD`, `DINT_TO_UDINT`, `DINT_TO_DWORD`, `DINT_TO_TIME`, `DINT_TO_LINT`, `DINT_TO_ULINT`, `DINT_TO_LWORD`, `DINT_TO_REAL`, `DINT_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_USINT=5 To_BYTE=5 To_INT=5 To_UINT=5 To_WORD=5 To_UDINT=5 To_DWORD=5 Is_TIME=TRUE Is_LINT=TRUE Is_ULINT=TRUE Is_LWORD=TRUE To_REAL=5 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : DINT := 5;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_UINT : UINT;
    To_WORD : WORD;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := DINT_TO_BOOL(Source);
To_SINT := DINT_TO_SINT(Source);
To_USINT := DINT_TO_USINT(Source);
To_BYTE := DINT_TO_BYTE(Source);
To_INT := DINT_TO_INT(Source);
To_UINT := DINT_TO_UINT(Source);
To_WORD := DINT_TO_WORD(Source);
To_UDINT := DINT_TO_UDINT(Source);
To_DWORD := DINT_TO_DWORD(Source);
Is_TIME := DINT_TO_TIME(Source) = T#5ms;
Is_LINT := DINT_TO_LINT(Source) = 5;
Is_ULINT := DINT_TO_ULINT(Source) = 5;
Is_LWORD := DINT_TO_LWORD(Source) = 5;
To_REAL := DINT_TO_REAL(Source);
Is_LREAL := DINT_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde UDINT

Funciones: `UDINT_TO_BOOL`, `UDINT_TO_SINT`, `UDINT_TO_USINT`, `UDINT_TO_BYTE`, `UDINT_TO_INT`, `UDINT_TO_UINT`, `UDINT_TO_WORD`, `UDINT_TO_DINT`, `UDINT_TO_DWORD`, `UDINT_TO_TIME`, `UDINT_TO_LINT`, `UDINT_TO_ULINT`, `UDINT_TO_LWORD`, `UDINT_TO_REAL`, `UDINT_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_USINT=5 To_BYTE=5 To_INT=5 To_UINT=5 To_WORD=5 To_DINT=5 To_DWORD=5 Is_TIME=TRUE Is_LINT=TRUE Is_ULINT=TRUE Is_LWORD=TRUE To_REAL=5 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : UDINT := 5;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_UINT : UINT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := UDINT_TO_BOOL(Source);
To_SINT := UDINT_TO_SINT(Source);
To_USINT := UDINT_TO_USINT(Source);
To_BYTE := UDINT_TO_BYTE(Source);
To_INT := UDINT_TO_INT(Source);
To_UINT := UDINT_TO_UINT(Source);
To_WORD := UDINT_TO_WORD(Source);
To_DINT := UDINT_TO_DINT(Source);
To_DWORD := UDINT_TO_DWORD(Source);
Is_TIME := UDINT_TO_TIME(Source) = T#5ms;
Is_LINT := UDINT_TO_LINT(Source) = 5;
Is_ULINT := UDINT_TO_ULINT(Source) = 5;
Is_LWORD := UDINT_TO_LWORD(Source) = 5;
To_REAL := UDINT_TO_REAL(Source);
Is_LREAL := UDINT_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde DWORD

Funciones: `DWORD_TO_BOOL`, `DWORD_TO_SINT`, `DWORD_TO_USINT`, `DWORD_TO_BYTE`, `DWORD_TO_INT`, `DWORD_TO_UINT`, `DWORD_TO_WORD`, `DWORD_TO_DINT`, `DWORD_TO_UDINT`, `DWORD_TO_TIME`, `DWORD_TO_LINT`, `DWORD_TO_ULINT`, `DWORD_TO_LWORD`, `DWORD_TO_REAL`, `DWORD_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_USINT=5 To_BYTE=5 To_INT=5 To_UINT=5 To_WORD=5 To_DINT=5 To_UDINT=5 Is_TIME=TRUE Is_LINT=TRUE Is_ULINT=TRUE Is_LWORD=TRUE To_REAL=5 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : DWORD := 5;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_UINT : UINT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_UDINT : UDINT;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := DWORD_TO_BOOL(Source);
To_SINT := DWORD_TO_SINT(Source);
To_USINT := DWORD_TO_USINT(Source);
To_BYTE := DWORD_TO_BYTE(Source);
To_INT := DWORD_TO_INT(Source);
To_UINT := DWORD_TO_UINT(Source);
To_WORD := DWORD_TO_WORD(Source);
To_DINT := DWORD_TO_DINT(Source);
To_UDINT := DWORD_TO_UDINT(Source);
Is_TIME := DWORD_TO_TIME(Source) = T#5ms;
Is_LINT := DWORD_TO_LINT(Source) = 5;
Is_ULINT := DWORD_TO_ULINT(Source) = 5;
Is_LWORD := DWORD_TO_LWORD(Source) = 5;
To_REAL := DWORD_TO_REAL(Source);
Is_LREAL := DWORD_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde TIME

Funciones: `TIME_TO_BOOL`, `TIME_TO_SINT`, `TIME_TO_USINT`, `TIME_TO_BYTE`, `TIME_TO_INT`, `TIME_TO_UINT`, `TIME_TO_WORD`, `TIME_TO_DINT`, `TIME_TO_UDINT`, `TIME_TO_DWORD`, `TIME_TO_LINT`, `TIME_TO_ULINT`, `TIME_TO_LWORD`, `TIME_TO_REAL`, `TIME_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_USINT=5 To_BYTE=5 To_INT=5 To_UINT=5 To_WORD=5 To_DINT=5 To_UDINT=5 To_DWORD=5 Is_LINT=TRUE Is_ULINT=TRUE Is_LWORD=TRUE To_REAL=5 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : TIME := T#5ms;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_UINT : UINT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := TIME_TO_BOOL(Source);
To_SINT := TIME_TO_SINT(Source);
To_USINT := TIME_TO_USINT(Source);
To_BYTE := TIME_TO_BYTE(Source);
To_INT := TIME_TO_INT(Source);
To_UINT := TIME_TO_UINT(Source);
To_WORD := TIME_TO_WORD(Source);
To_DINT := TIME_TO_DINT(Source);
To_UDINT := TIME_TO_UDINT(Source);
To_DWORD := TIME_TO_DWORD(Source);
Is_LINT := TIME_TO_LINT(Source) = 5;
Is_ULINT := TIME_TO_ULINT(Source) = 5;
Is_LWORD := TIME_TO_LWORD(Source) = 5;
To_REAL := TIME_TO_REAL(Source);
Is_LREAL := TIME_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde LINT

Funciones: `LINT_TO_BOOL`, `LINT_TO_SINT`, `LINT_TO_USINT`, `LINT_TO_BYTE`, `LINT_TO_INT`, `LINT_TO_UINT`, `LINT_TO_WORD`, `LINT_TO_DINT`, `LINT_TO_UDINT`, `LINT_TO_DWORD`, `LINT_TO_TIME`, `LINT_TO_ULINT`, `LINT_TO_LWORD`, `LINT_TO_REAL`, `LINT_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_USINT=5 To_BYTE=5 To_INT=5 To_UINT=5 To_WORD=5 To_DINT=5 To_UDINT=5 To_DWORD=5 Is_TIME=TRUE Is_ULINT=TRUE Is_LWORD=TRUE To_REAL=5 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : LINT := 5;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_UINT : UINT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := LINT_TO_BOOL(Source);
To_SINT := LINT_TO_SINT(Source);
To_USINT := LINT_TO_USINT(Source);
To_BYTE := LINT_TO_BYTE(Source);
To_INT := LINT_TO_INT(Source);
To_UINT := LINT_TO_UINT(Source);
To_WORD := LINT_TO_WORD(Source);
To_DINT := LINT_TO_DINT(Source);
To_UDINT := LINT_TO_UDINT(Source);
To_DWORD := LINT_TO_DWORD(Source);
Is_TIME := LINT_TO_TIME(Source) = T#5ms;
Is_ULINT := LINT_TO_ULINT(Source) = 5;
Is_LWORD := LINT_TO_LWORD(Source) = 5;
To_REAL := LINT_TO_REAL(Source);
Is_LREAL := LINT_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde ULINT

Funciones: `ULINT_TO_BOOL`, `ULINT_TO_SINT`, `ULINT_TO_USINT`, `ULINT_TO_BYTE`, `ULINT_TO_INT`, `ULINT_TO_UINT`, `ULINT_TO_WORD`, `ULINT_TO_DINT`, `ULINT_TO_UDINT`, `ULINT_TO_DWORD`, `ULINT_TO_TIME`, `ULINT_TO_LINT`, `ULINT_TO_LWORD`, `ULINT_TO_REAL`, `ULINT_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_USINT=5 To_BYTE=5 To_INT=5 To_UINT=5 To_WORD=5 To_DINT=5 To_UDINT=5 To_DWORD=5 Is_TIME=TRUE Is_LINT=TRUE Is_LWORD=TRUE To_REAL=5 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : ULINT := 5;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_UINT : UINT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := ULINT_TO_BOOL(Source);
To_SINT := ULINT_TO_SINT(Source);
To_USINT := ULINT_TO_USINT(Source);
To_BYTE := ULINT_TO_BYTE(Source);
To_INT := ULINT_TO_INT(Source);
To_UINT := ULINT_TO_UINT(Source);
To_WORD := ULINT_TO_WORD(Source);
To_DINT := ULINT_TO_DINT(Source);
To_UDINT := ULINT_TO_UDINT(Source);
To_DWORD := ULINT_TO_DWORD(Source);
Is_TIME := ULINT_TO_TIME(Source) = T#5ms;
Is_LINT := ULINT_TO_LINT(Source) = 5;
Is_LWORD := ULINT_TO_LWORD(Source) = 5;
To_REAL := ULINT_TO_REAL(Source);
Is_LREAL := ULINT_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde LWORD

Funciones: `LWORD_TO_BOOL`, `LWORD_TO_SINT`, `LWORD_TO_USINT`, `LWORD_TO_BYTE`, `LWORD_TO_INT`, `LWORD_TO_UINT`, `LWORD_TO_WORD`, `LWORD_TO_DINT`, `LWORD_TO_UDINT`, `LWORD_TO_DWORD`, `LWORD_TO_TIME`, `LWORD_TO_LINT`, `LWORD_TO_ULINT`, `LWORD_TO_REAL`, `LWORD_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_USINT=5 To_BYTE=5 To_INT=5 To_UINT=5 To_WORD=5 To_DINT=5 To_UDINT=5 To_DWORD=5 Is_TIME=TRUE Is_LINT=TRUE Is_ULINT=TRUE To_REAL=5 Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : LWORD := 5;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_UINT : UINT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    To_REAL : REAL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := LWORD_TO_BOOL(Source);
To_SINT := LWORD_TO_SINT(Source);
To_USINT := LWORD_TO_USINT(Source);
To_BYTE := LWORD_TO_BYTE(Source);
To_INT := LWORD_TO_INT(Source);
To_UINT := LWORD_TO_UINT(Source);
To_WORD := LWORD_TO_WORD(Source);
To_DINT := LWORD_TO_DINT(Source);
To_UDINT := LWORD_TO_UDINT(Source);
To_DWORD := LWORD_TO_DWORD(Source);
Is_TIME := LWORD_TO_TIME(Source) = T#5ms;
Is_LINT := LWORD_TO_LINT(Source) = 5;
Is_ULINT := LWORD_TO_ULINT(Source) = 5;
To_REAL := LWORD_TO_REAL(Source);
Is_LREAL := LWORD_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde REAL

Funciones: `REAL_TO_BOOL`, `REAL_TO_SINT`, `REAL_TO_USINT`, `REAL_TO_BYTE`, `REAL_TO_INT`, `REAL_TO_UINT`, `REAL_TO_WORD`, `REAL_TO_DINT`, `REAL_TO_UDINT`, `REAL_TO_DWORD`, `REAL_TO_TIME`, `REAL_TO_LINT`, `REAL_TO_ULINT`, `REAL_TO_LWORD`, `REAL_TO_LREAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_USINT=5 To_BYTE=5 To_INT=5 To_UINT=5 To_WORD=5 To_DINT=5 To_UDINT=5 To_DWORD=5 Is_TIME=TRUE Is_LINT=TRUE Is_ULINT=TRUE Is_LWORD=TRUE Is_LREAL=TRUE"
PROGRAM Example
VAR
    Source : REAL := 5.0;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_UINT : UINT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    Is_LREAL : BOOL;
END_VAR

To_BOOL := REAL_TO_BOOL(Source);
To_SINT := REAL_TO_SINT(Source);
To_USINT := REAL_TO_USINT(Source);
To_BYTE := REAL_TO_BYTE(Source);
To_INT := REAL_TO_INT(Source);
To_UINT := REAL_TO_UINT(Source);
To_WORD := REAL_TO_WORD(Source);
To_DINT := REAL_TO_DINT(Source);
To_UDINT := REAL_TO_UDINT(Source);
To_DWORD := REAL_TO_DWORD(Source);
Is_TIME := REAL_TO_TIME(Source) = T#5ms;
Is_LINT := REAL_TO_LINT(Source) = 5;
Is_ULINT := REAL_TO_ULINT(Source) = 5;
Is_LWORD := REAL_TO_LWORD(Source) = 5;
Is_LREAL := REAL_TO_LREAL(Source) = 5.0;
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

### Desde LREAL

Funciones: `LREAL_TO_BOOL`, `LREAL_TO_SINT`, `LREAL_TO_USINT`, `LREAL_TO_BYTE`, `LREAL_TO_INT`, `LREAL_TO_UINT`, `LREAL_TO_WORD`, `LREAL_TO_DINT`, `LREAL_TO_UDINT`, `LREAL_TO_DWORD`, `LREAL_TO_TIME`, `LREAL_TO_LINT`, `LREAL_TO_ULINT`, `LREAL_TO_LWORD`, `LREAL_TO_REAL`.

```pascal runnable expect="To_BOOL=TRUE To_SINT=5 To_USINT=5 To_BYTE=5 To_INT=5 To_UINT=5 To_WORD=5 To_DINT=5 To_UDINT=5 To_DWORD=5 Is_TIME=TRUE Is_LINT=TRUE Is_ULINT=TRUE Is_LWORD=TRUE To_REAL=5"
PROGRAM Example
VAR
    Source : LREAL := 5.0;
    To_BOOL : BOOL;
    To_SINT : SINT;
    To_USINT : USINT;
    To_BYTE : BYTE;
    To_INT : INT;
    To_UINT : UINT;
    To_WORD : WORD;
    To_DINT : DINT;
    To_UDINT : UDINT;
    To_DWORD : DWORD;
    Is_TIME : BOOL;
    Is_LINT : BOOL;
    Is_ULINT : BOOL;
    Is_LWORD : BOOL;
    To_REAL : REAL;
END_VAR

To_BOOL := LREAL_TO_BOOL(Source);
To_SINT := LREAL_TO_SINT(Source);
To_USINT := LREAL_TO_USINT(Source);
To_BYTE := LREAL_TO_BYTE(Source);
To_INT := LREAL_TO_INT(Source);
To_UINT := LREAL_TO_UINT(Source);
To_WORD := LREAL_TO_WORD(Source);
To_DINT := LREAL_TO_DINT(Source);
To_UDINT := LREAL_TO_UDINT(Source);
To_DWORD := LREAL_TO_DWORD(Source);
Is_TIME := LREAL_TO_TIME(Source) = T#5ms;
Is_LINT := LREAL_TO_LINT(Source) = 5;
Is_ULINT := LREAL_TO_ULINT(Source) = 5;
Is_LWORD := LREAL_TO_LWORD(Source) = 5;
To_REAL := LREAL_TO_REAL(Source);
END_PROGRAM
```

Resultado tras un ciclo: cada variable `To_*` vale `5` (`To_BOOL` vale `TRUE`) y cada variable `Is_*` vale `TRUE`.

{/* <<< END GENERATED: reference/functions <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
