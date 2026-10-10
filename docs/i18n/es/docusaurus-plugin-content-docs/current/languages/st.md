---
sidebar_position: 1
---

# Structured Text (ST)

Structured Text (ST) es la base semántica canónica de ZPLC.

## Papel en ZPLC 2.0

- `ST` es la entrada directa al backend compartido del compilador
- `IL`, `LD`, `FBD` y `SFC` son rutas cuando sus contratos de editor, transpilador y compilador las aceptan
- el runtime sigue ejecutando `.zplc`, no código fuente específico de lenguaje

La [suite histórica de lenguajes](./examples/v1-5-language-suite.md) es evidencia de compatibilidad; no prueba paridad universal, tiempos en la placa, hardware ni HIL.

## Por qué ST importa arquitectónicamente

`packages/zplc-ide/src/compiler/index.ts` trata a ST distinto del resto:

- `ST` evita la etapa de transpilation
- los demás lenguajes se normalizan a ST antes de compilar

Por eso ST es el mejor lugar para entender la semántica pública de automatización que el runtime debería ejecutar.

## Uso típico en ZPLC

ST es la opción natural para:

- lógica de control en texto
- aritmética y manipulación de datos
- llamar directamente a funciones y bloques de función de la stdlib
- cuerpos de acción que provienen de flujos visuales de más alto nivel

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

## Superficies ST visibles hoy en el repo

El compilador y la stdlib muestran uso de ST con:

- cuerpos de programa y variables
- temporizadores como `TON`, `TOF`, `TP`
- contadores como `CTU`, `CTD`, `CTUD`
- funciones de string como `LEN`, `CONCAT`, `LEFT`, `RIGHT`, `MID`
- llamadas a FBs de comunicación cuando el contrato compiler/runtime los respalda

## Entrada a la biblioteca estándar

Ver [Biblioteca Estándar](./stdlib.md).
