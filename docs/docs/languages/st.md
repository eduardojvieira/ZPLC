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
*   `VAR_GLOBAL`: Global variables shared across tasks.
*   `VAR RETAIN`: Variables saved to flash.

### Assignment

```st
Target := Expression;
Count := Count + 1;
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

## String Operations (New in v1.2)

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
