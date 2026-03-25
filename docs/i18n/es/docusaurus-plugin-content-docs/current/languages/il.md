---
title: Instruction List (IL)
sidebar_label: IL
description: Cómo encaja Instruction List en el workflow canónico de lenguajes de ZPLC v1.5.
---

# Instruction List (IL)

En ZPLC v1.5, `IL` forma parte del mismo contrato de workflow que `ST`, `LD`, `FBD` y `SFC`.

La fuente canónica para este claim es `packages/zplc-ide/src/compiler/index.ts`, donde:

- `LANGUAGE_WORKFLOW_SUPPORT.IL` marca `author`, `compile`, `simulate`, `deploy` y `debug` en `true`
- `compileProject()` normaliza los lenguajes no-ST antes de la compilación
- para `IL`, el IDE usa `parseIL()` y `transpileILToST()` antes de compilar a bytecode `.zplc`

## Qué significa eso en la práctica

`IL` no usa un backend separado del runtime. La ruta soportada es:

```mermaid
flowchart LR
  IL[fuente IL] --> PARSE[parseIL]
  PARSE --> TRANSPILE[transpileILToST]
  TRANSPILE --> ST[ST intermedio]
  ST --> COMPILE[compileToBinary]
  COMPILE --> ZPLC[.zplc]
  ZPLC --> RUNTIME[runtime + debug]
```

## Contrato de soporte en v1.5

| Etapa | Estado para IL | Fuente |
|---|---|---|
| Autoría | soportada | `LANGUAGE_WORKFLOW_SUPPORT.IL.author` |
| Compilación | soportada | `LANGUAGE_WORKFLOW_SUPPORT.IL.compile` |
| Simulación | soportada | `LANGUAGE_WORKFLOW_SUPPORT.IL.simulate` |
| Despliegue | soportado | `LANGUAGE_WORKFLOW_SUPPORT.IL.deploy` |
| Depuración | soportada | `LANGUAGE_WORKFLOW_SUPPORT.IL.debug` |

## Ejemplo mínimo

```iecst
PROGRAM WorkflowIL
VAR
    Start : BOOL := TRUE;
    Timer : TON;
END_VAR
VAR_OUTPUT
    Out1 AT %Q0.0 : BOOL;
END_VAR

    LD Start
    ST Timer.IN
    CAL Timer(
        PT := T#250ms
    )
    LD Timer.Q
    ST Out1
END_PROGRAM
```

Ese patrón aparece también en la [suite canónica de lenguajes v1.5](./examples/v1-5-language-suite.md).

## Qué NO deberías reclamar

La documentación de v1.5 no debería vender a `IL` como una implementación aislada del runtime. El contrato público real es más simple:

- `IL` está soportado como workflow del IDE
- el pipeline converge al mismo contrato de compilación/ejecución que el resto
- el runtime ejecuta `.zplc`, no un backend IL separado

## Relación con otras páginas

- [Lenguajes y modelo de programación](./index.md)
- [Structured Text (ST)](./st.md)
- [Suite canónica de lenguajes v1.5](./examples/v1-5-language-suite.md)
