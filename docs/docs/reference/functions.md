---
title: "Function reference"
sidebar_label: "Functions"
description: "Every function of the ZPLC compiler registry: signature, behaviour and an example that CI runs."
tags: [reference, generated]
---

# Function reference

{/* >>> GENERATED (tools/docs/generate_function_reference.ts): reference/functions. Do not edit. >>> */}

Every function of the compiler registry, with its signature, what it does and an example. The registry has 297 functions: the 57 named functions below and the 240 type conversions. `ANY`, `ANY_NUM`, `ANY_INT` and `ANY_BIT` stand for the family of types that the function accepts. The language elements that call them are in the [languages overview](../languages/index.md); the blocks with state are in the [function-block reference](./function-blocks.md).

Every example is a complete program. CI compiles it and runs it on the native POSIX runtime, and the result stated under it is the value that the run checks.

## Selection and limits

### MAX

`MAX(IN1 : ANY_NUM, IN2 : ANY_NUM) : ANY_NUM`

Returns the larger of two values.

```pascal runnable expect="Result=7"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := MAX(3, 7);
END_PROGRAM
```

Result after one scan: `Result` = `7`.

### MIN

`MIN(IN1 : ANY_NUM, IN2 : ANY_NUM) : ANY_NUM`

Returns the smaller of two values.

```pascal runnable expect="Result=3"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := MIN(3, 7);
END_PROGRAM
```

Result after one scan: `Result` = `3`.

### LIMIT

`LIMIT(MN : ANY_NUM, IN : ANY_NUM, MX : ANY_NUM) : ANY_NUM`

Clamps IN between the minimum MN and the maximum MX.

```pascal runnable expect="Result=10"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := LIMIT(0, 15, 10);
END_PROGRAM
```

Result after one scan: `Result` = `10`.

### SEL

`SEL(G : BOOL, IN0 : ANY, IN1 : ANY) : ANY`

Returns IN0 when G is FALSE and IN1 when G is TRUE.

```pascal runnable expect="Result=20"
PROGRAM Example
VAR
    Choice : BOOL := TRUE;
    Result : INT;
END_VAR

Result := SEL(Choice, 10, 20);
END_PROGRAM
```

Result after one scan: `Result` = `20`.

### MUX

`MUX(K : INT, IN0 : ANY, IN1 : ANY, ...) : ANY`

Returns the input that K selects: IN0 for 0, IN1 for 1, and so on, up to eight inputs.

```pascal runnable expect="Result=30"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := MUX(2, 10, 20, 30);
END_PROGRAM
```

Result after one scan: `Result` = `30`.

## Logic

### NAND

`NAND(IN1 : BOOL, IN2 : BOOL) : BOOL`

Returns NOT (IN1 AND IN2): FALSE only when both inputs are TRUE.

```pascal runnable expect="Result=FALSE"
PROGRAM Example
VAR
    Result : BOOL;
END_VAR

Result := NAND(TRUE, TRUE);
END_PROGRAM
```

Result after one scan: `Result` = `FALSE`.

### NOR

`NOR(IN1 : BOOL, IN2 : BOOL) : BOOL`

Returns NOT (IN1 OR IN2): TRUE only when both inputs are FALSE.

```pascal runnable expect="Result=TRUE"
PROGRAM Example
VAR
    Result : BOOL;
END_VAR

Result := NOR(FALSE, FALSE);
END_PROGRAM
```

Result after one scan: `Result` = `TRUE`.

## Bit shifts and bitwise logic

### ROL

`ROL(IN : DWORD, N : INT) : DWORD`

Rotates the 32 bits of IN left by N places; the bits that leave on the left enter on the right.

```pascal runnable expect="Result=3"
PROGRAM Example
VAR
    Value : DWORD := 16#80000001;
    Result : DWORD;
END_VAR

Result := ROL(Value, 1);
END_PROGRAM
```

Result after one scan: `Result` = `3`.

### ROR

`ROR(IN : DWORD, N : INT) : DWORD`

Rotates the 32 bits of IN right by N places; the bits that leave on the right enter on the left.

```pascal runnable expect="Result=2147483649"
PROGRAM Example
VAR
    Result : DWORD;
END_VAR

Result := ROR(16#00000003, 1);
END_PROGRAM
```

