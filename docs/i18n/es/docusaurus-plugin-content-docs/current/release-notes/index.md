---
slug: /release-notes
id: index
title: Notas de Version
sidebar_label: Notas de Version
description: Historial de versiones y cambios verificados.
tags: [releases, changelog]
---

# Notas de Version

Las notas de versión de v1.5 publican capacidades verificadas, restricciones visibles del release y el alcance público respaldado por evidencia.

## Postura del release

ZPLC v1.5.0 alinea runtime, IDE, placas soportadas y documentación bilingüe bajo un único contrato de release verificable en vez de publicar alcance aspiracional.

## Qué se publica en v1.5.0

El release documenta y publica:

- documentación canónica en inglés y español para quickstart, arquitectura, runtime, IDE, lenguajes, placas, setup de Zephyr, operaciones y notas de versión
- referencia generada de placas desde `firmware/app/boards/supported-boards.v1.5.0.json`
- referencia generada del API del runtime desde los headers públicos en `firmware/lib/zplc_core/include/`
- workflows visibles de release atados a exports reales del IDE/compilador y a headers públicos del runtime
- validación automatizada para cobertura del manifiesto, paridad bilingüe de slugs, frescura de referencias generadas y drift contra evidencia/fuentes

## Inclusiones respaldadas por evidencia

- placas soportadas listadas en `firmware/app/boards/supported-boards.v1.5.0.json`
- cobertura de workflow declarada por el repo y verificada por automatización para `ST`, `IL`, `LD`, `FBD` y `SFC`
- superficies de Modbus RTU, Modbus TCP y MQTT que coinciden entre runtime, compilador, IDE y docs
- documentacion canonica bilingue para el conjunto de paginas bloqueantes del release

## Registros de gobernanza del release

La matriz de evidencia del release sigue siendo el rastro interno de auditoría para validaciones humanas y compartidas, incluyendo:

- validación desktop en macOS, Linux y Windows
- prueba HIL humana para al menos una placa serial y una placa con red
- sign-off del release owner sobre ownership y completitud de la evidencia

Estos registros no amplían por sí solos el claim set público; documentan ownership, validación y seguimiento.

Al congelar este alcance, los registros desktop, la evidencia HIL representativa y el sign-off final del release owner siguen pendientes. El wording público de v1.5 no debe insinuar que esos gates ya están cerrados.

## No debe aparecer sin evidencia

- placas fuera del manifiesto soportado
- claims de escritorio sin evidencia en macOS, Linux y Windows
- claims HIL sin una validacion humana serial y una de red
- funciones de protocolo que aun respondan `not supported`

## Cómo leer estas notas

Usá estas notas junto con el manifiesto canónico, el mapa de fuentes de verdad y la matriz de evidencia:

- [`/docs/reference/v1-5-canonical-docs-manifest`](../reference/v1-5-canonical-docs-manifest.md)
- [`/docs/reference/source-of-truth`](../reference/source-of-truth.md)
- `specs/008-release-foundation/artifacts/release-evidence-matrix.md`

Si una capacidad no puede vincularse con esos artefactos, sacala del claim set público de v1.5
o marcala claramente como pendiente o experimental.
