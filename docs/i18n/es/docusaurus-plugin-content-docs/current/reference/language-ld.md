---
title: "Referencia de diagrama de escalera (LD)"
sidebar_label: "Diagrama de escalera"
description: "Qué funciona del diagrama de escalera, según las pruebas de conformidad ejecutadas."
tags: [reference, generated]
---

# Referencia de diagrama de escalera (LD)

{/* >>> GENERATED (tools/docs/generate_language_reference.ts): reference/language-ld. Do not edit. >>> */}

El estado de cada elemento de esta página se lee de las pruebas de conformidad ejecutadas, no se escribe a mano: un elemento funciona cuando al menos un caso de conformidad que lo nombra se compila, se ejecuta y cumple sus valores esperados, y ningún caso suyo figura en la lista de fallas conocidas. CI ejecuta toda la batería en cada cambio. Esta página cubre 7 elementos: 6 funcionan, 1 se rechazan a propósito y 0 aún no están probados.

## Editor

El diagrama de escalera se dibuja en el editor de peldaños de ZPLC: contactos, bobinas, ramas y bloques, con deshacer y validación mientras se dibuja. El texto estructurado que la compilación genera a partir de los peldaños es solo una salida de lectura.

![El editor de diagrama de escalera de ZPLC con el ejemplo Blinky abierto, que muestra sus peldaños, contactos y bobinas, con la interfaz en español](/img/editors/ld-es.png#gh-light-mode-only)

![El editor de diagrama de escalera de ZPLC con el ejemplo Blinky abierto, que muestra sus peldaños, contactos y bobinas, con la interfaz en español](/img/editors/ld-es-dark.png#gh-dark-mode-only)

La imagen es una captura de pantalla real de este editor, tomada de forma automática de la versión actual de ZPLC con un programa de ejemplo pequeño abierto.

## Elementos

| Elemento | Estado | Casos ejecutados | Requisito |
| --- | --- | --- | --- |
| LD: contactos normalmente abiertos y cerrados; bobinas normales, negadas, de activación y de desactivación | Funciona | 2 | LNG-022 |
| LD: ramas en paralelo | Funciona | 2 | LNG-021 |
| LD: contactos de flanco y bobinas de flanco | Funciona | 3 | LNG-022 |
| LD: bloques en un peldaño | Funciona | 11 | LNG-021, LNG-022 |
| LD: saltos y etiquetas | Se rechaza con un mensaje, decisión abierta | 2 | LNG-002 |
| LD: EN/ENO en las cajas de función | Funciona | 9 | LNG-028 |
| Bloques de función y funciones del usuario en LD y FBD | Funciona | 3 | LNG-008 |

## Cajas de función

Un peldaño puede contener como cajas con EN y ENO las funciones IEC siguientes. El cable izquierdo de una caja es EN, la energía que llega a ella, y el cable derecho es ENO, la energía que sale de ella. Se eligen en el grupo Funciones de la paleta; el número de operandos sigue a la función que elija.

| Tipo | Funciones | Operandos | Salida |
| --- | --- | --- | --- |
| Comparación | `GT`, `GE`, `EQ`, `NE`, `LE`, `LT` | `IN1`, `IN2` | ninguna: la caja deja pasar la energía cuando la comparación se cumple |
| Aritmética | `ADD`, `SUB`, `MUL`, `DIV`, `MOD` | `IN1`, `IN2` | una variable |
| Copia | `MOVE` | `IN` | una variable |
| Selección | `LIMIT`, `MIN`, `MAX` | `MN`, `IN`, `MX` para `LIMIT`; `IN1`, `IN2` para `MIN` y `MAX` | una variable |

- **EN y ENO.** Una comparación es una condición en serie: la energía pasa por ella cuando la energía que llega está activa y la comparación se cumple. Cualquier otra función se ejecuta mientras EN está activo, escribe su resultado en la salida y deja pasar la energía; mientras EN está inactivo, no se ejecuta, su salida conserva el valor y ENO está inactivo. No se detecta ningún error, por eso ENO no informa de ninguno.
- **Operandos.** Cada operando es una variable declarada, elegida de la lista de símbolos declarados, o un literal que usted escribe. La salida es una variable declarada que no es una entrada.
- **División por cero.** La caja no detecta `DIV` ni `MOD` con divisor cero: la VM del entorno de ejecución de ZPLC entra en falla, el ciclo termina en falla y la salida no se escribe. Esto vale para enteros y para `REAL` con `0.0` o `-0.0`. La falla también borra la imagen de salidas `%Q`, así que una salida asignada lee 0 después.
- **Desbordamiento.** Un resultado entero que no cabe en su tipo se desborda en círculo; la caja no lo informa.
- **En línea.** Mientras se monitorea, la caja muestra el valor de cada operando que es una variable y de la salida, y sus dos cables muestran EN y ENO.

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

## Páginas relacionadas

- [Editores de texto y visuales](../ide/editors.md)
- [Referencia de diagrama de bloques de función](./language-fbd.md)
- [Referencia de bloques de función](./function-blocks.md)

{/* <<< END GENERATED: reference/language-ld <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