Result after one scan: `Result` = `2147483649`.

### SHL

`SHL(IN : ANY_BIT, N : INT) : ANY_BIT`

Shifts IN left by N places; zeros enter on the right.

```pascal runnable expect="Result=16"
PROGRAM Example
VAR
    Result : WORD;
END_VAR

Result := SHL(16#0001, 4);
END_PROGRAM
```

Result after one scan: `Result` = `16`.

### SHR

`SHR(IN : ANY_BIT, N : INT) : ANY_BIT`

Shifts IN right by N places; zeros enter on the left.

```pascal runnable expect="Result=1"
PROGRAM Example
VAR
    Result : WORD;
END_VAR

Result := SHR(16#0010, 4);
END_PROGRAM
```

Result after one scan: `Result` = `1`.

### AND_WORD

`AND_WORD(IN1 : WORD, IN2 : WORD) : WORD`

Bitwise AND of two 16-bit words.

```pascal runnable expect="Result=3840"
PROGRAM Example
VAR
    Result : WORD;
END_VAR

Result := AND_WORD(16#FF0F, 16#0FF0);
END_PROGRAM
```

Result after one scan: `Result` = `3840`.

### OR_WORD

`OR_WORD(IN1 : WORD, IN2 : WORD) : WORD`

Bitwise OR of two 16-bit words.

```pascal runnable expect="Result=61455"
PROGRAM Example
VAR
    Result : WORD;
END_VAR

Result := OR_WORD(16#F000, 16#000F);
END_PROGRAM
```

Result after one scan: `Result` = `61455`.

### XOR_WORD

`XOR_WORD(IN1 : WORD, IN2 : WORD) : WORD`

Bitwise exclusive OR of two 16-bit words.

```pascal runnable expect="Result=61680"
PROGRAM Example
VAR
    Result : WORD;
END_VAR

Result := XOR_WORD(16#FF00, 16#0FF0);
END_PROGRAM
```

Result after one scan: `Result` = `61680`.

### NOT_WORD

`NOT_WORD(IN : WORD) : WORD`

Bitwise complement of a 16-bit word.

```pascal runnable expect="Result=65280"
PROGRAM Example
VAR
    Result : WORD;
END_VAR

Result := NOT_WORD(16#00FF);
END_PROGRAM
```

Result after one scan: `Result` = `65280`.

### AND_DWORD

`AND_DWORD(IN1 : DWORD, IN2 : DWORD) : DWORD`

Bitwise AND of two 32-bit words.

```pascal runnable expect="Result=267386880"
PROGRAM Example
VAR
    Result : DWORD;
END_VAR

Result := AND_DWORD(16#FFFF0000, 16#0FF00FF0);
END_PROGRAM
```

Result after one scan: `Result` = `267386880`.

### OR_DWORD

`OR_DWORD(IN1 : DWORD, IN2 : DWORD) : DWORD`

Bitwise OR of two 32-bit words.

```pascal runnable expect="Result=16711935"
PROGRAM Example
VAR
    Result : DWORD;
END_VAR

Result := OR_DWORD(16#00FF0000, 16#000000FF);
END_PROGRAM
```

Result after one scan: `Result` = `16711935`.

### XOR_DWORD

`XOR_DWORD(IN1 : DWORD, IN2 : DWORD) : DWORD`

Bitwise exclusive OR of two 32-bit words.

```pascal runnable expect="Result=16776960"
PROGRAM Example
VAR
    Result : DWORD;
END_VAR

Result := XOR_DWORD(16#0000FFFF, 16#00FF00FF);
END_PROGRAM
```

Result after one scan: `Result` = `16776960`.

### NOT_DWORD

`NOT_DWORD(IN : DWORD) : DWORD`

Bitwise complement of a 32-bit word.

```pascal runnable expect="Result=4294901760"
PROGRAM Example
VAR
    Result : DWORD;
END_VAR

Result := NOT_DWORD(16#0000FFFF);
END_PROGRAM
```

Result after one scan: `Result` = `4294901760`.

## Arithmetic

### ABS

`ABS(IN : ANY_NUM) : ANY_NUM`

