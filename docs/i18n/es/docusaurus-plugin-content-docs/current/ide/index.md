---
slug: /ide
id: index
title: ZPLC Studio 2.0
sidebar_label: Studio
description: Autoría PLC respaldada por carpetas, validación, simulación, evidencia y flujos de hardware controlados por personas.
tags: [ide, tooling]
---

# ZPLC Studio 2.0

Studio es el workbench de escritorio para crear, compilar, testear, simular y
revisar proyectos PLC en una carpeta elegida por la persona usuaria.

## Camino rápido

1. Creá o copiá un ejemplo a una carpeta.
2. Editá ST, LD, FBD o SFC y compilá mediante el camino canónico.
3. Ejecutá tests temporales y simulación POSIX nativa; inspeccioná evidencia en el ledger inferior.
4. Para hardware, usá flujos humanos separados de build, flash, deploy y RUN/STOP.

## Qué posee el workbench

| Superficie | Rol actual |
| --- | --- |
| Proyecto | Archivos respaldados por carpeta, export v2 y diff de migración. |
| Editores | ST es el camino textual principal; LD/FBD/SFC preservan modelos visuales semánticos. |
| Validación | Diagnósticos, tests temporales, reglas de seguridad, trace y simulación POSIX. |
| Evidencia | Registra resultados de tools y su alcance; no promociona host a HIL. |
| Hardware | Connect y deploy siguen siendo acciones humanas explícitas tras controles de compatibilidad. |

## Límites importantes

La simulación POSIX nativa valida comportamiento host. No afirma timing target
exacto, I/O eléctrico, HIL ni calificación de producción. Los perfiles de placas
sólo tienen evidencia cross-build; consultá [capacidades y evidencia](../reference/capabilities-evidence.md).

La IA puede preparar un cambio candidato aislado, pero sólo una persona puede
guardarlo o iniciar una operación física. Leé [IA y privacidad](./ai-privacy.md)
