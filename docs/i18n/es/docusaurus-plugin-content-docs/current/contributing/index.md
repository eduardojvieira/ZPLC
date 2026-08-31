---
slug: /contributing
id: index
title: Contribuir
sidebar_label: Contribuir
description: Cómo contribuir a ZPLC con límites de seguridad y evidencia claros.
tags: [contributing, open-source]
---

# Contribuir

Las contribuciones apuntan a `master` y deben dejar el repositorio más
confiable de lo que estaba.

## Camino rápido

1. Leé [AGENTS.md](https://github.com/eduardojvieira/ZPLC/blob/master/AGENTS.md), la [constitución de ingeniería](https://github.com/eduardojvieira/ZPLC/blob/master/.specify/memory/constitution.md), [VERSIONING.md](https://github.com/eduardojvieira/ZPLC/blob/master/VERSIONING.md) y el [RFC ZPLC 2.0 Foundation](https://github.com/eduardojvieira/ZPLC/blob/master/specs/010-zplc-2-0-foundation/spec.md).
2. Encontrá la spec activa más cercana y mantené el work unit enfocado.
3. Para cambios de comportamiento, agregá o reforzá tests focalizados y corré
   los checks de la capa modificada.
4. Actualizá documentación pública en inglés y español cuando cambie un claim,
   flujo o limitación visible.

## Reglas de contribución

| Área | Práctica requerida |
|---|---|
| Runtime y hardware | Conservá límites C99/HAL, fallos safe/off y recuperación. |
| Fronteras de confianza | Validá bytecode, IPC, paths e input externo antes de mutar. |
| Electron | Mantené el renderer sin privilegios e IPC estrecho y validado. |
| Evidencia | Etiquetá correctamente resultados host, QEMU, build target, HIL y manual. |
| Dependencias | Agregá una sola con necesidad concreta y justificación arquitectónica. |
| Operaciones físicas | Separá build, flash, deploy y run/debug; no automatices control físico vía IA o MCP. |

No publiques, flashees hardware, despliegues un programa PLC ni actués
equipamiento sin autorización explícita. Consultá
[CONTRIBUTING.md](https://github.com/eduardojvieira/ZPLC/blob/master/CONTRIBUTING.md) para el checklist del repositorio.