Returns the absolute value of an integer or of a real.

```pascal runnable expect="Result=5"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := ABS(-5);
END_PROGRAM
```

Result after one scan: `Result` = `5`.

### ABSF

`ABSF(IN : REAL) : REAL`

Returns the absolute value of a REAL.

```pascal runnable expect="Result=2.5"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := ABSF(-2.5);
END_PROGRAM
```

Result after one scan: `Result` = `2.5`.

### NEG

`NEG(IN : ANY_NUM) : ANY_NUM`

Returns the negation of an integer, -IN.

```pascal runnable expect="Result=-5"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := NEG(5);
END_PROGRAM
```

Result after one scan: `Result` = `-5`.

### NEGF

`NEGF(IN : REAL) : REAL`

Returns the negation of a REAL, -IN.

```pascal runnable expect="Result=-2.5"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := NEGF(2.5);
END_PROGRAM
```

Result after one scan: `Result` = `-2.5`.

### MOD

`MOD(IN1 : ANY_INT, IN2 : ANY_INT) : ANY_INT`

The remainder of IN1 divided by IN2. It is registered as a function, but ST reads MOD as an operator: write `IN1 MOD IN2`; the call form `MOD(IN1, IN2)` does not parse.

```pascal runnable expect="Result=2"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := 17 MOD 5;
END_PROGRAM
```

Result after one scan: `Result` = `2`.

### SQRT

`SQRT(IN : REAL) : REAL`

Returns the square root of a REAL; 0.0 for an input of 0.0 or below.

```pascal runnable expect="Result=4"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := SQRT(16.0);
END_PROGRAM
```

Result after one scan: `Result` = `4`.

### EXPT

`EXPT(BASE : REAL, EXP : REAL) : REAL`

Returns BASE raised to EXP, as the operator `**` does.

```pascal runnable expect="Result=1024"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := EXPT(2.0, 10.0);
END_PROGRAM
```

Result after one scan: `Result` = `1024`.

## Rounding

### TRUNC

`TRUNC(IN : REAL) : REAL`

Removes the fractional part of a REAL, toward zero, and keeps it a REAL.

```pascal runnable expect="Result=2"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := TRUNC(2.7);
END_PROGRAM
```

Result after one scan: `Result` = `2`.

### ROUND

`ROUND(IN : REAL) : REAL`

Rounds a REAL to the nearest whole number, an exact half away from zero, and keeps it a REAL.

```pascal runnable expect="Result=3"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := ROUND(2.5);
END_PROGRAM
```

Result after one scan: `Result` = `3`.

## Trigonometry

### SIN

`SIN(IN : REAL) : REAL`

Sine of an angle in radians.

```pascal runnable expect="Result=1000"
PROGRAM Example
VAR
    Result : INT;
END_VAR

(* sine of a quarter turn, in thousandths *)
Result := REAL_TO_INT(SIN(1.5707964) * 1000.0);
END_PROGRAM
```

Result after one scan: `Result` = `1000`.

### COS

`COS(IN : REAL) : REAL`

Cosine of an angle in radians.

```pascal runnable expect="Result=1"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := COS(0.0);
END_PROGRAM
```

Result after one scan: `Result` = `1`.

### TAN

`TAN(IN : REAL) : REAL`

Tangent of an angle in radians.

```pascal runnable expect="Result=0"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := TAN(0.0);
END_PROGRAM
```

Result after one scan: `Result` = `0`.

### ASIN

`ASIN(IN : REAL) : REAL`

Arc sine, in radians, of a value from -1.0 to 1.0.

```pascal runnable expect="Result=1571"
PROGRAM Example
VAR
    Result : INT;
END_VAR

(* a quarter turn, in thousandths of a radian *)
Result := REAL_TO_INT(ASIN(1.0) * 1000.0);
END_PROGRAM
```

Result after one scan: `Result` = `1571`.

### ACOS

`ACOS(IN : REAL) : REAL`

Arc cosine, in radians, of a value from -1.0 to 1.0.

```pascal runnable expect="Result=0"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := ACOS(1.0);
END_PROGRAM
```

Result after one scan: `Result` = `0`.

### ATAN

