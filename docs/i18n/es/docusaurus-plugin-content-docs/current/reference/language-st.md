---
title: "Referencia de texto estructurado (ST)"
sidebar_label: "Texto estructurado"
description: "Qué funciona del texto estructurado, según las pruebas de conformidad ejecutadas."
tags: [reference, generated]
---

# Referencia de texto estructurado (ST)

{/* >>> GENERATED (tools/docs/generate_language_reference.ts): reference/language-st. Do not edit. >>> */}

El estado de cada elemento de esta página se lee de las pruebas de conformidad ejecutadas, no se escribe a mano: un elemento funciona cuando al menos un caso de conformidad que lo nombra se compila, se ejecuta y cumple sus valores esperados, y ningún caso suyo figura en la lista de fallas conocidas. CI ejecuta toda la batería en cada cambio. Esta página cubre 87 elementos: 75 funcionan, 11 se rechazan a propósito y 1 aún no están probados.

## Editor

El texto estructurado se escribe en el editor de texto principal de ZPLC, que muestra los diagnósticos de la compilación con su línea y columna y navega desde un diagnóstico hasta su código.

![El editor de texto estructurado de ZPLC con el ejemplo Blinky abierto, que muestra el programa y la declaración de sus variables, con la interfaz en español](/img/editors/st-es.png#gh-light-mode-only)

![El editor de texto estructurado de ZPLC con el ejemplo Blinky abierto, que muestra el programa y la declaración de sus variables, con la interfaz en español](/img/editors/st-es-dark.png#gh-dark-mode-only)

La imagen es una captura de pantalla real de este editor, tomada de forma automática de la versión actual de ZPLC con un programa de ejemplo pequeño abierto.

## Elementos

### Tipos de datos

| Elemento | Estado | Casos ejecutados | Requisito |
| --- | --- | --- | --- |
| BOOL | Funciona | 3 | CMP-025 |
| USINT, UINT | Funciona | 3 | CMP-012 |
| SINT, INT | Funciona | 14 | CMP-011 |
| DINT | Funciona | 8 | CMP-011, CMP-016 |
| UDINT | Funciona | 10 | CMP-012 |
| LINT, ULINT, LWORD | Funciona | 34 | CMP-015 |
| REAL | Funciona | 11 | CMP-013 |
| LREAL | Funciona | 21 | CMP-015 |
| TIME | Funciona | 6 | CMP-017 |
| DATE, TOD, DT | Funciona | 5 | CMP-017 |
| LTIME, LDATE, LTOD, LDT | Se rechaza con un mensaje | 4 | CMP-003 |
| CHAR, WCHAR | Se rechaza con un mensaje | 2 | CMP-003 |
| STRING, STRING\[n\] | Funciona | 4 | CMP-021 |
| WSTRING | Funciona | 2 | CMP-021 |
| BYTE, WORD, DWORD | Funciona | 8 | CMP-004, CMP-014 |
| Matrices de una a tres dimensiones de BOOL, INT, DINT, REAL | Funciona | 2 | CMP-022 |
| Matrices con límites negativos o constantes; matrices de estructuras, bloques de función, cadenas y tipos de 64 bits | Funciona | 7 | CMP-022 |
| Matrices de matrices | Se rechaza con un mensaje, decisión abierta | 1 | CMP-006 |
| Inicializadores de matriz | Funciona | 2 | CMP-022, CMP-025 |
| Verificación de los límites de una matriz | Funciona | 1 | CMP-023 |
| STRUCT | Funciona | 9 | CMP-019 |
| Enumeraciones | Funciona | 5 | CMP-020 |
| Enumeraciones con tipo base; subrangos | Se rechaza con un mensaje, decisión abierta | 2 | CMP-006 |
| Alias de tipo; varios tipos en un bloque TYPE | Funciona | 2 | CMP-030 |
| REF\_TO, REF(), ^ | Funciona | 2 | CMP-024 |
| POINTER TO, ADR | Se rechaza con un mensaje, decisión abierta | 2 | CMP-006 |

### Literales

| Elemento | Estado | Casos ejecutados | Requisito |
| --- | --- | --- | --- |
| Decimales, reales, exponente, TRUE, FALSE | Funciona | 4 | CMP-011, CMP-013 |
| T#, D#, TOD#, DT#, literales de cadena | Funciona | 4 | CMP-017, CMP-021 |
| Literales de tiempo compuestos y fraccionarios | Funciona | 4 | CMP-017 |
| Literales con base 2#, 8#, 16#; separadores de dígitos | Funciona | 5 | CMP-031 |
| Literales con tipo, como INT#5 | Funciona | 1 | CMP-031 |

### Declaraciones y variables

| Elemento | Estado | Casos ejecutados | Requisito |
| --- | --- | --- | --- |
| VAR, VAR\_INPUT, VAR\_OUTPUT | Funciona | 3 | CMP-025 |
| VAR\_IN\_OUT | Funciona | 1 | CMP-028 |
| VAR\_TEMP | Funciona | 2 | CMP-027, CMP-030 |
| VAR\_GLOBAL | Funciona | 6 | CMP-025, CMP-042 |
| VAR\_GLOBAL CONSTANT | Funciona | 1 | CMP-026 |
| VAR CONSTANT | Funciona | 1 | CMP-026 |
| VAR\_EXTERNAL | Funciona | 1 | CMP-030 |
| VAR\_ACCESS, VAR\_CONFIG, PERSISTENT | Se rechaza con un mensaje, decisión abierta | 2 | CMP-006 |
| RETAIN, NON\_RETAIN | Funciona | 2 | CMP-029, RT-025 |
| AT %I, AT %Q (bit, byte, palabra, palabra doble) | Funciona | 4 | CMP-047, IO-003 |
| AT %M | Funciona | 1 | CMP-044 |
| Varios nombres en una declaración | Funciona | 1 | CMP-030 |
| Valores iniciales | Funciona | 4 | CMP-025 |

### Unidades de organización de programa

| Elemento | Estado | Casos ejecutados | Requisito |
| --- | --- | --- | --- |
| PROGRAM (uno por archivo) | Funciona | 2 | CMP-042 |
| FUNCTION | Funciona | 16 | CMP-027, CMP-035, CMP-036 |
| FUNCTION\_BLOCK con estado y varias instancias | Funciona | 4 | CMP-038 |
| Instancias de bloque de función dentro de bloques de función; matrices de instancias | Funciona | 2 | CMP-038 |
| Llamada a un bloque de función con entradas con nombre | Funciona | 3 | CMP-037 |
| Llamada a un bloque de función con =\> | Funciona | 2 | CMP-037 |
| Llamada posicional a un bloque de función | Se rechaza con un mensaje, decisión abierta | 1 | CMP-006 |
| Métodos, THIS | Funciona | 4 | CMP-041 |
| EXTENDS, OVERRIDE, FINAL, SUPER^ | Funciona | 6 | CMP-041 |
| Interfaces, IMPLEMENTS | Funciona | 8 | CMP-041 |
| PUBLIC, PRIVATE, PROTECTED, ABSTRACT | Funciona | 3 | CMP-041 |
| Propiedades, espacios de nombres, bloques ACTION | Se rechaza con un mensaje, decisión abierta | 3 | CMP-006 |
| POU y variables globales compartidas entre archivos; bibliotecas | Funciona | 7 | CMP-042, CMP-046 |

### Sentencias y operadores

| Elemento | Estado | Casos ejecutados | Requisito |
| --- | --- | --- | --- |
| IF, WHILE, REPEAT, EXIT, CONTINUE | Funciona | 5 | CMP-039 |
| FOR | Funciona | 6 | CMP-039 |
| CASE | Funciona | 8 | CMP-040 |
| RETURN | Funciona | 4 | CMP-036 |
| Llamada a función como sentencia; sentencia vacía | Funciona | 3 | CMP-035, CMP-032 |
| + - \* / MOD y comparaciones | Funciona | 11 | CMP-011, CMP-012, CMP-013 |
| AND, OR, XOR, NOT | Funciona | 5 | CMP-014 |
| \*\*, &, acceso a bit w.0 | Funciona | 3 | CMP-032 |
| Comentarios (\* \*) | Funciona | 1 | CMP-009 |
| Comentarios /\* \*/ | Funciona | 1 | CMP-032 |

### Conversiones y funciones estándar

| Elemento | Estado | Casos ejecutados | Requisito |
| --- | --- | --- | --- |
| Conversión implícita a un tipo más ancho | Funciona | 13 | CMP-005 |
| INT\_TO\_REAL, REAL\_TO\_INT, BOOL\_TO\_INT, INT\_TO\_BOOL, TRUNC, ROUND | Funciona | 12 | CMP-057 |
| Todas las demás conversiones X\_TO\_Y | Funciona | 9 | CMP-057 |
| ABS, MAX, MIN, LIMIT, SEL, MUX, SQRT | Funciona | 13 | CMP-011, CMP-058 |
| Funciones trigonométricas, logarítmicas y exponenciales | Funciona | 9 | CMP-058 |
| SHL, SHR, ROL, ROR y las funciones lógicas de palabra | Funciona | 7 | CMP-014, CMP-058 |
| Funciones de cadena (14) | Funciona | 5 | CMP-021 |
| UPTIME, CYCLE\_TIME, WATCHDOG\_RESET | Funciona | 2 | CMP-058, RT-034 |
| Formas de función de los operadores (ADD, MUL, GT, EQ, MOVE) | Se rechaza con un mensaje, decisión abierta | 1 | CMP-006 |

### Bloques de función

| Elemento | Estado | Casos ejecutados | Requisito |
| --- | --- | --- | --- |
| TON | Funciona | 4 | CMP-057 |
| TOF | Funciona | 2 | CMP-057 |
| TP | Funciona | 4 | CMP-057 |
| CTU, CTD, CTUD | Funciona | 16 | CMP-058 |
| R\_TRIG, F\_TRIG, SR, RS | Funciona | 3 | CMP-058 |
| BLINK, PWM, PULSE, HYSTERESIS, DEADBAND, LAG\_FILTER, RAMP\_REAL, INTEGRAL, DERIVATIVE, PID\_Compact, FIFO, LIFO (no están en el estándar) | Funciona | 23 | CMP-058 |
| Bloques de comunicación y de nube (12) | Sin verificar | 0 | COM-001, COM-002, COM-003, COM-004, COM-005, COM-006, COM-007, COM-008, COM-009 |

### Tareas y configuración

| Elemento | Estado | Casos ejecutados | Requisito |
| --- | --- | --- | --- |
| Tareas cíclicas en zplc.json (intervalo, prioridad, programas) | Funciona | 5 | CMP-047, RT-015 |
| Verificación de propiedad de las salidas entre programas; verificación del límite de memoria | Funciona | 5 | CMP-047, CMP-043 |
| Tareas disparadas por evento | Se rechaza con un mensaje, decisión abierta | 1 | RT-015 |
| CONFIGURATION, RESOURCE y TASK textuales | Se rechaza con un mensaje, decisión abierta | 1 | CMP-006 |

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
| LTIME, LDATE, LTOD, LDT | Se rechaza con un mensaje | No admitido: la compilación lo rechaza con un mensaje que indica la posición. | CMP-003 |
| CHAR, WCHAR | Se rechaza con un mensaje | No admitido: la compilación lo rechaza con un mensaje que indica la posición. | CMP-003 |
| Matrices de matrices | Se rechaza con un mensaje, decisión abierta | No admitido: la compilación lo rechaza con un mensaje que indica la posición; que una versión posterior lo admita es una decisión abierta. | CMP-006 |
| Enumeraciones con tipo base; subrangos | Se rechaza con un mensaje, decisión abierta | No admitido: la compilación lo rechaza con un mensaje que indica la posición; que una versión posterior lo admita es una decisión abierta. | CMP-006 |
| POINTER TO, ADR | Se rechaza con un mensaje, decisión abierta | No admitido: la compilación lo rechaza con un mensaje que indica la posición; que una versión posterior lo admita es una decisión abierta. | CMP-006 |
| VAR\_ACCESS, VAR\_CONFIG, PERSISTENT | Se rechaza con un mensaje, decisión abierta | No admitido: la compilación lo rechaza con un mensaje que indica la posición; que una versión posterior lo admita es una decisión abierta. | CMP-006 |
| Llamada posicional a un bloque de función | Se rechaza con un mensaje, decisión abierta | No admitido: la compilación lo rechaza con un mensaje que indica la posición; que una versión posterior lo admita es una decisión abierta. | CMP-006 |
| Propiedades, espacios de nombres, bloques ACTION | Se rechaza con un mensaje, decisión abierta | No admitido: la compilación lo rechaza con un mensaje que indica la posición; que una versión posterior lo admita es una decisión abierta. | CMP-006 |
| Formas de función de los operadores (ADD, MUL, GT, EQ, MOVE) | Se rechaza con un mensaje, decisión abierta | No admitido: la compilación lo rechaza con un mensaje que indica la posición; que una versión posterior lo admita es una decisión abierta. | CMP-006 |
| Bloques de comunicación y de nube (12) | Sin verificar | Ningún caso de conformidad que se ejecute lo cubre aún, por eso no se afirma nada sobre su comportamiento. | COM-001, COM-002, COM-003, COM-004, COM-005, COM-006, COM-007, COM-008, COM-009 |
| Tareas disparadas por evento | Se rechaza con un mensaje, decisión abierta | No admitido: la compilación lo rechaza con un mensaje que indica la posición; que una versión posterior lo admita es una decisión abierta. | RT-015 |
| CONFIGURATION, RESOURCE y TASK textuales | Se rechaza con un mensaje, decisión abierta | No admitido: la compilación lo rechaza con un mensaje que indica la posición; que una versión posterior lo admita es una decisión abierta. | CMP-006 |

## Páginas relacionadas

- [Guía de texto estructurado](../languages/st.md)
- [Referencia de funciones](./functions.md)
- [Referencia de bloques de función](./function-blocks.md)

{/* <<< END GENERATED: reference/language-st <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
