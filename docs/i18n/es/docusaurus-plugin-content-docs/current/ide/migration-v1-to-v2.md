---
slug: /ide/migration-v1-to-v2
id: migration-v1-to-v2
title: Migrar un proyecto v1 a v2
sidebar_label: Migrar v1 a v2
description: Previsualice, revise y guarde explícitamente un proyecto ZPLC v2 respaldado por una carpeta.
tags: [ide, migracion]
---

# Migrar un proyecto v1 a v2

ZPLC 2.0 muestra una vista previa de un proyecto v1 como v2 y la diferencia
resultante. La carpeta de origen no cambia hasta que usted guarda de forma
explícita; ese guardado actualiza su `zplc.json` en el espacio de trabajo
seleccionado al esquema v2.

## Camino rápido

1. Abra la carpeta del proyecto existente en Studio, o importe su archivo desde la pantalla de bienvenida: el
   diálogo de importación muestra la misma diferencia antes de escribir nada.
2. Elija **Revisar la diferencia** en el aviso de migración del explorador. El diálogo lista las líneas de `zplc.json` que
   la migración quita y agrega; solo cambia `zplc.json`, y sus programas no se tocan.
3. Elija **Aplicar migración** (equivale a **Guardar**) para escribir la configuración v2 revisada en ese espacio de trabajo, o
   **Cerrar** para dejar la carpeta como está.
4. Vuelva a compilar y ejecutar el escenario después de guardar.

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
| Modelo de proyecto | Un guardado explícito escribe `schemaVersion: 2` en el `zplc.json` del espacio de trabajo. |
| Carpeta original | No cambia durante la vista previa; guardar actualiza el `zplc.json` original del espacio de trabajo seleccionado. |
| Vista previa | Studio muestra una vista previa; no promete soporte de cada construcción heredada. |
| Evidencia | Los resultados de la compilación, de las pruebas y de la simulación POSIX corresponden al espacio de trabajo guardado y solo son evidencia de host. |

## Alcance de los proyectos de referencia

La verificación de la migración cubre los proyectos de referencia v1 del repositorio:
su forma v2 guardada debe compilar y conservar el comportamiento observable probado
en el runtime POSIX nativo. No es una afirmación de equivalencia en el destino, ni
eléctrica, ni de tiempos, ni HIL.

## Si la migración no es aceptable

Haga una copia de seguridad de la carpeta del proyecto o una confirmación en el
control de versiones antes de guardar, y revise la diferencia. Use los diagnósticos
para resolver el código fuente o la configuración no admitidos antes de adoptar la
migración. No edite a mano el JSON de los modelos visuales generado para evitar un
diagnóstico.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| `migrate-preview` no escribe nada, y `migrate` escribe solo el archivo de `--output` y deja la carpeta idéntica byte a byte | Pruebas unitarias de la línea de comandos, y los dos comandos de arriba ejecutados sobre una copia del proyecto incluido `motor_start_stop` sin su `schemaVersion` | Host |
| Studio muestra la diferencia antes de escribir, y la aplica con **Aplicar migración** | Recorrido 31 en la aplicación real | Host |
| La forma versión 2 guardada conserva lo que hace el proyecto | Una prueba exporta la migración del proyecto de arranque y parada de motor y comprueba que su escenario golden da el mismo observable en el runtime nativo | Host |
| El proyecto migrado se comporta igual en una placa | No se afirma: no hay equivalencia de destino, eléctrica ni de tiempos | Ninguno |

## Próximo paso

Siga con [el flujo del compilador](./compiler.md) y guarde un resultado nuevo
de prueba o de simulación del proyecto guardado.
