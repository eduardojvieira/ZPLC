---
id: intro
title: Introducción al runtime
sidebar_label: Generalidades del runtime
description: Runtime ZPLC portable, artefactos verificados y límites de evidencia.
tags: [runtime, embedded, vm]
---

# Runtime ZPLC

ZPLC es un runtime PLC C99 portable detrás de una capa de abstracción de
hardware (HAL). Studio, el runtime host nativo y los perfiles Zephyr usan
artefactos `.zplc` verificados y los mismos contratos de runtime. No es un PLC
de seguridad certificado.

## Camino rápido

1. Compilá el proyecto en un artefacto `.zplc`.
2. Verificá y cargá/desplegá ese artefacto. Una carga exitosa queda lógicamente
   detenida/READY.
3. Inspeccioná el target y ejecutá explícitamente el comando humano `zplc start`
   para correrlo.

El build de firmware, flash de firmware, deploy del programa PLC y RUN/debug
son operaciones separadas. Una carga de programa nunca implica un arranque
operacional.

## Superficies de runtime

| Superficie | Rol | Límite de evidencia |
| --- | --- | --- |
| Core y loader | VM C99, ISA, modelo de memoria y verificación `.zplc` | La evidencia host/unit no califica comportamiento físico. |
| Simulación nativa POSIX | Runtime local/headless para flujos de compile, test, trace y replay | Comportamiento host; no evidencia temporal target ni HIL. |
| Perfiles Zephyr | Runtime firmware y adaptadores HAL para revisiones de placa nombradas | Capabilities y calificación varían por perfil. |
| WASM | Superficie de fallback | Falla cerrado o no está disponible hasta verificar un artefacto. |

## Contratos y referencias

- [Runtime API](../reference/runtime-api.md) define la superficie pública del runtime.
- [Persistencia](./persistence.md) explica el program store verificado y sus
  límites por perfil.
- [Scheduler](./scheduler.md) describe la semántica de scheduling y los límites
  actuales de evidencia.
- [Fuente de verdad](../reference/source-of-truth.md) identifica versiones y
  contratos de release canónicos.
- [Referencia de placas](../reference/boards.md) lista perfiles, capabilities y
  su tier de evidencia.

## Límites de seguridad y evidencia

- Timing target, comportamiento eléctrico de salidas, recuperación ante cortes
  de energía y resultados HIL requieren evidencia para el perfil de placa exacto.
- La región `RETAIN` y las primitivas HAL existen, pero las declaraciones
  RETAIN a nivel de fuente hoy se rechazan y la retención target no está
  calificada.
- El restore publica el artefacto como lógicamente detenido/READY. El
  comportamiento de las salidas antes de ejecutar es específico del perfil de
  target y requiere evidencia registrada.
- El runtime no declara certificación como safety PLC.

Usá la referencia de placas y el procedimiento de recovery del perfil elegido
antes de commissioning o de una operación física.