`ATAN(IN : REAL) : REAL`

Arc tangent, in radians, of any REAL.

```pascal runnable expect="Result=785"
PROGRAM Example
VAR
    Result : INT;
END_VAR

(* an eighth of a turn, in thousandths of a radian *)
Result := REAL_TO_INT(ATAN(1.0) * 1000.0);
END_PROGRAM
```

Result after one scan: `Result` = `785`.

### ATAN2

`ATAN2(Y : REAL, X : REAL) : REAL`

Angle in radians of the point (X, Y) from the positive X axis, in the quadrant of the signs of X and Y.

```pascal runnable expect="Result=785"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := REAL_TO_INT(ATAN2(1.0, 1.0) * 1000.0);
END_PROGRAM
```

Result after one scan: `Result` = `785`.

## Logarithms and exponentials

### LN

`LN(IN : REAL) : REAL`

Natural logarithm of a REAL.

```pascal runnable expect="Result=0"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := LN(1.0);
END_PROGRAM
```

Result after one scan: `Result` = `0`.

### LOG

`LOG(IN : REAL) : REAL`

Logarithm to base 10 of a REAL.

```pascal runnable expect="Result=3"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := REAL_TO_INT(LOG(1000.0));
END_PROGRAM
```

Result after one scan: `Result` = `3`.

### EXP

`EXP(IN : REAL) : REAL`

The number e raised to IN.

```pascal runnable expect="Result=1"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := EXP(0.0);
END_PROGRAM
```

Result after one scan: `Result` = `1`.

## Scaling

### NORM_X

`NORM_X(MIN : REAL, X : REAL, MAX : REAL) : REAL`

Maps X from the range MIN to MAX onto 0.0 to 1.0; 0.0 when the range is empty.

```pascal runnable expect="Result=0.25"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := NORM_X(0.0, 25.0, 100.0);
END_PROGRAM
```

Result after one scan: `Result` = `0.25`.

### SCALE_X

`SCALE_X(MIN : REAL, X : REAL, MAX : REAL) : REAL`

Maps X from 0.0 to 1.0 onto the range MIN to MAX: MIN + X * (MAX - MIN).

```pascal runnable expect="Result=100"
PROGRAM Example
VAR
    Result : REAL;
END_VAR

Result := SCALE_X(0.0, 0.5, 200.0);
END_PROGRAM
```

Result after one scan: `Result` = `100`.

## Strings

### LEN

`LEN(S : STRING) : INT`

Number of characters of a string.

```pascal runnable expect="Result=5"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := LEN('HELLO');
END_PROGRAM
```

Result after one scan: `Result` = `5`.

### CONCAT

`CONCAT(S1 : STRING, S2 : STRING) : STRING`

Joins S2 to the end of S1.

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

Result after one scan: `Same` = `TRUE`.

### LEFT

`LEFT(S : STRING, N : INT) : STRING`

The N leftmost characters of S.

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

Result after one scan: `Same` = `TRUE`.

### RIGHT

`RIGHT(S : STRING, N : INT) : STRING`

The N rightmost characters of S.

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

Result after one scan: `Same` = `TRUE`.

### MID

`MID(S : STRING, POS : INT, N : INT) : STRING`

N characters of S from the 1-based position POS. The position comes before the count, which is the reverse of IEC 61131-3.

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

Result after one scan: `Same` = `TRUE`.

### FIND

`FIND(S1 : STRING, S2 : STRING) : INT`

The 1-based position of the first S2 inside S1, or 0 when it is not there.

```pascal runnable expect="Result=3"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := FIND('HELLO', 'L');
END_PROGRAM
```

Result after one scan: `Result` = `3`.

### INSERT

`INSERT(S1 : STRING, S2 : STRING, POS : INT) : STRING`

A new string with S2 inserted into S1 after the POS-th character; S1 does not change.

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

Result after one scan: `Same` = `TRUE`.

### DELETE

`DELETE(S : STRING, POS : INT, N : INT) : STRING`

S without N characters from the 1-based position POS. The position comes before the count, which is the reverse of IEC 61131-3.

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

Result after one scan: `Same` = `TRUE`.

### REPLACE

