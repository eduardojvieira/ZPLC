---
slug: /ide/migration-v1-to-v2
id: migration-v1-to-v2
title: Migrar un proyecto v1 a v2
sidebar_label: Migrar v1 a v2
description: Previsualizá, revisá y guardá explícitamente un proyecto ZPLC v2 respaldado por una carpeta.
tags: [ide, migracion]
---

# Migrar un proyecto v1 a v2

ZPLC 2.0 previsualiza un proyecto v1 como v2 y muestra el diff resultante. La
carpeta de origen no cambia hasta que guardás explícitamente; ese guardado
actualiza su `zplc.json` en el workspace seleccionado a schema v2.

## Camino rápido

1. Abrí la carpeta del proyecto existente en Studio.
2. Revisá el aviso de migración y su diff.
3. Elegí **Guardar** para escribir la configuración v2 revisada en ese workspace.
4. Volvé a compilar y ejecutar el escenario después de guardar.

## Qué cambia

| Área | Comportamiento v2 |
| --- | --- |
| Modelo de proyecto | Un Guardar explícito escribe `schemaVersion: 2` en el `zplc.json` del workspace. |
| Carpeta original | No cambia durante la vista previa; Guardar actualiza el `zplc.json` original del workspace seleccionado. |
| Vista previa | Studio muestra una vista previa; no promete soporte de cada construcción legada. |
| Evidencia | Los resultados de compilación, test y simulación POSIX aplican al workspace guardado y sólo son evidencia host. |

## Alcance golden

El gate de migración cubre los proyectos golden v1 del repositorio: su forma v2
guardada debe compilar y conservar el comportamiento observable probado en el runtime
POSIX nativo. No es una afirmación de equivalencia de target, eléctrica, de
timing ni HIL.

## Si la migración no es aceptable

Hacé un backup de la carpeta del proyecto o un commit en control de versiones
antes de guardar, y revisá el diff. Usá los diagnósticos para resolver fuente o
configuración no soportada antes de adoptar la migración. No edites JSON de
modelos visuales generado a mano para evitar un diagnóstico.

## Próximo paso

Seguí con [el flujo del compilador](./compiler.md) y guardá un resultado nuevo
de test o simulación del proyecto guardado.
