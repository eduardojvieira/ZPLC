---
slug: /ide/find-and-references
id: find-and-references
title: Búsqueda, todas las referencias y la ubicación de un documento
sidebar_label: Búsqueda y referencias
description: Cómo ZPLC busca en los cinco lenguajes, lista las referencias de una variable o de una dirección de E/S, y avanza y retrocede por los lugares que usted visitó.
tags: [ide, user-guide]
---

# Búsqueda, todas las referencias y la ubicación de un documento

ZPLC encuentra cosas en un proyecto de tres maneras: **Buscar** encuentra texto, **Buscar todas las referencias** lista dónde se usa un nombre o una dirección de E/S, e **Ir atrás** e **Ir adelante** vuelven a los lugares que usted visitó. Las tres funcionan en los cinco lenguajes, el mapeo de E/S y la tabla de observación.

## Buscar en el proyecto

Elija **Buscar** en la barra de actividades, o pulse `Ctrl+Mayús+F` (**Buscar en el proyecto**). La búsqueda lee el texto de los archivos de texto estructurado y de lista de instrucciones, y los nombres, variables, comentarios y expresiones de los diagramas de escalera, de bloques de función y de diagrama funcional secuencial, con los cambios sin guardar. Distinguir mayúsculas de minúsculas es una opción. Las coincidencias se listan por archivo, cada una con su lugar en palabras, por ejemplo "LD rung 'rung_1', cell 0,0" o "Tabla de variables, fila 'StartPB'".

Al elegir una coincidencia se abre su archivo en ese lugar. En un archivo de texto el cursor va a la línea; en un diagrama se selecciona el elemento, como al abrir un problema. Sin coincidencias, la vista dice cuántos archivos buscó.

## Buscar todas las referencias e Ir a la definición

**Buscar todas las referencias** (`Mayús+F12`) lista cada uso de una variable, de una instancia de bloque de función o de una dirección de E/S. **Ir a la definición** (`F12`) abre el lugar donde está declarada. Ambos toman su objetivo en este orden:

1. el elemento seleccionado en un diagrama; cuando el elemento lleva varios nombres, ZPLC pregunta "¿Qué nombre?";
2. el nombre bajo el cursor del editor de texto abierto, donde `F12` y `Mayús+F12` ejecutan los mismos comandos;
3. si no, un aviso dice que no hay nada seleccionado y qué seleccionar.

Cada fila del mapeo de E/S y cada fila de la tabla de observación tienen además un botón **Buscar referencias**.

Las referencias se abren en el modo **Referencias** de la vista Buscar, que tiene dos modos, **Buscar** y **Referencias**. La lista empieza con una línea como "Referencias a Start: 4 usos en 4 archivos" y agrupa los usos por archivo. Cada uso indica:

| Parte    | Valores                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Lenguaje | ST, IL, LD, FBD, SFC, Mapeo de E/S, Tabla de observación o Escenario de prueba                                                    |
| Lugar    | Una línea, un escalón, un bloque, una transición, una fila del mapeo de E/S o de la tabla de observación, o un paso de una prueba |
| Rol      | Declaración, Escritura, Uso, o Dirección para la dirección a la que está asignada una variable                                    |

Al elegir un uso se abre, con el elemento seleccionado en un diagrama. Un nombre que el proyecto no declara se informa como tal, y un nombre sin usos dice "No se encontraron usos de" y el nombre. Una lista muy larga muestra los primeros usos y lo indica.

## Direcciones de E/S

Un punto de E/S se puede escribir de más de una manera. Buscar todas las referencias lee cada manera como el mismo punto, así que las referencias de una forma listan las demás:

| Se escribe        | Se lee como                                                                      |
| ----------------- | -------------------------------------------------------------------------------- |
| `%IX0.0`, `%I0.0` | El bit 0 de entrada del byte 0. La `X` es opcional para un bit.                  |
| `%QX1.7`          | El bit 7 de salida del byte 1. Un número de bit mayor que 7 no es una dirección. |
| `%IB0`            | El byte 0 de entrada, 8 bits.                                                    |
| `%IW1`            | La palabra 1 de entrada: los bytes 2 y 3, 16 bits.                               |
| `%MD2`, `%ML1`    | Una palabra doble (32 bits) y una palabra larga (64 bits) de memoria.            |

Las áreas son `I` (entradas), `Q` (salidas) y `M` (memoria). Una dirección que se superpone con otra no se relaciona con ella: `%IB0` no encuentra `%IX0.0`, aunque ese bit es parte del byte.

## Atrás, Adelante y la ubicación del documento

**Ir atrás** (`Alt+Izquierda`) e **Ir adelante** (`Alt+Derecha`) recorren los lugares que usted visitó: un archivo y la posición en él, sin importar cómo llegó (una pestaña, el navegador, un problema, un resultado de búsqueda o una referencia). Se conservan los últimos 50 lugares.

Sobre un documento que pertenece al proyecto, la barra de ubicación muestra dónde está entre los objetos del PLC: el proyecto, su grupo y el objeto. Cada paso es un botón que muestra ese grupo en el navegador. La revisión de un cambio, las Preferencias, la Configuración del proyecto y el documento de la planta no tienen barra de ubicación.

## Qué está verificado

Nivel de evidencia: simulación en esta computadora. `packages/zplc-ide/src/shell/projectSearch.test.ts`, `packages/zplc-ide/src/refs/addresses.test.ts`, `packages/zplc-ide/src/refs/referenceIndex.test.ts`, `packages/zplc-ide/src/refs/ReferencesPanel.dom.test.tsx` y `packages/zplc-ide/src/components/PlaceBar.dom.test.tsx` cubren la búsqueda, las direcciones, el índice, la lista y la barra de ubicación. Recorridos de `bun run test:journeys` buscan y listan en la aplicación real las referencias de una variable usada en un escalón, un bloque y una transición, abren cada una, van a su definición y retroceden y avanzan con el teclado. La ventana se midió solo en Linux.