`REPLACE(S1 : STRING, S2 : STRING, POS : INT, N : INT) : STRING`

S1 with N characters from the 1-based position POS replaced by S2. The position comes before the count, which is the reverse of IEC 61131-3.

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

Result after one scan: `Same` = `TRUE`.

### STRCMP

`STRCMP(S1 : STRING, S2 : STRING) : INT`

Compares two strings: -1 when S1 is before S2, 0 when they are equal, 1 when S1 is after S2.

```pascal runnable expect="Result=-1"
PROGRAM Example
VAR
    Result : INT;
END_VAR

Result := STRCMP('A', 'B');
END_PROGRAM
```

Result after one scan: `Result` = `-1`.

### COPY

`COPY(SRC : STRING, DST : STRING) : STRING`

Copies SRC into DST and returns DST.

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

Result after one scan: `Same` = `TRUE`.

### CLEAR

`CLEAR(S : STRING) : STRING`

Makes S the empty string and returns it.

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

Result after one scan: `Result` = `0`.

### EQ_STRING

`EQ_STRING(S1 : STRING, S2 : STRING) : BOOL`

TRUE when the two strings are equal.

```pascal runnable expect="Result=TRUE"
PROGRAM Example
VAR
    Result : BOOL;
END_VAR

Result := EQ_STRING('A', 'A');
END_PROGRAM
```

Result after one scan: `Result` = `TRUE`.

### NE_STRING

`NE_STRING(S1 : STRING, S2 : STRING) : BOOL`

TRUE when the two strings differ.

```pascal runnable expect="Result=TRUE"
PROGRAM Example
VAR
    Result : BOOL;
END_VAR

Result := NE_STRING('A', 'B');
END_PROGRAM
```

Result after one scan: `Result` = `TRUE`.

## System

### UPTIME

`UPTIME() : DINT`

Milliseconds since the runtime started.

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

Result after 30 scans of 10 ms: `Running` = `TRUE`.

### CYCLE_TIME

`CYCLE_TIME() : DINT`

Microseconds that the previous scan of the task took.

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

Result after 3 scans of 10 ms: `Valid` = `TRUE`.

### WATCHDOG_RESET

`WATCHDOG_RESET()`

A compatibility stub: it does nothing and is not a safety control.

```pascal runnable expect="Count=1"
PROGRAM Example
VAR
    Count : INT;
END_VAR

WATCHDOG_RESET();
Count := Count + 1;
END_PROGRAM
```

Result after one scan: `Count` = `1`.

## Type conversions

A conversion function exists for every ordered pair of different types among `BOOL`, `SINT`, `USINT`, `BYTE`, `INT`, `UINT`, `WORD`, `DINT`, `UDINT`, `DWORD`, `TIME`, `LINT`, `ULINT`, `LWORD`, `REAL`, `LREAL`: 240 functions, named `<FROM>_TO_<TO>` (`INT_TO_REAL`, `LREAL_TO_DINT`). `DATE`, `TOD` and `DT` have none yet. What a conversion does with a value that its destination cannot hold depends on the pair:

