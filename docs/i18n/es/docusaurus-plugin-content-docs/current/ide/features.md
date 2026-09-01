---
slug: /ide/features
id: features
title: Workbench de Studio
sidebar_label: Workbench
description: Editor, ledger inferior, simulación y flujo de evidencia de ZPLC Studio 2.0.
tags: [ide, user-guide]
---

# Workbench de Studio

El workbench mantiene la edición en el centro y reúne Explorer, Inspector,
Output, Problems, Tests, Trace, Watch y Terminal en un ledger inferior.

## Flujo diario

1. Trabajá en una carpeta de proyecto elegida por vos.
2. Compilá y resolvé diagnósticos.
3. Ejecutá un test temporal o escenario POSIX nativo e inspeccioná su trace.
4. Revisá la fuente de evidencia antes de concluir algo.

## Editores

ST es el camino principal de servicio de lenguaje. LD, FBD y SFC abren, editan,
guardan, copian y deshacen sus modelos semánticos; ST generado es un artefacto,
no una fuente round-trip. IL es una superficie de compatibilidad donde el
compilador lo acepta.

## Simulación y hardware

POSIX nativo es el camino preferido de validación host. WASM es fallback
degradado declarado. Las acciones hardware están separadas: build del firmware,
flash del firmware, deploy del programa compilado y después run/debug. Cada una
sigue controlada por personas y Studio muestra los niveles de evidencia.

## Límite de depuración

Watches, traces, breakpoints y forces muestran sólo lo que informa el adaptador
conectado. Un trace host no es evidencia hardware/HIL; force o RUN/STOP físico
