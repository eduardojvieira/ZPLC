---
slug: /languages
id: index
title: Lenguajes y Modelo de Programación
sidebar_label: Visión General de Lenguajes
description: Visión general alineada al release de los workflows IEC 61131-3, sus límites de soporte y la superficie de biblioteca estándar en ZPLC.
tags: [languages, iec61131-3]
---

# Lenguajes y Modelo de Programación

ZPLC v1.5.0 documenta cinco rutas de lenguaje IEC 61131-3 dentro del IDE:

- `ST`
- `IL`
- `LD`
- `FBD`
- `SFC`

## Alineación con IEC 61131-3

El estándar define cinco lenguajes:
1. Texto Estructurado (ST)
2. Lista de Instrucciones (IL)
3. Diagrama de Contactos (LD)
4. Diagrama de Bloques de Función (FBD)
5. Diagrama de Funciones Secuenciales (SFC)

ZPLC usa **una sola ruta canónica de compilación**.

`ST` es la base semántica, y el resto de las superficies se normalizan hacia el mismo contrato
compilador/runtime antes de producir bytecode `.zplc`.

Eso se ve en `packages/zplc-ide/src/compiler/index.ts`:

- `ST` compila directo
- `IL` se parsea y transpila a ST
- `LD`, `FBD` y `SFC` también se transpilan a ST primero

## Contrato de workflow para los lenguajes reclamados

El IDE exporta la misma matriz de soporte para los cinco caminos reclamados:

- author
- compile
- simulate
- deploy
- debug

Esa matriz vive en `LANGUAGE_WORKFLOW_SUPPORT`, y `packages/zplc-ide/src/compiler/languageWorkflow.test.ts` verifica tanto el contrato declarado como la compilación de ejemplos canónicos para los cinco lenguajes.

## Posicionamiento de cada lenguaje

| Lenguaje | Posición en ZPLC | Superficie de autoría | Realidad de ejecución |
|---|---|---|---|
| `ST` | base semántica | editor de texto | compila directo a `.zplc` |
| `IL` | workflow textual de bajo nivel | editor de texto | se parsea y transpila antes del bytecode |
| `LD` | workflow visual tipo relay | editor basado en modelo | se transpila antes del bytecode |
| `FBD` | workflow visual de dataflow | editor basado en modelo | se transpila antes del bytecode |
| `SFC` | workflow secuencial/por estados | editor basado en modelo | se transpila antes del bytecode |

El punto arquitectónico importante es que el runtime ejecuta `.zplc`, no una VM distinta por lenguaje.

## Descubrimiento y ejemplos canónicos

El set de ejemplos release-facing vive en [Suite de Lenguajes v1.5](./examples/v1-5-language-suite.md).

Usalo como referencia compartida cuando quieras validar si un claim de lenguaje sigue siendo honesto.

Páginas de release por lenguaje:

- [Structured Text (ST)](./st.md)
- [Instruction List (IL)](./il.md)
- [Biblioteca Estándar](./stdlib.md)
- [Suite de Lenguajes v1.5](./examples/v1-5-language-suite.md)

## Modelo de Bytecode

El formato `.zplc` es un contrato de bytecode basado en stack definido por la ISA pública del runtime.

Si necesitás detalle del binario y del layout de memoria, seguí con:

- [ISA del Runtime](/runtime/isa)
- [API del Runtime](/reference/runtime-api)

## Biblioteca Estándar

El registro stdlib del compilador en `packages/zplc-compiler/src/compiler/stdlib/index.ts` define las funciones y bloques integrados que usan estas superficies de lenguaje.

Categorías importantes actualmente expuestas:

- temporizadores (`TON`, `TOF`, `TP`)
- contadores (`CTU`, `CTD`, `CTUD`)
- edge y bistables (`R_TRIG`, `F_TRIG`, `RS`, `SR`)
- strings (`LEN`, `CONCAT`, `LEFT`, `RIGHT`, `MID`, `FIND`, `INSERT`, `DELETE`, `REPLACE`)
- funciones matemáticas, de escalado y de sistema
- bloques de comunicación para Modbus y MQTT/cloud wrappers

Ver [Biblioteca Estándar](./stdlib.md).

## Límite de soporte en v1.5.0

El repo declara y testea soporte de workflow para los cinco lenguajes.

La aprobación humana final de la paridad end-to-end sigue estando separada en `REL-002` dentro de la matriz de evidencia del release.
