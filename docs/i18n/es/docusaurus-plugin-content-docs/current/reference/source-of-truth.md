---
title: Fuente de verdad
sidebar_label: Fuente de verdad
description: Qué archivo o registro es la autoridad para cada tipo de dato de ZPLC, y en qué orden cambiarlos.
---

# Fuente de verdad

Use esta página para encontrar el único lugar donde se decide un dato antes de cambiarlo o de escribir sobre él. Si dos fuentes difieren, el código actual, las pruebas, los contratos y la evidencia registrada prevalecen sobre la prosa. El mapa no afirma que cada consumidor lea su autoridad de forma automática: una página dice que una herramienta consume una fuente solo cuando una prueba o la implementación lo demuestran.

## Mapa de autoridad

| Pregunta                                         | Autoridad                                                                                       | Nota                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Comportamiento del runtime en C y del HAL        | Encabezados públicos e implementación en `firmware/lib/zplc_core/`                              | Las pruebas definen el comportamiento demostrado hasta hoy.                                                  |
| Formato del bytecode, opcodes y códigos de error | `tools/contract/contract.json`                                                                  | Los encabezados C, las tablas de TypeScript y las tablas de referencia se generan de él.                     |
| Compatibilidad del bytecode                      | `zplc_isa.h`, la salida del compilador y las pruebas de compatibilidad                          | La versión del producto no es la versión de la ABI.                                                          |
| Sesión de simulación nativa                      | `packages/zplc-ide/src/runtime/` y `specs/009-native-runtime-sim/`                              | Las capacidades dicen qué se admite y qué se degrada.                                                        |
| Esquema del archivo de proyecto y su migración   | `packages/zplc-ide/zplc.schema.json` y su migrador                                              | El formato actual; los consumidores no se actualizan solos.                                                  |
| Funciones y bloques de función estándar          | El registro del compilador en `packages/zplc-compiler/src/compiler/stdlib/`                     | Las páginas de [funciones](./functions.md) y de [bloques de función](./function-blocks.md) se generan de él. |
| Qué hace cada elemento de un lenguaje            | Los casos de conformidad y `tools/docs/language-capabilities.json`                              | Una celda dice «funciona» solo para un recorrido o caso que se ejecutó.                                      |
| Perfiles de placa                                | `firmware/app/boards/boards.json`                                                               | Figurar en el manifiesto no equivale a una calificación de hardware.                                         |
| Nivel de compatibilidad de una placa             | Los registros de evidencia que cita el manifiesto, en `specs/008-release-foundation/artifacts/` | El nivel se deriva, nunca se fija a mano; vea [Compatibilidad de hardware](./capabilities-evidence.md).      |
| Lecciones y curso                                | `packages/zplc-ide/lessons/*/lesson.json` y `course.json`                                       | El índice de lecciones se genera de ellos; CI rechaza una lista de identificadores escrita a mano.           |
| Qué puede afirmar una página                     | `docs/capability-claims.json` y las verificaciones de `tools/docs/`                             | Una cifra, un nombre o una capacidad falsos hacen fallar `bun run check:docs`.                               |
| Política de versiones                            | `VERSIONING.md`                                                                                 | Producto, esquema, ABI y protocolo son ejes separados.                                                       |
| Reglas de ingeniería                             | `.specify/memory/constitution.md` y `AGENTS.md`                                                 | Vea los [principios de ingeniería](../contributing/principles.md).                                           |
| Qué debe cumplir ZPLC 2.0                        | `specs/011-zplc-2-0-remediation/spec.md`                                                        | Los requisitos que leen las compuertas de publicación.                                                       |
| Paridad de la documentación                      | `docs/docs/` y `docs/i18n/es/`                                                                  | Ambos idiomas cambian en el mismo pull request.                                                              |

## Niveles de evidencia

Una afirmación de compatibilidad nombra la evidencia más fuerte registrada para ella: host, simulación nativa, destino emulado, `cross-build`, `community-reported` o `human-hil`. Los niveles, lo que establece cada uno y lo que no, se definen una sola vez, en [Compatibilidad de hardware](./capabilities-evidence.md#los-niveles).

## Orden de cambio

Primero cambia la implementación o el registro autoritativo. La documentación que lo describe lo sigue, en inglés y en español a la vez, y una página generada se regenera, nunca se edita.
