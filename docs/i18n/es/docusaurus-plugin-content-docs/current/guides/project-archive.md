---
slug: /guides/project-archive
id: project-archive
title: Exportar e importar un archivo de proyecto
sidebar_label: Archivos de proyecto
description: 'Lleve un proyecto a otro computador como un solo archivo, y abra un proyecto que alguien le envió, con las comprobaciones que ZPLC hace antes de escribir nada.'
tags: [how-to, projects, archive]
---

# Exportar e importar un archivo de proyecto

Un proyecto es una carpeta. Un archivo de proyecto es esa carpeta como un solo archivo, para poder enviarla, guardarla o abrirla en otro computador y recuperar el mismo proyecto byte por byte.

## Exportar

1. Guarde los archivos modificados del proyecto. El archivo contiene los archivos tal como están en disco, así que ZPLC le pide guardar primero.
2. Abra el menú **Compilación** de la barra de herramientas y elija **Exportar archivo del proyecto**.
3. Elija dónde escribir el archivo en el diálogo de guardado del sistema.

**Salida** dice cuántos archivos se escribieron. El archivo omite lo que oculta el árbol del proyecto (`node_modules`, `.git`, `build`, `dist` y `.vscode`) y los enlaces.

El mismo proyecto da los mismos bytes en cualquier computador: las entradas van ordenadas por ruta, almacenadas sin compresión, con fecha 1980-01-01 y nombres en UTF-8. Para ver qué contiene un archivo, use cualquier herramienta zip o Python en cualquier sistema:

```bash
python3 -m zipfile -l my-project.zip
```

**Exportar proyecto**, junto a él, escribe un documento JSON con los archivos y la configuración sin sus secretos. Ese documento es para leer. No se importa.

## Importar

1. En la pantalla de bienvenida, elija **Importar un archivo de proyecto** y seleccione el archivo. Todavía no se escribe nada. Un diálogo dice qué contiene el archivo (sus archivos, carpetas y tamaño), de quién es el proyecto y, para un proyecto de versión 1, las líneas que cambia migrarlo en `zplc.json`.
2. Elija **Elegir una carpeta e importar** y seleccione una carpeta vacía. ZPLC escribe allí los archivos byte por byte y abre el proyecto.

![El diálogo Import archive de ZPLC (interfaz en inglés)](/img/screens/guide-import-archive.png)

Una carpeta que no está vacía se rechaza, y una importación que falla deja la carpeta vacía de nuevo.

## Qué rechaza ZPLC

ZPLC lee archivos que otras herramientas escribieron, almacenados o comprimidos. Rechaza un archivo que contenga:

- una ruta absoluta, un `..`, o un nombre que dos sistemas leen de forma distinta;
- un enlace o una entrada cifrada;
- dos archivos que difieren solo por mayúsculas y minúsculas;
- un archivo que no coincide con su suma de comprobación;
- más de 4096 archivos, un archivo de más de 16 MiB, o más de 64 MiB en total.

No se escribe nada de un archivo rechazado.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| El formato, los rechazos y un viaje de ida y vuelta con carpetas reales | Pruebas unitarias del lector y el escritor de archivos | Host |
| Exportar y luego importar en una carpeta vacía da carpetas iguales y un `zplc.json` idéntico byte por byte | Recorrido 30 en la aplicación real | Host |
| Un archivo que escribió otra herramienta, almacenado o comprimido | Pruebas unitarias con archivos escritos por otra herramienta | Host |

## Vea también

- [Banco de trabajo de ZPLC](../ide/features.md#archivos-de-proyecto): la descripción completa.
- [Migrar un proyecto de versión 1](../ide/migration-v1-to-v2.md): lo que muestra la importación para un proyecto antiguo.
