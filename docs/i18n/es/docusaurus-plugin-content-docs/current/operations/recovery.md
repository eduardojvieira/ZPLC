---
slug: /operations/recovery
id: recovery
title: Límites de recuperación
sidebar_label: Recuperación
description: Recupere una sesión ZPLC sin confundir evidencia host con prueba target o HIL.
tags: [operations, recovery]
---

# Límites de recuperación

Recupere primero la capa más chica: lleve la lógica de control a un estado
seguro, inspeccione conexión y artefacto, y después elija de forma deliberada
recuperación de programa o firmware. ZPLC no inventa un procedimiento universal
de recuperación de hardware.

## Camino rápido

1. Detenga la puesta en marcha y aplique el procedimiento de trabajo seguro aprobado por el sitio.
2. Reconecte, inspeccione identidad y estado del runtime, y guarde la evidencia diagnóstica.
3. Recompile y valide el artefacto `.zplc` antes de que una persona confirme el deploy.
4. Para firmware, siga las instrucciones de recuperación Zephyr del profile y runner exactos.

## Decisión de recuperación

| Situación | Acción segura | Límite de evidencia |
| --- | --- | --- |
| Falla de runtime o programa | Conserve las salidas en safe state e inspeccione estado y trace. | Un trace host no prueba electricidad. |
| Conexión perdida | Reconecte y verifique board/profile/ABI antes de deploy. | Una identidad serial no es calificación HIL. |
| Reemplazo de programa | Compile, pruebe, simule y usá deploy confirmado por una persona. | Deploy cambia lógica; no es flash de firmware. |
| Falla de firmware | Deténgase y siga el procedimiento del board/runner exacto. | Los profiles actuales no tienen referencias HIL. |
| Duda sobre programa persistido | Reinicie sólo bajo el procedimiento del sitio; inspeccione estado restaurado antes de RUN. | Los claims de corte de energía y persistencia target requieren evidencia target/HIL. |

## Estado seguro y reinicio

El comportamiento de safe state y restore del runtime cuenta con evidencia de
código y tests host. Antes de energizar maquinaria después de una falla o
reinicio, verifique la salida real en el dispositivo exacto bajo el procedimiento
de puesta en marcha. Una persona autoriza flash, deploy, force, RUN, STOP y
recovery; AI y MCP no ofrecen esos controles.

## Qué conservar

Conserve hash de compilación, diagnósticos, trace, identidad del runtime,
profile seleccionado y confirmación humana de deploy con el incidente. No
copies credenciales ni serial sensible crudo en tickets o prompts de IA.

## Próximo paso

Leé [el límite de despliegue](../ide/deployment.md) y el procedimiento Zephyr
del runner antes de cambiar firmware.
