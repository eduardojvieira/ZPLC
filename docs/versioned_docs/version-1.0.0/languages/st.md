---
sidebar_position: 1
---

# Structured Text (ST)

Structured Text (ST) is a high-level, Pascal-like programming language defined by IEC 61131-3. It is the primary language for ZPLC, offering powerful control flow and complex algorithm capabilities.

## Syntax Overview

### Comments

```st
(* Multi-line comment 
   spanning lines *)

// Single-line comment
```

### Variables

Variables are declared inside `VAR ... END_VAR` blocks.

```st
VAR
    myBool : BOOL := FALSE;
    myInt : INT := 123;
    myString : STRING := 'Hello World';
END_VAR
```

**Scopes:**
*   `VAR`: Local temporary variables.
*   `VAR_INPUT`: Input parameters (for Function Blocks).
*   `VAR_OUTPUT`: Output parameters.
*   `VAR_IN_OUT`: Input/Output references.
*   `VAR_GLOBAL`: Global variables shared across tasks.
*   `VAR RETAIN`: Variables saved to flash.

### Assignment

```st
Target := Expression;
Count := Count + 1;
```

## Data Types

### Standard Types

ZPLC supports standard IEC data types: `BOOL`, `SINT`, `INT`, `DINT`, `LINT`, `USINT`, `UINT`, `UDINT`, `ULINT`, `REAL`, `LREAL`, `TIME`, `STRING`.

### Arrays

Arrays can be single or multi-dimensional (up to 3 dimensions).

```st
VAR
    Arr1 : ARRAY[0..9] OF INT;
    Matrix : ARRAY[0..4, 0..4] OF REAL;
    Cube : ARRAY[0..2, 0..2, 0..2] OF BYTE;
END_VAR

Arr1[0] := 10;
Matrix[1, 2] := 3.14;
Cube[0, 1, 0] := 255;
```

### Structs (User-Defined Types)

You can define custom structures using the `TYPE` keyword.

```st
TYPE MotorData : 
    STRUCT
        Speed : REAL;
        Direction : BOOL;
        ErrorCode : INT;
    END_STRUCT;
END_TYPE

VAR
    Motor1 : MotorData;
END_VAR

Motor1.Speed := 100.0;
```

## Control Structures

### IF-THEN-ELSE

```st
IF temp > 100.0 THEN
    Alarm := TRUE;
ELSIF temp > 80.0 THEN
    Warning := TRUE;
ELSE
    Alarm := FALSE;
    Warning := FALSE;
END_IF;
```

### CASE

```st
CASE State OF
    0:  (* Idle *)
        Motor := FALSE;
    1:  (* Run *)
        Motor := TRUE;
    ELSE
        Error := TRUE;
END_CASE;
```

### Loops

**WHILE** (Check condition before):
```st
WHILE i < 10 DO
    i := i + 1;
END_WHILE;
```

**FOR** (Fixed iteration):
```st
FOR i := 0 TO 9 BY 1 DO
    arr[i] := 0;
END_FOR;
```

### REPEAT (Check condition after)

```st
REPEAT
    i := i - 1;
UNTIL i = 0
END_REPEAT;
```

## User-Defined Units

### Functions (FUNCTION)

Functions return a single value and do not store state.

```st
FUNCTION Add : INT
    VAR_INPUT
        A : INT;
        B : INT;
    END_VAR
    Add := A + B;
END_FUNCTION
```

### Function Blocks (FUNCTION_BLOCK)

Function Blocks maintain state between calls.

```st
FUNCTION_BLOCK Counter
    VAR_INPUT
        Up : BOOL;
    END_VAR
    VAR_OUTPUT
        Count : INT;
    END_VAR
    VAR
        InternalVal : INT := 0;
    END_VAR

    IF Up THEN
        InternalVal := InternalVal + 1;
    END_IF;
    Count := InternalVal;
END_FUNCTION_BLOCK
```

## Operators

| Precedence | Operator | Description |
|---|---|---|
| Highest | `(...)` | Parentheses |
| | `function()` | Function Call |
| | `**` | Exponentiation (EXPT) |
| | `-`, `NOT` | Negation |
| | `*`, `/`, `MOD` | Multiply, Divide, Modulo |
| | `+`, `-` | Add, Subtract |
| | `<`, `>`, `<=`, `>=` | Comparison |
| | `=`, `<>` | Equality |
| | `AND` | Boolean AND |
| | `XOR` | Boolean XOR |
| Lowest | `OR` | Boolean OR |

## String Operations

ZPLC supports the IEC 61131-3 `STRING` type with standard operators.

```st
VAR
    Str1 : STRING := 'Hello';
    Str2 : STRING := 'World';
    Result : STRING;
    IsEqual : BOOL;
END_VAR

Result := CONCAT(Str1, ' ', Str2); (* 'Hello World' *)
IsEqual := (Str1 = 'Hello');       (* TRUE *)
Len := LEN(Str1);                  (* 5 *)
```
