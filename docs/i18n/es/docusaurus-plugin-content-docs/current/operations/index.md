---
slug: /operations
id: index
title: Operaciones
sidebar_label: Operaciones
description: Guias de operacion, diagnostico y recuperacion para ZPLC.
tags: [operations]
---

# Operaciones

La operación de v1.5 se enfoca en evidencia de release, diagnóstico, recuperación controlada y manejo honesto del alcance entre runtime, IDE, hardware y docs.

## Modelo operativo para v1.5.0

Tratā ZPLC v1.5.0 como un único tren de release. La documentación, las placas soportadas,
los workflows del IDE y el comportamiento del runtime tienen que apuntar al mismo conjunto de claims respaldados por fuentes.

## Antes del sign-off

Ejecutá estos checks no-build antes de aprobar documentación o mensajería pública:

- `python3 tools/hil/validate_supported_boards.py`
- `python3 tools/hil/validate_release_evidence.py`
- `bun run generate:v1.5-docs`
- `bun run validate:v1.5-docs`
- tests automatizados puntuales que respalden el área de workflow o runtime que cambió

Si alguno falla, frená el sign-off y corregí primero la fuente de verdad.

## Gates con evidencia humana

La matriz de evidencia del release todavía marca varios gates como pendientes. Operaciones y el release owner
tienen que mantener la evidencia humana alineada con el claim set publicado:

- evidencia de smoke desktop para macOS, Linux y Windows
- un registro de validación para una placa enfocada en serial
- un registro de validación para una placa con capacidad de red
- confirmación humana de que las notas de versión describen solo alcance verificado

Usá `specs/008-release-foundation/artifacts/release-evidence-matrix.md` como lista canónica de gates y estados.

## Flujo de diagnóstico y recuperación

Cuando falle una validación o un paso de despliegue, seguí esta secuencia en vez de parchear docs por intuición:

1. identificá la superficie rota (`runtime-api`, placas, notas de versión, landing copy o docs de workflow)
2. rastreala hasta su fuente canónica con [`/docs/reference/source-of-truth`](../reference/source-of-truth.md)
3. corregí el artefacto fuente o el generador, no solo el markdown renderizado
4. regenerá las referencias si la superficie es generada
5. reejecutá los checks no-build y registrá el resultado

## Reglas para corregir alcance

Nunca dejes claims no soportados o flojos en superficies públicas del release.

- Si una placa no está en `firmware/app/boards/supported-boards.v1.5.0.json`, removela de las docs y del copy del website.
- Si un gate sigue pendiente en la matriz de evidencia, describilo como pendiente, nunca como completo.
- Si una referencia generada está desactualizada o semánticamente rota, bloqueá el sign-off hasta corregir el generador y regenerar la salida.
- Si una página de operaciones o notas de versión es demasiado superficial para guiar una revisión, profundizala o sacala de la superficie bloqueante del release.

## Checklist operativo

- confirmar que el manifiesto canónico sigue representando el conjunto de páginas bloqueantes
- confirmar que inglés y español siguen alineados en las páginas bloqueantes
- confirmar que las referencias generadas de runtime y placas están frescas y son confiables
- confirmar que los claims de la landing siguen coincidiendo con placas soportadas, headers públicos y evidencia de release
- confirmar que los gates humanos pendientes están explicitados en las notas de versión
