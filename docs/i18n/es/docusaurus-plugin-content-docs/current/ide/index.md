---
slug: /ide
id: index
title: ZPLC Studio 2.0
sidebar_label: Studio
description: Creación de proyectos PLC en una carpeta, validación, simulación y flujos de hardware controlados por una persona.
tags: [ide, tooling]
---

# ZPLC Studio 2.0

Studio es el entorno de trabajo de escritorio para crear, compilar, probar,
simular y revisar proyectos PLC en una carpeta que usted elige.

## Camino rápido

1. Cree un proyecto o copie un ejemplo a una carpeta.
2. Edite ST, LD, FBD o SFC y compile con el compilador canónico.
3. Ejecute pruebas temporales y la simulación POSIX nativa; revise los resultados en el panel inferior.
4. Para hardware, use los flujos separados de compilación, grabación, despliegue y RUN/STOP, que inicia una persona.

## Qué ofrece el entorno de trabajo

| Superficie | Función actual |
| --- | --- |
| Proyecto | Archivos en una carpeta, exportación al esquema v2 y diferencias de migración. |
| Editores | ST es la vía de texto principal; LD, FBD y SFC conservan sus modelos visuales. |
| Validación | Diagnósticos del compilador, pruebas temporales, reglas de seguridad, trace y simulación POSIX. |
| Evidencia | Registra los resultados de las herramientas y su alcance; no convierte un resultado en host en uno de HIL. |
| Hardware | Connect y deploy siguen siendo acciones explícitas de una persona, después de las verificaciones de compatibilidad. |

## Límites importantes

La simulación POSIX nativa valida el comportamiento en el equipo anfitrión. No
afirma tiempos exactos de la placa, E/S eléctrica, HIL ni calificación para
producción. Los perfiles de placa solo tienen resultados de cross-build; consulte
[capacidades y evidencia](../reference/capabilities-evidence.md).

La IA puede preparar un cambio candidato aislado, pero solo una persona puede
guardarlo o iniciar una operación física. Lea [IA y privacidad](./ai-privacy.md)
antes de activar un proveedor de IA.
