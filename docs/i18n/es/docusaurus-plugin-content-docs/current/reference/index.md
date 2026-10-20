---
slug: /reference
id: index
title: Referencia
sidebar_label: Referencia
description: "Consulte un dato: los lenguajes, las funciones y los bloques de función, los archivos de proyecto y de escenario, la línea de comandos, el runtime y las placas."
tags: [reference]
---

# Referencia

Use esta sección para consultar un dato. La mayoría de las páginas se generan a
partir de la fuente que describen, por lo que no pueden separarse de ella; cada
una dice de qué fuente se lee. Para aprender a hacer algo, empiece por las guías
prácticas.

## Lenguajes

- [Referencia de Structured Text](./language-st.md): qué funciona, elemento por elemento, y qué no.
- [Instruction List](./language-il.md), [Ladder Diagram](./language-ld.md), [Function Block Diagram](./language-fbd.md) y [Sequential Function Chart](./language-sfc.md): lo mismo, por lenguaje.

## Funciones y bloques de función

- [Funciones](./functions.md) y [bloques de función](./function-blocks.md): cada nombre del registro del compilador, con su firma o sus pines y un ejemplo que ejecuta la verificación de la documentación.

## Proyectos y herramientas

- [Archivo de proyecto (`zplc.json`)](./project-file.md): cada campo.
- [Formato del archivo de escenario](./scenario-file.md): eventos, expectativas y límites.
- [Línea de comandos](./cli.md) y [servidor MCP](./mcp.md): cada comando, herramienta y recurso.
- [Códigos de diagnóstico](./diagnostic-codes.md): el código estable de cada error de una compilación, qué significa y un programa que lo provoca.

## Runtime y firmware

- [API del runtime](./runtime-api.md): los encabezados en C.
- [Protocolo de sesión del runtime](./runtime-protocol.md), [opciones de Kconfig](./kconfig.md) y [comandos de la consola](./shell-commands.md).

## Placas

- [Compatibilidad de hardware](./capabilities-evidence.md): los niveles de evidencia y el nivel de cada placa.
- [Placas soportadas](./boards.md): los canales de E/S, los pines y la huella de cada placa, generados desde el manifiesto de placas.
- [Preparación del workspace de Zephyr](./zephyr-workspace-setup.md): las entradas de una compilación de firmware reproducible.