| From | To | Result |
| --- | --- | --- |
| An integer | A wider integer or the same width | The value keeps its value. |
| An integer | A narrower integer, or the other signedness | The low bits (two's complement wrap): `INT_TO_SINT(300)` is 44, `INT_TO_UINT(-1)` is 65535. |
| An integer or TIME | BOOL | FALSE for 0, TRUE for any other value. |
| BOOL | A numeric type | 0 or 1. |
| An integer | REAL or LREAL | The nearest representable value. |
| REAL or LREAL | An integer | The nearest integer, an exact half to the even integer (2.5 gives 2, 3.5 gives 4); a value out of range gives the nearest limit of the destination; NaN gives 0. |
| REAL or LREAL | BOOL | FALSE for 0.0 and -0.0, TRUE for any other value, NaN included. |
| TIME | A numeric type | Its count of milliseconds, as an unsigned 32-bit integer. |

### From BOOL

Functions: `BOOL_TO_SINT`, `BOOL_TO_USINT`, `BOOL_TO_BYTE`, `BOOL_TO_INT`, `BOOL_TO_UINT`, `BOOL_TO_WORD`, `BOOL_TO_DINT`, `BOOL_TO_UDINT`, `BOOL_TO_DWORD`, `BOOL_TO_TIME`, `BOOL_TO_LINT`, `BOOL_TO_ULINT`, `BOOL_TO_LWORD`, `BOOL_TO_REAL`, `BOOL_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `1` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From SINT

Functions: `SINT_TO_BOOL`, `SINT_TO_USINT`, `SINT_TO_BYTE`, `SINT_TO_INT`, `SINT_TO_UINT`, `SINT_TO_WORD`, `SINT_TO_DINT`, `SINT_TO_UDINT`, `SINT_TO_DWORD`, `SINT_TO_TIME`, `SINT_TO_LINT`, `SINT_TO_ULINT`, `SINT_TO_LWORD`, `SINT_TO_REAL`, `SINT_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From USINT

Functions: `USINT_TO_BOOL`, `USINT_TO_SINT`, `USINT_TO_BYTE`, `USINT_TO_INT`, `USINT_TO_UINT`, `USINT_TO_WORD`, `USINT_TO_DINT`, `USINT_TO_UDINT`, `USINT_TO_DWORD`, `USINT_TO_TIME`, `USINT_TO_LINT`, `USINT_TO_ULINT`, `USINT_TO_LWORD`, `USINT_TO_REAL`, `USINT_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From BYTE

Functions: `BYTE_TO_BOOL`, `BYTE_TO_SINT`, `BYTE_TO_USINT`, `BYTE_TO_INT`, `BYTE_TO_UINT`, `BYTE_TO_WORD`, `BYTE_TO_DINT`, `BYTE_TO_UDINT`, `BYTE_TO_DWORD`, `BYTE_TO_TIME`, `BYTE_TO_LINT`, `BYTE_TO_ULINT`, `BYTE_TO_LWORD`, `BYTE_TO_REAL`, `BYTE_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From INT

Functions: `INT_TO_BOOL`, `INT_TO_SINT`, `INT_TO_USINT`, `INT_TO_BYTE`, `INT_TO_UINT`, `INT_TO_WORD`, `INT_TO_DINT`, `INT_TO_UDINT`, `INT_TO_DWORD`, `INT_TO_TIME`, `INT_TO_LINT`, `INT_TO_ULINT`, `INT_TO_LWORD`, `INT_TO_REAL`, `INT_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From UINT

Functions: `UINT_TO_BOOL`, `UINT_TO_SINT`, `UINT_TO_USINT`, `UINT_TO_BYTE`, `UINT_TO_INT`, `UINT_TO_WORD`, `UINT_TO_DINT`, `UINT_TO_UDINT`, `UINT_TO_DWORD`, `UINT_TO_TIME`, `UINT_TO_LINT`, `UINT_TO_ULINT`, `UINT_TO_LWORD`, `UINT_TO_REAL`, `UINT_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From WORD

Functions: `WORD_TO_BOOL`, `WORD_TO_SINT`, `WORD_TO_USINT`, `WORD_TO_BYTE`, `WORD_TO_INT`, `WORD_TO_UINT`, `WORD_TO_DINT`, `WORD_TO_UDINT`, `WORD_TO_DWORD`, `WORD_TO_TIME`, `WORD_TO_LINT`, `WORD_TO_ULINT`, `WORD_TO_LWORD`, `WORD_TO_REAL`, `WORD_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From DINT

Functions: `DINT_TO_BOOL`, `DINT_TO_SINT`, `DINT_TO_USINT`, `DINT_TO_BYTE`, `DINT_TO_INT`, `DINT_TO_UINT`, `DINT_TO_WORD`, `DINT_TO_UDINT`, `DINT_TO_DWORD`, `DINT_TO_TIME`, `DINT_TO_LINT`, `DINT_TO_ULINT`, `DINT_TO_LWORD`, `DINT_TO_REAL`, `DINT_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From UDINT

Functions: `UDINT_TO_BOOL`, `UDINT_TO_SINT`, `UDINT_TO_USINT`, `UDINT_TO_BYTE`, `UDINT_TO_INT`, `UDINT_TO_UINT`, `UDINT_TO_WORD`, `UDINT_TO_DINT`, `UDINT_TO_DWORD`, `UDINT_TO_TIME`, `UDINT_TO_LINT`, `UDINT_TO_ULINT`, `UDINT_TO_LWORD`, `UDINT_TO_REAL`, `UDINT_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From DWORD

Functions: `DWORD_TO_BOOL`, `DWORD_TO_SINT`, `DWORD_TO_USINT`, `DWORD_TO_BYTE`, `DWORD_TO_INT`, `DWORD_TO_UINT`, `DWORD_TO_WORD`, `DWORD_TO_DINT`, `DWORD_TO_UDINT`, `DWORD_TO_TIME`, `DWORD_TO_LINT`, `DWORD_TO_ULINT`, `DWORD_TO_LWORD`, `DWORD_TO_REAL`, `DWORD_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From TIME

Functions: `TIME_TO_BOOL`, `TIME_TO_SINT`, `TIME_TO_USINT`, `TIME_TO_BYTE`, `TIME_TO_INT`, `TIME_TO_UINT`, `TIME_TO_WORD`, `TIME_TO_DINT`, `TIME_TO_UDINT`, `TIME_TO_DWORD`, `TIME_TO_LINT`, `TIME_TO_ULINT`, `TIME_TO_LWORD`, `TIME_TO_REAL`, `TIME_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From LINT

Functions: `LINT_TO_BOOL`, `LINT_TO_SINT`, `LINT_TO_USINT`, `LINT_TO_BYTE`, `LINT_TO_INT`, `LINT_TO_UINT`, `LINT_TO_WORD`, `LINT_TO_DINT`, `LINT_TO_UDINT`, `LINT_TO_DWORD`, `LINT_TO_TIME`, `LINT_TO_ULINT`, `LINT_TO_LWORD`, `LINT_TO_REAL`, `LINT_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From ULINT

Functions: `ULINT_TO_BOOL`, `ULINT_TO_SINT`, `ULINT_TO_USINT`, `ULINT_TO_BYTE`, `ULINT_TO_INT`, `ULINT_TO_UINT`, `ULINT_TO_WORD`, `ULINT_TO_DINT`, `ULINT_TO_UDINT`, `ULINT_TO_DWORD`, `ULINT_TO_TIME`, `ULINT_TO_LINT`, `ULINT_TO_LWORD`, `ULINT_TO_REAL`, `ULINT_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From LWORD

Functions: `LWORD_TO_BOOL`, `LWORD_TO_SINT`, `LWORD_TO_USINT`, `LWORD_TO_BYTE`, `LWORD_TO_INT`, `LWORD_TO_UINT`, `LWORD_TO_WORD`, `LWORD_TO_DINT`, `LWORD_TO_UDINT`, `LWORD_TO_DWORD`, `LWORD_TO_TIME`, `LWORD_TO_LINT`, `LWORD_TO_ULINT`, `LWORD_TO_REAL`, `LWORD_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From REAL

Functions: `REAL_TO_BOOL`, `REAL_TO_SINT`, `REAL_TO_USINT`, `REAL_TO_BYTE`, `REAL_TO_INT`, `REAL_TO_UINT`, `REAL_TO_WORD`, `REAL_TO_DINT`, `REAL_TO_UDINT`, `REAL_TO_DWORD`, `REAL_TO_TIME`, `REAL_TO_LINT`, `REAL_TO_ULINT`, `REAL_TO_LWORD`, `REAL_TO_LREAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

### From LREAL

Functions: `LREAL_TO_BOOL`, `LREAL_TO_SINT`, `LREAL_TO_USINT`, `LREAL_TO_BYTE`, `LREAL_TO_INT`, `LREAL_TO_UINT`, `LREAL_TO_WORD`, `LREAL_TO_DINT`, `LREAL_TO_UDINT`, `LREAL_TO_DWORD`, `LREAL_TO_TIME`, `LREAL_TO_LINT`, `LREAL_TO_ULINT`, `LREAL_TO_LWORD`, `LREAL_TO_REAL`.

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

Result after one scan: each `To_*` variable holds `5` (`To_BOOL` holds `TRUE`) and each `Is_*` variable holds `TRUE`.

{/* <<< END GENERATED: reference/functions <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
