---
slug: /guides/project-archive
id: project-archive
title: Exportar e importar un archivo de proyecto
sidebar_label: Archivos de proyecto
description: "Lleve un proyecto a otro equipo como un solo archivo y abra un proyecto que alguien le envió, con las comprobaciones que hace Studio antes de escribir nada."
tags: [how-to, projects, archive]
---

# Exportar e importar un archivo de proyecto

Un proyecto es una carpeta. Un archivo de proyecto es esa carpeta como un solo
archivo, para que pueda enviarlo, guardarlo o abrirlo en otro equipo y recuperar el
mismo proyecto byte por byte.

## Exportar

1. Guarde los archivos modificados del proyecto: el archivo contiene los ficheros
   como están en el disco, así que Studio le pide guardar antes.
2. Abra el menú **Compilación** de la barra de herramientas y elija **Export Project
   Archive**.
3. Elija dónde escribir el archivo en el diálogo de guardado del sistema.

Output indica cuántos archivos se escribieron. El archivo omite lo que oculta el
árbol del proyecto (`node_modules`, `.git`, `build`, `dist` y `.vscode`) y los
enlaces.

Un archivo hecho en un equipo es el mismo conjunto de bytes que uno hecho en otro a
partir del mismo proyecto: las entradas están ordenadas por ruta, almacenadas sin
compresión, con fecha 1980-01-01 y nombres en UTF-8. Puede ver qué contiene un
archivo con cualquier herramienta zip, o con Python en cualquier sistema:

```bash
python3 -m zipfile -l my-project.zip
```

**Exportar proyecto**, a su lado, escribe un documento JSON de los archivos y de la
configuración sin sus secretos. Ese documento es para leer; no se importa.

## Importar

1. En la pantalla de bienvenida, elija **Importar un archivo de proyecto** y seleccione el
   archivo. Todavía no se escribe nada: un diálogo dice qué contiene el archivo (sus
   archivos, carpetas y tamaño), de quién es el proyecto y, para un proyecto de
   versión 1, las líneas que cambia su migración en `zplc.json`.
2. Elija **Elegir una carpeta e importar** y seleccione una carpeta vacía. Studio
   escribe allí los archivos byte por byte y abre el proyecto.

Una carpeta que no está vacía se rechaza, y una importación que falla deja la carpeta
vacía de nuevo.

## Qué rechaza Studio

Studio lee archivos que escribieron otras herramientas, almacenados o comprimidos, y
rechaza uno que contenga una ruta absoluta, un `..`, un nombre que dos sistemas leen
de forma distinta, un enlace, una entrada cifrada, dos archivos que difieren solo en
mayúsculas, un archivo que no coincide con su suma de verificación, más de 4096
archivos, un archivo de más de 16 MiB o más de 64 MiB en total. De un archivo
rechazado no se escribe nada.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| El formato, los rechazos y un viaje de ida y vuelta en carpetas reales | Pruebas unitarias del lector y del escritor de archivos | Host |
| Exportar y luego importar en una carpeta vacía da carpetas iguales y un `zplc.json` idéntico byte a byte | Recorrido 30 en la aplicación real | Host |
| Un archivo que escribió otra herramienta, almacenado o comprimido | Pruebas unitarias con archivos escritos por otra herramienta | Host |

## Vea también

- [Banco de trabajo de Studio](../ide/features.md#archivos-de-proyecto): la descripción completa.
- [Migrar un proyecto de la versión 1](../ide/migration-v1-to-v2.md): qué muestra la importación para un proyecto antiguo.
