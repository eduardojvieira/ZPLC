---
slug: /reference
id: index
title: Referencia
sidebar_label: Referencia
description: 'Consulte un dato: los lenguajes, las funciones y los bloques de función, los archivos de proyecto y de escenario, la línea de comandos, el runtime y las placas.'
tags: [reference]
---

# Referencia

Consulte aquí un dato: un nombre, un campo, un código, un pin. La mayoría de las páginas se generan a partir de la fuente que describen, y cada una indica cuál es, de modo que no pueden desviarse de ella. Para aprender a hacer algo, empiece por las [guías](../guides/simulate-and-debug.md) o por [Aprender](../learn/index.md).

## Encuentre la página según lo que necesita

| Usted necesita                                                     | Vaya a                                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué hace un elemento del lenguaje y si el compilador lo acepta     | [Texto estructurado](./language-st.md), [Lista de instrucciones](./language-il.md), [Diagrama de escalera](./language-ld.md), [Diagrama de bloques de función](./language-fbd.md), [Diagrama funcional secuencial](./language-sfc.md) |
| Las teclas de los editores visuales                                | [Referencia de teclado de los editores visuales](./visual-editor-keyboard.md)                                                                                                                                                         |
| La firma de una función o los pines de un bloque de función        | [Funciones](./functions.md) y [bloques de función](./function-blocks.md)                                                                                                                                                              |
| Un campo de `zplc.json`                                            | [Archivo de proyecto](./project-file.md)                                                                                                                                                                                              |
| Cómo escribir una prueba de escenario                              | [Formato del archivo de escenario](./scenario-file.md)                                                                                                                                                                                |
| Un comando de `zplc-cli` o una herramienta del servidor MCP        | [Línea de comandos](./cli.md) y [Herramientas y recursos MCP](./mcp.md)                                                                                                                                                               |
| Qué significa un código de error de compilación                    | [Códigos de diagnóstico](./diagnostic-codes.md)                                                                                                                                                                                       |
| Una función C, un tipo o un encabezado del runtime                 | [API del runtime](./runtime-api.md)                                                                                                                                                                                                   |
| Un mensaje del protocolo de sesión o del protocolo del dispositivo | [Protocolo de sesión del runtime](./runtime-protocol.md) y [Protocolo de enlace con el dispositivo](./device-protocol.md)                                                                                                             |
| Una opción del firmware                                            | [Opciones de Kconfig](./kconfig.md)                                                                                                                                                                                                   |
| Un comando de la consola del firmware                              | [Comandos de la consola](./shell-commands.md)                                                                                                                                                                                         |
| Los pines, canales y memoria de una placa                          | [Placas](./boards.md)                                                                                                                                                                                                                 |
| Hasta dónde se ha demostrado que funciona una placa                | [Compatibilidad de hardware](./capabilities-evidence.md)                                                                                                                                                                              |
| Las entradas de una compilación reproducible del firmware          | [Configuración del espacio de trabajo de Zephyr](./zephyr-workspace-setup.md)                                                                                                                                                         |
| Las piezas y el cableado de una placa del curso                    | [Kits del estudiante](./learner-kits/index.md)                                                                                                                                                                                        |
| Qué archivo es la autoridad para cada tipo de dato                 | [Fuente de verdad](./source-of-truth.md)                                                                                                                                                                                              |

## Páginas generadas y páginas escritas a mano

Una página generada lleva una marca `GENERATED` que nombra su generador, y nunca se edita a mano: cambie la fuente y ejecute `bun run docs:generate`. Las páginas escritas a mano de esta sección son este índice, la [fuente de verdad](./source-of-truth.md), el índice de los [kits del estudiante](./learner-kits/index.md) y los niveles de [compatibilidad de hardware](./capabilities-evidence.md).
