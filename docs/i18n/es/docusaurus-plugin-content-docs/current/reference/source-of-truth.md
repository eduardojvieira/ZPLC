---
title: Fuente de verdad
sidebar_label: Fuente de verdad
description: Mapa honesto de autoridad para hechos, compatibilidad y evidencia de ZPLC.
---

# Fuente de verdad

Este mapa identifica autoridad sin afirmar que todos los consumidores leen
archivos dinámicamente. Si las fuentes difieren, el código actual, los tests,
los contratos y la evidencia registrada prevalecen sobre la prosa.

## Camino rápido

1. Encuentre el contrato de implementación del comportamiento que va a cambiar.
2. Encuentre la evidencia requerida antes de publicar una afirmación.
3. Actualice la documentación en inglés y español en el mismo cambio.

## Mapa de autoridad

| Pregunta | Autoridad | Nota |
|---|---|---|
| Runtime C y HAL | Encabezados públicos e implementación en `firmware/lib/zplc_core/` | Los tests muestran el comportamiento demostrado. |
| Compatibilidad de bytecode/ISA | `zplc_isa.h`, salida del compilador y tests de compatibilidad | La versión del producto no es la ABI. |
| Sesión nativa de desktop | `packages/zplc-ide/src/runtime/` y spec 009 | Las capabilities indican soporte o degradación. |
| Schema y migración actual del proyecto | `packages/zplc-ide/zplc.schema.json` y su migrador actual | Autoridad del formato actual; no implica actualización automática de consumidores. |
| Perfiles de placas | `firmware/app/boards/boards.json` | Estar listado no equivale a HIL. |
| Calificación de placa/release | `specs/008-release-foundation/artifacts/` | El nivel de evidencia limita el claim público. |
| Política de versiones | `VERSIONING.md` | Producto, schema, ABI y protocolo son ejes separados. |
| Paridad de documentación | `docs/docs/` y `docs/i18n/es/` | Ambas fuentes se actualizan juntas. |
| Ejecución de ZPLC 2.0 | `specs/010-zplc-2-0-foundation/spec.md` | RFC aprobado, no claim de release. |

## Niveles de evidencia

| Nivel | Qué demuestra | Qué no demuestra |
|---|---|---|
| Host | Código y runtime locales | Timing físico o comportamiento eléctrico |
| QEMU | Destino emulado configurado | Periféricos o cableado de la placa |
| Build de destino | Que un profile compila | Que un dispositivo arranca o controla una máquina |
| HIL | Comportamiento registrado en hardware identificado | Certificación o toda condición operativa |
| Manual | Procedimiento observado por una persona | Automatización reproducible sin artifacts guardados |

## Regla de actualización

Primero cambia la implementación o el registro autoritativo; la documentación que
lo describe se actualiza después. Una página afirma que el IDE, el compilador o
los docs consumen una fuente de forma automática solo cuando una prueba o la
implementación lo demuestran.
