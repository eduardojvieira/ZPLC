---
slug: /ide/migration-v1-to-v2
id: migration-v1-to-v2
title: Migrar un proyecto v1 a v2
sidebar_label: Migrar v1 a v2
description: Previsualice, revise y guarde explícitamente un proyecto ZPLC v2 respaldado por una carpeta.
tags: [ide, migration]
---

# Migrar un proyecto v1 a v2

ZPLC 2.0 le muestra en qué se convierte un proyecto de la versión 1 como proyecto de la versión 2 antes de cambiar nada. La carpeta se queda como está hasta que usted guarda; el guardado reescribe solo el `zplc.json` de esa carpeta al esquema versión 2, y sus programas no se tocan.

## Migrar en la aplicación

1. Abra la carpeta del proyecto de la versión 1 en ZPLC, o importe su archivo desde la pantalla de bienvenida. El diálogo de importación muestra la misma diferencia antes de escribir nada.
2. En el aviso de migración del explorador, elija **Revisar la diferencia**. El diálogo lista las líneas de `zplc.json` que la migración quita y agrega.
3. Elija **Aplicar migración** (equivale a **Guardar**) para escribir en la carpeta la configuración de la versión 2 revisada, o **Cerrar** para dejarla como está.
4. Compile el proyecto y ejecute otra vez su escenario.

## Migrar desde una terminal

Para ver qué cambiaría la migración sin abrir la aplicación, y para escribir el archivo de proyecto de la versión 2 donde usted elija, use la línea de comandos ([Use la línea de comandos](../guides/command-line.md)):

```bash
zplc-cli migrate-preview path/to/project
zplc-cli migrate path/to/project --output zplc.v2.json
```

`migrate-preview` no escribe nada e imprime `migrate-preview passed`; agregue `--json` para obtener la lista de cambios. `migrate` escribe el archivo de proyecto de la versión 2 en `--output`, que no puede ser el archivo de proyecto ni un archivo de `src` o `tests`, y deja la carpeta del proyecto como estaba. Revise el archivo y cópielo sobre `zplc.json` cuando lo acepte.

## Qué cambia

| Área               | Comportamiento de la versión 2                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Modelo de proyecto | Un guardado explícito escribe `schemaVersion: 2` en el `zplc.json` de la carpeta.                                       |
| Carpeta original   | Sin cambios durante la vista previa. Guardar actualiza su `zplc.json`.                                                  |
| Vista previa       | La vista de la aplicación es una vista previa. No promete que se admita toda construcción heredada.                     |
| Evidencia          | Los resultados de compilación, prueba y simulación nativa se aplican al proyecto guardado y son solo evidencia de host. |

## Antes de guardar

Haga una copia de seguridad de la carpeta o confírmela en el control de versiones, y revise la diferencia. Si un diagnóstico informa de código fuente o de configuración no admitidos, resuélvalo antes de adoptar la migración. No edite a mano el JSON generado del modelo visual para eludir un diagnóstico.

## Qué está verificado

La comprobación de migración cubre los proyectos de referencia de la versión 1 del repositorio: su forma guardada de la versión 2 debe compilarse y conservar el comportamiento observable probado en el runtime nativo. No es una afirmación de equivalencia en un destino, en el comportamiento eléctrico, en el tiempo ni en ejecuciones con hardware en el lazo.

| Parte                                                                                                                                | Verificada con                                                                                                                                                            | Nivel   |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `migrate-preview` no escribe nada, y `migrate` escribe solo el archivo indicado en `--output` y deja la carpeta idéntica byte a byte | Pruebas unitarias de la línea de comandos, y ambos comandos ejecutados sobre una copia del proyecto incluido `motor_start_stop` sin su `schemaVersion`                    | Host    |
| La aplicación muestra la diferencia antes de escribir, y la aplica con **Aplicar migración**                                         | Recorrido 31 en la aplicación real                                                                                                                                        | Host    |
| La forma guardada de la versión 2 conserva lo que hace el proyecto                                                                   | Una prueba exporta la migración del proyecto de arranque y paro de motor y comprueba que su escenario de referencia da el mismo resultado observable en el runtime nativo | Host    |
| El proyecto migrado se comporta igual en una placa                                                                                   | No se afirma: no hay equivalencia de destino, eléctrica ni de tiempo                                                                                                      | Ninguno |

## Paso siguiente

Continúe con el [flujo del compilador](./compiler.md) y registre un resultado nuevo de prueba o de simulación para el proyecto guardado.
