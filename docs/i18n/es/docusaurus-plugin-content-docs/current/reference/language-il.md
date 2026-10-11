---
title: "Referencia de Lista de Instrucciones (IL)"
sidebar_label: "Lista de Instrucciones"
description: "Qué funciona de Lista de Instrucciones, según las pruebas de conformidad ejecutadas."
tags: [reference, generated]
---

# Referencia de Lista de Instrucciones (IL)

{/* >>> GENERATED (tools/docs/generate_language_reference.ts): reference/language-il. Do not edit. >>> */}

El estado de cada elemento de esta página se lee de las pruebas de conformidad ejecutadas, no se escribe a mano: un elemento funciona cuando al menos un caso de conformidad que lo nombra se compila, se ejecuta y cumple sus valores esperados, y ningún caso suyo figura en la lista de fallos conocidos. CI ejecuta toda la batería en cada cambio. Esta página cubre 5 elementos: 4 funcionan, 1 se rechazan a propósito y 0 aún no están probados.

## Editor

Lista de Instrucciones se escribe en un editor de texto. El código se analiza y se traduce a Texto Estructurado antes de compilarse, por eso los tipos de datos, funciones y bloques de función son los de Texto Estructurado.

Aquí se publica una captura de pantalla real de este editor, tomada de forma automática de la versión actual de Studio, cuando la captura exista. Hasta entonces la página no muestra imagen alguna: nunca muestra un dibujo ni una maqueta del editor.

## Elementos

| Elemento | Estado | Casos ejecutados | Requisito |
| --- | --- | --- | --- |
| Los 34 operadores implementados sobre un acumulador DINT o BOOL, con las llamadas a bloques de función CAL, CALC y CALCN con parámetros con nombre y los retornos RET, RETC y RETCN | Funciona | 5 | LNG-019, LNG-020 |
| Mnemónico desconocido | Se rechaza con un mensaje | 1 | LNG-017 |
| JMP, JMPC, JMPCN, etiquetas | Funciona | 3 | LNG-018 |
| Operaciones entre paréntesis | Funciona | 3 | LNG-019 |
| Acumulador con tipo; llamadas a funciones (las llamadas a bloques de función existen, arriba); desplazamientos | Funciona | 3 | LNG-019 |

## Direccionamiento de E/S

Una variable se asocia a un lugar de la imagen de proceso con `AT`, o con una entrada de `io` en el [archivo de proyecto](./project-file.md). Una dirección se escribe `%`, el área, el tamaño y la posición; la forma corta `%I0.0` es `%IX0.0`, y las direcciones no distinguen mayúsculas de minúsculas. Las mismas direcciones se usan en todos los lenguajes: Lista de Instrucciones las escribe en sus declaraciones y los lenguajes gráficos las declaran en la tabla de variables del programa.

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
| Mnemónico desconocido | Se rechaza con un mensaje | No admitido: la compilación lo rechaza con un mensaje que indica la posición. | LNG-017 |

## Páginas relacionadas

- [Guía de Lista de Instrucciones](../languages/il.md)
- [Referencia de Texto Estructurado](./language-st.md)

{/* <<< END GENERATED: reference/language-il <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
