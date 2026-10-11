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

1. Abrí la carpeta del proyecto existente en Studio, o importá su archivo desde la pantalla de bienvenida: el
   diálogo de importación muestra la misma diferencia antes de escribir nada.
2. Elegí **Review the difference** en el aviso de migración del Explorer. El diálogo lista las líneas de `zplc.json` que
   la migración quita y agrega; solo cambia `zplc.json`, y tus programas no se tocan.
3. Elegí **Apply migration** (equivale a **Guardar**) para escribir la configuración v2 revisada en ese workspace, o
   **Close** para dejar la carpeta como está.
4. Volvé a compilar y ejecutar el escenario después de guardar.

## Desde una terminal

Para ver qué cambiaría la migración sin abrir Studio, y para escribir el archivo de
proyecto versión 2 donde se elija, se usa la línea de comandos
([Usar la línea de comandos](../guides/command-line.md)):

```bash
zplc-cli migrate-preview path/to/project
zplc-cli migrate path/to/project --output zplc.v2.json
```

`migrate-preview` no escribe nada e imprime `migrate-preview passed`; con `--json` da la
lista de cambios. `migrate` escribe el archivo de proyecto versión 2 en `--output`, que
no puede ser el archivo del proyecto ni un archivo de `src` o de `tests`, y deja la
carpeta del proyecto como estaba. Se revisa el archivo y, si se acepta, se copia sobre
`zplc.json`.

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

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| `migrate-preview` no escribe nada, y `migrate` escribe solo el archivo de `--output` y deja la carpeta idéntica byte a byte | Pruebas unitarias de la línea de comandos, y los dos comandos de arriba ejecutados sobre una copia del proyecto incluido `motor_start_stop` sin su `schemaVersion` | Host |
| Studio muestra la diferencia antes de escribir, y la aplica con **Apply migration** | Recorrido 31 en la aplicación real | Host |
| La forma versión 2 guardada conserva lo que hace el proyecto | Una prueba exporta la migración del proyecto de arranque y parada de motor y comprueba que su escenario golden da el mismo observable en el runtime nativo | Host |
| El proyecto migrado se comporta igual en una placa | No se afirma: no hay equivalencia de destino, eléctrica ni de tiempos | Ninguno |

## Próximo paso

Seguí con [el flujo del compilador](./compiler.md) y guardá un resultado nuevo
de test o simulación del proyecto guardado.
