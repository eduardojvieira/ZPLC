---
title: Fuente de verdad
sidebar_label: Fuente de verdad
description: Mapa honesto de autoridad para hechos, compatibilidad y evidencia de ZPLC.
---

# Fuente de verdad

Este mapa identifica autoridad sin afirmar que todos los consumidores leen
archivos dinámicamente. Si las fuentes difieren, el código actual, las pruebas,
los contratos y la evidencia registrada prevalecen sobre la prosa.

## Camino rápido

1. Encuentre el contrato de implementación del comportamiento que va a cambiar.
2. Encuentre la evidencia requerida antes de publicar una afirmación.
3. Actualice la documentación en inglés y español en el mismo cambio.

## Mapa de autoridad

| Pregunta | Autoridad | Nota |
|---|---|---|
| Runtime en C y HAL | Encabezados públicos e implementación en `firmware/lib/zplc_core/` | Las pruebas definen el comportamiento demostrado hasta hoy. |
| Compatibilidad del bytecode y de la ISA | `zplc_isa.h`, salida del compilador y pruebas de compatibilidad | La versión del producto no es la versión de la ABI. |
| Contrato de la sesión nativa de escritorio | `packages/zplc-ide/src/runtime/` y la especificación 009 | Las capacidades definen qué se admite y qué se degrada. |
| Esquema y migración actuales del proyecto | `packages/zplc-ide/zplc.schema.json` y su migrador actual | Autoridad del formato actual; no se debe suponer que los consumidores se actualizan solos. |
| Datos de los perfiles de placa | `firmware/app/boards/boards.json` | Figurar en el manifiesto no equivale a una calificación HIL. |
| Calificación de placas y de versiones | `specs/008-release-foundation/artifacts/` | El nivel de evidencia limita lo que se puede afirmar en público. |
| Política de versiones | `VERSIONING.md` | Producto, esquema, ABI y protocolo son ejes separados. |
| Paridad de la documentación pública | `docs/docs/` y `docs/i18n/es/` | Ambas fuentes se actualizan juntas. |
| Ejecución de ZPLC 2.0 | `specs/010-zplc-2-0-foundation/spec.md` | RFC aprobado; no es una afirmación de versión. |

## Niveles de evidencia

| Nivel | Qué demuestra | Qué no demuestra |
|---|---|---|
| Host | Código y runtime locales | Tiempos físicos o comportamiento eléctrico |
| QEMU | Destino emulado configurado | Periféricos o cableado de la placa |
| Compilación para el destino | Que un perfil compila | Que un dispositivo arranca o controla una máquina |
| HIL | Comportamiento registrado en hardware identificado | Certificación o toda condición operativa |
| Manual | Procedimiento observado por una persona | Automatización reproducible sin artefactos conservados |

## Regla de actualización

Primero cambia la implementación o el registro autoritativo; la documentación que
lo describe se actualiza después. Una página afirma que el IDE, el compilador o
la documentación consumen una fuente de forma automática solo cuando una prueba o la
implementación lo demuestran.
