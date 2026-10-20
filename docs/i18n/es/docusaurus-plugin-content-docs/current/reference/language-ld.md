---
title: "Referencia de diagrama de escalera (LD)"
sidebar_label: "Diagrama de escalera"
description: "Qué funciona del diagrama de escalera, según las pruebas de conformidad ejecutadas."
tags: [reference, generated]
---

# Referencia de diagrama de escalera (LD)

{/* >>> GENERATED (tools/docs/generate_language_reference.ts): reference/language-ld. Do not edit. >>> */}

El estado de cada elemento de esta página se lee de las pruebas de conformidad ejecutadas, no se escribe a mano: un elemento funciona cuando al menos un caso de conformidad que lo nombra se compila, se ejecuta y cumple sus valores esperados, y ningún caso suyo figura en la lista de fallas conocidas. CI ejecuta toda la batería en cada cambio. Esta página cubre 7 elementos: 5 funcionan, 2 se rechazan a propósito y 0 aún no están probados.

## Editor

El diagrama de escalera se dibuja en el editor de peldaños de ZPLC: contactos, bobinas, ramas y bloques, con deshacer y validación mientras se dibuja. El texto estructurado que la compilación genera a partir de los peldaños es solo una salida de lectura.

Aquí se publica una captura de pantalla real de este editor, tomada de forma automática de la versión actual de ZPLC, cuando la captura exista. Hasta entonces la página no muestra imagen alguna: nunca muestra un dibujo ni una maqueta del editor.

## Elementos

| Elemento | Estado | Casos ejecutados | Requisito |
| --- | --- | --- | --- |
| LD: contactos normalmente abiertos y cerrados; bobinas normales, negadas, de activación y de desactivación | Funciona | 2 | LNG-022 |
| LD: ramas en paralelo | Funciona | 2 | LNG-021 |
| LD: contactos de flanco y bobinas de flanco | Funciona | 3 | LNG-022 |
| LD: bloques en un peldaño | Funciona | 2 | LNG-021, LNG-022 |
| LD: saltos y etiquetas | Se rechaza con un mensaje, decisión abierta | 2 | LNG-002 |
| EN/ENO | Se rechaza con un mensaje, decisión abierta | 1 | LNG-002 |
| Bloques de función y funciones del usuario en LD y FBD | Funciona | 3 | LNG-008 |

## Direccionamiento de E/S

Una variable se asocia a un lugar de la imagen de proceso con `AT`, o con una entrada de `io` en el [archivo de proyecto](./project-file.md). Una dirección se escribe `%`, el área, el tamaño y la posición; la forma corta `%I0.0` es `%IX0.0`, y las direcciones no distinguen mayúsculas de minúsculas. Las mismas direcciones se usan en todos los lenguajes: la lista de instrucciones las escribe en sus declaraciones y los lenguajes gráficos las declaran en la tabla de variables del programa.

| Dirección | Contiene | Área | Desplazamiento en bytes | Base de la región |
| --- | --- | --- | --- | --- |
| `%IX<byte>.<bit>` | un bit | entradas | `<byte>` | `0x0000` (4096 bytes) |
| `%IB<n>` | un byte | entradas | `n` | `0x0000` (4096 bytes) |
| `%IW<n>` | una palabra de 16 bits | entradas | `2 * n` | `0x0000` (4096 bytes) |
| `%ID<n>` | una palabra doble de 32 bits | entradas | `4 * n` | `0x0000` (4096 bytes) |
| `%QX<byte>.<bit>` | un bit | salidas | `<byte>` | `0x1000` (4096 bytes) |
| `%QB<n>` | un byte | salidas | `n` | `0x1000` (4096 bytes) |
| `%QW<n>` | una palabra de 16 bits | salidas | `2 * n` | `0x1000` (4096 bytes) |
| `%QD<n>` | una palabra doble de 32 bits | salidas | `4 * n` | `0x1000` (4096 bytes) |
| `%MX<byte>.<bit>` | un bit | memoria (región de trabajo) | `<byte>` | `0x2000` (8192 bytes) |
| `%MB<n>` | un byte | memoria (región de trabajo) | `n` | `0x2000` (8192 bytes) |
| `%MW<n>` | una palabra de 16 bits | memoria (región de trabajo) | `2 * n` | `0x2000` (8192 bytes) |
| `%MD<n>` | una palabra doble de 32 bits | memoria (región de trabajo) | `4 * n` | `0x2000` (8192 bytes) |

## No admitido

Estos elementos no funcionan hoy. Cada uno se rechaza con un mensaje ubicado o aún no está probado; ninguno se acepta en silencio.

| Elemento | Estado | Qué ocurre | Requisito |
| --- | --- | --- | --- |
| LD: saltos y etiquetas | Se rechaza con un mensaje, decisión abierta | No admitido: la compilación lo rechaza con un mensaje que indica la posición; que una versión posterior lo admita es una decisión abierta. | LNG-002 |
| EN/ENO | Se rechaza con un mensaje, decisión abierta | No admitido: la compilación lo rechaza con un mensaje que indica la posición; que una versión posterior lo admita es una decisión abierta. | LNG-002 |

## Páginas relacionadas

- [Editores de texto y visuales](../ide/editors.md)
- [Referencia de diagrama de bloques de función](./language-fbd.md)
- [Referencia de bloques de función](./function-blocks.md)

{/* <<< END GENERATED: reference/language-ld <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
