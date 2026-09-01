---
slug: /getting-started
id: index
title: Primeros pasos
sidebar_label: Primeros pasos
description: Creá un proyecto ZPLC respaldado por carpeta, validalo en host y entendé el límite de hardware.
tags: [quickstart]
---

# Primeros pasos

Empezá con una carpeta de proyecto, compilá, testeá y simulá. Tratá hardware como
un paso humano separado con evidencia apropiada a la placa exacta.

## Camino rápido

1. Instalá el candidato desktop o corré Studio desde fuente.
2. Creá un proyecto o copiá un ejemplo a una carpeta elegida por vos.
3. Compilá y ejecutá su test temporal o escenario POSIX nativo.
4. Revisá el alcance de evidencia antes de considerar hardware.

## Desde fuente

```bash
bun install --frozen-lockfile
bun run --cwd=packages/zplc-ide electron:dev
```

## Primer proyecto

Un proyecto tiene `zplc.json`, archivos de fuente/modelo y tareas. Elegí un
target catalogado sólo si necesitás su profile de build; no asegura que una placa
física esté calificada.

Usá el diálogo de ejemplos de Studio para copiar un starter a una carpeta de
destino. Para una carpeta legada, usá [migración a v2](../ide/migration-v1-to-v2.md).

## Validar en host

Compilá el proyecto, ejecutá el test/escenario provisto e inspeccioná trace y
diagnósticos. POSIX nativo es evidencia host. No prueba I/O físico, timing
target, persistencia tras corte de energía, flash ni HIL.

## Pasar a hardware deliberadamente

Usá el profile Zephyr exacto para build de firmware y después acciones humanas
distintas de flash, deploy de programa y RUN/debug. Los seis profiles actuales
