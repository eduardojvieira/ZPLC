---
sidebar_position: 1
---

# Structured Text (ST)

Structured Text (ST) es la base semántica canónica de ZPLC.

## Papel canónico en v1.5

- `ST` es la entrada directa al backend compartido del compilador
- `IL`, `LD`, `FBD` y `SFC` son rutas soportadas cuando convergen al mismo contrato
- el runtime sigue ejecutando `.zplc`, no código fuente específico de lenguaje

Usá la [Suite de Lenguajes v1.5](./examples/v1-5-language-suite.md) como referencia compartida para validar claims.

## Por qué ST importa arquitectónicamente

`packages/zplc-ide/src/compiler/index.ts` trata a ST distinto del resto:

- `ST` evita la etapa de transpilation
- los demás lenguajes se normalizan a ST antes de compilar

Por eso ST es el mejor lugar para entender la semántica pública de automatización que el runtime debería ejecutar.

## Ejemplo canónico mínimo

```st
PROGRAM WorkflowST
VAR
    Start : BOOL := TRUE;
    Timer : TON;
    Out1 : BOOL := FALSE;
END_VAR
Timer(IN := Start, PT := T#250ms);
Out1 := Timer.Q;
END_PROGRAM
```

## Qué puede reclamar esta página

- ST como camino directo de compilación
- ST como baseline semántica del resto
- ejemplos que coinciden con los tests de workflow compartido
- uso de stdlib respaldado por el registro stdlib del compilador

## Qué NO debería reclamar

No deberías vender ST como si tuviera privilegios runtime especiales. Compila al mismo contrato de bytecode que el resto.

## Superficies ST visibles hoy en el repo

El compilador y la stdlib muestran uso de ST con:

- cuerpos de programa y variables
- temporizadores como `TON`, `TOF`, `TP`
- contadores como `CTU`, `CTD`, `CTUD`
- funciones de string como `LEN`, `CONCAT`, `LEFT`, `RIGHT`, `MID`
- llamadas a FBs de comunicación cuando el contrato compiler/runtime los respalda

## Entrada a la biblioteca estándar

Ver [Biblioteca Estándar](./stdlib.md).
